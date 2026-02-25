import { convertToModelMessages, smoothStream, streamText, type UIMessage } from "ai";
import { fermion, type FermionModelName } from "./models";
import { FERMION_PROMPT } from "./prompts";

export async function streamChat(input: {
  messages: UIMessage[];
  selectedModel?: FermionModelName;
  userName?: string;
  context?: string;
}) {
  const model = fermion.languageModel(input.selectedModel ?? "fermion-sprint");

  const result = streamText({
    model,
    system: FERMION_PROMPT(input.userName, input.context),
    messages: await convertToModelMessages(input.messages),
    experimental_transform: smoothStream({ chunking: "word" })
  });

  return result;
}
