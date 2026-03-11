"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage } from "@avenire/ai/message-types";
import { Badge } from "@avenire/ui/components/badge";
import { Button } from "@avenire/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@avenire/ui/components/card";
import { cn } from "@avenire/ui/lib/utils";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { useMatplotlibPlot } from "@/hooks/use-matplotlib-plot";
import {
  RollingAgentActivity,
  type ActivityAction,
} from "@/components/chat/rolling-tool-activity";

type ToolPart = Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;
type CompletedToolPart = Extract<ToolPart, { state: "output-available" }>;
type DeleteToolPart = Extract<ToolPart, { type: "tool-delete_file" }>;
type DeleteApprovalRequestedToolPart = Extract<
  DeleteToolPart,
  { state: "approval-requested" }
>;
type DeleteApprovalRespondedToolPart = Extract<
  DeleteToolPart,
  { state: "approval-responded" }
>;

function buildAgentActionsFromToolPart(part: ToolPart): ActivityAction[] {
  if (
    part.type !== "tool-avenire_agent" &&
    part.type !== "tool-file_manager_agent"
  ) {
    return [];
  }

  const taskLabel =
    part.type === "tool-avenire_agent" ? "query" : "workspace files";
  const query =
    "input" in part && part.input && "query" in part.input
      ? String((part.input as { query?: string }).query ?? "")
      : "input" in part && part.input && "task" in part.input
        ? String((part.input as { task?: string }).task ?? "")
        : part.state === "output-available" && "query" in part.output
          ? String((part.output as { query?: string }).query ?? "")
          : part.state === "output-available" && "task" in part.output
            ? String((part.output as { task?: string }).task ?? "")
            : "";

  const actions: ActivityAction[] = [];

  if (query) {
    if (part.type === "tool-avenire_agent") {
      const matches =
        part.state === "output-available" &&
        "citations" in part.output &&
        Array.isArray(part.output.citations)
          ? part.output.citations
              .map((citation) =>
                typeof citation.workspacePath === "string"
                  ? citation.workspacePath
                  : null
              )
              .filter((path): path is string => Boolean(path))
              .slice(0, 6)
          : [];

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

  if (part.state === "output-available" && "files" in part.output) {
    const files = Array.isArray(part.output.files) ? part.output.files : [];
    for (const file of files) {
      if (
        !file ||
        typeof file.workspacePath !== "string" ||
        typeof file.excerpt !== "string"
      ) {
        continue;
      }
      actions.push({
        kind: "read",
        pending: false,
        value: file.workspacePath,
        preview: {
          content: file.excerpt,
          path: file.workspacePath,
        },
      });
    }
  }

  return actions;
}

function DeleteApprovalCard({
  addToolApprovalResponse,
  isReadonly,
  part,
}: {
  addToolApprovalResponse: UseChatHelpers<UIMessage>["addToolApprovalResponse"];
  isReadonly: boolean;
  part: DeleteApprovalRequestedToolPart | DeleteApprovalRespondedToolPart;
}) {
  const [pendingDecision, setPendingDecision] = useState<boolean | null>(null);
  const pathHint =
    "workspacePathHint" in part.input &&
    typeof part.input.workspacePathHint === "string"
      ? part.input.workspacePathHint
      : part.input.fileId;

  const submitDecision = async (approved: boolean) => {
    try {
      setPendingDecision(approved);
      await addToolApprovalResponse({
        approved,
        id: part.approval.id,
      });
    } catch (error) {
      toast.error("Unable to submit approval response", {
        description:
          error instanceof Error ? error.message : "Unknown approval error.",
      });
      setPendingDecision(null);
    }
  };

  if (part.state === "approval-responded") {
    return (
      <ToolCardShell title="Delete file">
        <Badge variant={part.approval.approved ? "secondary" : "outline"}>
          {part.approval.approved ? "Approved" : "Denied"}
        </Badge>
        <p className="font-mono text-xs">{pathHint}</p>
        <p className="text-muted-foreground text-xs">
          {part.approval.approved
            ? "Waiting for the server to continue the tool run."
            : "The delete action was denied and will not run."}
        </p>
      </ToolCardShell>
    );
  }

  return (
    <ToolCardShell title="Delete file">
      <Badge variant="outline">Approval required</Badge>
      <p className="font-mono text-xs">{pathHint}</p>
      <p className="text-muted-foreground text-xs">
        Deleting this file moves it to trash.
      </p>
      <div className="flex gap-2">
        <Button
          disabled={isReadonly || pendingDecision !== null}
          onClick={() => submitDecision(true)}
          size="sm"
          type="button"
        >
          {pendingDecision === true ? "Approving..." : "Approve"}
        </Button>
        <Button
          disabled={isReadonly || pendingDecision !== null}
          onClick={() => submitDecision(false)}
          size="sm"
          type="button"
          variant="outline"
        >
          {pendingDecision === false ? "Denying..." : "Deny"}
        </Button>
      </div>
    </ToolCardShell>
  );
}

function ToolCardShell({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <Card className="w-full gap-2 border-foreground/[0.08] bg-foreground/[0.02] py-2">
      <CardHeader className="px-3 pb-1">
        <CardTitle className="text-[11px] font-semibold uppercase tracking-wide text-foreground/55">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-1 text-xs">
        {children}
      </CardContent>
    </Card>
  );
}

function ToolPending({ input, label }: { input: unknown; label: string }) {
  return (
    <ToolCardShell title={label}>
      <Badge variant="secondary">Running</Badge>
      <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted/70 p-3 text-xs">
        {JSON.stringify(input, null, 2)}
      </pre>
    </ToolCardShell>
  );
}

function ToolError({ errorText, label }: { errorText: string; label: string }) {
  return (
    <ToolCardShell title={label}>
      <Badge variant="destructive">Failed</Badge>
      <p className="text-destructive text-sm">{errorText}</p>
    </ToolCardShell>
  );
}

function GraphToolCard({
  caption,
  pythonCode,
  title,
}: {
  caption: string | null;
  pythonCode: string;
  title: string;
}) {
  const plot = useMatplotlibPlot(pythonCode);

  return (
    <ToolCardShell title={title}>
      <Badge variant="secondary">Matplotlib</Badge>
      {plot.loading && (
        <p className="text-muted-foreground text-sm">Rendering plot...</p>
      )}
      {plot.error && <p className="text-destructive text-sm">{plot.error}</p>}
      {plot.imgUrl && (
        <img
          alt={title}
          className="w-full rounded-lg border border-border/60 bg-white object-contain"
          height={800}
          src={plot.imgUrl}
          width={1200}
        />
      )}
      {caption ? (
        <p className="text-muted-foreground text-xs">{caption}</p>
      ) : null}
      <details className="rounded-md border border-border/60 bg-muted/50 p-3">
        <summary className="cursor-pointer font-medium text-xs">
          Python code
        </summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">
          {pythonCode}
        </pre>
      </details>
    </ToolCardShell>
  );
}

function QuizToolCard({
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
    <ToolCardShell title={title}>
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{questions.length} questions</Badge>
        <a
          className="text-xs underline underline-offset-4"
          href={`/dashboard/flashcards/${setId}`}
        >
          Open study set
        </a>
      </div>
      <div className="space-y-4">
        {questions.map((question, index) => {
          const selected = answers[index];
          const answered = typeof selected === "number";
          return (
            <div
              className="rounded-lg border border-border/60 p-3"
              key={`${setId}-${index}`}
            >
              <p className="mb-3 font-medium text-sm">
                {index + 1}. {question.frontMarkdown}
              </p>
              <div className="grid gap-2">
                {question.options.map((option, optionIndex) => {
                  const isCorrect = optionIndex === question.correctOptionIndex;
                  return (
                    <button
                      className={cn(
                        "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                        answered &&
                          isCorrect &&
                          "border-emerald-500 bg-emerald-500/10",
                        answered &&
                          selected === optionIndex &&
                          !isCorrect &&
                          "border-destructive bg-destructive/10",
                        !answered && "border-border/70 hover:bg-muted/70"
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
                <div className="mt-3 rounded-md bg-muted/60 p-3 text-xs">
                  <p className="font-medium">
                    {selected === question.correctOptionIndex
                      ? "Correct"
                      : "Incorrect"}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {question.explanation ?? question.backMarkdown}
                  </p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </ToolCardShell>
  );
}

export function ChatToolPart({
  addToolApprovalResponse,
  isReadonly,
  part,
}: {
  addToolApprovalResponse: UseChatHelpers<UIMessage>["addToolApprovalResponse"];
  isReadonly: boolean;
  part: ToolPart;
}) {
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

  if (
    part.type === "tool-delete_file" &&
    (part.state === "approval-requested" || part.state === "approval-responded")
  ) {
    return (
      <DeleteApprovalCard
        addToolApprovalResponse={addToolApprovalResponse}
        isReadonly={isReadonly}
        part={part}
      />
    );
  }

  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <ToolPending
        input={part.input}
        label={part.type.replace("tool-", "").replaceAll("_", " ")}
      />
    );
  }

  if (part.state === "output-error") {
    return (
      <ToolError
        errorText={part.errorText}
        label={part.type.replace("tool-", "").replaceAll("_", " ")}
      />
    );
  }

  if (part.state !== "output-available") {
    return (
      <ToolCardShell
        title={part.type.replace("tool-", "").replaceAll("_", " ")}
      >
        <Badge variant="outline">Awaiting output</Badge>
      </ToolCardShell>
    );
  }

  const completedPart: CompletedToolPart = part;

  switch (completedPart.type) {
    case "tool-create_note":
    case "tool-update_note":
      return (
        <ToolCardShell title={completedPart.output.title}>
          <Badge variant="secondary">
            {completedPart.type === "tool-create_note"
              ? "Note created"
              : "Note updated"}
          </Badge>
          <p className="text-sm">{completedPart.output.workspacePath}</p>
          {completedPart.output.ingestionJobId ? (
            <p className="text-muted-foreground text-xs">
              Ingestion job: {completedPart.output.ingestionJobId}
            </p>
          ) : null}
        </ToolCardShell>
      );
    case "tool-read_note":
    case "tool-read_workspace_file":
      return (
        <ToolCardShell
          title={
            completedPart.type === "tool-read_note"
              ? completedPart.output.title
              : completedPart.output.name
          }
        >
          <Badge variant="secondary">
            {completedPart.type === "tool-read_note"
              ? "Loaded note"
              : completedPart.output.readMode === "text"
                ? "Read file"
                : "Read indexed summary"}
          </Badge>
          <p className="text-muted-foreground text-xs">
            {completedPart.output.workspacePath}
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted/70 p-3 text-xs">
            {completedPart.output.content}
          </pre>
        </ToolCardShell>
      );
    case "tool-search_materials":
      return (
        <ToolCardShell title="Workspace Search">
          <Badge variant="secondary">
            {completedPart.output.totalMatches} matches
          </Badge>
          <div className="space-y-3">
            {completedPart.output.matches.slice(0, 6).map((match) => (
              <div
                className="rounded-md border border-border/60 p-3"
                key={match.chunkId}
              >
                <p className="font-medium text-xs">{match.workspacePath}</p>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground text-xs">
                  {match.snippet}
                </p>
              </div>
            ))}
          </div>
        </ToolCardShell>
      );
    case "tool-list_files":
      return (
        <ToolCardShell title="Workspace Files">
          <Badge variant="secondary">
            {completedPart.output.totalFiles} files
          </Badge>
          <div className="space-y-2">
            {completedPart.output.files.map((file) => (
              <div
                className="flex items-center justify-between gap-3 text-xs"
                key={file.fileId}
              >
                <span className="truncate">{file.workspacePath}</span>
                <Badge variant={file.isIngested ? "secondary" : "outline"}>
                  {file.isIngested ? "Indexed" : "Not indexed"}
                </Badge>
              </div>
            ))}
          </div>
        </ToolCardShell>
      );
    case "tool-move_file":
      return (
        <ToolCardShell title={completedPart.output.title}>
          <Badge variant="secondary">File moved</Badge>
          <div className="space-y-1 text-xs">
            <p className="font-mono text-muted-foreground">
              From: {completedPart.output.previousWorkspacePath}
            </p>
            <p className="font-mono">{completedPart.output.workspacePath}</p>
          </div>
        </ToolCardShell>
      );
    case "tool-delete_file":
      return (
        <ToolCardShell title={completedPart.output.title}>
          <Badge variant="secondary">Moved to trash</Badge>
          <p className="font-mono text-xs">
            {completedPart.output.workspacePath}
          </p>
          <p className="text-muted-foreground text-xs">
            Deleted at {completedPart.output.deletedAt}
          </p>
        </ToolCardShell>
      );
    case "tool-get_file_summary":
      return (
        <ToolCardShell title={completedPart.output.name}>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {completedPart.output.chunkCount} chunks
            </Badge>
            <Badge
              variant={
                completedPart.output.hasIngestion ? "secondary" : "outline"
              }
            >
              {completedPart.output.hasIngestion ? "Indexed" : "Pending"}
            </Badge>
          </div>
          <p className="text-muted-foreground text-xs">
            {completedPart.output.workspacePath}
          </p>
          <div className="space-y-2">
            {completedPart.output.chunks.map((chunk) => (
              <div
                className="rounded-md border border-border/60 p-3"
                key={chunk.chunkId}
              >
                <p className="whitespace-pre-wrap text-xs">{chunk.content}</p>
              </div>
            ))}
          </div>
        </ToolCardShell>
      );
    case "tool-generate_flashcards":
      return (
        <ToolCardShell title={completedPart.output.title}>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {completedPart.output.cardCount} cards
            </Badge>
            <a
              className="text-xs underline underline-offset-4"
              href={`/dashboard/flashcards/${completedPart.output.setId}`}
            >
              Open set
            </a>
          </div>
        </ToolCardShell>
      );
    case "tool-get_due_cards":
      return (
        <ToolCardShell title="Due Study Cards">
          <Badge variant="secondary">
            {completedPart.output.totalDueCount} due today
          </Badge>
          <div className="space-y-2">
            {completedPart.output.dueCards.map((card) => (
              <div
                className="rounded-md border border-border/60 p-3 text-xs"
                key={card.cardId}
              >
                <p className="font-medium">{card.setTitle}</p>
                <p className="mt-1 text-muted-foreground">
                  {card.frontMarkdown}
                </p>
              </div>
            ))}
          </div>
        </ToolCardShell>
      );
    case "tool-render_graph":
      return (
        <GraphToolCard
          caption={completedPart.output.caption ?? null}
          pythonCode={completedPart.output.pythonCode}
          title={completedPart.output.title}
        />
      );
    case "tool-quiz_me":
      return (
        <QuizToolCard
          questions={completedPart.output.questions}
          setId={completedPart.output.setId}
          title={completedPart.output.title}
        />
      );
    default:
      return null;
  }
}
