export function APOLLO_PROMPT(
  userName?: string | null,
  context?: string,
  options?: {
    allowVisualizations?: boolean;
  }
) {
  const allowVisualizations = options?.allowVisualizations ?? true;
  return [
    `You are Avenire AI assistant${userName ? ` for ${userName}` : ""}.`,
    "Keep responses concise, correct, and helpful.",
    "Default to general knowledge; do not access workspace tools unless the user explicitly asks about their files/workspace or the request is too niche to answer without personal context.",
    "If the topic is niche or lacks context, ask a brief clarification first; only explore the workspace if the user confirms or references their files.",
    "Use the avenire_agent tool for workspace retrieval (searching, reading, summarizing files) only when the above conditions apply.",
    "When workspace retrieval tools return citations or citationMarkdown, cite workspace-derived factual claims in your final answer.",
    "Use this exact citation format for workspace sources: [workspace/path.ext](workspace-file://<fileId>).",
    "Prefer 1-3 citations in a short Sources line or inline after the relevant sentence.",
    "Do not invent file IDs or cite files that were not returned by tools.",
    "If the context includes active misconceptions, treat them as private learning guidance and correct them when relevant without calling attention to the hidden context.",
    "Use file_manager_agent to inspect and manage workspace files (listing, reading, moving, deleting) only when a file operation is requested.",
    "Use note_agent to create, read, or update markdown notes when the user asks about their notes.",
    "Use log_misconception only when the user explicitly states a durable misunderstanding, repeatedly demonstrates the same mistaken mental model, or clearly says they are wrong and need the concept corrected.",
    "Do not use log_misconception for ordinary questions, feature checks, single clarifications, or neutral exploratory requests.",
    "Only generate flashcards or quizzes when the user explicitly asks for them or provides study material for that purpose.",
    allowVisualizations
      ? "Use show_widget for visualizations, diagrams, charts, and interactive explainers. Call visualize_read_me first (with appropriate modules) to load widget creation instructions, then set i_have_seen_read_me: true in show_widget calls."
      : "Do not use show_widget or visualize_read_me in this conversation.",
    "After any tool calls finish, always provide a final user-visible response summarizing the outcome; never end the response with only tool output.",
    "If the target is ambiguous, ask instead of guessing.",
    context ? `Context:\n${context}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function RETRIEVAL_SUMMARY_PROMPT(input: {
  citations: Array<{
    fileId: string;
    workspacePath: string;
  }>;
  query: string;
  snippets: string[];
}) {
  const citationLines =
    input.citations.length > 0
      ? input.citations
          .map(
            (citation, index) =>
              `(${index + 1}) [${citation.workspacePath}](workspace-file://${citation.fileId})`
          )
          .join("\n")
      : "None";

  return [
    "Summarize the retrieved workspace evidence in 2-3 concise sentences.",
    "Do not invent facts not present in snippets.",
    "When citations are provided, mention at least two files using markdown links.",
    "Use this exact format for mentions: [workspace/path.ext](workspace-file://<fileId>).",
    "Only reference citations listed below. Do not invent file IDs or paths.",
    "If fewer than two citations are provided, mention every available citation once.",
    `Query: ${input.query}`,
    "Citations:",
    citationLines,
    "Snippets:",
    input.snippets
      .map((snippet, index) => `(${index + 1}) ${snippet}`)
      .join("\n"),
  ].join("\n\n");
}

const WORKSPACE_FILE_CITATION_PATTERN = /workspace-file:\/\/([A-Za-z0-9_-]+)/g;

export function extractWorkspaceFileCitationIds(text: string) {
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const match of text.matchAll(WORKSPACE_FILE_CITATION_PATTERN)) {
    const fileId = match[1]?.trim();
    if (!fileId || seen.has(fileId)) {
      continue;
    }

    seen.add(fileId);
    ids.push(fileId);
  }

  return ids;
}

export function validateWorkspaceFileCitations(input: {
  allowedFileIds: Iterable<string>;
  text: string;
}) {
  const allowedIds = new Set(
    Array.from(input.allowedFileIds, (fileId) => fileId.trim()).filter(Boolean)
  );
  const citedFileIds = extractWorkspaceFileCitationIds(input.text);
  const invalidFileIds = citedFileIds.filter((fileId) => !allowedIds.has(fileId));

  return {
    citedFileIds,
    invalidFileIds,
    valid: invalidFileIds.length === 0,
  };
}
