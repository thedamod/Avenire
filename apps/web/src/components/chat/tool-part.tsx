"use client";

import type { UIMessage } from "@avenire/ai/message-types";
import { motion } from "motion/react";
import { type ReactNode, useMemo, useState } from "react";
import {
  type ActivityAction,
  RollingAgentActivity,
} from "@/components/chat/rolling-tool-activity";
import { FlashcardDeckStack } from "@/components/flashcards/deck-stack";
import { cn } from "@/lib/utils";

type ToolPart = Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;
type CompletedToolPart = Extract<ToolPart, { state: "output-available" }>;

function extractQueryFromPart(part: ToolPart): string {
  if ("input" in part && part.input) {
    if ("query" in part.input) {
      return String((part.input as { query?: string }).query ?? "");
    }
    if ("task" in part.input) {
      return String((part.input as { task?: string }).task ?? "");
    }
  }
  if (part.state === "output-available" && "output" in part) {
    if ("query" in part.output) {
      return String((part.output as { query?: string }).query ?? "");
    }
    if ("task" in part.output) {
      return String((part.output as { task?: string }).task ?? "");
    }
  }
  return "";
}

function extractCitationMatches(part: ToolPart): string[] {
  if (part.state !== "output-available" || !("citations" in part.output)) {
    return [];
  }
  if (!Array.isArray(part.output.citations)) {
    return [];
  }
  return part.output.citations
    .map((citation) =>
      typeof citation.workspacePath === "string" ? citation.workspacePath : null
    )
    .filter((path): path is string => Boolean(path))
    .slice(0, 6);
}

function extractFileReadActions(part: ToolPart): ActivityAction[] {
  if (part.state !== "output-available" || !("files" in part.output)) {
    return [];
  }
  const files = Array.isArray(part.output.files) ? part.output.files : [];
  const actions: ActivityAction[] = [];
  for (const file of files) {
    if (!file || typeof file.workspacePath !== "string") {
      continue;
    }
    const maybeExcerpt = (file as { excerpt?: unknown }).excerpt;
    if (typeof maybeExcerpt !== "string") {
      continue;
    }
    actions.push({
      kind: "read",
      pending: false,
      value: file.workspacePath,
      preview: {
        content: maybeExcerpt,
        path: file.workspacePath,
      },
    });
  }
  return actions;
}

function buildAgentActionsFromToolPart(part: ToolPart): ActivityAction[] {
  if (
    part.type !== "tool-avenire_agent" &&
    part.type !== "tool-file_manager_agent"
  ) {
    return [];
  }

  const taskLabel =
    part.type === "tool-avenire_agent" ? "query" : "workspace files";
  const query = extractQueryFromPart(part);
  const actions: ActivityAction[] = [];

  if (query) {
    if (part.type === "tool-avenire_agent") {
      const matches = extractCitationMatches(part);
      actions.push({
        kind: "search",
        pending: part.state !== "output-available",
        value: query,
        preview:
          matches.length > 0
            ? {
                query,
                matches,
              }
            : undefined,
      });
    } else {
      actions.push({
        kind: "list",
        pending: part.state !== "output-available",
        value: taskLabel,
      });
    }
  }

  actions.push(...extractFileReadActions(part));
  return actions;
}

export function ToolRow({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="mb-1 flex items-baseline gap-2 text-sm"
      initial={{ opacity: 0, y: 5 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <span className="font-semibold text-foreground/72">{label}</span>
      {children}
    </motion.div>
  );
}

function ToolPending({ label }: { label: string }) {
  return (
    <ToolRow label={label}>
      <span className="font-mono text-[11px] text-foreground/28">
        running...
      </span>
    </ToolRow>
  );
}

function ToolError({ errorText, label }: { errorText: string; label: string }) {
  return (
    <ToolRow label={label}>
      <span className="font-mono text-[12px] text-destructive/80">
        {errorText}
      </span>
    </ToolRow>
  );
}

function FlashcardDeckComponent({
  cards,
  setId,
  title,
}: {
  cards: Array<{
    backMarkdown: string;
    frontMarkdown: string;
  }>;
  setId: string;
  title: string;
}) {
  if (cards.length === 0) {
    return (
      <p className="font-mono text-[11px] text-foreground/28">
        No cards generated
      </p>
    );
  }

  const deckCards = useMemo(
    () =>
      cards.map((card, index) => ({
        back: <MarkdownContent content={card.backMarkdown} />,
        front: <MarkdownContent content={card.frontMarkdown} />,
        id: `${setId}:${index}:${card.frontMarkdown.slice(
          0,
          24
        )}:${card.backMarkdown.slice(0, 24)}`,
        title,
      })),
    [cards, setId, title]
  );

  return (
    <div className="mb-2">
      <FlashcardDeckStack
        autoAdvanceMs={3800}
        cards={deckCards}
        className="max-w-[28rem]"
        deckLabel={title}
        showCounter
        showDeckLabel
      />
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <p className="whitespace-pre-wrap">{content}</p>
    </div>
  );
}

function QuizToolOutput({
  questions,
  setId,
  title,
}: {
  questions: Array<{
    backMarkdown: string;
    correctOptionIndex: number;
    explanation?: string | null;
    frontMarkdown: string;
    options: string[];
  }>;
  setId: string;
  title: string;
}) {
  const [answers, setAnswers] = useState<Record<number, number>>({});

  return (
    <div className="mb-2 space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold text-foreground/72 text-sm">
          {title}
        </span>
        <span className="font-mono text-[11px] text-foreground/28">
          {questions.length} questions
        </span>
        <a
          className="font-mono text-[11px] text-foreground/40 underline underline-offset-2 hover:text-foreground/60"
          href={`/workspace/flashcards/${setId}`}
        >
          open set
        </a>
      </div>
      <div className="space-y-3">
        {questions.map((question, index) => {
          const selected = answers[index];
          const answered = typeof selected === "number";
          return (
            <div
              className="rounded-lg border border-border/40 p-3"
              key={`${setId}-${index}`}
            >
              <p className="mb-2 font-medium text-sm">
                {index + 1}. {question.frontMarkdown}
              </p>
              <div className="grid gap-1.5">
                {question.options.map((option, optionIndex) => {
                  const isCorrect = optionIndex === question.correctOptionIndex;
                  return (
                    <button
                      className={cn(
                        "rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors",
                        answered &&
                          isCorrect &&
                          "border-emerald-500/60 bg-emerald-500/10",
                        answered &&
                          selected === optionIndex &&
                          !isCorrect &&
                          "border-destructive/60 bg-destructive/10",
                        !answered && "border-border/40 hover:bg-muted/50"
                      )}
                      disabled={answered}
                      key={`${setId}-${index}-${optionIndex}`}
                      onClick={() =>
                        setAnswers((current) => ({
                          ...current,
                          [index]: optionIndex,
                        }))
                      }
                      type="button"
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              {answered ? (
                <div className="mt-2 rounded-md bg-muted/40 p-2 text-xs">
                  <p className="font-medium">
                    {selected === question.correctOptionIndex
                      ? "Correct"
                      : "Incorrect"}
                  </p>
                  <p className="mt-0.5 text-foreground/50">
                    {question.explanation ?? question.backMarkdown}
                  </p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChatToolPart({ part }: { part: ToolPart }) {
  if (
    part.type === "tool-avenire_agent" ||
    part.type === "tool-file_manager_agent"
  ) {
    const actions = buildAgentActionsFromToolPart(part);
    if (actions.length === 0) {
      return null;
    }
    return (
      <RollingAgentActivity
        actions={actions}
        isStreaming={part.state !== "output-available"}
      />
    );
  }

  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <ToolPending
        label={part.type.replace("tool-", "").replaceAll("_", " ")}
      />
    );
  }

  if (part.state === "output-error") {
    const errorText = part.errorText;
    return (
      <ToolError
        errorText={errorText}
        label={part.type.replace("tool-", "").replaceAll("_", " ")}
      />
    );
  }

  if (part.state !== "output-available") {
    return (
      <ToolRow label={part.type.replace("tool-", "").replaceAll("_", " ")}>
        <span className="font-mono text-[11px] text-foreground/28">
          awaiting output
        </span>
      </ToolRow>
    );
  }

  const completedPart: CompletedToolPart = part;

  switch (completedPart.type) {
    case "tool-note_agent":
      return (
        <div className="mb-2 space-y-1">
          <ToolRow label="Note agent">
            <span className="font-mono text-[11px] text-foreground/28">
              {completedPart.output.operation}{" "}
              {completedPart.output.notes.length} note(s)
            </span>
          </ToolRow>
          {completedPart.output.notes.slice(0, 3).map((note) => (
            <div
              className="ml-0 rounded-md border border-border/30 p-2"
              key={note.fileId}
            >
              <p className="font-mono text-[10px] text-foreground/40">
                {note.workspacePath}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap font-mono text-[11px] text-foreground/50">
                {note.contentPreview.slice(0, 200)}
              </p>
            </div>
          ))}
        </div>
      );
    case "tool-search_materials":
      return (
        <div className="mb-2 space-y-1">
          <ToolRow label="Search">
            <span className="font-mono text-[12px] text-foreground/62">
              {completedPart.output.query}
            </span>
            <span className="font-mono text-[11px] text-foreground/28">
              {completedPart.output.totalMatches} matches
            </span>
          </ToolRow>
          {completedPart.output.matches.slice(0, 4).map((match) => (
            <div
              className="ml-0 rounded-md border border-border/30 p-2"
              key={match.chunkId}
            >
              <p className="font-mono text-[10px] text-foreground/40">
                {match.workspacePath}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap font-mono text-[11px] text-foreground/50">
                {match.snippet}
              </p>
            </div>
          ))}
        </div>
      );
    case "tool-generate_flashcards":
      return (
        <FlashcardDeckComponent
          cards={completedPart.output.cards ?? []}
          setId={completedPart.output.setId}
          title={completedPart.output.title}
        />
      );
    case "tool-get_due_cards":
      return (
        <div className="mb-2 space-y-1">
          <ToolRow label="Due cards">
            <span className="font-mono text-[11px] text-foreground/28">
              {completedPart.output.totalDueCount} due today
            </span>
          </ToolRow>
          {completedPart.output.dueCards.slice(0, 3).map((card) => (
            <div
              className="ml-0 rounded-md border border-border/30 p-2"
              key={card.cardId}
            >
              <p className="font-mono text-[11px] text-foreground/50">
                {card.setTitle}
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-foreground/40">
                {card.frontMarkdown}
              </p>
            </div>
          ))}
        </div>
      );
    case "tool-show_widget":
      return null;
    case "tool-quiz_me":
      return (
        <QuizToolOutput
          questions={completedPart.output.questions}
          setId={completedPart.output.setId}
          title={completedPart.output.title}
        />
      );
    case "tool-visualize_read_me":
      return (
        <ToolRow label="Read skill">
          <span className="font-mono text-[11px] text-foreground/28">
            loaded
          </span>
        </ToolRow>
      );
    default:
      return null;
  }
}
