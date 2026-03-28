"use client";

import { Badge } from "@avenire/ui/components/badge";
import { Button } from "@avenire/ui/components/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, } from "@avenire/ui/components/dialog";
import { Input } from "@avenire/ui/components/input";
import { Label } from "@avenire/ui/components/label";
import { ScrollArea } from "@avenire/ui/components/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from "@avenire/ui/components/table";
import { Textarea } from "@avenire/ui/components/textarea";
import { cn } from "@avenire/ui/lib/utils";
import { BookOpenText as BookOpenCheck, Pause, Pencil, Plus, Trash as Trash2 } from "@phosphor-icons/react"
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "@/components/chat/markdown";
import { HeaderBreadcrumbs, HeaderLeadingIcon } from "@/components/dashboard/header-portal";
import { FlashcardDeckStack } from "@/components/flashcards/deck-stack";
import type {
  FlashcardCardRecord,
  FlashcardDisplayState,
  FlashcardEnrollmentStatus,
  FlashcardReviewQueueItem,
  FlashcardSetRecord,
  FlashcardTaxonomy,
} from "@/lib/flashcards";
import { useWorkspaceHistoryStore } from "@/stores/workspaceHistoryStore";

type Rating = "again" | "hard" | "good" | "easy";
const REVIEW_ADVANCE_DELAY_MS = 500;

const STATE_LABELS: Record<FlashcardDisplayState, string> = {
  killed: "Killed",
  learning: "Learning",
  mature: "Mature",
  new: "New",
  relearning: "Relearning",
  suspended: "Suspended",
  young: "Young",
};

const STATE_STYLES: Record<FlashcardDisplayState, string> = {
  killed:
    "border-rose-200/70 bg-rose-100/70 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200",
  learning:
    "border-amber-200/70 bg-amber-100/70 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200",
  mature:
    "border-emerald-200/70 bg-emerald-100/70 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  new: "border-zinc-200/70 bg-zinc-100/70 text-zinc-700 dark:border-zinc-400/30 dark:bg-zinc-500/10 dark:text-zinc-200",
  relearning:
    "border-orange-200/70 bg-orange-100/70 text-orange-700 dark:border-orange-400/30 dark:bg-orange-500/10 dark:text-orange-200",
  suspended:
    "border-stone-200/70 bg-stone-100/70 text-stone-700 dark:border-stone-400/30 dark:bg-stone-500/10 dark:text-stone-200",
  young:
    "border-teal-200/70 bg-teal-100/70 text-teal-700 dark:border-teal-400/30 dark:bg-teal-500/10 dark:text-teal-200",
};

function readTaxonomyField(
  source: Record<string, unknown>,
  key: "subject" | "topic" | "concept"
) {
  const value = source[key];
  return typeof value === "string" ? value : "";
}

function stateBadge(state: FlashcardDisplayState) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 font-medium text-[11px]",
        STATE_STYLES[state]
      )}
    >
      {STATE_LABELS[state]}
    </span>
  );
}

function buildDrillQuery(filters: FlashcardTaxonomy[]) {
  const params = new URLSearchParams();
  for (const filter of filters) {
    params.append("drill", JSON.stringify(filter));
  }
  return params.toString();
}

function getEnrollmentLabel(
  status: FlashcardEnrollmentStatus | null | undefined
) {
  if (status === "active") {
    return "Study active";
  }

  if (status === "paused") {
    return "Paused";
  }

  return "Not enrolled";
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This screen intentionally co-locates review, enrollment, editing, and card bank flows.
export function FlashcardSetDetail({
  initialDrillFilters,
  initialQueue,
  initialSet,
  initialStudyOpen = false,
}: {
  initialDrillFilters: FlashcardTaxonomy[];
  initialQueue: FlashcardReviewQueueItem[];
  initialSet: FlashcardSetRecord;
  initialStudyOpen?: boolean;
}) {
  const pathname = usePathname();
  const recordRoute = useWorkspaceHistoryStore((state) => state.recordRoute);
  const [set, setSet] = useState(initialSet);
  const [queue, setQueue] = useState(initialQueue);
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<FlashcardCardRecord | null>(
    null
  );
  const [frontMarkdown, setFrontMarkdown] = useState("");
  const [backMarkdown, setBackMarkdown] = useState("");
  const [notesMarkdown, setNotesMarkdown] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [concept, setConcept] = useState("");
  const [tags, setTags] = useState("");
  const [studyOpen, setStudyOpen] = useState(
    initialStudyOpen && initialQueue.length > 0
  );
  const [studyRevealed, setStudyRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const reviewAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const queueRef = useRef(queue);
  const studyOpenRef = useRef(studyOpen);
  const studyRevealedRef = useRef(studyRevealed);
  const submitReviewRef = useRef<(rating: Rating) => Promise<void>>(
    async () => undefined
  );

  useEffect(() => {
    recordRoute(pathname);
  }, [pathname, recordRoute]);
  const [drillFilters, setDrillFilters] = useState(initialDrillFilters);
  const deferredSearch = useDeferredValue(search);
  const headerLeadingIcon = useMemo(
    () => <BookOpenCheck className="size-3.5" />,
    []
  );
  const headerBreadcrumbs = useMemo(
    () => (
      <div className="min-w-0">
        <p className="truncate text-muted-foreground text-sm">Mindset</p>
        <p className="truncate text-muted-foreground text-xs">{set.title}</p>
      </div>
    ),
    [set.title]
  );

  useEffect(() => {
    if (!studyOpen) {
      setStudyRevealed(false);
    }
  }, [studyOpen]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    studyOpenRef.current = studyOpen;
  }, [studyOpen]);

  useEffect(() => {
    studyRevealedRef.current = studyRevealed;
  }, [studyRevealed]);

  useEffect(() => {
    return () => {
      if (reviewAdvanceTimerRef.current) {
        clearTimeout(reviewAdvanceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !studyOpenRef.current ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        setStudyRevealed((value) => !value);
      }

      const ratingMap: Record<string, Rating> = {
        Digit1: "again",
        Digit2: "hard",
        Digit3: "good",
        Digit4: "easy",
      };

      const rating = ratingMap[event.code];
      if (rating && studyRevealedRef.current && queueRef.current[0]) {
        event.preventDefault();
        submitReviewRef.current(rating).catch(() => undefined);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const snapshotByCardId = useMemo(
    () => new Map(set.cardSnapshots.map((snapshot) => [snapshot.card.id, snapshot])),
    [set.cardSnapshots]
  );
  const activeCard = queue[0] ?? null;
  const activeCardId = activeCard?.card.id ?? null;
  useEffect(() => {
    if (studyOpen && !activeCard) {
      setStudyOpen(false);
    }
  }, [activeCard, studyOpen]);
  const activeSnapshot = activeCardId
    ? (snapshotByCardId.get(activeCardId) ?? null)
    : null;
  const filteredCards = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();
    if (!needle) {
      return set.cards;
    }

    return set.cards.filter((card) => {
      return (
        card.frontMarkdown.toLowerCase().includes(needle) ||
        card.backMarkdown.toLowerCase().includes(needle) ||
        (card.notesMarkdown ?? "").toLowerCase().includes(needle) ||
        card.tags.some((tag) => tag.toLowerCase().includes(needle))
      );
    });
  }, [deferredSearch, set.cards]);
  const reviewDeckCards = useMemo(
    () =>
      queue.map((item) => ({
        back: (
          <div className="w-full space-y-5">
            <Markdown
              className="max-w-none text-base"
              content={item.card.backMarkdown}
              id={`study-back-${item.card.id}`}
              parseIncompleteMarkdown={false}
            />
            {item.card.notesMarkdown ? (
              <div className="rounded-2xl border border-border/60 bg-background/75 p-3">
                <p className="mb-2 text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
                  Notes
                </p>
                <Markdown
                  className="max-w-none text-sm"
                  content={item.card.notesMarkdown}
                  id={`study-notes-${item.card.id}`}
                  parseIncompleteMarkdown={false}
                />
              </div>
            ) : null}
          </div>
        ),
        front: (
          <div className="w-full">
            <Markdown
              className="max-w-none text-center text-lg [&_p]:text-center"
              content={item.card.frontMarkdown}
              id={`study-front-${item.card.id}`}
              parseIncompleteMarkdown={false}
            />
          </div>
        ),
        id: item.card.id,
        title: item.set.title,
        meta:
          item.card.id === activeCardId && activeSnapshot?.dueAt
            ? "Due now"
            : "Ready to recall",
      })),
    [activeCardId, activeSnapshot?.dueAt, queue]
  );
  const setEnrollmentLabel = getEnrollmentLabel(set.enrollment?.status);
  const reviewSummary = `${set.dueCount} due · ${set.newCount} new · ${set.reviewCountToday} studied today`;

  const loadSet = async () => {
    const response = await fetch(`/api/flashcards/sets/${set.id}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { set?: FlashcardSetRecord };
    if (payload.set) {
      setSet(payload.set);
    }
  };

  const loadQueue = async () => {
    const query = new URLSearchParams({
      limit: "20",
      setId: set.id,
    });
    const drillQuery = buildDrillQuery(drillFilters);
    if (drillQuery) {
      for (const [key, value] of new URLSearchParams(drillQuery).entries()) {
        query.append(key, value);
      }
    }

    const response = await fetch(
      `/api/flashcards/review/queue?${query.toString()}`,
      {
        cache: "no-store",
      }
    );
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as {
      queue?: FlashcardReviewQueueItem[];
    };
    setQueue(payload.queue ?? []);
  };

  const openEditor = (card?: FlashcardCardRecord) => {
    setEditingCard(card ?? null);
    setFrontMarkdown(card?.frontMarkdown ?? "");
    setBackMarkdown(card?.backMarkdown ?? "");
    setNotesMarkdown(card?.notesMarkdown ?? "");
    setSubject(card ? readTaxonomyField(card.source, "subject") : "");
    setTopic(card ? readTaxonomyField(card.source, "topic") : "");
    setConcept(card ? readTaxonomyField(card.source, "concept") : "");
    setTags(card?.tags.join(", ") ?? "");
    setEditorOpen(true);
  };

  const saveCard = async () => {
    setBusy(true);
    try {
      const payload = {
        backMarkdown,
        frontMarkdown,
        notesMarkdown,
        source: {
          ...(editingCard?.source ?? {}),
          concept,
          subject,
          topic,
        },
        tags: tags
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
      };
      const response = await fetch(
        editingCard
          ? `/api/flashcards/cards/${editingCard.id}`
          : `/api/flashcards/sets/${set.id}/cards`,
        {
          body: JSON.stringify(payload),
          headers: { "Content-Type": "application/json" },
          method: editingCard ? "PATCH" : "POST",
        }
      );

      if (!response.ok) {
        return;
      }

      setEditorOpen(false);
      setEditingCard(null);
      await Promise.all([loadSet(), loadQueue()]);
    } finally {
      setBusy(false);
    }
  };

  const archiveCard = async (cardId: string) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/flashcards/cards/${cardId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        return;
      }

      await Promise.all([loadSet(), loadQueue()]);
    } finally {
      setBusy(false);
    }
  };

  const toggleEnrollment = async () => {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/flashcards/sets/${set.id}/enrollment`,
        {
          body: JSON.stringify({
            newCardsPerDay: set.enrollment?.newCardsPerDay ?? 20,
            status: set.enrollment?.status === "active" ? "paused" : "active",
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      );
      if (!response.ok) {
        return;
      }

      await Promise.all([loadSet(), loadQueue()]);
    } finally {
      setBusy(false);
    }
  };

  const submitReview = async (rating: Rating) => {
    const current = queue[0];
    if (!current) {
      return;
    }
    if (reviewAdvanceTimerRef.current) {
      return;
    }

    setBusy(true);
    let shouldAdvance = false;
    try {
      const response = await fetch("/api/flashcards/review", {
        body: JSON.stringify({
          cardId: current.card.id,
          rating,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        return;
      }

      shouldAdvance = true;
      setStudyRevealed(false);
      reviewAdvanceTimerRef.current = setTimeout(async () => {
        try {
          await Promise.all([loadSet(), loadQueue()]);
        } finally {
          reviewAdvanceTimerRef.current = null;
          setBusy(false);
        }
      }, REVIEW_ADVANCE_DELAY_MS);
    } finally {
      if (!shouldAdvance) {
        setBusy(false);
      }
    }
  };

  useEffect(() => {
    submitReviewRef.current = submitReview;
  }, [submitReview]);

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="flex w-full flex-col gap-4 px-4 py-4 md:px-6 lg:px-8">
        <HeaderLeadingIcon>
          {headerLeadingIcon}
        </HeaderLeadingIcon>
        <HeaderBreadcrumbs>
          {headerBreadcrumbs}
        </HeaderBreadcrumbs>
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          <div>
          <div className="gap-3 border-border/40 border-b pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="rounded-sm" variant="outline">
                    {set.sourceType === "ai-generated"
                      ? "AI-generated set"
                      : "Manual set"}
                  </Badge>
                  <Badge className="rounded-sm" variant="outline">
                    {set.stateCounts.killed} killed
                  </Badge>
                </div>
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">{set.title}</h1>
                  <p className="text-muted-foreground text-sm">
                    {set.description ?? "No description set for this deck."}
                  </p>
                </div>
                {drillFilters.length > 0 ? (
                  <div className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs dark:border-amber-400/20 dark:bg-amber-500/10">
                    <p className="font-medium text-amber-900 dark:text-amber-100">
                      Drill session
                    </p>
                    <p className="mt-1 text-amber-700 dark:text-amber-200">
                      Review is limited to canonical matches for these concepts.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {drillFilters.map((filter) => (
                        <Badge
                          className="rounded-full border-amber-300/80 bg-background/80 text-[11px] text-amber-900 dark:border-amber-400/20 dark:bg-background/20 dark:text-amber-100"
                          key={`${filter.subject}:${filter.topic}:${filter.concept}`}
                          variant="outline"
                        >
                          {filter.concept}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={toggleEnrollment}
                  type="button"
                  variant="outline"
                >
                  {set.enrollment?.status === "active" ? (
                    <>
                      <Pause className="size-4" />
                      Pause
                    </>
                  ) : (
                    <>
                      <BookOpenCheck className="size-4" />
                      Enable Study
                    </>
                  )}
                </Button>
                <Dialog onOpenChange={setEditorOpen} open={editorOpen}>
                  <DialogTrigger render={<Button />}>
                    <Plus className="size-4" />
                    Add Card
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl" largeWidth>
                    <DialogHeader>
                      <DialogTitle>
                        {editingCard ? "Edit card" : "Add card"}
                      </DialogTitle>
                      <DialogDescription>
                        Markdown and KaTeX are supported on both sides of the
                        card.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="flashcard-front">Front</Label>
                        <Textarea
                          id="flashcard-front"
                          onChange={(event) =>
                            setFrontMarkdown(event.target.value)
                          }
                          placeholder="State the Routh-Hurwitz criterion."
                          value={frontMarkdown}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="flashcard-back">Back</Label>
                        <Textarea
                          id="flashcard-back"
                          onChange={(event) =>
                            setBackMarkdown(event.target.value)
                          }
                          placeholder="The number of right-half-plane roots equals the number of sign changes in the first column."
                          value={backMarkdown}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="flashcard-notes">Notes</Label>
                        <Textarea
                          id="flashcard-notes"
                          onChange={(event) =>
                            setNotesMarkdown(event.target.value)
                          }
                          placeholder="Add a derivation, caveat, or worked example."
                          value={notesMarkdown}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="flashcard-subject">Subject</Label>
                        <Input
                          id="flashcard-subject"
                          onChange={(event) => setSubject(event.target.value)}
                          placeholder="Chemistry"
                          value={subject}
                        />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="flashcard-topic">Topic</Label>
                          <Input
                            id="flashcard-topic"
                            onChange={(event) => setTopic(event.target.value)}
                            placeholder="Thermodynamics"
                            value={topic}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="flashcard-concept">Concept</Label>
                          <Input
                            id="flashcard-concept"
                            onChange={(event) => setConcept(event.target.value)}
                            placeholder="Gibbs free energy"
                            value={concept}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="flashcard-tags">Tags</Label>
                        <Input
                          id="flashcard-tags"
                          onChange={(event) => setTags(event.target.value)}
                          placeholder="controls, exam-2"
                          value={tags}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        disabled={
                          busy ||
                          !frontMarkdown.trim() ||
                          !backMarkdown.trim() ||
                          !subject.trim() ||
                          !topic.trim() ||
                          !concept.trim()
                        }
                        onClick={saveCard}
                        type="button"
                      >
                        Save
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="font-medium text-foreground text-sm">Review</p>
              <p className="text-muted-foreground text-xs">{reviewSummary}</p>
            </div>
            <Button
              disabled={!activeCard}
              onClick={() => setStudyOpen(true)}
              type="button"
              variant="outline"
            >
              {activeCard ? "Start review" : "No cards queued"}
            </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md bg-secondary/40 px-4 py-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.15em]">
              Deck profile
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge className="rounded-sm" variant="outline">
                {set.sourceType === "ai-generated" ? "AI-generated" : "Manual"}
              </Badge>
              <Badge className="rounded-sm" variant="outline">
                {setEnrollmentLabel}
              </Badge>
              <Badge className="rounded-sm" variant="outline">
                {set.cardCount} cards
              </Badge>
            </div>
            <p className="mt-3 text-muted-foreground text-xs">
              {set.stateCounts.killed} killed ·{" "}
              {set.stateCounts.learning + set.stateCounts.relearning} in
              progress
            </p>
            </div>
            <div className="rounded-md bg-secondary/40 px-4 py-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.15em]">
              Study context
            </p>
            <div className="mt-3 space-y-2 text-muted-foreground text-xs">
              <p>{set.reviewCountToday} studied today</p>
              <p>{set.reviewCount7d} reviews in the last 7 days</p>
              <p>
                {set.lastStudiedAt
                  ? `Last studied ${new Date(set.lastStudiedAt).toLocaleDateString()}`
                  : "Not studied yet"}
              </p>
              <p>Updated {new Date(set.updatedAt).toLocaleDateString()}</p>
            </div>
          </div>
        </div>

        <Dialog onOpenChange={setStudyOpen} open={studyOpen}>
          <DialogContent
            className="h-[100dvh] w-full overflow-hidden border-border/60 bg-background p-0 sm:h-[92vh] sm:w-[min(44rem,calc(100vw-1.5rem))]"
            largeWidth
          >
            <div className="relative flex h-full flex-col overflow-hidden bg-background">
              <DialogHeader className="relative border-border/10 border-b px-4 py-4 sm:px-6 sm:py-5">
                <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
                  <div className="min-w-0 space-y-2">
                    <span className="inline-flex items-center rounded-full border border-border/40 bg-background/75 px-3 py-1 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.24em] backdrop-blur">
                      Review Session
                    </span>
                    <div className="space-y-1">
                      <DialogTitle className="text-xl tracking-tight sm:text-2xl md:text-[2rem]">
                        {set.title}
                      </DialogTitle>
                      <DialogDescription className="max-w-xl text-sm leading-snug">
                        Press space to flip. Use 1-4 to submit Again, Hard,
                        Good, or Easy.
                      </DialogDescription>
                    </div>
                  </div>
                  <div className="hidden rounded-[1.25rem] border border-border/40 bg-background/75 px-4 py-3 text-right backdrop-blur sm:block">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-[0.22em]">
                      Session
                    </p>
                    <p className="mt-1 font-medium text-foreground text-xl">
                      {activeCard
                        ? `${activeCard.position}/${queue.length}`
                        : "0/0"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {activeCard
                        ? `${activeCard.remainingDueCount ?? 0} left`
                        : "No cards queued"}
                    </p>
                  </div>
                </div>
              </DialogHeader>

              <div className="relative flex min-h-0 flex-1 flex-col gap-3 px-3 py-3 sm:gap-4 sm:px-4 sm:py-4 md:px-6 md:py-6">
                <div className="flex flex-1 items-center justify-center overflow-y-auto py-2">
                  {activeCard ? (
                    <div className="w-full max-w-[22rem] rounded-[1.75rem] border border-border/40 bg-white/70 p-3 backdrop-blur-sm sm:max-w-[27rem] sm:p-4 md:p-5 dark:bg-slate-950/45">
                      <FlashcardDeckStack
                        cards={reviewDeckCards}
                        className="w-full max-w-none"
                        flipped={studyRevealed}
                        onFlippedChange={setStudyRevealed}
                        showCounter={false}
                        showDeckLabel={false}
                      />
                    </div>
                  ) : (
                    <div className="rounded-[1.5rem] border border-border/40 border-dashed bg-background/70 px-5 py-10 text-center text-muted-foreground text-xs backdrop-blur-sm">
                      No cards are queued right now.
                    </div>
                  )}
                </div>

                <div className="rounded-[1.5rem] border border-border/40 bg-background/75 p-3 backdrop-blur-sm md:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Button
                      className="rounded-full"
                      onClick={() => setStudyRevealed((value) => !value)}
                      type="button"
                      variant="outline"
                    >
                      {studyRevealed ? "Hide answer" : "Reveal answer"}
                    </Button>
                    <span className="hidden text-muted-foreground text-xs sm:inline">
                      Space to flip · 1-4 to grade
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
                    <RatingButton
                      disabled={busy || !studyRevealed}
                      label="1 · Again"
                      onClick={() => submitReview("again")}
                    />
                    <RatingButton
                      disabled={busy || !studyRevealed}
                      label="2 · Hard"
                      onClick={() => submitReview("hard")}
                    />
                    <RatingButton
                      disabled={busy || !studyRevealed}
                      label="3 · Good"
                      onClick={() => submitReview("good")}
                    />
                    <RatingButton
                      disabled={busy || !studyRevealed}
                      label="4 · Easy"
                      onClick={() => submitReview("easy")}
                    />
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <div className="mt-4 min-w-0">
          <div className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium text-foreground">Card bank</h2>
                <p className="text-muted-foreground text-xs">Search, edit, or kill cards.</p>
              </div>
              <Input
                className="max-w-xs"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search front, back, notes, or tags"
                value={search}
              />
            </div>
          </div>
          <div className="min-w-0">
            <ScrollArea className="h-[30rem] w-full rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Card</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCards.map((card) => {
                    const snapshot = snapshotByCardId.get(card.id) ?? null;

                    return (
                      <TableRow key={card.id}>
                        <TableCell className="align-top">
                          <div className="space-y-2">
                            <p className="line-clamp-2 text-foreground text-sm">
                              {card.frontMarkdown}
                            </p>
                            <p className="line-clamp-2 text-muted-foreground text-xs">
                              {card.backMarkdown}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          {snapshot ? stateBadge(snapshot.displayState) : null}
                        </TableCell>
                        <TableCell className="align-top text-muted-foreground text-xs">
                          {snapshot?.dueAt
                            ? new Date(snapshot.dueAt).toLocaleString()
                            : "Not scheduled"}
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-wrap gap-1.5">
                            {card.tags.length > 0 ? (
                              card.tags.map((tag) => (
                                <Badge
                                  className="rounded-sm"
                                  key={tag}
                                  variant="outline"
                                >
                                  {tag}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-muted-foreground text-xs">
                                No tags
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex gap-2">
                            <Button
                              onClick={() => openEditor(card)}
                              size="icon-sm"
                              type="button"
                              variant="outline"
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              onClick={() => archiveCard(card.id)}
                              size="icon-sm"
                              type="button"
                              variant="ghost"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function RatingButton({
  disabled,
  label,
  onClick,
}: {
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      className={cn(
        "h-auto min-h-10 flex-col items-start justify-center rounded-[1.1rem] border border-border/70 bg-background px-3 py-2 text-left text-xs leading-tight text-foreground transition-colors hover:bg-muted/20 sm:min-h-12 sm:px-4 sm:py-3 sm:text-sm",
        disabled && "bg-muted/10 text-muted-foreground hover:bg-muted/10"
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
      variant="outline"
    >
      {label}
    </Button>
  );
}
