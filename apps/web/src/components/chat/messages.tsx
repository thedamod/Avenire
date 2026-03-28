"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { AgentActivityData, UIMessage } from "@avenire/ai/message-types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@avenire/ui/components/card";
import { Warning as AlertCircle } from "@phosphor-icons/react";
import { memo, type RefObject } from "react";
import { PreviewMessage } from "@/components/chat/message";
import { Overview } from "@/components/chat/overview";
import { getChatErrorMessage } from "@/lib/chat-errors";

interface MessagesProps {
  agentActivity: AgentActivityData | null;
  chatId: string;
  error: UseChatHelpers<UIMessage>["error"];
  isEmpty: boolean;
  isReadonly: boolean;
  messages: UseChatHelpers<UIMessage>["messages"];
  messagesContainerRef: RefObject<HTMLDivElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onRegenerate: (messageId: string) => void;
  sendMessage: UseChatHelpers<UIMessage>["sendMessage"];
  status: UseChatHelpers<UIMessage>["status"];
  userName?: string;
  workspaceUuid: string;
}

const getMessageSignature = (message: UIMessage) => {
  const lastPart = message.parts?.at(-1);
  return [
    message.id,
    message.role,
    message.parts?.length ?? 0,
    lastPart?.type ?? "",
    lastPart && "text" in lastPart ? (lastPart.text ?? "") : "",
    lastPart && "state" in lastPart ? (lastPart.state ?? "") : "",
  ].join("|");
};

const haveMessagesChanged = (
  prevMessages: UseChatHelpers<UIMessage>["messages"],
  nextMessages: UseChatHelpers<UIMessage>["messages"]
) => {
  if (prevMessages.length !== nextMessages.length) {
    return true;
  }
  return prevMessages.some(
    (message, index) =>
      getMessageSignature(message) !== getMessageSignature(nextMessages[index])
  );
};

function PureMessages({
  agentActivity,
  chatId,
  status,
  messages,
  error,
  onRegenerate,
  sendMessage,
  isReadonly,
  workspaceUuid,
  userName,
  messagesContainerRef,
  messagesEndRef,
  isEmpty,
}: MessagesProps) {
  const isCenteredEmptyState = isEmpty && messages.length === 0;

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div
        className={
          isCenteredEmptyState
            ? "relative flex h-full min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-y-contain px-2 py-8 md:px-0 md:py-10"
            : "relative flex h-full min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-y-contain px-2 pt-24 pb-8 md:px-0 md:pt-5 md:pb-6"
        }
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
                {getChatErrorMessage(error)}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-destructive/80 text-sm">
              <p>If the issue repeats, try again or contact support.</p>
            </CardContent>
          </Card>
        )}
        {isEmpty && (
          <div className="flex flex-1 items-center justify-center">
            <Overview userName={userName} />
          </div>
        )}

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
              agentActivity={showAgentActivity}
              chatId={chatId}
              isComplete={isComplete}
              isReadonly={isReadonly}
              isStreaming={isLoading}
              key={message.id}
              message={message}
              onRegenerate={onRegenerate}
              sendMessage={sendMessage}
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
  if (prevProps.workspaceUuid !== nextProps.workspaceUuid) {
    return false;
  }
  return !haveMessagesChanged(prevProps.messages, nextProps.messages);
});
