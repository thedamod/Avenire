"use client";

import { Badge } from "@avenire/ui/components/badge";
import { Button } from "@avenire/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@avenire/ui/components/card";
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
import { ScrollArea } from "@avenire/ui/components/scroll-area";
import { Textarea } from "@avenire/ui/components/textarea";
import { cn } from "@avenire/ui/lib/utils";
import { BookOpenCheck, Plus } from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { startTransition, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { WorkspaceHeader } from "@/components/dashboard/workspace-header";
import type { FlashcardDashboardRecord } from "@/lib/flashcards";
import { useWorkspaceHistoryStore } from "@/stores/workspaceHistoryStore";

interface FlashcardGenerationRequest {
  concept: string;
  count: number;
  reason: string;
  subject: string;
  title?: string;
  topic: string;
}

function getEnrollmentLabel(
  status: FlashcardDashboardRecord["sets"][number]["enrollmentStatus"]
) {
  if (status === "active") {
    return "Study active";
  }

  if (status === "paused") {
    return "Paused";
  }

  return "Not enrolled";
}
export function FlashcardsDashboard({
  generationRequest,
  initialDashboard,
}: {
  generationRequest: FlashcardGenerationRequest | null;
  initialDashboard: FlashcardDashboardRecord;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const recordRoute = useWorkspaceHistoryStore((state) => state.recordRoute);
  const [dashboard] = useState(initialDashboard);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [createStatus, setCreateStatus] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationLoading, setGenerationLoading] = useState(
    generationRequest !== null
  );
  const [busy, setBusy] = useState(false);
  const autoOpenCreateRef = useRef(false);
  const generationStartedRef = useRef(false);

  const orderedSets = dashboard.sets.slice().sort((left, right) => {
    const pressureDiff =
      right.dueCount + right.newCount - (left.dueCount + left.newCount);

    if (pressureDiff !== 0) {
      return pressureDiff;
    }

    return (
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    );
  });
  const reviewTarget =
    orderedSets.find((set) => set.dueCount > 0 || set.newCount > 0) ?? null;
  const [selectedSetId, setSelectedSetId] = useState<string | null>(
    reviewTarget?.id ?? orderedSets[0]?.id ?? null
  );

  useEffect(() => {
    if (
      selectedSetId &&
      orderedSets.some((candidate) => candidate.id === selectedSetId)
    ) {
      return;
    }

    setSelectedSetId(reviewTarget?.id ?? orderedSets[0]?.id ?? null);
  }, [orderedSets, reviewTarget, selectedSetId]);

  const selectedSet =
    orderedSets.find((candidate) => candidate.id === selectedSetId) ?? null;
  const selectedSnapshots = dashboard.cardSnapshots.filter(
    (snapshot) => snapshot.card.setId === selectedSetId
  );

  useEffect(() => {
    recordRoute(pathname);
  }, [pathname, recordRoute]);

  useEffect(() => {
    if (searchParams.get("create") !== "1" || autoOpenCreateRef.current) {
      return;
    }
    autoOpenCreateRef.current = true;
    setCreateOpen(true);
  }, [searchParams]);

  useEffect(() => {
    if (!generationRequest || generationStartedRef.current) {
      return;
    }
    generationStartedRef.current = true;
    setGenerationLoading(true);
    setGenerationError(null);

    void (async () => {
      try {
        const response = await fetch("/api/flashcards/onboarding", {
          body: JSON.stringify(generationRequest),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(payload.error ?? "Unable to generate flashcards.");
        }
        const payload = (await response.json()) as {
          set?: { id?: string };
        };
        const setId = payload.set?.id;
        if (!setId) {
          throw new Error("Flashcard generation did not return a set.");
        }
        startTransition(() => {
          router.replace(`/workspace/flashcards/${setId}` as Route);
        });
      } catch (error) {
        setGenerationError(
          error instanceof Error ? error.message : "Unable to generate flashcards."
        );
        setGenerationLoading(false);
      }
    })();
  }, [generationRequest, router]);

  const createSet = async () => {
    setBusy(true);
    setCreateStatus(null);
    try {
      const response = await fetch("/api/flashcards/sets", {
        body: JSON.stringify({
          description,
          tags: tags
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
          title,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        setCreateStatus("Could not create the set.");
        return;
      }

      const payload = (await response.json()) as {
        set?: { id?: string };
      };
      const setId = payload.set?.id;
      if (!setId) {
        setCreateStatus(
          "The set was created, but no route target was returned."
        );
        return;
      }

      setCreateOpen(false);
      setTitle("");
      setDescription("");
      setTags("");
      setCreateStatus(null);
      startTransition(() => {
        router.push(`/workspace/flashcards/${setId}` as Route);
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-none flex-col gap-4 px-4 py-4 md:px-6">
        <WorkspaceHeader
          leadingIcon={<BookOpenCheck className="size-3.5" />}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={!reviewTarget}
                onClick={() => {
                  if (!reviewTarget) {
                    return;
                  }
                  router.push(
                    `/workspace/flashcards/${reviewTarget.id}` as Route
                  );
                }}
                type="button"
              >
                <BookOpenCheck className="size-4" />
                Go to deck
              </Button>
              <Dialog onOpenChange={setCreateOpen} open={createOpen}>
                <DialogTrigger render={<Button variant="outline" />}>
                  <Plus className="size-4" />
                  New Set
                </DialogTrigger>
                <DialogContent className="max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Create set</DialogTitle>
                    <DialogDescription>
                      Shared sets stay at workspace scope. Review history stays
                      personal.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="flashcards-set-title">Title</Label>
                      <Input
                        id="flashcards-set-title"
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="Control systems"
                        value={title}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="flashcards-set-description">
                        Description
                      </Label>
                      <Textarea
                        id="flashcards-set-description"
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="Feedback, stability, and state-space revision"
                        value={description}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="flashcards-set-tags">Tags</Label>
                      <Input
                        id="flashcards-set-tags"
                        onChange={(event) => setTags(event.target.value)}
                        placeholder="signals, controls, exam-2"
                        value={tags}
                      />
                    </div>
                  </div>
                  {createStatus ? (
                    <p className="text-muted-foreground text-xs">
                      {createStatus}
                    </p>
                  ) : null}
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
            </div>
          }
        >
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground text-sm">
              Flashcards
            </p>
          </div>
        </WorkspaceHeader>

        <section className="flex flex-wrap items-center justify-between gap-3 border-border/70 border-b pb-4">
          <div className="space-y-1">
            <h1 className="font-medium text-base text-foreground">
              Flashcards
            </h1>
            <p className="text-muted-foreground text-xs">
              Select a deck, check what is coming up, then jump straight into
              review.
            </p>
          </div>
        </section>

        <AnimatePresence>
          {generationLoading ? (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="rounded-3xl border border-border/70 bg-background p-5 shadow-sm shadow-black/5"
              initial={{ opacity: 0, y: 10 }}
              key="flashcard-generation"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Generating flashcards
                  </p>
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">
                    Building your deck from onboarding
                  </h2>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    The set is being generated now. Once it is ready, you will
                    land directly in the flashcards.
                  </p>
                </div>
                <div className="rounded-full border border-border/70 bg-muted/20 px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Loading
                </div>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {["Generate", "Create", "Open"].map((label, index) => (
                  <div
                    className="rounded-2xl border border-border/70 bg-muted/10 px-3 py-3"
                    key={label}
                  >
                    <motion.div
                      animate={{ opacity: [0.45, 1, 0.45] }}
                      className="h-2 w-16 rounded-full bg-foreground/40"
                      transition={{
                        duration: 1.1,
                        repeat: Number.POSITIVE_INFINITY,
                        delay: index * 0.12,
                      }}
                    />
                    <p className="mt-3 text-sm font-medium text-foreground">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        {generationError ? (
          <div className="rounded-2xl border border-border/70 bg-background p-4 text-sm text-muted-foreground">
            {generationError}
          </div>
        ) : null}

        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="grid gap-4 xl:grid-cols-[minmax(18rem,0.88fr)_minmax(0,1.12fr)]"
          initial={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          <Card className="shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Decks</CardTitle>
              <CardDescription>
                Pick a deck and jump into review.
              </CardDescription>
            </CardHeader>
            <CardContent className="min-h-0">
              <ScrollArea className="max-h-[16rem]">
                <div className="space-y-2 p-1">
                  {orderedSets.length === 0 ? (
                    <div className="rounded-2xl border border-border/45 border-dashed px-4 py-8 text-center text-muted-foreground text-xs">
                      No flashcard sets yet.
                    </div>
                  ) : (
                    orderedSets.map((set) => {
                      const isSelected = set.id === selectedSetId;
                      return (
                        <button
                          className={cn(
                            "flex w-full items-start justify-between gap-3 rounded-2xl border border-border/45 bg-background/80 px-3 py-3 text-left transition-colors hover:bg-muted/20",
                            isSelected && "border-border/70 bg-muted/20"
                          )}
                          key={set.id}
                          onClick={() => setSelectedSetId(set.id)}
                          type="button"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-foreground text-sm">
                              {set.title}
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {set.dueCount + set.newCount} ready ·{" "}
                              {set.cardCount} cards
                            </p>
                          </div>
                          {set.dueCount > 0 ? (
                            <Badge
                              className="shrink-0 rounded-sm"
                              variant="outline"
                            >
                              {set.dueCount} due
                            </Badge>
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            {selectedSet ? (
              <>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <CardTitle className="truncate text-base">
                        {selectedSet.title}
                      </CardTitle>
                      <CardDescription className="line-clamp-2">
                        {selectedSet.description ?? "No description yet."}
                      </CardDescription>
                    </div>
                    {selectedSet.dueCount > 0 ? (
                      <Badge className="rounded-sm" variant="outline">
                        {selectedSet.dueCount} due
                      </Badge>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border/45 bg-muted/10 px-4 py-3">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
                        Deck profile
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge className="rounded-sm" variant="outline">
                          {selectedSet.sourceType === "ai-generated"
                            ? "AI-generated"
                            : "Manual"}
                        </Badge>
                        <Badge className="rounded-sm" variant="outline">
                          {getEnrollmentLabel(selectedSet.enrollmentStatus)}
                        </Badge>
                        <Badge className="rounded-sm" variant="outline">
                          {selectedSet.cardCount} cards
                        </Badge>
                      </div>
                      <p className="mt-3 text-muted-foreground text-xs">
                        {selectedSet.description ?? "No description yet."}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/45 bg-muted/10 px-4 py-3">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
                        Study context
                      </p>
                      <div className="mt-3 space-y-2 text-muted-foreground text-xs">
                        <p>
                          {selectedSet.lastStudiedAt
                            ? `Last studied ${new Date(
                                selectedSet.lastStudiedAt
                              ).toLocaleDateString()}`
                            : "Not studied yet"}
                        </p>
                        <p>
                          Updated{" "}
                          {new Date(selectedSet.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
                        Quick cards
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {selectedSnapshots.length} tracked
                      </p>
                    </div>
                    <div className="space-y-2">
                      {selectedSnapshots.length === 0 ? (
                        <p className="text-muted-foreground text-xs">
                          No cards tracked for this deck yet.
                        </p>
                      ) : (
                        selectedSnapshots.slice(0, 3).map((snapshot) => (
                          <div
                            className="rounded-2xl border border-border/45 bg-background/70 px-3 py-3"
                            key={snapshot.card.id}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="line-clamp-2 text-foreground text-sm">
                                  {snapshot.card.frontMarkdown}
                                </p>
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  {snapshot.dueAt
                                    ? `Due ${new Date(snapshot.dueAt).toLocaleDateString()}`
                                    : "Not scheduled"}
                                </p>
                              </div>
                              <Badge
                                className="shrink-0 rounded-sm"
                                variant="outline"
                              >
                                {snapshot.displayState}
                              </Badge>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() =>
                        router.push(
                          `/workspace/flashcards/${selectedSet.id}` as Route
                        )
                      }
                      type="button"
                    >
                      Open deck
                    </Button>
                    <Button
                      onClick={() =>
                        router.push(
                          `/workspace/flashcards/${selectedSet.id}` as Route
                        )
                      }
                      type="button"
                      variant="outline"
                    >
                      Go
                    </Button>
                  </div>
                </CardContent>
              </>
            ) : (
              <CardContent className="px-4 py-8 text-center text-muted-foreground text-xs">
                Nothing to show yet.
              </CardContent>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
