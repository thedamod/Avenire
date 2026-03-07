"use client";

import type { UIMessage } from "@avenire/ai/message-types";
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
import { SidebarTrigger } from "@avenire/ui/components/sidebar";
import { Link2, Plus, Share2 } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Chat } from "@/components/chat/chat";
import {
  CHAT_NAME_UPDATED_EVENT,
  type ChatNameUpdatedDetail,
} from "@/lib/chat-events";
import { useDashboardViewStore } from "@/stores/dashboardViewStore";

interface ChatWorkspaceProps {
  chatSlug: string;
  chatTitle: string;
  initialMessages: UIMessage[];
  isReadonly?: boolean;
}

interface ShareSuggestion {
  email: string;
  name: string | null;
}

function PlaceholderCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Sparkles;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center rounded-xl border bg-muted/20 p-8 text-center">
      <div className="mb-3 flex size-9 items-center justify-center rounded-full border">
        <Icon className="size-4" />
      </div>
      <p className="font-medium text-sm">{title}</p>
      <p className="mt-1 text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

export function ChatWorkspace({
  chatSlug,
  chatTitle,
  initialMessages,
  isReadonly = false,
}: ChatWorkspaceProps) {
  const router = useRouter();
  const view = useDashboardViewStore((state) => state.view);
  const setView = useDashboardViewStore((state) => state.setView);
  const [shareEmail, setShareEmail] = useState("");
  const [shareSuggestions, setShareSuggestions] = useState<ShareSuggestion[]>([]);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [title, setTitle] = useState(chatTitle);

  useEffect(() => {
    if (!view) {
      setView("chat");
    }
  }, [setView, view]);

  useEffect(() => {
    setTitle(chatTitle);
  }, [chatTitle]);

  useEffect(() => {
    const onChatNameUpdated = (event: Event) => {
      const detail = (event as CustomEvent<ChatNameUpdatedDetail>).detail;
      if (!detail?.id || !detail?.name || detail.id !== chatSlug) {
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
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const url = new URL(`/api/chats/${chatSlug}/share/suggestions`, window.location.origin);
          if (shareEmail.trim()) {
            url.searchParams.set("q", shareEmail.trim());
          }
          const response = await fetch(url.toString(), { cache: "no-store" });
          if (!response.ok) {
            setShareSuggestions([]);
            return;
          }
          const payload = (await response.json()) as { suggestions?: ShareSuggestion[] };
          setShareSuggestions(payload.suggestions ?? []);
        } catch {
          setShareSuggestions([]);
        }
      })();
    }, 150);
    return () => clearTimeout(timer);
  }, [chatSlug, shareEmail]);

  if (view === "flashcards") {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center p-6">
        <PlaceholderCard
          description="Flashcards view is coming next. Switch back to Chat anytime."
          icon={Sparkles}
          title="Flashcards"
        />
      </div>
    );
  }


  const createChat = async () => {
    const response = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { chat?: { slug?: string } };
    const slug = payload.chat?.slug;
    if (!slug) {
      return;
    }

    router.push(`/dashboard/chats/${slug}` as Route);
    router.refresh();
  };

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
      <header className="flex h-10 shrink-0 items-center border-b border-border/70 px-2.5">
        <div className="flex w-1/3 items-center gap-2">
          <SidebarTrigger className="h-6 w-6 rounded-md" />
          {!isReadonly ? (
            <Button
              aria-label="New chat"
              className="size-5 rounded-md"
              onClick={() => void createChat()}
              size="icon-xs"
              type="button"
              variant="outline"
            >
              <Plus className="size-3" />
            </Button>
          ) : null}
        </div>
        <div className="w-1/3 truncate px-2 text-center font-medium text-xs">
          {title}
        </div>
        <div className="flex w-1/3 justify-end">
          {!isReadonly ? (
          <Dialog>
            <DialogTrigger
              render={
                <Button
                  className="size-5 rounded-md"
                  size="icon-xs"
                  type="button"
                  variant="outline"
                />
              }
            >
              <Share2 className="size-3" />
              <span className="sr-only">Share</span>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Share chat</DialogTitle>
                <DialogDescription>
                  Grant read-only access by email or create a signed link.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <label className="font-medium text-sm" htmlFor="share-email">
                  Add people
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    id="share-email"
                    list="chat-share-email-suggestions"
                    onChange={(event) => setShareEmail(event.target.value)}
                    placeholder="name@example.com"
                    type="email"
                    value={shareEmail}
                  />
                  <datalist id="chat-share-email-suggestions">
                    {shareSuggestions.map((item) => (
                      <option
                        key={item.email}
                        label={item.name ? `${item.name} (${item.email})` : item.email}
                        value={item.email}
                      />
                    ))}
                  </datalist>
                  <Button
                    disabled={shareBusy}
                    onClick={() => void shareWithEmail()}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    Add
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="font-medium text-sm">Share link (7 days)</label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={shareLink ?? ""} />
                  <Button
                    disabled={shareBusy}
                    onClick={() => void generateShareLink()}
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
                      void navigator.clipboard.writeText(shareLink);
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
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <Chat
          id={chatSlug}
          initialMessages={initialMessages}
          isReadonly={isReadonly}
          selectedModel="fermion-sprint"
          selectedReasoningModel="fermion-reasoning"
        />
      </div>
    </div>
  );
}
