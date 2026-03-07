"use client";

import type { UIMessage } from "@avenire/ai/message-types";
import { Button } from "@avenire/ui/components/button";
import { GitBranch, RefreshCcw, Copy } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * Extracts and concatenates all text parts from a UIMessage.
 *
 * @param message - The message to extract text from
 * @returns The combined text from every part whose type is `"text"`, joined with `\n` and trimmed of surrounding whitespace
 */
function extractText(message: UIMessage) {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

/**
 * Render action buttons for a chat message: copy its text, create a branched chat, and optionally regenerate the assistant response.
 *
 * @param chatId - The ID of the current chat used when creating a branched chat
 * @param message - The UIMessage whose text and role determine available actions
 * @param onRegenerate - Optional callback invoked to regenerate the assistant message
 * @returns A JSX element containing the action buttons for the provided message
 */
export function ChatActions({
  chatId,
  message,
  onRegenerate,
}: {
  chatId: string;
  message: UIMessage;
  onRegenerate?: () => void;
}) {
  const router = useRouter();

  const copyMessage = async () => {
    const text = extractText(message);
    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied message");
    } catch {
      toast.error("Failed to copy message");
    }
  };

  const branchChat = async () => {
    const response = await fetch(`/api/chats/${chatId}`, { method: "POST" });
    if (!response.ok) {
      toast.error("Failed to branch chat");
      return;
    }

    const data = (await response.json()) as { chat?: { slug: string } };
    if (!data.chat?.slug) {
      toast.error("Failed to branch chat");
      return;
    }

    router.push(`/dashboard/chats/${data.chat.slug}` as Route);
    router.refresh();
  };

  return (
    <div className="mt-2 flex items-center gap-2">
      <Button
        className="h-9 w-9"
        onClick={copyMessage}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Copy className="size-4" />
      </Button>
      <Button
        className="h-9 w-9"
        onClick={branchChat}
        size="icon"
        type="button"
        variant="ghost"
      >
        <GitBranch className="size-4" />
      </Button>
      {onRegenerate && message.role === "assistant" && (
        <Button
          className="h-9 w-9"
          onClick={onRegenerate}
          size="icon"
          type="button"
          variant="ghost"
        >
          <RefreshCcw className="size-4" />
        </Button>
      )}
    </div>
  );
}
