import { createHash, randomUUID } from "node:crypto";
import {
  APOLLO_PROMPT,
  type ApolloModelName,
  apollo,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  smoothStream,
  stepCountIs,
  streamText,
} from "@avenire/ai";
import type { AgentActivityData, UIMessage } from "@avenire/ai/message-types";
import { auth } from "@avenire/auth/server";
import { headers } from "next/headers";
import { after, NextResponse } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { consumeChatUnits } from "@/lib/billing";
import {
  createChatForUser,
  deleteChatForUser,
  getChatBySlugForUser,
  isChatOwnerForUser,
  saveMessagesForChatSlug,
  updateChatForUser,
} from "@/lib/chat-data";
import { createChatTools } from "@/lib/chat-tools";
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
const DEFAULT_CHAT_TITLE_MODEL: ApolloModelName = "apollo-sprint";
const MODEL_TOOL_ALLOW_LIST = new Set([
  "apollo_agent",
  "file_manager_agent",
  "create_note",
  "update_note",
  "read_note",
  "read_workspace_file",
  "list_files",
  "get_file_summary",
  "move_file",
  "delete_file",
  "generate_flashcards",
  "render_graph",
  "get_due_cards",
  "quiz_me",
]);

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
  const normalized = sanitizeChatName(value.split(/\s+/).slice(0, 6).join(" "));

  return normalized.length > 0 ? normalized : DEFAULT_CHAT_TITLE;
}

function resolveChatTitleModel(): ApolloModelName {
  const raw = process.env.CHAT_TITLE_MODEL?.trim();
  if (!raw) {
    return DEFAULT_CHAT_TITLE_MODEL;
  }

  const allowed = new Set<ApolloModelName>([
    "apollo-sprint",
    "apollo-core",
    "apollo-apex",
    "apollo-agent",
    "apollo-tiny",
    "apollo-core",
    "apollo-agent",
  ]);

  if (allowed.has(raw as ApolloModelName)) {
    return raw as ApolloModelName;
  }

  return DEFAULT_CHAT_TITLE_MODEL;
}

function stripNonHttpFileParts(messages: UIMessage[]) {
  let changed = false;

  const nextMessages = messages.map((message) => {
    const nextParts = message.parts.flatMap((part): typeof message.parts => {
      if (part.type !== "file") {
        return [part];
      }

      const url =
        typeof (part as { url?: unknown }).url === "string"
          ? ((part as { url: string }).url ?? "").trim()
          : "";

      if (url.startsWith("http://") || url.startsWith("https://")) {
        return [part];
      }

      changed = true;
      return [];
    });

    if (!changed) {
      return message;
    }

    return {
      ...message,
      parts: nextParts,
    };
  });

  return changed ? nextMessages : messages;
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

async function generateChatName(
  messages: UIMessage[],
  abortSignal?: AbortSignal
) {
  const latestUserText = extractLatestUserText(messages);
  if (!latestUserText) {
    logInfo("Skipping chat title generation: latest user text missing");
    return null;
  }

  try {
    const modelName = resolveChatTitleModel();
    logInfo("Generating chat title", {
      model: apollo.languageModel(modelName),
      sourceLength: latestUserText.length,
    });

    const { text } = await generateText({
      model: apollo.languageModel(modelName),
      prompt: [
        "Generate a concise, descriptive chat title based only on the user's request.",
        "Use 4-8 words when possible.",
        "Avoid generic labels and single-word replies.",
        "No quotes. No punctuation at the end.",
        "Return ONLY the title text. No labels, no extra sentences, and no questions.",
        `User message: ${latestUserText}`,
      ].join("\n"),
      maxOutputTokens: 32,
      temperature: 0.2,
      abortSignal,
    });

    if (!text || text.trim().length === 0) {
      const fallback = fallbackChatNameFromText(latestUserText);
      logInfo("Generated chat title result", {
        raw: text ?? "",
        normalized: "",
        accepted: false,
        fallback,
      });
      return fallback;
    }

    const normalized = sanitizeChatName(text);
    const fallback = fallbackChatNameFromText(latestUserText);
    const accepted =
      normalized.length >= 8 ||
      latestUserText.trim().length <= normalized.length + 4;
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
    .filter(
      (part): part is Extract<typeof part, { type: "text" }> =>
        part.type === "text"
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function resolveChatContextMaxChars() {
  const parsed = Number.parseInt(process.env.CHAT_CONTEXT_MAX_CHARS ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 2000) {
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

function pickModelTools<T extends Record<string, unknown>>(tools: T) {
  return Object.fromEntries(
    Object.entries(tools).filter(([name]) => MODEL_TOOL_ALLOW_LIST.has(name))
  ) as T;
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
      (session as { session?: { activeOrganizationId?: string | null } })
        .session?.activeOrganizationId ?? null;
    const workspace = await resolveWorkspaceForUser(
      session.user.id,
      activeOrganizationId
    );
    if (!workspace) {
      void apiLogger.requestFailed(404, "Workspace not found");
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
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
    const idempotencyHeader = request.headers.get("idempotency-key")?.trim();

    const originalMessages = stripNonHttpFileParts(
      normalizeMessageFileMediaTypes(body.messages ?? [])
    );
    const modelContextMessages = trimMessagesForModelContext(originalMessages);
    logInfo("Incoming chat request", {
      chatId: body.chatId ?? null,
      selectedModel: body.selectedModel ?? null,
      selectedReasoningModel: body.selectedReasoningModel ?? null,
      messageCount: originalMessages.length,
      modelContextCount: modelContextMessages.length,
    });

    type ExistingChat = NonNullable<
      Awaited<ReturnType<typeof getChatBySlugForUser>>
    >;
    type CreatedChat = Awaited<ReturnType<typeof createChatForUser>>;
    let chat: ExistingChat | CreatedChat | null = null;
    let chatCreatedFromNew = false;
    if (chatSlug === "new") {
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

        idempotencyLockAcquired =
          await tryAcquireIdempotencyLock(idempotencyRedisKey);
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
        void apiLogger.requestFailed(404, "Chat not found", {
          chatId: chatSlug,
        });
        return NextResponse.json({ error: "Chat not found" }, { status: 404 });
      }
      if (
        Boolean(chat.readOnly) ||
        !(await isChatOwnerForUser(
          session.user.id,
          chatSlug,
          workspace.workspaceId
        ))
      ) {
        void apiLogger.requestFailed(403, "Read-only chat", {
          chatId: chatSlug,
        });
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

    if (idempotencyHeader && !idempotencyRedisKey) {
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

      idempotencyLockAcquired =
        await tryAcquireIdempotencyLock(idempotencyRedisKey);
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

    const streamId = randomUUID();
    const previousStreamId = await getActiveStreamId(chatSlug);
    if (previousStreamId) {
      await clearActiveStreamId(chatSlug, previousStreamId);
    }

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
          const nextName = await generateChatName(
            originalMessages,
            request.signal
          );
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

            await updateChatForUser(
              session.user.id,
              chatSlug,
              {
                title: nextName,
              },
              workspace.workspaceId
            );
            logInfo("Persisted generated chat title", {
              chatId: chatSlug,
              name: nextName,
            });
          }
        }

        logInfo("Starting model stream", {
          chatId: chatSlug,
          model:
            body.selectedModel ?? body.selectedReasoningModel ?? "apollo-apex",
        });

        let result: ReturnType<typeof streamText<any, any>>;
        const mergedContext = [body.context?.trim()]
          .filter((value) => Boolean(value))
          .join("\n\n");
        const agentActivityId = randomUUID();
        const emitAgentActivity = (data: AgentActivityData) => {
          writer.write({
            type: "data-agent_activity",
            id: data.id,
            data,
            transient: true,
          });
        };
        const tools = createChatTools({
          chatSlug,
          agentActivityId,
          emitAgentActivity,
          rootFolderId: workspace.rootFolderId,
          userId: session.user.id,
          workspaceId: workspace.workspaceId,
        });
        const modelTools = pickModelTools(tools);

        try {
          result = streamText({
            model: apollo.languageModel(
              body.selectedModel ?? body.selectedReasoningModel ?? "apollo-apex"
            ),
            system: APOLLO_PROMPT(
              body.userName ?? session.user.name ?? undefined,
              mergedContext || undefined
            ),
            providerOptions: {
              baseten: {
                reasoning: true, // This enables the extraction of thinking tokens
              },
            },
            messages: await convertToModelMessages(modelContextMessages, {
              tools,
            }),
            stopWhen: stepCountIs(8),
            tools: modelTools,
            abortSignal: request.signal,
            experimental_transform: smoothStream({ chunking: "word" }),
            onChunk: async ({ chunk }) => {
              try {
                if (chunk.type === "tool-call") {
                  logInfo("Streaming tool call chunk", {
                    chatId: chatSlug,
                    toolCallId: chunk.toolCallId,
                    toolName: chunk.toolName,
                  });
                }

                if (chunk.type === "tool-result") {
                  logInfo("Streaming tool result chunk", {
                    chatId: chatSlug,
                    toolCallId: chunk.toolCallId,
                    toolName: chunk.toolName,
                  });
                }
              } catch (error) {}
            },
          });
        } catch (error) {
          await clearActiveStreamId(chatSlug, streamId);
          logError("Failed to start model stream", {
            chatId: chatSlug,
            model:
              body.selectedModel ??
              body.selectedReasoningModel ??
              "apollo-apex",
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
                  workspace.workspaceId
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
                    "apollo-apex";

                  if (additionalCredits > 0) {
                    const meteredUsage = await consumeChatUnits(
                      session.user.id,
                      additionalCredits
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
                await clearActiveStreamId(chatSlug, streamId);
                if (idempotencyRedisKey && idempotencyLockAcquired) {
                  await markIdempotencyDone(idempotencyRedisKey, chatSlug);
                }
                logInfo("Cleared active stream id", { chatId: chatSlug });
              }
            },
          })
        );
      },
    });

    const baseResponse = createUIMessageStreamResponse({ stream });
    if (!baseResponse.body) {
      return baseResponse;
    }

    const [clientBody, resumableBody] = baseResponse.body.tee();
    const resumableTextStream = resumableBody.pipeThrough(
      new TextDecoderStream()
    );

    void (async () => {
      try {
        const streamContext = createResumableStreamContext({
          waitUntil: after,
          publisher: await getRedisClient(),
          subscriber: await getRedisSubscriber(),
        });

        await streamContext.createNewResumableStream(
          streamId,
          () => resumableTextStream
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
        body.selectedModel ?? body.selectedReasoningModel ?? "apollo-apex",
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
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
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
      (session as { session?: { activeOrganizationId?: string | null } })
        .session?.activeOrganizationId ?? null;
    const workspace = await resolveWorkspaceForUser(
      session.user.id,
      activeOrganizationId
    );
    if (!workspace) {
      void apiLogger.requestFailed(404, "Workspace not found");
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    const deleted = await deleteChatForUser(
      session.user.id,
      id,
      workspace.workspaceId
    );
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
  } catch (error) {
    logError("Unhandled chat DELETE error", { error: formatError(error) });
    void apiLogger.requestFailed(500, error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
