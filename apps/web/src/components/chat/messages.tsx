import type { UseChatHelpers } from "@ai-sdk/react";
import type { AgentActivityData, UIMessage } from "@avenire/ai/message-types";
import type { CSSProperties } from "react";
import { memo, type RefObject } from "react";
import { PreviewMessage, ThinkingMessage } from "@/components/chat/message";
import { Overview } from "@/components/chat/overview";

interface MessagesProps {
  addToolApprovalResponse: UseChatHelpers<UIMessage>["addToolApprovalResponse"];
  agentActivity: AgentActivityData | null;
  chatId: string;
  error: UseChatHelpers<UIMessage>["error"];
  isReadonly: boolean;
  messages: UseChatHelpers<UIMessage>["messages"];
  messagesContainerRef: RefObject<HTMLDivElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  reload: UseChatHelpers<UIMessage>["regenerate"];
  setMessages: UseChatHelpers<UIMessage>["setMessages"];
  status: UseChatHelpers<UIMessage>["status"];
  workspaceUuid: string;
}

function PureMessages({
  addToolApprovalResponse,
  agentActivity,
  chatId,
  status,
  messages,
  error,
  reload,
  setMessages,
  isReadonly,
  workspaceUuid,
  messagesContainerRef,
  messagesEndRef,
}: MessagesProps) {
  return (
    <div
      className="scroll-fade-frame scroll-fade-top relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      style={
        {
          "--scroll-fade-color": "var(--background)",
        } as CSSProperties
      }
    >
      <div
        className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-y-contain px-2 pt-24 pb-8 md:px-0 md:pt-5 md:pb-6"
        ref={messagesContainerRef}
      >
        {messages.length === 0 && <Overview />}

        {messages.map((message, index) => {
          const isLoading =
            status === "streaming" && messages.length - 1 === index;
          const showAgentActivity =
            isLoading && message.role === "assistant" ? agentActivity : null;

          return (
            <PreviewMessage
              addToolApprovalResponse={addToolApprovalResponse}
              agentActivity={showAgentActivity}
              chatId={chatId}
              error={error}
              isLoading={isLoading}
              isReadonly={isReadonly}
              isStreaming={isLoading}
              key={message.id}
              message={message}
              reload={reload}
              setMessages={setMessages}
              workspaceUuid={workspaceUuid}
            />
          );
        })}

        {status === "submitted" &&
          messages.length > 0 &&
          messages.at(-1)?.role === "user" && <ThinkingMessage />}

        <div className="min-h-6 min-w-6 shrink-0" ref={messagesEndRef} />
      </div>
    </div>
  );
}

export const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (nextProps.status === "streaming") {
    return false;
  }
  if (
    prevProps.status !== nextProps.status &&
    (prevProps.status === "submitted" || nextProps.status === "submitted")
  ) {
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
