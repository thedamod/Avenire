import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage } from "@avenire/ai/message-types";
import type { CSSProperties } from "react";
import { memo, type RefObject } from "react";
import { PreviewMessage, ThinkingMessage } from "@/components/chat/message";
import { Overview } from "@/components/chat/overview";

interface MessagesProps {
  chatId: string;
  error: UseChatHelpers<UIMessage>["error"];
  isReadonly: boolean;
  messages: UseChatHelpers<UIMessage>["messages"];
  messagesContainerRef: RefObject<HTMLDivElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  reload: UseChatHelpers<UIMessage>["regenerate"];
  setMessages: UseChatHelpers<UIMessage>["setMessages"];
  status: UseChatHelpers<UIMessage>["status"];
}

function PureMessages({
  chatId,
  status,
  messages,
  error,
  reload,
  setMessages,
  isReadonly,
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

        {messages.map((message, index) => (
          <PreviewMessage
            chatId={chatId}
            error={error}
            isLoading={status === "streaming" && messages.length - 1 === index}
            isReadonly={isReadonly}
            key={message.id}
            message={message}
            reload={reload}
            setMessages={setMessages}
            status={status}
          />
        ))}

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
  if (prevProps.status !== nextProps.status) {
    return false;
  }
  if (prevProps.messages.length !== nextProps.messages.length) {
    return false;
  }
  return true;
});
