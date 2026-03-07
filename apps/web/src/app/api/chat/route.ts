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
  isChatOwnerForUser,
  saveMessagesForChatSlug,
  updateChatForUser,
} from "@/lib/chat-data";
import { consumeChatUnits } from "@/lib/billing";
import { createApiLogger } from "@/lib/observability";
import {
  clearActiveStreamId,
  getActiveStreamId,
  getRedisClient,
  getRedisSubscriber,
  setActiveStreamId,
} from "./chat-stream-store";

const DEFAULT_CHAT_TITLE = "New Chat";
const LOG_PREFIX = "[api/chat]";
const DEFAULT_CHAT_TOKENS_PER_CREDIT = 4000;

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

function isValidUIMessageArray(value: unknown): value is UIMessage[] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((item) => {
    if (typeof item !== "object" || item === null) {
      return false;
    }

    const candidate = item as Record<string, unknown>;
    return (
      typeof candidate.role === "string" &&
      Array.isArray(candidate.parts)
    );
  });
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
      rawLength: text.length,
      normalizedLength: normalized.length,
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

function resolveChatTokensPerCredit() {
  const raw = Number.parseInt(process.env.CHAT_TOKENS_PER_CREDIT ?? "", 10);
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_CHAT_TOKENS_PER_CREDIT;
  }
  return raw;
}

function resolveTotalTokens(usage: {
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
}) {
  if (typeof usage.totalTokens === "number" && Number.isFinite(usage.totalTokens)) {
    return usage.totalTokens;
  }

  const inputTokens = typeof usage.inputTokens === "number" ? usage.inputTokens : 0;
  const outputTokens = typeof usage.outputTokens === "number" ? usage.outputTokens : 0;
  return inputTokens + outputTokens;
}

function getRequiredChatCredits(totalTokens: number) {
  const tokensPerCredit = resolveChatTokensPerCredit();
  return Math.max(1, Math.ceil(totalTokens / tokensPerCredit));
}

function getPersistedMessages(input: {
  originalMessages: UIMessage[];
  streamedMessages: UIMessage[];
  responseMessage: UIMessage;
  isContinuation: boolean;
}) {
  if (input.streamedMessages.length >= input.originalMessages.length) {
    return input.streamedMessages;
  }

  if (input.isContinuation && input.originalMessages.length > 0) {
    return [...input.originalMessages.slice(0, -1), input.responseMessage];
  }

  return [...input.originalMessages, input.responseMessage];
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  const apiLogger = createApiLogger({
    request,
    route: "/api/chat",
    feature: "chat",
    userId: session?.user?.id ?? null,
  });
  void apiLogger.requestStarted();

  if (!session?.user) {
    void apiLogger.requestFailed(401, "Unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    messages?: unknown;
    selectedModel?: FermionModelName;
    selectedReasoningModel?: FermionModelName;
    chatId?: string;
    userName?: string;
    context?: string;
  };

  const chatSlug = body.chatId?.trim();
  if (!chatSlug) {
    void apiLogger.requestFailed(400, "Missing chatId");
    return NextResponse.json({ error: "Missing chatId" }, { status: 400 });
  }

  if (typeof body.messages !== "undefined" && !isValidUIMessageArray(body.messages)) {
    return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
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
    void apiLogger.requestFailed(404, "Chat not found", { chatId: chatSlug });
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }
  if (chat.readOnly || !(await isChatOwnerForUser(session.user.id, chatSlug))) {
    void apiLogger.requestFailed(403, "Read-only chat", { chatId: chatSlug });
    return NextResponse.json({ error: "Read-only chat" }, { status: 403 });
  }

  const initialUsage = await consumeChatUnits(session.user.id, 1);
  if (!initialUsage.ok) {
    const retryAfter = initialUsage.retryAfter?.toISOString() ?? null;
    void apiLogger.rateLimited("chat", retryAfter, { chatId: chatSlug });
    return NextResponse.json(
      {
        error: "Chat usage limit reached",
        retryAfter,
      },
      { status: 429 },
    );
  }
  const previousStreamId = await getActiveStreamId(chatSlug);
  if (previousStreamId) {
    await clearActiveStreamId(chatSlug, previousStreamId);
  }
  const streamId = randomUUID();

  const stream = createUIMessageStream<UIMessage>({
    execute: async ({ writer }) => {
      if (shouldGenerateTitle(chat.title, originalMessages)) {
        const nextName = await generateChatName(originalMessages);
        if (nextName) {
          logInfo("Streaming generated chat title event", {
            chatId: chatSlug,
            nameLength: nextName.length,
          });
          writer.write({
            type: "data-chatName",
            transient: true,
            data: {
              id: chatSlug,
              name: nextName,
            },
          });

          try {
            await updateChatForUser(session.user.id, chatSlug, { title: nextName });
            logInfo("Persisted generated chat title", {
              chatId: chatSlug,
              nameLength: nextName.length,
            });
          } catch (error) {
            logError("Failed to persist generated chat title", {
              chatId: chatSlug,
              nameLength: nextName.length,
              error,
            });
          }
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
        await clearActiveStreamId(chatSlug, streamId);
        logError("Failed to start model stream", {
          chatId: chatSlug,
          model: body.selectedModel ?? body.selectedReasoningModel ?? "fermion-sprint",
          error,
        });
        void apiLogger.requestFailed(500, error, { chatId: chatSlug });
        throw error;
      }

      writer.merge(
        result.toUIMessageStream({
          originalMessages,
          generateMessageId: randomUUID,
          onFinish: async ({ messages, responseMessage, isContinuation }) => {
            try {
              const persistedMessages = getPersistedMessages({
                originalMessages,
                streamedMessages: messages as unknown as UIMessage[],
                responseMessage: responseMessage as unknown as UIMessage,
                isContinuation,
              });
              const activeStreamId = await getActiveStreamId(chatSlug);
              if (activeStreamId !== streamId) {
                logInfo("Skipped persisting stale stream messages", {
                  chatId: chatSlug,
                  messageCount: messages.length,
                  streamId,
                  activeStreamId,
                });
                return;
              }
              logInfo("Model stream finished", {
                chatId: chatSlug,
                messageCount: persistedMessages.length,
              });
              await saveMessagesForChatSlug(
                session.user.id,
                chatSlug,
                persistedMessages,
              );
              logInfo("Persisted streamed messages", {
                chatId: chatSlug,
                messageCount: persistedMessages.length,
              });

              try {
                const totalUsage = await result.totalUsage;
                const totalTokens = resolveTotalTokens(totalUsage);
                const requiredCredits = getRequiredChatCredits(totalTokens);
                const additionalCredits = Math.max(0, requiredCredits - 1);
                const modelName =
                  body.selectedModel ?? body.selectedReasoningModel ?? "fermion-sprint";

                if (additionalCredits > 0) {
                  const meteredUsage = await consumeChatUnits(session.user.id, additionalCredits);
                  if (!meteredUsage.ok) {
                    logInfo("Chat usage over-limit after stream completion", {
                      chatId: chatSlug,
                      totalTokens,
                      requiredCredits,
                      additionalCredits,
                    });
                  }
                }

                logInfo("Applied token-based chat usage", {
                  chatId: chatSlug,
                  totalTokens,
                  requiredCredits,
                  additionalCredits,
                });
                void apiLogger.meter("meter.chat.tokens", {
                  chatId: chatSlug,
                  model: modelName,
                  inputTokens: totalUsage.inputTokens ?? null,
                  outputTokens: totalUsage.outputTokens ?? null,
                  totalTokens,
                  creditsCharged: requiredCredits,
                });
                void apiLogger.meter("meter.chat.request", {
                  chatId: chatSlug,
                  model: modelName,
                  messageCount: persistedMessages.length,
                });
                void apiLogger.featureUsed("chat", {
                  chatId: chatSlug,
                  model: modelName,
                });
              } catch (usageError) {
                logError("Failed to apply token-based chat usage", {
                  chatId: chatSlug,
                  error: usageError,
                });
              }
            } catch (error) {
              logError("Failed to persist streamed chat messages", {
                chatId: chatSlug,
                error,
              });
            } finally {
              const activeStreamId = await getActiveStreamId(chatSlug);
              if (activeStreamId === streamId) {
                await clearActiveStreamId(chatSlug, streamId);
                logInfo("Cleared active stream id", { chatId: chatSlug, streamId });
              }
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

  const [clientBody, resumableBody] = baseResponse.body.tee();
  const resumableTextStream = resumableBody.pipeThrough(new TextDecoderStream());

  try {
    const streamContext = createResumableStreamContext({
      waitUntil: after,
      publisher: await getRedisClient(),
      subscriber: await getRedisSubscriber(),
    });

    await streamContext.createNewResumableStream(streamId, () => resumableTextStream);
    await setActiveStreamId(chatSlug, streamId);
  } catch (error) {
    await clearActiveStreamId(chatSlug, streamId);
    logError("Failed to create resumable chat stream", {
      chatSlug,
      streamId,
      error,
    });
    throw error;
  }

  void apiLogger.requestSucceeded(200, {
    chatId: chatSlug,
    selectedModel: body.selectedModel ?? body.selectedReasoningModel ?? "fermion-sprint",
    messageCount: originalMessages.length,
  });

  return new Response(clientBody, {
    status: baseResponse.status,
    statusText: baseResponse.statusText,
    headers: baseResponse.headers,
  });
}

export async function DELETE(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  const apiLogger = createApiLogger({
    request,
    route: "/api/chat",
    feature: "chat",
    userId: session?.user?.id ?? null,
  });
  void apiLogger.requestStarted();

  if (!session?.user) {
    void apiLogger.requestFailed(401, "Unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    void apiLogger.requestFailed(400, "Missing chat id");
    return NextResponse.json({ error: "Missing chat id" }, { status: 400 });
  }

  const deleted = await deleteChatForUser(session.user.id, id);
  if (!deleted) {
    void apiLogger.requestFailed(404, "Chat not found", { chatId: id });
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const activeStreamId = await getActiveStreamId(id);
  if (activeStreamId) {
    await clearActiveStreamId(id, activeStreamId);
  }
  void apiLogger.featureUsed("chat.delete", { chatId: id });
  void apiLogger.requestSucceeded(200, { chatId: id });

  return NextResponse.json({ ok: true });
}
