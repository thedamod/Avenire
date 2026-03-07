import { memo, type RefObject } from "react";
import type { UseChatHelpers } from "@ai-sdk/react";

import type { UIMessage } from "@avenire/ai/message-types";
import { PreviewMessage, ThinkingMessage } from "@/components/chat/message";
import { Overview } from "@/components/chat/overview";

interface MessagesProps {
  chatId: string;
  status: UseChatHelpers<UIMessage>["status"];
  messages: UseChatHelpers<UIMessage>["messages"];
  setMessages: UseChatHelpers<UIMessage>["setMessages"];
  reload: UseChatHelpers<UIMessage>["regenerate"];
  error: UseChatHelpers<UIMessage>["error"];
  messagesContainerRef: RefObject<HTMLDivElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  isReadonly: boolean;
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
      ref={messagesContainerRef}
      className="relative flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-2 pt-24 pb-24 md:px-0 md:pt-4 md:pb-12"
    >
      {messages.length === 0 && <Overview />}

      {messages.map((message, index) => (
        <PreviewMessage
          chatId={chatId}
          key={message.id}
          message={message}
          error={error}
          isLoading={status === "streaming" && messages.length - 1 === index}
          setMessages={setMessages}
          reload={reload}
          isReadonly={isReadonly}
          status={status}
        />
      ))}

      {status === "submitted" &&
        messages.length > 0 &&
        messages.at(-1)?.role === "user" && <ThinkingMessage />}

      <div ref={messagesEndRef} className="shrink-0 min-w-6 min-h-6" />
    </div>
  );
}

export const Messages = memo(PureMessages);
