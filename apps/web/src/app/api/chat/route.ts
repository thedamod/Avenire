import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type ApolloModelName,
  APOLLO_PROMPT,
  apollo,
  convertToModelMessages,
  generateText,
  smoothStream,
  stepCountIs,
  streamText,
} from "@avenire/ai";
import type { UIMessage } from "@avenire/ai/message-types";
import { auth } from "@avenire/auth/server";
import { headers } from "next/headers";
import { NextResponse, after } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { createResumableStreamContext } from "resumable-stream";
import {
  createChatForUser,
  deleteChatForUser,
  getChatBySlugForUser,
  isChatOwnerForUser,
  saveMessagesForChatSlug,
  updateChatForUser,
} from "@/lib/chat-data";
import { consumeChatUnits } from "@/lib/billing";
import { resolveWorkspaceForUser } from "@/lib/file-data";
import { normalizeMediaType } from "@/lib/media-type";
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

function formatError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: "Unknown error", value: error };
}

function sanitizeChatName(value: string) {
  return value
    .replace(/^["'`\s]+|["'`\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function fallbackChatNameFromText(value: string) {
  const normalized = sanitizeChatName(
    value
      .split(/\s+/)
      .slice(0, 6)
      .join(" ")
  );

  return normalized.length > 0 ? normalized : DEFAULT_CHAT_TITLE;
}

function extractLatestUserText(messages: UIMessage[]) {
  const latestUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === "user");
  if (!latestUserMessage) {
    return "";
  }

  const textPart = latestUserMessage.parts.find((part) => part.type === "text");
  return textPart?.type === "text" ? textPart.text.trim() : "";
}

async function generateChatName(messages: UIMessage[], abortSignal?: AbortSignal) {
  const latestUserText = extractLatestUserText(messages);
  if (!latestUserText) {
    logInfo("Skipping chat title generation: latest user text missing");
    return null;
  }

  try {
    logInfo("Generating chat title", {
      model: apollo.languageModel("apollo-sprint"),
      sourceLength: latestUserText.length,
    });

    const { text } = await generateText({
      model: apollo.languageModel("apollo-sprint"),
      prompt: [
        "Generate a concise, descriptive chat title based only on the user's request.",
        "Use 4-8 words when possible.",
        "Avoid generic labels and single-word replies.",
        "No quotes. No punctuation at the end. Return only the title text.",
        `User message: ${latestUserText}`,
      ].join("\n"),
      maxOutputTokens: 32,
      temperature: 0.2,
      abortSignal,
    });

    const normalized = sanitizeChatName(text);
    const fallback = fallbackChatNameFromText(latestUserText);
    const accepted =
      normalized.length >= 8 || latestUserText.trim().length <= normalized.length + 4;
    logInfo("Generated chat title result", {
      raw: text,
      normalized,
      accepted,
      fallback,
    });

    if (accepted && normalized.length > 0) {
      return normalized;
    }

    return fallback;
  } catch (error) {
    logError("Failed to generate chat title", { error });
    return fallbackChatNameFromText(latestUserText);
  }
}

function extractMessageText(message: UIMessage) {
  return message.parts
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function resolveChatContextMaxChars() {
  const parsed = Number.parseInt(process.env.CHAT_CONTEXT_MAX_CHARS ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 2_000) {
    return 24_000;
  }
  return parsed;
}

function trimMessagesForModelContext(messages: UIMessage[]) {
  const maxChars = resolveChatContextMaxChars();
  if (messages.length <= 2) {
    return messages;
  }

  const out: UIMessage[] = [];
  let totalChars = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }
    const textLength = extractMessageText(message).length;
    const nextTotal = totalChars + textLength;
    if (out.length > 0 && nextTotal > maxChars) {
      break;
    }
    out.push(message);
    totalChars = nextTotal;
  }

  return out.reverse();
}

function normalizeMessageFileMediaTypes(messages: UIMessage[]) {
  let changed = false;

  const normalizedMessages = messages.map((message) => {
    let messageChanged = false;

    const normalizedParts = message.parts.map((part) => {
      if (part.type !== "file") {
        return part;
      }

      const normalizedPartMediaType = normalizeMediaType(part.mediaType);
      if (normalizedPartMediaType === part.mediaType) {
        return part;
      }

      changed = true;
      messageChanged = true;

      return {
        ...part,
        mediaType: normalizedPartMediaType,
      };
    });

    if (!messageChanged) {
      return message;
    }

    return {
      ...message,
      parts: normalizedParts,
    };
  });

  return changed ? normalizedMessages : messages;
}

function buildChatIdempotencyRedisKey(input: {
  userId: string;
  workspaceId: string;
  chatSlug: string;
  idempotencyKey: string;
}) {
  const hash = createHash("sha256")
    .update(
      `${input.userId}:${input.workspaceId}:${input.chatSlug}:${input.idempotencyKey}`
    )
    .digest("hex");
  return `chat:idempotency:${hash}`;
}

async function tryAcquireIdempotencyLock(key: string) {
  try {
    const client = await getRedisClient();
    const ok = await client.set(
      key,
      JSON.stringify({ status: "in_progress", ts: Date.now() }),
      {
        EX: 180,
        NX: true,
      }
    );
    return ok === "OK";
  } catch {
    return true;
  }
}

async function getIdempotencyState(key: string) {
  try {
    const client = await getRedisClient();
    return await client.get(key);
  } catch {
    return null;
  }
}

async function markIdempotencyDone(key: string, chatSlug: string) {
  try {
    const client = await getRedisClient();
    await client.set(
      key,
      JSON.stringify({ status: "done", chatSlug, ts: Date.now() }),
      {
        EX: 600,
      }
    );
  } catch {
    // ignore idempotency mark failures
  }
}

async function clearIdempotencyKey(key: string) {
  try {
    const client = await getRedisClient();
    await client.del(key);
  } catch {
    // ignore idempotency cleanup failures
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
  if (
    typeof usage.totalTokens === "number" &&
    Number.isFinite(usage.totalTokens)
  ) {
    return usage.totalTokens;
  }

  const inputTokens =
    typeof usage.inputTokens === "number" ? usage.inputTokens : 0;
  const outputTokens =
    typeof usage.outputTokens === "number" ? usage.outputTokens : 0;
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
  let persisted: UIMessage[];
  if (input.streamedMessages.length >= input.originalMessages.length) {
    persisted = input.streamedMessages;
  } else if (input.isContinuation && input.originalMessages.length > 0) {
    persisted = [...input.originalMessages.slice(0, -1), input.responseMessage];
  } else {
    persisted = [...input.originalMessages, input.responseMessage];
  }

  // Ensure the most recently sent user message is always persisted.
  const latestUserMessage = [...input.originalMessages]
    .reverse()
    .find((message) => message.role === "user");
  if (!latestUserMessage) {
    return persisted;
  }
  if (persisted.some((message) => message.id === latestUserMessage.id)) {
    return persisted;
  }

  const responseIndex = persisted.findIndex(
    (message) => message.id === input.responseMessage.id
  );
  if (responseIndex < 0) {
    return [...persisted, latestUserMessage];
  }

  return [
    ...persisted.slice(0, responseIndex),
    latestUserMessage,
    ...persisted.slice(responseIndex),
  ];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function inferArtifactKind(toolName: string, output: Record<string, unknown>) {
  if (typeof output.kind === "string" && output.kind.length > 0) {
    return output.kind;
  }
  if (toolName.includes("flashcard")) return "flashcards";
  if (toolName.includes("quiz")) return "quiz";
  if (toolName.includes("plot")) return "matplotlib";
  if (toolName.includes("graph")) return "desmos";
  return "artifact";
}

function inferArtifactTitle(kind: string, output: Record<string, unknown>) {
  if (typeof output.title === "string" && output.title.trim().length > 0) {
    return output.title.trim();
  }
  if (typeof output.topic === "string" && output.topic.trim().length > 0) {
    return `${kind}: ${output.topic.trim()}`;
  }
  return kind.slice(0, 1).toUpperCase() + kind.slice(1);
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
  let idempotencyRedisKey: string | null = null;
  let idempotencyLockAcquired = false;

  try {
    if (!session?.user) {
      void apiLogger.requestFailed(401, "Unauthorized");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const activeOrganizationId =
      (session as { session?: { activeOrganizationId?: string | null } }).session
        ?.activeOrganizationId ?? null;
    const workspace = await resolveWorkspaceForUser(
      session.user.id,
      activeOrganizationId
    );
    if (!workspace) {
      void apiLogger.requestFailed(404, "Workspace not found");
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      messages?: UIMessage[];
      selectedModel?: ApolloModelName;
      selectedReasoningModel?: ApolloModelName;
      chatId?: string;
      userName?: string;
      context?: string;
    };

    let chatSlug: string = body.chatId?.trim() ?? "";
    if (!chatSlug) {
      void apiLogger.requestFailed(400, "Missing chatId");
      return NextResponse.json({ error: "Missing chatId" }, { status: 400 });
    }

    const originalMessages = normalizeMessageFileMediaTypes(body.messages ?? []);
    const modelContextMessages = trimMessagesForModelContext(originalMessages);
    logInfo("Incoming chat request", {
      chatId: body.chatId ?? null,
      selectedModel: body.selectedModel ?? null,
      selectedReasoningModel: body.selectedReasoningModel ?? null,
      messageCount: originalMessages.length,
      modelContextCount: modelContextMessages.length,
    });

    type ExistingChat = NonNullable<Awaited<ReturnType<typeof getChatBySlugForUser>>>;
    type CreatedChat = Awaited<ReturnType<typeof createChatForUser>>;
    let chat: ExistingChat | CreatedChat | null = null;
    let chatCreatedFromNew = false;
    if (chatSlug === "new") {
      const createdChat = await createChatForUser(
        session.user.id,
        workspace.workspaceId,
        DEFAULT_CHAT_TITLE
      );
      chat = createdChat;
      chatCreatedFromNew = true;
      chatSlug = createdChat.slug;
    } else {
      chat = await getChatBySlugForUser(
        session.user.id,
        chatSlug,
        workspace.workspaceId
      );

      if (!chat) {
        void apiLogger.requestFailed(404, "Chat not found", { chatId: chatSlug });
        return NextResponse.json({ error: "Chat not found" }, { status: 404 });
      }
      if (
        Boolean(chat.readOnly) ||
        !(await isChatOwnerForUser(session.user.id, chatSlug, workspace.workspaceId))
      ) {
        void apiLogger.requestFailed(403, "Read-only chat", { chatId: chatSlug });
        return NextResponse.json({ error: "Read-only chat" }, { status: 403 });
      }
    }
    if (!chat) {
      void apiLogger.requestFailed(500, "Unable to resolve chat", {
        chatId: chatSlug,
      });
      return NextResponse.json(
        { error: "Unable to resolve chat" },
        { status: 500 }
      );
    }

    const idempotencyHeader = request.headers.get("idempotency-key")?.trim();
    if (idempotencyHeader) {
      idempotencyRedisKey = buildChatIdempotencyRedisKey({
        userId: session.user.id,
        workspaceId: workspace.workspaceId,
        chatSlug,
        idempotencyKey: idempotencyHeader,
      });

      const state = await getIdempotencyState(idempotencyRedisKey);
      if (state) {
        void apiLogger.requestFailed(409, "Duplicate request", {
          chatId: chatSlug,
          idempotencyKey: idempotencyHeader,
        });
        return NextResponse.json(
          {
            error: "Duplicate request",
            chatId: chatSlug,
          },
          { status: 409 }
        );
      }

      idempotencyLockAcquired = await tryAcquireIdempotencyLock(
        idempotencyRedisKey
      );
      if (!idempotencyLockAcquired) {
        void apiLogger.requestFailed(409, "Request in progress", {
          chatId: chatSlug,
          idempotencyKey: idempotencyHeader,
        });
        return NextResponse.json(
          {
            error: "Request already in progress",
            chatId: chatSlug,
          },
          { status: 409 }
        );
      }
    }

    const initialUsage = await consumeChatUnits(session.user.id, 1);
    if (!initialUsage.ok) {
      const retryAfter = initialUsage.retryAfter?.toISOString() ?? null;
      void apiLogger.rateLimited("chat", retryAfter, { chatId: chatSlug });
      if (idempotencyRedisKey && idempotencyLockAcquired) {
        await clearIdempotencyKey(idempotencyRedisKey);
      }
      return NextResponse.json(
        {
          error: "Chat usage limit reached",
          retryAfter,
        },
        { status: 429 }
      );
    }

    await clearActiveStreamId(chatSlug);

  const stream = createUIMessageStream<UIMessage>({
    execute: async ({ writer }) => {
      if (chatCreatedFromNew) {
        writer.write({
          type: "data-chatCreated",
          transient: true,
          data: {
            fromId: body.chatId?.trim() ?? "new",
            id: chatSlug,
            title: chat.title,
          },
        });
      }

      if (shouldGenerateTitle(chat.title, originalMessages)) {
        const nextName = await generateChatName(originalMessages, request.signal);
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

          await updateChatForUser(session.user.id, chatSlug, {
            title: nextName,
          }, workspace.workspaceId);
          logInfo("Persisted generated chat title", {
            chatId: chatSlug,
            name: nextName,
          });
        }
      }

      logInfo("Starting model stream", {
        chatId: chatSlug,
        model:
          body.selectedModel ??
          body.selectedReasoningModel ??
          "apollo-core",
      });

      let result: ReturnType<typeof streamText<any, any>>;
      const mergedContext = [body.context?.trim()]
        .filter((value) => Boolean(value))
        .join("\n\n");

      try {
        result = streamText({
          model: apollo.languageModel(
            body.selectedModel ?? body.selectedReasoningModel ?? "apollo-core",
          ),
          system: APOLLO_PROMPT(
            body.userName ?? session.user.name ?? undefined,
            mergedContext || undefined,
          ),
          messages: await convertToModelMessages(modelContextMessages),
          stopWhen: stepCountIs(5),
          abortSignal: request.signal,
          experimental_transform: smoothStream({ chunking: "word" }),
          onChunk: async ({ chunk }) => {
            try {
            } catch (error) {
            }
          },
        });
      } catch (error) {
        await clearActiveStreamId(chatSlug, streamId);
        logError("Failed to start model stream", {
          chatId: chatSlug,
          model:
            body.selectedModel ??
            body.selectedReasoningModel ??
            "apollo-core",
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
                workspace.workspaceId,
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
                  body.selectedModel ??
                  body.selectedReasoningModel ??
                  "apollo-core";

                if (additionalCredits > 0) {
                  const meteredUsage = await consumeChatUnits(
                    session.user.id,
                    additionalCredits,
                  );
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
              await clearActiveStreamId(chatSlug);
              if (idempotencyRedisKey && idempotencyLockAcquired) {
                await markIdempotencyDone(idempotencyRedisKey, chatSlug);
              }
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

  const [clientBody, resumableBody] = baseResponse.body.tee();
  const resumableTextStream = resumableBody.pipeThrough(
    new TextDecoderStream(),
  );

  try {
    const streamContext = createResumableStreamContext({
      waitUntil: after,
      publisher: await getRedisClient(),
      subscriber: await getRedisSubscriber(),
    });

      await streamContext.createNewResumableStream(
        streamId,
        () => resumableTextStream,
      );
      await setActiveStreamId(chatSlug, streamId);
    } catch (error) {
      logError("Failed to create resumable chat stream", {
        chatSlug,
        streamId,
        error: formatError(error),
      });
    }
  })();

	  void apiLogger.requestSucceeded(200, {
	    chatId: chatSlug,
    selectedModel:
      body.selectedModel ?? body.selectedReasoningModel ?? "apollo-core",
	    messageCount: originalMessages.length,
	  });

    if (idempotencyRedisKey && idempotencyLockAcquired) {
      request.signal.addEventListener(
        "abort",
        () => {
          void clearIdempotencyKey(idempotencyRedisKey as string);
        },
        { once: true }
      );
    }

	    return new Response(clientBody, {
	      status: baseResponse.status,
      statusText: baseResponse.statusText,
      headers: baseResponse.headers,
    });
  } catch (error) {
    logError("Unhandled chat POST error", { error: formatError(error) });
    if (idempotencyRedisKey && idempotencyLockAcquired) {
      await clearIdempotencyKey(idempotencyRedisKey);
    }
    void apiLogger.requestFailed(500, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
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

  try {
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

    const activeOrganizationId =
      (session as { session?: { activeOrganizationId?: string | null } }).session
        ?.activeOrganizationId ?? null;
    const workspace = await resolveWorkspaceForUser(
      session.user.id,
      activeOrganizationId
    );
    if (!workspace) {
      void apiLogger.requestFailed(404, "Workspace not found");
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const deleted = await deleteChatForUser(session.user.id, id, workspace.workspaceId);
    if (!deleted) {
      void apiLogger.requestFailed(404, "Chat not found", { chatId: id });
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    await clearActiveStreamId(id);
    void apiLogger.featureUsed("chat.delete", { chatId: id });
    void apiLogger.requestSucceeded(200, { chatId: id });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logError("Unhandled chat DELETE error", { error: formatError(error) });
    void apiLogger.requestFailed(500, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
