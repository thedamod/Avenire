"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage } from "@avenire/ai/message-types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@avenire/ui/components/card";
import { AlertCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { memo } from "react";
import type { Attachment } from "@/components/chat/attachment";
import { ChatActions } from "@/components/chat/chat-actions";
import { Markdown } from "@/components/chat/markdown";
import { PreviewAttachment } from "@/components/chat/preview-attachment";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/chat/reasoning";
import { cn } from "@/lib/utils";

type MessageErrorType =
  | "MODEL_ERROR"
  | "NETWORK_ERROR"
  | "VALIDATION_ERROR"
  | "UNKNOWN_ERROR";

const ERROR_MESSAGES: Record<MessageErrorType, string> = {
  MODEL_ERROR:
    "The AI model encountered an issue while processing your request.",
  NETWORK_ERROR: "There was a problem connecting to the server.",
  VALIDATION_ERROR: "There was an issue with the message format.",
  UNKNOWN_ERROR: "An unexpected error occurred while processing your message.",
};

const categorizeError = (error: Error): MessageErrorType => {
  const message = error.message.toLowerCase();
  if (message.includes("model") || message.includes("ai")) {
    return "MODEL_ERROR";
  }
  if (message.includes("network") || message.includes("connection")) {
    return "NETWORK_ERROR";
  }
  if (message.includes("validation") || message.includes("format")) {
    return "VALIDATION_ERROR";
  }
  return "UNKNOWN_ERROR";
};

interface MessagePart {
  content?: string;
  filename?: string;
  mediaType?: string;
  reasoning?: string;
  reasoningText?: string;
  text?: string;
  type: string;
  url?: string;
}

const isReasoningPart = (part: MessagePart) =>
  part.type === "reasoning" ||
  part.type.startsWith("reasoning-") ||
  (typeof part.reasoning === "string" && part.reasoning.length > 0) ||
  (typeof part.reasoningText === "string" && part.reasoningText.length > 0);

const getReasoningText = (part: MessagePart) => {
  const candidates = [
    part.text,
    part.reasoning,
    part.reasoningText,
    part.content,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return "";
};

function AnimatedMarkdown({
  content,
  id,
}: {
  content: string;
  id: string;
}) {
  return <Markdown content={content} id={id} />;
}

const toAttachment = (part: MessagePart): Partial<Attachment> | null => {
  if (part.type !== "file" || !part.url) {
    return null;
  }
  return {
    name: part.filename ?? "Attachment",
    url: part.url,
    contentType: part.mediaType ?? "application/octet-stream",
    status: "completed",
  };
};

const PurePreviewMessage = ({
  chatId,
  message,
  error,
  isLoading,
  status,
  setMessages: _setMessages,
  reload,
  isReadonly,
}: {
  chatId: string;
  message: UIMessage;
  error: UseChatHelpers<UIMessage>["error"];
  isLoading: boolean;
  status: UseChatHelpers<UIMessage>["status"];
  setMessages: UseChatHelpers<UIMessage>["setMessages"];
  reload: UseChatHelpers<UIMessage>["regenerate"];
  isReadonly: boolean;
}) => {
  const parts = (message.parts ?? []) as MessagePart[];
  const fileParts = parts.filter((part) => part.type === "file");

  return (
    <AnimatePresence>
      <motion.div
        animate={{ y: 0, opacity: 1 }}
        className={cn("group/message mx-auto w-full max-w-3xl px-4", {
          "justify-self-end": message.role === "user",
        })}
        data-role={message.role}
        data-testid={`message-${message.role}`}
        initial={{ y: 5, opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <div className="flex w-full flex-col gap-3 group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-[80%]">
          {message.role === "assistant" && (
            <div className="flex flex-row items-center gap-2">
              <div className="flex flex-col gap-4 text-muted-foreground text-xs uppercase tracking-[0.18em]">
                Apollo
              </div>
            </div>
          )}

          {error && (
            <Card className="w-full border-destructive/20 bg-destructive/10 text-destructive">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  <CardTitle className="text-base">Message Error</CardTitle>
                </div>
                <CardDescription className="text-destructive/80">
                  {ERROR_MESSAGES[categorizeError(error)]}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-destructive/80 text-sm">
                <p>Technical details (for support):</p>
                <code className="mt-1 block max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded bg-destructive/5 p-2 text-xs">
                  {error.name}: {error.message}
                </code>
              </CardContent>
            </Card>
          )}

          <div
            className={cn(
              "flex w-full flex-col gap-4",
              message.role === "user" && "items-end"
            )}
          >
            {fileParts.length > 0 && (
              <div
                className="flex flex-row justify-end gap-2"
                data-testid="message-attachments"
              >
                {fileParts.map((part, index) => {
                  const attachment = toAttachment(part);
                  if (!attachment) {
                    return null;
                  }
                  return (
                    <PreviewAttachment
                      attachment={attachment}
                      key={`${message.id}-file-${index}`}
                    />
                  );
                })}
              </div>
            )}

            {parts.map((part, index) => {
              const key = `message-${message.id}-part-${index}`;

              if (isReasoningPart(part)) {
                return (
                  <Reasoning
                    className="w-full"
                    isStreaming={status === "streaming" && isLoading}
                    key={key}
                  >
                    <ReasoningTrigger />
                    <ReasoningContent>
                      {getReasoningText(part)}
                    </ReasoningContent>
                  </Reasoning>
                );
              }

              if (part.type === "text") {
                return (
                  <div className="flex flex-row items-start gap-2" key={key}>
                    <div
                      className={cn(
                        "flex w-full flex-col gap-4",
                        message.role === "user" &&
                          "group relative rounded-2xl rounded-br-sm border border-border/80 bg-secondary px-4 py-3 text-secondary-foreground"
                      )}
                      data-testid="message-content"
                    >
                      {message.role === "user" ? (
                        <p className="text-[15px] leading-6">{part.text ?? ""}</p>
                      ) : (
                        <AnimatedMarkdown
                          content={part.text ?? ""}
                          id={key}
                        />
                      )}
                    </div>
                  </div>
                );
              }
              return null;
            })}
          </div>

          {!isReadonly && message.role === "assistant" && !isLoading && (
            <ChatActions
              chatId={chatId}
              message={message}
              onRegenerate={
                message.role === "assistant"
                  ? () => {
                      reload();
                    }
                  : undefined
              }
            />
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prev, next) =>
    prev.message === next.message &&
    prev.error?.message === next.error?.message &&
    prev.isLoading === next.isLoading &&
    prev.status === next.status
);

export const ThinkingMessage = memo(function ThinkingMessage() {
  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="mx-auto w-full max-w-3xl px-4 text-muted-foreground text-sm"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      Thinking...
    </motion.div>
  );
});
