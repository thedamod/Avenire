"use client";

import { useChat, type UseChatHelpers } from "@ai-sdk/react";
import type { AgentActivityData, UIMessage } from "@avenire/ai/message-types";
import { Button } from "@avenire/ui/components/button";
import {
  DefaultChatTransport, type FileUIPart, lastAssistantMessageIsCompleteWithApprovalResponses, } from "ai";
import { CaretDown as ChevronDown } from "@phosphor-icons/react"
import { AnimatePresence, motion, useInView } from "motion/react";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import {
  type Attachment,
  createLocalAttachment,
} from "@/components/chat/attachment";
import { Messages } from "@/components/chat/messages";
import { MultimodalInput } from "@/components/chat/multimodal-input";
import { Overview } from "@/components/chat/overview";
import { SuggestedActions } from "@/components/chat/suggested-actions";
import { useScrollToBottom } from "@/components/chat/use-scroll-to-bottom";
import { getChatErrorMessage } from "@/lib/chat-errors";
import {
  CHAT_CREATED_EVENT,
  CHAT_NAME_UPDATED_EVENT,
  CHAT_STREAM_FINISHED_EVENT,
  CHAT_STREAM_STATUS_EVENT,
  type ChatCreatedDetail,
  type ChatNameUpdatedDetail,
  type ChatStreamStatusDetail,
} from "@/lib/chat-events";
import { normalizeMediaType } from "@/lib/media-type";
import { chatMessageHandoffActions } from "@/stores/chat-message-handoff-store";

interface ChatProps {
  id: string;
  initialMessages: UIMessage[];
  initialPrompt?: string | null;
  isReadonly: boolean;
  selectedModel: string;
  userName?: string;
  workspaceUuid: string;
}

type SendMessageInput = Parameters<UseChatHelpers<UIMessage>["sendMessage"]>[0];
type SendMessageOptions =
  Parameters<UseChatHelpers<UIMessage>["sendMessage"]>[1];

function createOptimisticUserMessage(
  message: SendMessageInput
): UIMessage | null {
  if (!message) {
    return null;
  }

  const text =
    "text" in message && typeof message.text === "string" ? message.text : "";
  const candidateFiles =
    "files" in message && Array.isArray(message.files) ? message.files : [];
  const files = candidateFiles.filter(
    (file): file is FileUIPart =>
      file.type === "file" &&
      typeof file.url === "string" &&
      file.url.trim().length > 0
  );

  if (text.trim().length === 0 && files.length === 0) {
    return null;
  }

  return {
    id: crypto.randomUUID(),
    role: "user",
    parts: [
      ...(text.trim().length > 0 ? [{ type: "text" as const, text }] : []),
      ...files.map((file) => ({
        type: "file" as const,
        filename: file.filename,
        mediaType: file.mediaType,
        url: file.url,
      })),
    ],
  } as UIMessage;
}

export function Chat({
  id,
  initialMessages,
  initialPrompt,
  selectedModel,
  isReadonly,
  workspaceUuid,
  userName,
}: ChatProps) {
  const [chatId, setChatId] = useState(id);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [input, setInput] = useState("");
  const [agentActivity, setAgentActivity] = useState<AgentActivityData | null>(
    null
  );
  const router = useRouter();
  const lastCompletedMessageIdRef = useRef<string | null>(null);
  const messagesRef = useRef<UIMessage[]>(initialMessages);
  const pendingNewChatMessagesRef = useRef<UIMessage[] | null>(null);
  const pendingChatRouteRef = useRef<string | null>(null);
  const autoPromptSentRef = useRef<string | null>(null);
  const MAX_FILES = 3;
  const [messagesContainerRef, messagesEndRef, scroll] =
    useScrollToBottom<HTMLDivElement>();
  const isInView = useInView(messagesEndRef, {
    root: messagesContainerRef,
  });

  const handleError = useCallback((error: Error) => {
    toast.error(getChatErrorMessage(error), {
      description: "If this issue persists, please contact support.",
      duration: 5000,
    });
  }, []);

  const {
    messages,
    setMessages,
    sendMessage: append,
    status,
    resumeStream,
    error,
  } = useChat<UIMessage>({
    id: chatId,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: {
        chatId,
        selectedModel,
      },
    }),
    experimental_throttle: 100,
    messages: initialMessages,
    onError: handleError,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onData: (dataPart) => {
      if (dataPart.type === "data-chatCreated") {
        const detail = dataPart.data as ChatCreatedDetail;
        if (!(detail?.id && detail?.fromId)) {
          return;
        }
        primeNewChatHandoff(detail.id);
        setChatId(detail.id);
        pendingChatRouteRef.current = detail.id;
        window.dispatchEvent(
          new CustomEvent<ChatCreatedDetail>(CHAT_CREATED_EVENT, {
            detail,
          })
        );
        return;
      }

      if (dataPart.type === "data-chatName") {
        const detail = dataPart.data as ChatNameUpdatedDetail;
        if (!(detail?.id && detail?.name)) {
          return;
        }
        window.dispatchEvent(
          new CustomEvent<ChatNameUpdatedDetail>(CHAT_NAME_UPDATED_EVENT, {
            detail,
          })
        );
        return;
      }

      if (dataPart.type === "data-agent_activity") {
        setAgentActivity(dataPart.data as AgentActivityData);
      }
    },
  });

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const primeNewChatHandoff = useCallback((nextChatId: string) => {
    if (!nextChatId) {
      return;
    }

    const currentMessages = messagesRef.current;
    const pendingMessages = pendingNewChatMessagesRef.current;
    const handoffMessages =
      pendingMessages && pendingMessages.length > currentMessages.length
        ? pendingMessages
        : currentMessages.length > 0
          ? currentMessages
          : pendingMessages;

    if (!handoffMessages || handoffMessages.length === 0) {
      return;
    }

    chatMessageHandoffActions.prime(nextChatId, handoffMessages);
  }, []);

  const sendMessage = useCallback(
    async (message: SendMessageInput, options?: SendMessageOptions) => {
      if (chatId === "new") {
        const optimisticMessage = createOptimisticUserMessage(message);
        if (optimisticMessage) {
          pendingNewChatMessagesRef.current = [
            ...messagesRef.current,
            optimisticMessage,
          ];
        }
      }

      try {
        return await append(message, options);
      } catch (error) {
        if (chatId === "new" && !pendingChatRouteRef.current) {
          pendingNewChatMessagesRef.current = null;
        }
        throw error;
      }
    },
    [append, chatId]
  );

  useEffect(() => {
    if (initialMessages.length === 0 || messages.length > 0) {
      return;
    }

    setMessages(initialMessages);
  }, [initialMessages, messages.length, setMessages]);

  useEffect(() => {
    if (id === "new") {
      return;
    }
    resumeStream().catch(() => undefined);
  }, [id, resumeStream]);

  useEffect(() => {
    if (id !== "new") {
      autoPromptSentRef.current = null;
      return;
    }
    const prompt = initialPrompt?.trim();
    if (!prompt || autoPromptSentRef.current === prompt) {
      return;
    }
    if (status !== "ready" || messages.length > 0) {
      return;
    }

    autoPromptSentRef.current = prompt;
    sendMessage({ text: prompt }).catch(() => {
      autoPromptSentRef.current = null;
    });
  }, [id, initialPrompt, messages.length, sendMessage, status]);

  useEffect(() => {
    if (!pendingChatRouteRef.current) {
      return;
    }

    const nextChatId = pendingChatRouteRef.current;

    primeNewChatHandoff(nextChatId);
    startTransition(() => {
      router.replace(`/workspace/chats/${nextChatId}`);
    });
    pendingChatRouteRef.current = null;
    pendingNewChatMessagesRef.current = null;
  }, [chatId, primeNewChatHandoff, router]);

  useEffect(() => {
    if (status !== "ready") {
      return;
    }
    window.dispatchEvent(
      new CustomEvent(CHAT_STREAM_FINISHED_EVENT, {
        detail: { chatId },
      })
    );
  }, [chatId, status]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent<ChatStreamStatusDetail>(CHAT_STREAM_STATUS_EVENT, {
        detail: { chatId, status },
      })
    );
  }, [chatId, status]);

  useEffect(() => {
    if (status !== "ready") {
      return;
    }
    const lastMessage = messages.at(-1);
    if (!lastMessage || lastMessage.role !== "assistant") {
      return;
    }
    if (lastCompletedMessageIdRef.current === lastMessage.id) {
      return;
    }

    lastCompletedMessageIdRef.current = lastMessage.id;
  }, [chatId, messages, status]);

  useEffect(() => {
    if (status === "submitted") {
      setAgentActivity(null);
    }
  }, [status]);

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }
    if (status === "submitted" || status === "streaming") {
      scroll();
    }
  }, [messages, scroll, status]);

  const regenerateFromMessage = useCallback(
    async (assistantMessageId: string) => {
      if (status === "submitted" || status === "streaming") {
        return;
      }

      const targetIndex = messages.findIndex(
        (message) => message.id === assistantMessageId
      );
      if (targetIndex <= 0 || messages[targetIndex]?.role !== "assistant") {
        return;
      }

      let userIndex = targetIndex - 1;
      while (userIndex >= 0 && messages[userIndex]?.role !== "user") {
        userIndex -= 1;
      }
      if (userIndex < 0) {
        return;
      }

      const userMessage = messages[userIndex];
      const userText = userMessage.parts
        .filter(
          (
            part
          ): part is Extract<
            (typeof userMessage.parts)[number],
            { type: "text"; text: string }
          > => part.type === "text"
        )
        .map((part) => part.text)
        .join("\n")
        .trim();
      const userFiles: FileUIPart[] = userMessage.parts
        .filter(
          (
            part
          ): part is Extract<
            (typeof userMessage.parts)[number],
            { type: "file"; url: string }
          > => part.type === "file" && typeof part.url === "string"
        )
        .map((part) => ({
          type: "file",
          filename: part.filename,
          mediaType: part.mediaType,
          url: part.url,
        }));

      const preservedMessages = messages.slice(0, userIndex);
      setMessages(preservedMessages);

      try {
        await sendMessage({
          text: userText,
          ...(userFiles.length > 0 ? { files: userFiles } : {}),
        });
      } catch (error) {
        setMessages(messages);
        handleError(
          error instanceof Error ? error : new Error("Failed to regenerate")
        );
      }
    },
    [handleError, messages, sendMessage, setMessages, status]
  );

  const handleSubmit = async (inputValue: string, files: Attachment[]) => {
    const localFileParts: FileUIPart[] = files
      .filter((attachment) => attachment.source === "local")
      .flatMap((attachment) => {
        if (!attachment.url || attachment.url.trim().length === 0) {
          return [];
        }

        const url = attachment.url.trim();
        if (!(url.startsWith("http://") || url.startsWith("https://"))) {
          return [];
        }

        return [
          {
            type: "file",
            mediaType: normalizeMediaType(attachment.contentType),
            filename: attachment.name,
            url,
          } satisfies FileUIPart,
        ];
      });

    const workspaceFileParts: FileUIPart[] = files
      .filter((attachment) => attachment.source === "workspace")
      .flatMap((attachment) => {
        if (!attachment.url || attachment.url.trim().length === 0) {
          return [];
        }
        return [
          {
            type: "file",
            mediaType: normalizeMediaType(attachment.contentType),
            filename: attachment.name,
            url: attachment.url,
          } satisfies FileUIPart,
        ];
      });

    if (localFileParts.length > 0 || workspaceFileParts.length > 0) {
      await sendMessage({
        text: inputValue,
        files: [...localFileParts, ...workspaceFileParts],
      });
    } else {
      await sendMessage({ text: inputValue });
    }
  };

  const addDroppedFiles = useCallback((incomingFiles: File[]) => {
    if (incomingFiles.length === 0) {
      return;
    }
    setAttachments((prev) => {
      if (prev.length + incomingFiles.length > MAX_FILES) {
        toast.error("File limit exceeded", {
          description: `You can only upload up to ${MAX_FILES} files per message.`,
          duration: 3000,
        });
        return prev;
      }

      const next = incomingFiles.map(createLocalAttachment);

      return [...prev, ...next];
    });
  }, []);

  const { getRootProps, isDragActive } = useDropzone({
    onDrop: addDroppedFiles,
    noClick: true,
    noKeyboard: true,
  });

  const isEmptyState =
    messages.length === 0 &&
    !pendingChatRouteRef.current &&
    status !== "submitted" &&
    status !== "streaming";
  const inputCard = (centered = false) => (
    <div
      className={`flex min-h-36 w-full flex-col gap-2 rounded-2xl bg-transparent p-3 pb-1 backdrop-blur-sm ${
        centered ? "rounded-b-2xl" : "rounded-b-none"
      }`}
    >
      <MultimodalInput
        attachments={attachments}
        centered={centered}
        handleSubmit={handleSubmit}
        input={input}
        setAttachments={setAttachments}
        setInput={setInput}
        status={status}
        workspaceUuid={workspaceUuid}
      />
    </div>
  );

  return (
    <div {...getRootProps()} className="relative flex h-full min-h-0 flex-col">
      <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col bg-background transition-all duration-300">
        {!isEmptyState && (
          <Messages
            agentActivity={agentActivity}
            chatId={chatId}
            error={error}
            isEmpty={isEmptyState}
            isReadonly={isReadonly}
            messages={messages}
            messagesContainerRef={messagesContainerRef}
            messagesEndRef={messagesEndRef}
            onRegenerate={regenerateFromMessage}
            sendMessage={sendMessage}
            status={status}
            userName={userName}
            workspaceUuid={workspaceUuid}
          />
        )}

        {!isReadonly && (
          <AnimatePresence initial={false} mode="popLayout">
            {isEmptyState ? (
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="absolute inset-0 z-30 flex items-center justify-center px-2 pb-20"
                exit={{ opacity: 0, y: 16 }}
                initial={{ opacity: 0, y: 24 }}
                key="composer-center"
                transition={{ duration: 0.24, ease: "easeOut" }}
              >
                <div className="flex w-full max-w-3xl flex-col items-center justify-center">
                  <div className="mb-6">
                    <Overview userName={userName} />
                  </div>
                  {inputCard(true)}
                  {attachments.length === 0 && (
                    <SuggestedActions
                      onAction={(text) => {
                        sendMessage({ text });
                      }}
                    />
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.form
                animate={{ opacity: 1, y: 0 }}
                className="relative z-30 mx-auto w-full max-w-3xl px-2 pb-2"
                exit={{ opacity: 0, y: 12 }}
                initial={{ opacity: 0, y: 20 }}
                key="composer-bottom"
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                <motion.div
                  animate={isInView ? "hidden" : "visible"}
                  className="mb-2 flex justify-end"
                  initial="hidden"
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  variants={{
                    visible: { opacity: 1, y: 0 },
                    hidden: { opacity: 0, y: 8 },
                  }}
                >
                  <Button
                    className="rounded-full border-border/80 bg-card/90 backdrop-blur-xs"
                    onClick={() => scroll({ force: true })}
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </motion.div>
                {inputCard(false)}
              </motion.form>
            )}
          </AnimatePresence>
        )}
      </div>

      <AnimatePresence>
        {isDragActive && (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-background/50 backdrop-blur-sm"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              animate={{ scale: 1 }}
              className="rounded-lg border-2 border-primary border-dashed bg-background/80 p-8 text-center"
              exit={{ scale: 0.95 }}
              initial={{ scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <p className="font-medium text-lg">Drop your files here</p>
              <p className="mt-2 text-muted-foreground text-sm">
                You can upload up to {MAX_FILES} files
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
