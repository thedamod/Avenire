import { generateText, Output } from "@avenire/ai";
import type { UIMessage } from "@avenire/ai/message-types";
import { apollo } from "@avenire/ai/models";
import {
  createSessionSummary,
  getLatestSessionSummaryForChat,
  getRecentRelevantSessionSummary,
  listSessionSummariesForUser,
  type SessionSummaryRecord,
} from "@avenire/database";
import { z } from "zod";

const DEFAULT_SESSION_INACTIVITY_WINDOW_MS = 30 * 60 * 1000;
const SUMMARY_MODEL = "apollo-core";

const summaryOutputSchema = z.object({
  conceptsCovered: z.array(z.string().min(1)).max(8),
  misconceptionsDetected: z.array(z.string().min(1)).max(8),
  summaryText: z.string().min(1).max(1200),
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
  ).slice(0, 8);
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
}) {
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
  previousLastMessageAt: Date | null;
  requestStartedAt: Date;
  subject?: string | null;
  userId: string;
  workspaceId: string;
}) {
  const window = resolveSessionWindow({
    latestSummary: input.latestSummary,
    latestUserPosition: input.latestUserPosition,
    previousLastMessageAt: input.previousLastMessageAt,
    requestStartedAt: input.requestStartedAt,
  });
  const boundedMessages = input.messages.slice(window.startPosition);

  if (boundedMessages.length === 0 || isTrivialSession(boundedMessages)) {
    return null;
  }

  const transcript = buildTranscript(boundedMessages);
  const flashcardsCreated = extractFlashcardsCreated(boundedMessages);
  const misconceptionsDetected = extractMisconceptions(boundedMessages);

  const result = await generateText({
    model: apollo.languageModel(SUMMARY_MODEL),
    output: Output.object({ schema: summaryOutputSchema }),
    prompt: [
      "Summarize this completed tutoring session window.",
      "Return concise, factual output only.",
      "Focus on concepts covered, misconceptions explicitly surfaced, and the learning outcome.",
      `Detected subject: ${normalizeText(input.subject) || "unknown"}`,
      `Flashcards created during this window: ${flashcardsCreated}`,
      misconceptionsDetected.length > 0
        ? `Misconceptions already detected by tools: ${misconceptionsDetected.join(", ")}`
        : "Misconceptions already detected by tools: none",
      "Session transcript:",
      transcript,
    ].join("\n\n"),
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
    ).slice(0, 8),
    startedAt:
      window.shouldCreateNewSummary || !input.latestSummary
        ? input.requestStartedAt
        : new Date(input.latestSummary.startedAt),
    startPosition: window.startPosition,
    subject: input.subject ?? null,
    summaryText: result.output.summaryText,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
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
  listSessionSummariesForUser,
};
