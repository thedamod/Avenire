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
import { Link2, MessageSquareText, Share2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Chat } from "@/components/chat/chat";
import { ChatIcon } from "@/components/chat/chat-icon";
import { ThinkingGlyph } from "@/components/chat/thinking-indicator";
import { WorkspaceHeader } from "@/components/dashboard/workspace-header";
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
import { useWorkspaceHistoryStore } from "@/stores/workspaceHistoryStore";
import type { ShareSuggestion } from "@/types/share";

interface ChatWorkspaceProps {
  chatSlug: string;
  chatTitle: string;
  chatIcon?: string | null;
  initialMessages: UIMessage[];
  initialPrompt?: string | null;
  isReadonly?: boolean;
  workspaceUuid: string;
  userName?: string;
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
  const [shareSuggestions, setShareSuggestions] = useState<ShareSuggestion[]>(
    []
  );
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [title, setTitle] = useState(chatTitle);
  const [icon, setIcon] = useState<string | null>(chatIcon ?? null);
  const [isPending, setIsPending] = useState(false);
  const [resolvedInitialMessages, setResolvedInitialMessages] =
    useState(initialMessages);

  useEffect(() => {
    setTitle(chatTitle);
  }, [chatTitle]);

  useEffect(() => {
    setIcon(chatIcon ?? null);
  }, [chatIcon]);

  useEffect(() => {
    setActiveChatSlug(chatSlug);
  }, [chatSlug]);

  useEffect(() => {
    if (initialMessages.length > 0) {
      setResolvedInitialMessages(initialMessages);
      return;
    }

    const pendingMessages = chatMessageHandoffActions.consume(chatSlug);
    if (pendingMessages && pendingMessages.length > 0) {
      setResolvedInitialMessages(pendingMessages);
      return;
    }

    setResolvedInitialMessages(initialMessages);
  }, [chatSlug, initialMessages]);

  useEffect(() => {
    const onChatCreated = (event: Event) => {
      const detail = (event as CustomEvent<ChatCreatedDetail>).detail;
      if (!(detail?.id && detail?.fromId)) {
        return;
      }
      if (chatSlug !== "new" && detail.fromId !== chatSlug) {
        return;
      }
      setActiveChatSlug(detail.id);
    };

    window.addEventListener(CHAT_CREATED_EVENT, onChatCreated);
    return () => {
      window.removeEventListener(CHAT_CREATED_EVENT, onChatCreated);
    };
  }, [chatSlug]);

  const currentChatSlug = activeChatSlug;
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
    setShareEmail("");
    setShareSuggestions([]);
    setShareLink(null);
    setShareBusy(false);
    setShareStatus(null);
    setIsShareDialogOpen(false);
    setIsPending(false);
  }, [currentChatSlug]);

  useEffect(() => {
    const onChatNameUpdated = (event: Event) => {
      const detail = (event as CustomEvent<ChatNameUpdatedDetail>).detail;
      if (!(detail?.id && detail?.name)) {
        return;
      }
      if (currentChatSlug !== "new" && detail.id !== currentChatSlug) {
        return;
      }
      setTitle(detail.name);
      if (detail.icon) {
        setIcon(detail.icon);
      }
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
  }, [currentChatSlug]);

  useEffect(() => {
    if (currentChatSlug === "new") {
      setShareSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const loadSuggestions = async () => {
        try {
          const url = new URL(
            `/api/chats/${currentChatSlug}/share/suggestions`,
            window.location.origin
          );
          if (shareEmail.trim()) {
            url.searchParams.set("q", shareEmail.trim());
          }
          const response = await fetch(url.toString(), {
            cache: "no-store",
            signal: controller.signal,
          });
          if (!response.ok) {
            if (controller.signal.aborted) {
              return;
            }
            setShareSuggestions([]);
            return;
          }
          const payload = (await response.json()) as {
            suggestions?: ShareSuggestion[];
          };
          setShareSuggestions(payload.suggestions ?? []);
        } catch {
          if (controller.signal.aborted) {
            return;
          }
          setShareSuggestions([]);
        }
      };
      loadSuggestions().catch(() => {
        setShareSuggestions([]);
      });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [currentChatSlug, isShareDialogOpen, shareEmail]);

  const shareWithEmail = async () => {
    const email = shareEmail.trim();
    if (!email) {
      return;
    }

    setShareBusy(true);
    setShareStatus(null);
    try {
      const response = await fetch(`/api/chats/${currentChatSlug}/share/grants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
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
      <WorkspaceHeader
        actions={
          isReadonly || currentChatSlug === "new" ? null : (
            <Dialog>
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
                  <DialogTitle>Share chat</DialogTitle>
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
          )
        }
      >
        <Breadcrumb className="min-w-0 flex-1">
          <BreadcrumbList className="flex-nowrap overflow-hidden whitespace-nowrap pr-2">
            <BreadcrumbItem>
              <BreadcrumbPage className="inline-flex max-w-full items-center gap-1.5 overflow-hidden text-sm font-medium leading-none">
                {isPending ? (
                  <ThinkingGlyph className="size-3.5" />
                ) : isChatIconName(icon) ? (
                  <ChatIcon
                    className="hidden size-3.5 text-muted-foreground sm:inline-flex"
                    name={icon}
                  />
                ) : (
                  <MessageSquareText className="hidden size-3.5 text-muted-foreground sm:inline-flex" />
                )}
                <span className="min-w-0 truncate">{title}</span>
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </WorkspaceHeader>

      <div className="min-h-0 flex-1 overflow-hidden">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="h-full"
          initial={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <Chat
            id={chatSlug}
            initialMessages={resolvedInitialMessages}
            initialPrompt={initialPrompt}
            isReadonly={isReadonly}
            selectedModel="apollo-apex"
            workspaceUuid={workspaceUuid}
            userName={userName}
          />
        </motion.div>
      </div>
    </div>
  );
}
