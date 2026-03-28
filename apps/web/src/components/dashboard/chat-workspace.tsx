"use client";

import type { UIMessage } from "@avenire/ai/message-types";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@avenire/ui/components/breadcrumb";
import { Button } from "@avenire/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@avenire/ui/components/dialog";
import { Input } from "@avenire/ui/components/input";
import { Label } from "@avenire/ui/components/label";
import { ChatText as MessageSquareText, LinkSimple as Link2, ShareNetwork as Share2 } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Chat } from "@/components/chat/chat";
import { ChatIcon } from "@/components/chat/chat-icon";
import { ThinkingGlyph } from "@/components/chat/thinking-indicator";
import {
  HeaderActions,
  HeaderBreadcrumbs,
} from "@/components/dashboard/header-portal";
import { EmailSuggestionInput } from "@/components/shared/email-suggestion-input";
import {
  CHAT_CREATED_EVENT,
  CHAT_NAME_UPDATED_EVENT,
  CHAT_STREAM_STATUS_EVENT,
  type ChatCreatedDetail,
  type ChatNameUpdatedDetail,
  type ChatStreamStatusDetail,
} from "@/lib/chat-events";
import { isChatIconName } from "@/lib/chat-icons";
import { chatMessageHandoffActions } from "@/stores/chat-message-handoff-store";
import { useChatMessageHandoffStore } from "@/stores/chat-message-handoff-store";
import { useWorkspaceHistoryStore } from "@/stores/workspaceHistoryStore";
import type { ShareSuggestion } from "@/types/share";
import { useQuery } from "@tanstack/react-query"

interface ChatWorkspaceProps {
  chatIcon?: string | null;
  chatSlug: string;
  chatTitle: string;
  initialMessages: UIMessage[];
  initialPrompt?: string | null;
  isReadonly?: boolean;
  userName?: string;
  workspaceUuid: string;
}

async function loadShareSuggestions(input: {
  chatSlug: string;
  email: string;
  signal: AbortSignal;
}): Promise<ShareSuggestion[]> {
  const url = new URL(
    `/api/chats/${input.chatSlug}/share/suggestions`,
    window.location.origin
  );
  if (input.email.trim()) {
    url.searchParams.set("q", input.email.trim());
  }

  const response = await fetch(url.toString(), {
    cache: "no-store",
    signal: input.signal,
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as {
    suggestions?: ShareSuggestion[];
  };
  return payload.suggestions ?? [];
}

export function ChatWorkspace({
  chatSlug,
  chatTitle,
  chatIcon,
  initialMessages,
  initialPrompt,
  isReadonly = false,
  workspaceUuid,
  userName,
}: ChatWorkspaceProps) {
  const pathname = usePathname();
  const recordRoute = useWorkspaceHistoryStore((state) => state.recordRoute);
  const [activeChatSlug, setActiveChatSlug] = useState(chatSlug);
  const [shareEmail, setShareEmail] = useState("");
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [chatMetaOverride, setChatMetaOverride] = useState<{
    icon: string | null;
    slug: string;
    title: string;
  } | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [resolvedInitialMessages, setResolvedInitialMessages] = useState<
    UIMessage[]
  >(() => {
    if (initialMessages.length > 0) {
      return initialMessages;
    }

    return chatMessageHandoffActions.consume(chatSlug) ?? initialMessages;
  });
  const [prevChatSlug, setPrevChatSlug] = useState(chatSlug);

  const resetShareState = useCallback(() => {
    setShareEmail("");
    setShareLink(null);
    setShareBusy(false);
    setShareStatus(null);
    setIsShareDialogOpen(false);
  }, []);

  if (chatSlug !== prevChatSlug) {
    setPrevChatSlug(chatSlug);
    setActiveChatSlug(chatSlug);
    setChatMetaOverride(null);
    resetShareState();
    setIsPending(false);
    if (initialMessages.length > 0) {
      setResolvedInitialMessages(initialMessages);
    } else {
      const pending = chatMessageHandoffActions.consume(chatSlug);
      setResolvedInitialMessages(pending ?? initialMessages);
    }
  }

  useEffect(() => {
    const onChatCreated = (event: Event) => {
      const detail = (event as CustomEvent<ChatCreatedDetail>).detail;
      if (!(detail?.id && detail?.fromId)) {
        return;
      }
      if (chatSlug !== "new" && detail.fromId !== chatSlug) {
        return;
      }
      const pendingMessages =
        useChatMessageHandoffStore.getState().messagesByChatId[detail.id] ??
        null;
      if (pendingMessages) {
        setResolvedInitialMessages(pendingMessages);
      }
      setActiveChatSlug(detail.id);
      setChatMetaOverride(null);
      resetShareState();
      setIsPending(false);
    };

    window.addEventListener(CHAT_CREATED_EVENT, onChatCreated);
    return () => {
      window.removeEventListener(CHAT_CREATED_EVENT, onChatCreated);
    };
  }, [chatSlug, resetShareState]);

  const currentChatSlug = activeChatSlug;
  const title =
    chatMetaOverride?.slug === currentChatSlug
      ? chatMetaOverride.title
      : chatTitle;
  const icon =
    chatMetaOverride?.slug === currentChatSlug
      ? chatMetaOverride.icon
      : (chatIcon ?? null);
  let headerIcon = (
    <MessageSquareText className="hidden size-3.5 text-muted-foreground sm:inline-flex" />
  );
  if (isPending) {
    headerIcon = <ThinkingGlyph className="size-3.5" />;
  } else if (isChatIconName(icon)) {
    headerIcon = (
      <ChatIcon
        className="hidden size-3.5 text-muted-foreground sm:inline-flex"
        name={icon}
      />
    );
  }
  const currentRoute = useMemo(() => {
    if (pathname === "/workspace/chats/new" && currentChatSlug !== "new") {
      return `/workspace/chats/${currentChatSlug}`;
    }
    return pathname;
  }, [currentChatSlug, pathname]);

  useEffect(() => {
    recordRoute(currentRoute);
  }, [currentRoute, recordRoute]);

  useEffect(() => {
    document.title = `${title} — Avenire`;
  }, [title]);

  useEffect(() => {
    const onChatNameUpdated = (event: Event) => {
      const detail = (event as CustomEvent<ChatNameUpdatedDetail>).detail;
      if (!(detail?.id && detail?.name)) {
        return;
      }
      if (currentChatSlug !== "new" && detail.id !== currentChatSlug) {
        return;
      }
      setChatMetaOverride({
        icon: detail.icon ?? chatIcon ?? null,
        slug: currentChatSlug,
        title: detail.name,
      });
    };

    window.addEventListener(CHAT_NAME_UPDATED_EVENT, onChatNameUpdated);
    return () => {
      window.removeEventListener(CHAT_NAME_UPDATED_EVENT, onChatNameUpdated);
    };
  }, [currentChatSlug]);

  useEffect(() => {
    const onChatStreamStatus = (event: Event) => {
      const detail = (event as CustomEvent<ChatStreamStatusDetail>).detail;
      if (!detail?.chatId) {
        return;
      }
      if (currentChatSlug !== "new" && detail.chatId !== currentChatSlug) {
        return;
      }
      setIsPending(
        detail.status === "submitted" || detail.status === "streaming"
      );
    };

    window.addEventListener(CHAT_STREAM_STATUS_EVENT, onChatStreamStatus);
    return () => {
      window.removeEventListener(CHAT_STREAM_STATUS_EVENT, onChatStreamStatus);
    };
  }, [chatIcon, currentChatSlug]);

  const shareSuggestionsQuery = useQuery({
    enabled:
      isShareDialogOpen &&
      currentChatSlug !== "new" &&
      shareEmail.trim().length > 0,
    queryFn: ({ signal }) =>
      loadShareSuggestions({
        chatSlug: currentChatSlug,
        email: shareEmail,
        signal,
      }),
    queryKey: [
      "chat-share-suggestions",
      currentChatSlug,
      shareEmail.trim().toLowerCase(),
    ],
    staleTime: 30_000,
  });

  const shareSuggestions =
    isShareDialogOpen && currentChatSlug !== "new"
      ? (shareSuggestionsQuery.data ?? [])
      : [];

  const shareWithEmail = async () => {
    const email = shareEmail.trim();
    if (!email) {
      return;
    }

    setShareBusy(true);
    setShareStatus(null);
    try {
      const response = await fetch(
        `/api/chats/${currentChatSlug}/share/grants`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }
      );
      if (!response.ok) {
        setShareStatus("Could not add access.");
        return;
      }
      setShareEmail("");
      setShareStatus(`Access granted to ${email}.`);
    } finally {
      setShareBusy(false);
    }
  };

  const generateShareLink = async () => {
    setShareBusy(true);
    setShareStatus(null);
    try {
      const response = await fetch(`/api/chats/${currentChatSlug}/share/link`, {
        method: "POST",
      });
      if (!response.ok) {
        setShareStatus("Unable to generate link.");
        return;
      }
      const payload = (await response.json()) as { shareUrl?: string };
      if (payload.shareUrl) {
        setShareLink(payload.shareUrl);
        setShareStatus("Share link generated.");
      }
    } finally {
      setShareBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <HeaderActions>
        {isReadonly || currentChatSlug === "new" ? null : (
          <Dialog
            onOpenChange={(open) => {
              setIsShareDialogOpen(open);
              if (!open) {
                resetShareState();
              }
            }}
            open={isShareDialogOpen}
          >
            <DialogTrigger
              render={
                <Button
                  className="rounded-md"
                  size="sm"
                  type="button"
                  variant="outline"
                />
              }
            >
              <Share2 className="size-3.5" />
              Share
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Share method</DialogTitle>
                <DialogDescription>
                  Grant read-only access by email or create a signed link.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <Label htmlFor="share-email">Add people</Label>
                <div className="flex items-center gap-2">
                  <EmailSuggestionInput
                    id="share-email"
                    onValueChange={setShareEmail}
                    placeholder="name@example.com"
                    suggestions={shareSuggestions}
                    value={shareEmail}
                  />
                  <Button
                    disabled={shareBusy}
                    onClick={() => {
                      shareWithEmail().catch(() => undefined);
                    }}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    Add
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Share link (7 days)</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={shareLink ?? ""} />
                  <Button
                    disabled={shareBusy}
                    onClick={() => {
                      generateShareLink().catch(() => undefined);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Link2 className="size-4" />
                    Generate
                  </Button>
                  <Button
                    disabled={!shareLink}
                    onClick={() => {
                      if (!shareLink) {
                        return;
                      }
                      navigator.clipboard.writeText(shareLink).catch(() => {
                        setShareStatus("Unable to copy link.");
                      });
                      setShareStatus("Link copied.");
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Copy
                  </Button>
                </div>
              </div>
              {shareStatus ? (
                <p className="text-muted-foreground text-xs">{shareStatus}</p>
              ) : null}
            </DialogContent>
          </Dialog>
        )}
      </HeaderActions>
      <HeaderBreadcrumbs>
        <Breadcrumb className="min-w-0 flex-1">
          <BreadcrumbList className="flex-nowrap overflow-hidden whitespace-nowrap pr-2">
            <BreadcrumbItem>
              <BreadcrumbPage className="inline-flex max-w-full items-center gap-1.5 overflow-hidden font-medium text-sm leading-none">
                {headerIcon}
                <span className="min-w-0 truncate">{title}</span>
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </HeaderBreadcrumbs>

      <div className="min-h-0 flex-1 overflow-hidden">
        <motion.div
          className="h-full"
          initial={false}
        >
          <Chat
            id={currentChatSlug}
            initialMessages={resolvedInitialMessages}
            initialPrompt={initialPrompt}
            isReadonly={isReadonly}
            key={currentChatSlug}
            selectedModel="apollo-apex"
            userName={userName}
            workspaceUuid={workspaceUuid}
          />
        </motion.div>
      </div>
    </div>
  );
}
