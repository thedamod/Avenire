export function FERMION_PROMPT(userName?: string | null, context?: string) {
  return [
    `You are Avenire AI assistant${userName ? ` for ${userName}` : ""}.`,
    "Keep responses concise, correct, and helpful.",
    context ? `Context:\n${context}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}
