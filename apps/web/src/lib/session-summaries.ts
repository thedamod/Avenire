import { generateText, Output } from "@avenire/ai";
import type { UIMessage } from "@avenire/ai/message-types";
import { apollo } from "@avenire/ai/models";
import {
  createSessionSummary,
  getLatestSessionSummaryForChat,
  getRecentRelevantSessionSummary,
  listSessionSummariesForUser,
  type SessionSummaryRecord,
  upsertMisconception,
} from "@avenire/database";
import { z } from "zod";
import { normalizeSubjectLabel } from "@/lib/subject-detection";

const DEFAULT_SESSION_INACTIVITY_WINDOW_MS = 30 * 60 * 1000;
// Keep the session-summary pass cheap; this is the truncation/summarization step,
// not the primary response generation path.
const SUMMARY_MODEL = "apollo-sprint";
const MAX_SUMMARY_LIST_ITEMS = 12;
const MAX_MISCONCEPTION_CANDIDATES = 3;
const MIN_AUTOMATIC_MISCONCEPTION_CONFIDENCE = 0.92;
const MAX_MISCONCEPTION_CONCEPT_LENGTH = 180;
const MAX_MISCONCEPTION_REASON_LENGTH = 600;
const MAX_MISCONCEPTION_SUBJECT_LENGTH = 120;
const MAX_MISCONCEPTION_TOPIC_LENGTH = 120;

const misconceptionCandidateSchema = z.object({
  confidence: z.number().min(0).max(1),
  concept: z.string().min(1),
  reason: z.string().min(1),
  subject: z.string().min(1),
  topic: z.string().min(1),
});

const summaryOutputSchema = z.object({
  conceptsCovered: z.array(z.string().min(1)).max(MAX_SUMMARY_LIST_ITEMS),
  misconceptionsDetected: z
    .array(z.string().min(1))
    .max(MAX_SUMMARY_LIST_ITEMS),
  misconceptionCandidates: z
    .array(misconceptionCandidateSchema)
    .max(MAX_MISCONCEPTION_CANDIDATES),
  subject: z.string().min(1).nullable(),
  subjectConfidence: z.number().min(0).max(1).nullable(),
  summaryText: z.string().min(1),
});

type ToolPart = Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;

export interface SessionWindow {
  shouldCreateNewSummary: boolean;
  startPosition: number;
  summaryId: string | null;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBoundedText(value: string, maxLength: number) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Expected non-empty text.");
  }

  return trimmed.slice(0, maxLength);
}

function normalizeMisconceptionCandidate(
  candidate: z.infer<typeof misconceptionCandidateSchema>
) {
  return {
    confidence: Math.min(1, Math.max(0, candidate.confidence)),
    concept: normalizeBoundedText(
      candidate.concept,
      MAX_MISCONCEPTION_CONCEPT_LENGTH
    ),
    reason: normalizeBoundedText(
      candidate.reason,
      MAX_MISCONCEPTION_REASON_LENGTH
    ),
    subject: normalizeBoundedText(
      candidate.subject,
      MAX_MISCONCEPTION_SUBJECT_LENGTH
    ),
    topic: normalizeBoundedText(
      candidate.topic,
      MAX_MISCONCEPTION_TOPIC_LENGTH
    ),
  };
}

function extractMessageText(message: UIMessage) {
  return message.parts
    .filter(
      (part): part is Extract<typeof part, { type: "text" }> =>
        part.type === "text"
    )
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractUserTranscript(messages: UIMessage[]) {
  return messages
    .filter((message) => message.role === "user")
    .map(extractMessageText)
    .filter(Boolean)
    .join("\n")
    .trim();
}

const STRONG_MISCONCEPTION_SIGNAL_PATTERN =
  /\b(i (?:don't|do not) understand|i'?m confused|i am confused|i thought|i assumed|i was wrong|i keep thinking|i keep getting|wrong model|wrong idea|mistaken|misunderstood|mistake|why isn't|why doesn't|does that mean|so that means|so .*? right)\b/i;

function hasStrongMisconceptionEvidence(transcript: string) {
  return STRONG_MISCONCEPTION_SIGNAL_PATTERN.test(transcript);
}

function isCompletedToolPart(
  part: UIMessage["parts"][number]
): part is Extract<ToolPart, { state: "output-available" }> {
  return (
    part.type.startsWith("tool-") &&
    "state" in part &&
    part.state === "output-available"
  );
}

function summarizeToolPart(
  part: Extract<ToolPart, { state: "output-available" }>
) {
  switch (part.type) {
    case "tool-generate_flashcards": {
      const cardCount = Array.isArray(part.output.cards)
        ? part.output.cards.length
        : 0;
      return `Generated ${cardCount} flashcards in "${normalizeText(part.output.title)}".`;
    }
    case "tool-quiz_me": {
      const questionCount =
        typeof part.output.questionCount === "number"
          ? part.output.questionCount
          : 0;
      return `Created a ${questionCount}-question quiz in "${normalizeText(part.output.title)}".`;
    }
    case "tool-log_misconception":
      return normalizeText(part.output.summary);
    case "tool-search_materials":
      return `Searched study materials for "${normalizeText(part.output.query)}" and found ${part.output.totalMatches} matches.`;
    case "tool-avenire_agent":
    case "tool-file_manager_agent":
    case "tool-note_agent":
      return normalizeText(part.output.summary);
    case "tool-get_due_cards":
      return `Reviewed due-card status with ${part.output.totalDueCount} cards due.`;
    default:
      return "";
  }
}

function extractFlashcardsCreated(messages: UIMessage[]) {
  let total = 0;
  for (const message of messages) {
    for (const part of message.parts) {
      if (
        part.type === "tool-generate_flashcards" &&
        part.state === "output-available" &&
        Array.isArray(part.output.cards)
      ) {
        total += part.output.cards.length;
      }
    }
  }
  return total;
}

function extractMisconceptions(messages: UIMessage[]) {
  return Array.from(
    new Set(
      messages.flatMap((message) =>
        message.parts.flatMap((part) => {
          if (
            part.type !== "tool-log_misconception" ||
            part.state !== "output-available"
          ) {
            return [];
          }

          const concept = normalizeText(part.output.misconception?.concept);
          return concept ? [concept] : [];
        })
      )
    )
  ).slice(0, MAX_SUMMARY_LIST_ITEMS);
}

async function persistAutomaticMisconceptions(input: {
  candidates: z.infer<typeof misconceptionCandidateSchema>[];
  endedAt: Date;
  userTranscript: string;
  userId: string;
  workspaceId: string;
}) {
  if (!hasStrongMisconceptionEvidence(input.userTranscript)) {
    return;
  }

  const seen = new Set<string>();
  const eligibleCandidates = input.candidates.filter((candidate) => {
    if (candidate.confidence < MIN_AUTOMATIC_MISCONCEPTION_CONFIDENCE) {
      return false;
    }

    const key = [
      candidate.subject.trim().toLowerCase(),
      candidate.topic.trim().toLowerCase(),
      candidate.concept.trim().toLowerCase(),
    ].join("::");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });

  if (eligibleCandidates.length === 0) {
    return;
  }

  await Promise.allSettled(
    eligibleCandidates.map((candidate) =>
      upsertMisconception({
        confidence: candidate.confidence,
        concept: candidate.concept,
        reason: candidate.reason,
        source: "auto",
        subject: candidate.subject,
        topic: candidate.topic,
        userId: input.userId,
        workspaceId: input.workspaceId,
        observedAt: input.endedAt,
      })
    )
  );
}

function buildTranscript(messages: UIMessage[]) {
  return messages
    .map((message, index) => {
      const role = message.role.toUpperCase();
      const text = extractMessageText(message);
      const toolLines = message.parts
        .filter(isCompletedToolPart)
        .map(summarizeToolPart)
        .filter(Boolean)
        .map((line) => `TOOL: ${line}`);
      const content = [text, ...toolLines].filter(Boolean).join("\n");
      return content ? `Message ${index + 1} [${role}]\n${content}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function isTrivialSession(messages: UIMessage[]) {
  const userTexts = messages
    .filter((message) => message.role === "user")
    .map(extractMessageText)
    .filter(Boolean);
  const assistantTexts = messages
    .filter((message) => message.role === "assistant")
    .map(extractMessageText)
    .filter(Boolean);
  const toolCount = messages.flatMap((message) =>
    message.parts.filter(isCompletedToolPart)
  ).length;

  return (
    userTexts.length === 0 ||
    (assistantTexts.length === 0 && toolCount === 0) ||
    (userTexts.join(" ").length < 24 &&
      assistantTexts.join(" ").length < 48 &&
      toolCount === 0)
  );
}

export function resolveSessionWindow(input: {
  latestSummary: SessionSummaryRecord | null;
  latestUserPosition: number;
  previousLastMessageAt: Date | null;
  requestStartedAt: Date;
  forceNewSessionBoundary?: boolean;
}) {
  if (input.forceNewSessionBoundary) {
    return {
      shouldCreateNewSummary: true,
      startPosition: input.latestSummary
        ? Math.max(0, input.latestSummary.endPosition + 1)
        : 0,
      summaryId: null,
    } satisfies SessionWindow;
  }

  const inactivityWindowMs = DEFAULT_SESSION_INACTIVITY_WINDOW_MS;
  const inactiveForMs = input.previousLastMessageAt
    ? input.requestStartedAt.getTime() - input.previousLastMessageAt.getTime()
    : Number.POSITIVE_INFINITY;
  const isNewSessionBoundary =
    !input.latestSummary || inactiveForMs >= inactivityWindowMs;

  if (isNewSessionBoundary) {
    return {
      shouldCreateNewSummary: true,
      startPosition: Math.max(0, input.latestUserPosition),
      summaryId: null,
    } satisfies SessionWindow;
  }

  const latest = input.latestSummary;
  if (!latest) {
    throw new Error(
      "Expected latestSummary to exist after session boundary check"
    );
  }
  return {
    shouldCreateNewSummary: false,
    startPosition: Math.max(0, latest.startPosition),
    summaryId: latest.id,
  } satisfies SessionWindow;
}

export async function persistSessionSummaryForCompletedTurn(input: {
  chatId: string;
  endedAt: Date;
  latestSummary: SessionSummaryRecord | null;
  latestUserPosition: number;
  messages: UIMessage[];
  forceNewSessionBoundary?: boolean;
  previousLastMessageAt: Date | null;
  requestStartedAt: Date;
  subject?: string | null;
  subjectConfidence?: number | null;
  userId: string;
  workspaceId: string;
}) {
  const window = resolveSessionWindow({
    latestSummary: input.latestSummary,
    latestUserPosition: input.latestUserPosition,
    previousLastMessageAt: input.previousLastMessageAt,
    requestStartedAt: input.requestStartedAt,
    forceNewSessionBoundary: input.forceNewSessionBoundary,
  });
  const boundedMessages = input.messages.slice(window.startPosition);

  if (boundedMessages.length === 0 || isTrivialSession(boundedMessages)) {
    return null;
  }

  const transcript = buildTranscript(boundedMessages);
  const userTranscript = extractUserTranscript(boundedMessages);
  const flashcardsCreated = extractFlashcardsCreated(boundedMessages);
  const misconceptionsDetected = extractMisconceptions(boundedMessages);

  const result = await generateText({
    model: apollo.languageModel(SUMMARY_MODEL),
    output: Output.object({ schema: summaryOutputSchema }),
    prompt: [
      "Summarize this completed tutoring session window.",
      "Return concise, factual output only.",
      "Focus on concepts covered, misconceptions explicitly surfaced, and the learning outcome.",
      "Also identify the primary academic subject and a confidence score between 0 and 1.",
      "Also infer up to three concept-level misconception candidates only when the user explicitly expresses confusion, states a wrong model, or repeatedly shows the same durable misunderstanding.",
      "Be very conservative. Do not infer a misconception from a normal question, a feature check, a single clarification, or general curiosity.",
      `Flashcards created during this window: ${flashcardsCreated}`,
      misconceptionsDetected.length > 0
        ? `Misconceptions already detected by tools: ${misconceptionsDetected.join(", ")}`
        : "Misconceptions already detected by tools: none",
      "For subject, use an established subject label such as Mathematics, Physics, Chemistry, Biology, Computer Science, History, Literature, or Economics.",
      "If the subject is mixed or unclear, still return the dominant subject with a lower confidence score.",
      "For misconceptionCandidates, keep concept labels short and specific, ideally under 180 characters, and keep subject/topic labels concise.",
      "For misconceptionCandidates, return objects with concept, subject, topic, reason, and confidence.",
      "Session transcript:",
      transcript,
    ].join("\n\n"),
  });

  const detectedSubject = normalizeSubjectLabel(result.output.subject);
  const normalizedCandidates = result.output.misconceptionCandidates.map(
    normalizeMisconceptionCandidate
  );

  await persistAutomaticMisconceptions({
    candidates: normalizedCandidates,
    endedAt: input.endedAt,
    userTranscript,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });

  return createSessionSummary({
    chatId: input.chatId,
    conceptsCovered: result.output.conceptsCovered,
    endedAt: input.endedAt,
    endPosition: input.messages.length - 1,
    flashcardsCreated,
    id: window.summaryId ?? undefined,
    misconceptionsDetected: Array.from(
      new Set([
        ...misconceptionsDetected,
        ...result.output.misconceptionsDetected,
      ])
    ).slice(0, MAX_SUMMARY_LIST_ITEMS),
    subject: detectedSubject,
    subjectConfidence: result.output.subjectConfidence ?? null,
    startedAt:
      window.shouldCreateNewSummary || !input.latestSummary
        ? input.requestStartedAt
        : new Date(input.latestSummary.startedAt),
    startPosition: window.startPosition,
    summaryText: result.output.summaryText,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
}

export async function getWorkspaceSubjectSummary(input: {
  userId: string;
  workspaceId: string;
}): Promise<SessionSummaryRecord | null> {
  const summaries = await listSessionSummariesForUser({
    userId: input.userId,
    workspaceId: input.workspaceId,
    limit: 2,
  });

  const latest = summaries[0] ?? null;
  if (!latest) {
    return null;
  }

  if ((latest.subjectConfidence ?? 0) >= 0.5) {
    return latest;
  }

  const fallback = summaries[1] ?? null;
  if (fallback?.subject) {
    return fallback;
  }

  return latest.subject ? latest : null;
}

export function buildRecentSessionSummaryContext(
  summary: SessionSummaryRecord | null
) {
  if (!summary) {
    return null;
  }

  const concepts =
    summary.conceptsCovered.length > 0
      ? `Concepts covered: ${summary.conceptsCovered.join(", ")}.`
      : null;
  const misconceptions =
    summary.misconceptionsDetected.length > 0
      ? `Recent misconceptions: ${summary.misconceptionsDetected.join(", ")}.`
      : null;
  const flashcards =
    summary.flashcardsCreated > 0
      ? `Flashcards created: ${summary.flashcardsCreated}.`
      : null;

  return [
    "Recent session summary:",
    summary.summaryText,
    concepts,
    misconceptions,
    flashcards,
    "Use this as soft continuity context only.",
  ]
    .filter(Boolean)
    .join(" ");
}

export {
  getLatestSessionSummaryForChat,
  getRecentRelevantSessionSummary,
};
