"use client";

import { Badge } from "@avenire/ui/components/badge";
import { Button } from "@avenire/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@avenire/ui/components/dialog";
import { Input } from "@avenire/ui/components/input";
import { Label } from "@avenire/ui/components/label";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@avenire/ui/components/sidebar";
import { Textarea } from "@avenire/ui/components/textarea";
import { BookOpenCheck, MessageSquareDashed, PlusCircle } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useMemo, useState } from "react";
import type { FlashcardSetSummary } from "@/lib/flashcards";

export function FlashcardsSidebarPanel({
  active,
  activeSetId,
}: {
  active: boolean;
  activeSetId?: string;
}) {
  const router = useRouter();
  const [sets, setSets] = useState<FlashcardSetSummary[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!active) {
      return;
    }

    const controller = new AbortController();
    const load = async () => {
      const response = await fetch("/api/flashcards/sets", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        sets?: FlashcardSetSummary[];
      };
      setSets(payload.sets ?? []);
    };

    load().catch(() => undefined);
    return () => controller.abort();
  }, [active]);

  const createSet = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/flashcards/sets", {
        body: JSON.stringify({ description, title }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        set?: { id?: string };
      };
      const setId = payload.set?.id;
      if (!setId) {
        return;
      }

      setCreateOpen(false);
      setTitle("");
      setDescription("");
      startTransition(() => {
        router.push(`/dashboard/flashcards/${setId}` as Route);
      });
    } finally {
      setBusy(false);
    }
  };

  const reviewTarget =
    sets.find((set) => set.dueCount > 0 || set.newCount > 0) ?? null;
  const filteredSets = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) {
      return sets;
    }
    return sets.filter((set) => set.title.toLowerCase().includes(needle));
  }, [searchQuery, sets]);

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <SidebarGroup>
        <SidebarGroupLabel>Flashcards</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <Dialog onOpenChange={setCreateOpen} open={createOpen}>
                <DialogTrigger render={<SidebarMenuButton />}>
                  <PlusCircle className="size-4" />
                  <span>New Set</span>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Create Set</DialogTitle>
                    <DialogDescription>
                      Create a workspace-level flashcard set.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="flashcards-sidebar-title">Title</Label>
                      <Input
                        id="flashcards-sidebar-title"
                        onChange={(event) => setTitle(event.target.value)}
                        value={title}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="flashcards-sidebar-description">
                        Description
                      </Label>
                      <Textarea
                        id="flashcards-sidebar-description"
                        onChange={(event) => setDescription(event.target.value)}
                        value={description}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      disabled={busy || !title.trim()}
                      onClick={createSet}
                      type="button"
                    >
                      Create
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => {
                  if (reviewTarget) {
                    router.push(
                      `/dashboard/flashcards/${reviewTarget.id}` as Route
                    );
                    return;
                  }
                  router.push("/dashboard/flashcards" as Route);
                }}
              >
                <BookOpenCheck className="size-4" />
                <span>Review Due</span>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => router.push("/dashboard/flashcards" as Route)}
              >
                <MessageSquareDashed className="size-4" />
                <span>Import From Chat</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup className="min-h-0 flex-1">
        <SidebarGroupLabel>Sets</SidebarGroupLabel>
        <SidebarGroupContent>
          <Input
            className="mb-2 h-8 text-xs"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search sets by name..."
            value={searchQuery}
          />
          {filteredSets.length === 0 ? (
            <p className="px-2 py-1 text-muted-foreground text-xs">
              {sets.length === 0 ? "No sets yet." : "No matching sets."}
            </p>
          ) : (
            <SidebarMenu>
              {filteredSets.map((set) => (
                <SidebarMenuItem key={set.id}>
                  <SidebarMenuButton
                    isActive={activeSetId === set.id}
                    onClick={() =>
                      router.push(`/dashboard/flashcards/${set.id}` as Route)
                    }
                  >
                    <SparklineChip due={set.dueCount} newCount={set.newCount} />
                    <span className="truncate">{set.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          )}
        </SidebarGroupContent>
      </SidebarGroup>
    </div>
  );
}

function SparklineChip({ due, newCount }: { due: number; newCount: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant="outline">{due}</Badge>
      <Badge variant="secondary">{newCount}</Badge>
    </span>
  );
}
