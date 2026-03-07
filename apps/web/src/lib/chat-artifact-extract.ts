export interface ExtractedArtifact {
  sourceMessageId: string | null;
  toolCallId: string | null;
  toolName: string;
  kind: string;
  title: string;
  content: Record<string, unknown>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeToolOutput(output: unknown): Record<string, unknown> | null {
  if (isObject(output)) {
    return output;
  }

  if (typeof output === "string") {
    return { value: output };
  }

  return null;
}

function shouldExtractToolPart(part: Record<string, unknown>) {
  const state =
    typeof part.state === "string" ? part.state : null;

  // Only persist completed tool outputs. Skip input/progress/error states.
  if (state && state !== "output-available") {
    return false;
  }

  if (
    typeof part.errorText === "string" &&
    (part.output === undefined || part.output === null) &&
    (part.result === undefined || part.result === null) &&
    (part.data === undefined || part.data === null)
  ) {
    return false;
  }

  return true;
}

function inferKind(toolName: string, output: Record<string, unknown>): string {
  if (typeof output.kind === "string" && output.kind.length > 0) {
    return output.kind;
  }

  if (toolName.includes("flashcard")) return "flashcards";
  if (toolName.includes("quiz")) return "quiz";
  if (toolName.includes("plot")) return "matplotlib";
  if (toolName.includes("graph")) return "desmos";
  return "artifact";
}

function inferTitle(kind: string, output: Record<string, unknown>) {
  if (typeof output.title === "string" && output.title.trim()) {
    return output.title.trim();
  }

  if (typeof output.topic === "string" && output.topic.trim()) {
    return `${kind}: ${output.topic.trim()}`;
  }

  return kind[0]?.toUpperCase() + kind.slice(1);
}

export function extractArtifactsFromMessage(message: {
  id?: string;
  parts?: unknown[];
}): ExtractedArtifact[] {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  const out: ExtractedArtifact[] = [];

  for (const part of parts) {
    if (!isObject(part) || typeof part.type !== "string") {
      continue;
    }

    if (part.type.startsWith("tool-")) {
      if (!shouldExtractToolPart(part)) {
        continue;
      }
      const toolName = part.type.slice(5);
      const output = normalizeToolOutput(
        part.output ?? part.result ?? part.data ?? part,
      );
      if (!output) {
        continue;
      }

      const kind = inferKind(toolName, output);
      out.push({
        sourceMessageId: message.id ?? null,
        toolCallId:
          typeof part.toolCallId === "string" ? part.toolCallId : null,
        toolName,
        kind,
        title: inferTitle(kind, output),
        content: output,
      });
      continue;
    }

    if (part.type === "tool-result") {
      const toolName =
        typeof part.toolName === "string" ? part.toolName : "tool-result";
      const output = normalizeToolOutput(part.result ?? part.output ?? part.data);
      if (!output) {
        continue;
      }

      const kind = inferKind(toolName, output);
      out.push({
        sourceMessageId: message.id ?? null,
        toolCallId:
          typeof part.toolCallId === "string" ? part.toolCallId : null,
        toolName,
        kind,
        title: inferTitle(kind, output),
        content: output,
      });
    }
  }

  return out;
}

export function extractArtifactsFromMessages(messages: Array<{ id?: string; parts?: unknown[] }>) {
  return messages.flatMap((message) => extractArtifactsFromMessage(message));
}
