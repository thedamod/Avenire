import type { UseChatHelpers } from "@ai-sdk/react";
import type { AgentActivityData, UIMessage } from "@avenire/ai/message-types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@avenire/ui/components/card";
import { AlertCircle } from "lucide-react";
import { memo, type RefObject } from "react";
import { PreviewMessage } from "@/components/chat/message";
import { Overview } from "@/components/chat/overview";

interface MessagesProps {
  addToolApprovalResponse: UseChatHelpers<UIMessage>["addToolApprovalResponse"];
  agentActivity: AgentActivityData | null;
  chatId: string;
  error: UseChatHelpers<UIMessage>["error"];
  isEmpty: boolean;
  isReadonly: boolean;
  messages: UseChatHelpers<UIMessage>["messages"];
  messagesContainerRef: RefObject<HTMLDivElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  reload: UseChatHelpers<UIMessage>["regenerate"];
  sendMessage: UseChatHelpers<UIMessage>["sendMessage"];
  setMessages: UseChatHelpers<UIMessage>["setMessages"];
  status: UseChatHelpers<UIMessage>["status"];
  workspaceUuid: string;
  userName?: string;
}

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

function PureMessages({
  addToolApprovalResponse,
  agentActivity,
  chatId,
  status,
  messages,
  error,
  reload,
  sendMessage,
  setMessages,
  isReadonly,
  workspaceUuid,
  userName,
  messagesContainerRef,
  messagesEndRef,
  isEmpty,
}: MessagesProps) {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div
        className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-y-contain px-2 pt-24 pb-8 md:px-0 md:pt-5 md:pb-6"
        ref={messagesContainerRef}
      >
        {error && (
          <Card className="mx-auto w-full max-w-3xl border-destructive/20 bg-destructive/10 text-destructive">
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
        {isEmpty && <Overview userName={userName} />}

        {messages.map((message, index) => {
          const isLast = messages.length - 1 === index;
          const isLoading = status === "streaming" && isLast;
          const showAgentActivity =
            isLoading && message.role === "assistant" ? agentActivity : null;
          const lastPart = message.parts?.at(-1);
          const lastPartDone =
            !(lastPart && "state" in lastPart) ||
            (lastPart as { state?: string }).state !== "input-streaming";
          const isComplete =
            message.role !== "assistant"
              ? true
              : lastPartDone && !isLoading && status !== "submitted";

          return (
            <PreviewMessage
              addToolApprovalResponse={addToolApprovalResponse}
              agentActivity={showAgentActivity}
              chatId={chatId}
              isComplete={isComplete}
              isLoading={isLoading}
              isReadonly={isReadonly}
              isStreaming={isLoading}
              key={message.id}
              message={message}
              reload={reload}
              sendMessage={sendMessage}
              setMessages={setMessages}
              workspaceUuid={workspaceUuid}
            />
          );
        })}

        <div className="min-h-6 min-w-6 shrink-0" ref={messagesEndRef} />
      </div>
    </div>
  );
}

export const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (nextProps.status === "streaming") {
    return false;
  }
  if (prevProps.status !== nextProps.status) {
    return false;
  }
  const prevMessages = prevProps.messages;
  const nextMessages = nextProps.messages;
  if (prevMessages.length !== nextMessages.length) {
    return false;
  }
  for (let index = 0; index < nextMessages.length; index += 1) {
    const prevMessage = prevMessages[index];
    const nextMessage = nextMessages[index];
    const prevParts = prevMessage.parts ?? [];
    const nextParts = nextMessage.parts ?? [];
    const prevLast = prevParts.at(-1);
    const nextLast = nextParts.at(-1);

    const prevSignature = [
      prevMessage.id,
      prevMessage.role,
      prevParts.length,
      prevLast?.type ?? "",
      prevLast && "text" in prevLast ? (prevLast.text ?? "") : "",
      prevLast && "state" in prevLast ? (prevLast.state ?? "") : "",
    ].join("|");
    const nextSignature = [
      nextMessage.id,
      nextMessage.role,
      nextParts.length,
      nextLast?.type ?? "",
      nextLast && "text" in nextLast ? (nextLast.text ?? "") : "",
      nextLast && "state" in nextLast ? (nextLast.state ?? "") : "",
    ].join("|");

    if (prevSignature !== nextSignature) {
      return false;
    }
  }
  if (prevProps.workspaceUuid !== nextProps.workspaceUuid) {
    return false;
  }
  return true;
});
