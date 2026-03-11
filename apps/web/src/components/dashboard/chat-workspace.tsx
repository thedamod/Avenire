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
import {
  ArrowLeft,
  ArrowRight,
  Link2,
  MessageSquareText,
  Share2,
} from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Chat } from "@/components/chat/chat";
import { EmailSuggestionInput } from "@/components/shared/email-suggestion-input";
import {
  CHAT_NAME_UPDATED_EVENT,
  type ChatNameUpdatedDetail,
} from "@/lib/chat-events";
import { useDashboardViewStore } from "@/stores/dashboardViewStore";
import { useWorkspaceHistoryStore } from "@/stores/workspaceHistoryStore";
import type { ShareSuggestion } from "@/types/share";

interface ChatWorkspaceProps {
  chatSlug: string;
  chatTitle: string;
  initialMessages: UIMessage[];
  isReadonly?: boolean;
  workspaceUuid: string;
}

export function ChatWorkspace({
  chatSlug,
  chatTitle,
  initialMessages,
  isReadonly = false,
  workspaceUuid,
}: ChatWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const view = useDashboardViewStore((state) => state.view);
  const setView = useDashboardViewStore((state) => state.setView);
  const recordRoute = useWorkspaceHistoryStore((state) => state.recordRoute);
  const historyEntries = useWorkspaceHistoryStore((state) => state.entries);
  const historyIndex = useWorkspaceHistoryStore((state) => state.index);
  const backRoute =
    historyIndex > 0 ? (historyEntries[historyIndex - 1] ?? null) : null;
  const forwardRoute =
    historyIndex >= 0 && historyIndex < historyEntries.length - 1
      ? (historyEntries[historyIndex + 1] ?? null)
      : null;
  const [shareEmail, setShareEmail] = useState("");
  const [shareSuggestions, setShareSuggestions] = useState<ShareSuggestion[]>(
    []
  );
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [title, setTitle] = useState(chatTitle);

  useEffect(() => {
    if (!view) {
      setView("chat");
    }
  }, [setView, view]);

  useEffect(() => {
    setTitle(chatTitle);
  }, [chatTitle]);

  const currentRoute = useMemo(() => pathname, [pathname]);

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
  }, [chatSlug]);

  useEffect(() => {
    const onChatNameUpdated = (event: Event) => {
      const detail = (event as CustomEvent<ChatNameUpdatedDetail>).detail;
      if (!(detail?.id && detail?.name)) {
        return;
      }
      if (chatSlug !== "new" && detail.id !== chatSlug) {
        return;
      }
      setTitle(detail.name);
    };

    window.addEventListener(CHAT_NAME_UPDATED_EVENT, onChatNameUpdated);
    return () => {
      window.removeEventListener(CHAT_NAME_UPDATED_EVENT, onChatNameUpdated);
    };
  }, [chatSlug]);

  useEffect(() => {
    if (chatSlug === "new") {
      setShareSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const loadSuggestions = async () => {
        try {
          const url = new URL(
            `/api/chats/${chatSlug}/share/suggestions`,
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
  }, [chatSlug, isShareDialogOpen, shareEmail]);

  const shareWithEmail = async () => {
    const email = shareEmail.trim();
    if (!email) {
      return;
    }

    setShareBusy(true);
    setShareStatus(null);
    try {
      const response = await fetch(`/api/chats/${chatSlug}/share/grants`, {
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
      const response = await fetch(`/api/chats/${chatSlug}/share/link`, {
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
      <header className="shrink-0 border-border/70 border-b bg-background/95 backdrop-blur-xs">
        <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 px-4 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Button
              aria-label="Go back"
              className="rounded-md"
              disabled={!backRoute}
              onClick={() => {
                if (backRoute) {
                  router.push(backRoute as Route);
                }
              }}
              size="icon-xs"
              type="button"
              variant="outline"
            >
              <ArrowLeft className="size-3.5" />
            </Button>
            <Button
              aria-label="Go forward"
              className="rounded-md"
              disabled={!forwardRoute}
              onClick={() => {
                if (forwardRoute) {
                  router.push(forwardRoute as Route);
                }
              }}
              size="icon-xs"
              type="button"
              variant="outline"
            >
              <ArrowRight className="size-3.5" />
            </Button>
            <Breadcrumb className="min-w-0 flex-1">
              <BreadcrumbList className="flex-nowrap overflow-x-auto whitespace-nowrap pr-2">
                <BreadcrumbItem>
                  <BreadcrumbPage className="inline-flex items-center gap-2">
                    <MessageSquareText className="size-3.5 text-muted-foreground" />
                    <span>{title}</span>
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="flex items-center gap-2">
            {isReadonly || chatSlug === "new" ? null : (
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
                    <p className="text-muted-foreground text-xs">
                      {shareStatus}
                    </p>
                  ) : null}
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        <Chat
          id={chatSlug}
          initialMessages={initialMessages}
          isReadonly={isReadonly}
          selectedModel="apollo-apex"
          selectedReasoningModel="apollo-apex"
          workspaceUuid={workspaceUuid}
        />
      </div>
    </div>
  );
}
