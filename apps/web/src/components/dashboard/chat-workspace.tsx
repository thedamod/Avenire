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
}

/**
 * Renders a centered placeholder card with a circular icon, a title, and a description.
 *
 * @param icon - React component used as the centered circular icon
 * @param title - Title text displayed below the icon
 * @param description - Description text displayed under the title
 * @returns The rendered placeholder card element
 */
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

/**
 * Render the dashboard chat workspace with header controls, sharing UI, and the Chat view.
 *
 * The component displays a header with chat creation and share controls, a center-aligned
 * chat title that syncs with external updates, a share dialog for granting email access
 * or generating a temporary share link, and the main Chat component (or a Flashcards
 * placeholder when the dashboard view is set to "flashcards").
 *
 * @param chatSlug - The chat's unique slug used for routing and share API calls
 * @param chatTitle - Initial title to display for the chat; kept in sync with external updates
 * @param initialMessages - Initial messages supplied to the Chat component
 * @returns A React element that renders the chat workspace (header, share dialog, and main chat area)
 */
export function ChatWorkspace({
  chatSlug,
  chatTitle,
  initialMessages,
}: ChatWorkspaceProps) {
  const router = useRouter();
  const view = useDashboardViewStore((state) => state.view);
  const setView = useDashboardViewStore((state) => state.setView);
  const [shareEmail, setShareEmail] = useState("");
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
      <header className="flex h-12 shrink-0 items-center border-b border-border/70 px-3">
        <div className="flex w-1/3 items-center gap-2">
          <SidebarTrigger className="h-8 w-8 rounded-md" />
          <Button
            className="h-8 w-8 rounded-md"
            onClick={() => void createChat()}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <Plus className="size-4" />
          </Button>
        </div>
        <div className="w-1/3 truncate px-3 text-center font-medium text-sm">
          {title}
        </div>
        <div className="flex w-1/3 justify-end">
          <Dialog>
            <DialogTrigger
              render={
                <Button
                  className="h-8 rounded-md"
                  size="sm"
                  type="button"
                  variant="outline"
                />
              }
            >
              <Share2 className="size-4" />
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
                <label className="font-medium text-sm" htmlFor="share-email">
                  Add people
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    id="share-email"
                    onChange={(event) => setShareEmail(event.target.value)}
                    placeholder="name@example.com"
                    type="email"
                    value={shareEmail}
                  />
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
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <Chat
          id={chatSlug}
          initialMessages={initialMessages}
          isReadonly={false}
          selectedModel="fermion-sprint"
          selectedReasoningModel="fermion-reasoning"
        />
      </div>
    </div>
  );
}
