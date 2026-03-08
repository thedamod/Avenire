"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "@avenire/ai/message-types";
import { Button } from "@avenire/ui/components/button";
import { DefaultChatTransport } from "ai";
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
  CHAT_NAME_UPDATED_EVENT,
  type ChatNameUpdatedDetail,
} from "@/lib/chat-events";

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
}

export function Chat({
  id,
  initialMessages,
  selectedModel,
  selectedReasoningModel,
  isReadonly,
}: ChatProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [input, setInput] = useState("");
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

  const {
    messages,
    setMessages,
    sendMessage: append,
    status,
    stop,
    regenerate: reload,
    resumeStream,
    error,
  } = useChat<UIMessage>({
    id,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: {
        chatId: id,
        selectedModel,
        selectedReasoningModel,
      },
    }),
    experimental_throttle: 100,
    messages: initialMessages,
    onError: handleError,
    onData: (dataPart) => {
      if (dataPart.type !== "data-chatName") {
        return;
      }

      const detail = dataPart.data as ChatNameUpdatedDetail;
      if (!detail?.id || !detail?.name) {
        return;
      }

      window.dispatchEvent(
        new CustomEvent<ChatNameUpdatedDetail>(CHAT_NAME_UPDATED_EVENT, {
          detail,
        }),
      );
    },
  });

  useEffect(() => {
    void resumeStream();
  }, [resumeStream]);

  const handleSubmit = (files: Attachment[]) => {
    const fileArray = files
      .map((attachment) => attachment.file)
      .filter((file): file is File => Boolean(file));

    if (fileArray.length > 0) {
      const dataTransfer = new DataTransfer();
      for (const file of fileArray) {
        dataTransfer.items.add(file);
      }
      append({ text: input, files: dataTransfer.files });
    } else {
      append({ text: input });
    }

    setInput("");
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
        stop={stop}
      />
    </div>
  );

  return (
    <div {...getRootProps()} className="relative flex h-full min-h-0 flex-col">
      <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col bg-background transition-all duration-300">
        {!isEmptyState && (
          <Messages
            chatId={id}
            error={error}
            isReadonly={isReadonly}
            messages={messages}
            messagesContainerRef={messagesContainerRef}
            messagesEndRef={messagesEndRef}
            reload={reload}
            setMessages={setMessages}
            status={status}
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
                <div className="w-full max-w-3xl flex flex-col items-center justify-center">
                  <div className="mb-6">
                    <Overview />
                  </div>
                  {inputCard(true)}
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
                    className="rounded-full bg-background/90 shadow-md backdrop-blur-md transition-shadow hover:shadow-lg"
                    onClick={scroll}
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
