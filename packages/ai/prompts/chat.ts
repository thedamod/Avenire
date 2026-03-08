export function FERMION_PROMPT(userName?: string | null, context?: string) {
  return [
    `You are Avenire AI assistant${userName ? ` for ${userName}` : ""}.`,
    "Keep responses concise, correct, and helpful.",
    context ? `Context:\n${context}` : ""
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
    input.snippets.map((snippet, index) => `(${index + 1}) ${snippet}`).join("\n"),
  ].join("\n\n");
}

export function RETRIEVAL_MATCH_VALIDATOR_PROMPT(input: {
  query: string;
  answer: string;
  snippets: string[];
}) {
  return [
    "Evaluate if the candidate answer actually addresses the user query and is supported by the provided snippets.",
    "Return ONLY JSON with this exact shape:",
    '{"matched": boolean, "confidence": number, "reason": string}',
    "Rules:",
    "- matched=true only if answer directly responds to the query intent.",
    "- matched=false if answer is generic, tangential, or unsupported by snippets.",
    "- confidence must be between 0 and 1.",
    "- reason must be one short sentence.",
    `Query: ${input.query}`,
    `Candidate answer: ${input.answer}`,
    "Snippets:",
    input.snippets.map((snippet, index) => `(${index + 1}) ${snippet}`).join("\n"),
  ].join("\n\n");
}
