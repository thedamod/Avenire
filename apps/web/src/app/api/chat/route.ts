import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type FermionModelName,
  fermion,
  generateText,
  streamChat,
} from "@avenire/ai";
import type { UIMessage } from "@avenire/ai/message-types";
import { auth } from "@avenire/auth/server";
import { headers } from "next/headers";
import { NextResponse, after } from "next/server";
import { randomUUID } from "node:crypto";
import { createResumableStreamContext } from "resumable-stream";
import {
  deleteChatForUser,
  getChatBySlugForUser,
  saveMessagesForChatSlug,
  updateChatForUser,
} from "@/lib/chat-data";
import {
  clearActiveStreamId,
  getActiveStreamId,
  getRedisClient,
  getRedisSubscriber,
  setActiveStreamId,
} from "./chat-stream-store";

const DEFAULT_CHAT_TITLE = "New Chat";
const LOG_PREFIX = "[api/chat]";

function logInfo(message: string, meta?: Record<string, unknown>) {
  if (meta) {
    console.info(`${LOG_PREFIX} ${message}`, meta);
    return;
  }

  console.info(`${LOG_PREFIX} ${message}`);
}

function logError(message: string, meta?: Record<string, unknown>) {
  if (meta) {
    console.error(`${LOG_PREFIX} ${message}`, meta);
    return;
  }

  console.error(`${LOG_PREFIX} ${message}`);
}

function sanitizeChatName(value: string) {
  return value
    .replace(/^["'`\s]+|["'`\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function extractLatestUserText(messages: UIMessage[]) {
  const latestUserMessage = [...messages].reverse().find((m) => m.role === "user");
  if (!latestUserMessage) {
    return "";
  }

  const textPart = latestUserMessage.parts.find((part) => part.type === "text");
  return textPart?.type === "text" ? textPart.text.trim() : "";
}

async function generateChatName(messages: UIMessage[]) {
  const latestUserText = extractLatestUserText(messages);
  if (!latestUserText) {
    logInfo("Skipping chat title generation: latest user text missing");
    return null;
  }

  try {
    logInfo("Generating chat title", {
      model: "fermion-sprint",
      sourceLength: latestUserText.length,
    });

    const { text } = await generateText({
      model: fermion.languageModel("fermion-sprint"),
      prompt: [
        "Generate a concise chat title based only on the user's request.",
        "Use 3-6 words.",
        "No quotes. No punctuation at the end. Return only the title.",
        `User message: ${latestUserText}`,
      ].join("\n"),
      maxOutputTokens: 20,
      temperature: 0.2,
    });

    const normalized = sanitizeChatName(text);
    logInfo("Generated chat title result", {
      raw: text,
      normalized,
      accepted: normalized.length > 0,
    });

    return normalized.length > 0 ? normalized : null;
  } catch (error) {
    logError("Failed to generate chat title", { error });
    return null;
  }
}

function shouldGenerateTitle(currentTitle: string, messages: UIMessage[]) {
  if (currentTitle === DEFAULT_CHAT_TITLE) {
    return true;
  }

  const latestUserText = extractLatestUserText(messages);
  if (!latestUserText) {
    return false;
  }

  return currentTitle === sanitizeChatName(latestUserText);
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    messages?: UIMessage[];
    selectedModel?: FermionModelName;
    selectedReasoningModel?: FermionModelName;
    chatId?: string;
    userName?: string;
    context?: string;
  };

  const chatSlug = body.chatId?.trim();
  if (!chatSlug) {
    return NextResponse.json({ error: "Missing chatId" }, { status: 400 });
  }

  const originalMessages = body.messages ?? [];
  logInfo("Incoming chat request", {
    chatId: body.chatId ?? null,
    selectedModel: body.selectedModel ?? null,
    selectedReasoningModel: body.selectedReasoningModel ?? null,
    messageCount: originalMessages.length,
  });

  const chat = await getChatBySlugForUser(session.user.id, chatSlug);

  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const previousStreamId = await getActiveStreamId(chatSlug);
  if (previousStreamId) {
    await clearActiveStreamId(chatSlug, previousStreamId);
  }

  const stream = createUIMessageStream<UIMessage>({
    execute: async ({ writer }) => {
      if (shouldGenerateTitle(chat.title, originalMessages)) {
        const nextName = await generateChatName(originalMessages);
        if (nextName) {
          logInfo("Streaming generated chat title event", {
            chatId: chatSlug,
            name: nextName,
          });
          writer.write({
            type: "data-chatName",
            transient: true,
            data: {
              id: chatSlug,
              name: nextName,
            },
          });

          await updateChatForUser(session.user.id, chatSlug, { title: nextName });
          logInfo("Persisted generated chat title", {
            chatId: chatSlug,
            name: nextName,
          });
        }
      }

      logInfo("Starting model stream", {
        chatId: chatSlug,
        model: body.selectedModel ?? body.selectedReasoningModel ?? "fermion-sprint",
      });

      let result: Awaited<ReturnType<typeof streamChat>>;
      try {
        result = await streamChat({
          messages: originalMessages,
          selectedModel: body.selectedModel ?? body.selectedReasoningModel,
          userName: body.userName ?? session.user.name ?? undefined,
          context: body.context,
        });
      } catch (error) {
        logError("Failed to start model stream", {
          chatId: chatSlug,
          model: body.selectedModel ?? body.selectedReasoningModel ?? "fermion-sprint",
          error,
        });
        throw error;
      }

      writer.merge(
        result.toUIMessageStream({
          originalMessages,
          generateMessageId: randomUUID,
          onFinish: async ({ messages }) => {
            try {
              logInfo("Model stream finished", {
                chatId: chatSlug,
                messageCount: messages.length,
              });
              await saveMessagesForChatSlug(
                session.user.id,
                chatSlug,
                messages as unknown as UIMessage[],
              );
              logInfo("Persisted streamed messages", {
                chatId: chatSlug,
                messageCount: messages.length,
              });
            } catch (error) {
              logError("Failed to persist streamed chat messages", {
                chatId: chatSlug,
                error,
              });
            } finally {
              await clearActiveStreamId(chatSlug, streamId);
              logInfo("Cleared active stream id", { chatId: chatSlug });
            }
          },
        }),
      );
    },
  });

  const baseResponse = createUIMessageStreamResponse({ stream });
  if (!baseResponse.body) {
    return baseResponse;
  }

  const streamId = randomUUID();
  const [clientBody, resumableBody] = baseResponse.body.tee();
  const resumableTextStream = resumableBody.pipeThrough(new TextDecoderStream());

  void (async () => {
    try {
      const streamContext = createResumableStreamContext({
        waitUntil: after,
        publisher: await getRedisClient(),
        subscriber: await getRedisSubscriber(),
      });

      await streamContext.createNewResumableStream(streamId, () => resumableTextStream);
      await setActiveStreamId(chatSlug, streamId);
    } catch (error) {
      logError("Failed to create resumable chat stream", {
        chatSlug,
        streamId,
        error,
      });
    }
  })();

  return new Response(clientBody, {
    status: baseResponse.status,
    statusText: baseResponse.statusText,
    headers: baseResponse.headers,
  });
}

export async function DELETE(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing chat id" }, { status: 400 });
  }

  const deleted = await deleteChatForUser(session.user.id, id);
  if (!deleted) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const activeStreamId = await getActiveStreamId(id);
  if (activeStreamId) {
    await clearActiveStreamId(id, activeStreamId);
  }

  return NextResponse.json({ ok: true });
}
