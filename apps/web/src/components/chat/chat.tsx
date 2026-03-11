"use client";

import { useChat } from "@ai-sdk/react";
import type { AgentActivityData, UIMessage } from "@avenire/ai/message-types";
import { Button } from "@avenire/ui/components/button";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type FileUIPart,
} from "ai";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { useCallback, useEffect, useState } from "react";
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
import {
  CHAT_CREATED_EVENT,
  CHAT_NAME_UPDATED_EVENT,
  CHAT_STREAM_FINISHED_EVENT,
  type ChatCreatedDetail,
  type ChatNameUpdatedDetail,
} from "@/lib/chat-events";
import { normalizeMediaType } from "@/lib/media-type";

type ChatErrorType =
  | "NETWORK_ERROR"
  | "MODEL_ERROR"
  | "VALIDATION_ERROR"
  | "UNKNOWN_ERROR";

const ERROR_MESSAGES: Record<ChatErrorType, string> = {
  NETWORK_ERROR:
    "Unable to connect to the server. Please check your internet connection and try again.",
  MODEL_ERROR:
    "The AI model is currently experiencing issues. Please try again in a few moments.",
  VALIDATION_ERROR:
    "There was an issue with your request. Please check your input and try again.",
  UNKNOWN_ERROR:
    "Something went wrong. Please try again or contact support if the issue persists.",
};

const categorizeError = (error: Error): ChatErrorType => {
  const message = error.message.toLowerCase();
  if (error.name === "NetworkError" || message.includes("network")) {
    return "NETWORK_ERROR";
  }
  if (message.includes("model") || message.includes("ai")) {
    return "MODEL_ERROR";
  }
  if (message.includes("validation") || message.includes("invalid")) {
    return "VALIDATION_ERROR";
  }
  return "UNKNOWN_ERROR";
};

interface ChatProps {
  id: string;
  initialMessages: UIMessage[];
  isReadonly: boolean;
  selectedModel: string;
  selectedReasoningModel: string;
  workspaceUuid: string;
}

export function Chat({
  id,
  initialMessages,
  selectedModel,
  selectedReasoningModel,
  isReadonly,
  workspaceUuid,
}: ChatProps) {
  const [chatId, setChatId] = useState(id);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [input, setInput] = useState("");
  const [agentActivity, setAgentActivity] = useState<AgentActivityData | null>(
    null
  );
  const MAX_FILES = 3;
  const [messagesContainerRef, messagesEndRef, scroll] =
    useScrollToBottom<HTMLDivElement>();
  const isInView = useInView(messagesEndRef, {
    root: messagesContainerRef,
  });

  const handleError = useCallback((error: Error) => {
    const errorType = categorizeError(error);
    toast.error(ERROR_MESSAGES[errorType], {
      description: "If this issue persists, please contact support.",
      duration: 5000,
    });
  }, []);

  useEffect(() => {
    setChatId(id);
    setAttachments([]);
    setInput("");
    setAgentActivity(null);
  }, [id]);

  const {
    messages,
    setMessages,
    sendMessage: append,
    status,
    stop,
    regenerate: reload,
    resumeStream,
    addToolApprovalResponse,
    error,
  } = useChat<UIMessage>({
    id: chatId,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: {
        chatId,
        selectedModel,
        selectedReasoningModel,
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
        setChatId(detail.id);
        if (
          typeof window !== "undefined" &&
          window.location.pathname === "/dashboard/chats"
        ) {
          window.history.pushState({}, "", `/dashboard/chats/${detail.id}`);
        }
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
    if (id === "new") {
      return;
    }
    resumeStream().catch(() => undefined);
  }, [id, resumeStream]);

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
      return;
    }
    if (status === "ready" && messages.at(-1)?.role === "assistant") {
      scroll();
    }
  }, [messages, scroll, status]);

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
      await append({
        text: inputValue,
        files: [...localFileParts, ...workspaceFileParts],
      });
    } else {
      await append({ text: inputValue });
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

  const isEmptyState = messages.length === 0;

  return (
    <div {...getRootProps()} className="relative flex h-full min-h-0 flex-col">
      <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col transition-all duration-300">
        {!isEmptyState && (
          <Messages
            addToolApprovalResponse={addToolApprovalResponse}
            agentActivity={agentActivity}
            chatId={chatId}
            error={error}
            isReadonly={isReadonly}
            messages={messages}
            messagesContainerRef={messagesContainerRef}
            messagesEndRef={messagesEndRef}
            reload={reload}
            setMessages={setMessages}
            status={status}
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
                <div className="flex w-full max-w-3xl flex-col items-center justify-center gap-6 px-3 sm:px-5">
                  <div>
                    <Overview />
                  </div>
                  <MultimodalInput
                    attachments={attachments}
                    centered
                    handleSubmit={handleSubmit}
                    input={input}
                    setAttachments={setAttachments}
                    setInput={setInput}
                    status={status}
                    stop={stop}
                    workspaceUuid={workspaceUuid}
                  />
                  {attachments.length === 0 && (
                    <SuggestedActions
                      onAction={(text) => {
                        append({ text });
                      }}
                    />
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="shrink-0 px-3 pb-3 sm:px-5 sm:pb-4"
                exit={{ opacity: 0, y: 12 }}
                initial={{ opacity: 0, y: 20 }}
                key="composer-bottom"
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                <div className="relative mx-auto w-full max-w-3xl">
                  <motion.div
                    animate={isInView ? "hidden" : "visible"}
                    className="pointer-events-none absolute right-0 -top-11 z-10 flex justify-end"
                    initial="hidden"
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    variants={{
                      visible: { opacity: 1, y: 0 },
                      hidden: { opacity: 0, y: 8 },
                    }}
                  >
                    <Button
                      className="pointer-events-auto rounded-full border-border/80 bg-card/90 backdrop-blur-xs"
                      onClick={scroll}
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </motion.div>
                  <MultimodalInput
                    attachments={attachments}
                    handleSubmit={handleSubmit}
                    input={input}
                    setAttachments={setAttachments}
                    setInput={setInput}
                    status={status}
                    stop={stop}
                    workspaceUuid={workspaceUuid}
                  />
                </div>
              </motion.div>
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
