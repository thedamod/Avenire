import { streamChat, type FermionModelName, type UIMessage } from "@avenire/ai";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    messages?: UIMessage[];
    selectedModel?: FermionModelName;
    selectedReasoningModel?: FermionModelName;
    chatId?: string;
    userName?: string;
    context?: string;
  };

  const result = await streamChat({
    messages: body.messages ?? [],
    selectedModel: body.selectedModel ?? body.selectedReasoningModel,
    userName: body.userName,
    context: body.context
  });

  return result.toUIMessageStreamResponse({
    originalMessages: body.messages ?? [],
    generateMessageId: randomUUID
  });
}
