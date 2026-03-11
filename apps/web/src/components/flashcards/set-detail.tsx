"use client";

import { Badge } from "@avenire/ui/components/badge";
import { Button } from "@avenire/ui/components/button";
import { Calendar, CalendarDayButton } from "@avenire/ui/components/calendar";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@avenire/ui/components/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@avenire/ui/components/tabs";
import { Textarea } from "@avenire/ui/components/textarea";
import { cn } from "@avenire/ui/lib/utils";
import {
  BookOpenCheck,
  CalendarRange,
  Clock3,
  Layers3,
  Pause,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { Markdown } from "@/components/chat/markdown";
import { FlashcardFlipCard } from "@/components/flashcards/flip-card";
import type {
  FlashcardCardRecord,
  FlashcardDisplayState,
  FlashcardReviewEventRecord,
  FlashcardReviewQueueItem,
  FlashcardSetRecord,
} from "@/lib/flashcards";

type Rating = "again" | "hard" | "good" | "easy";
interface CalendarRangeValue {
  from: Date | undefined;
  to?: Date;
}

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
    "border-rose-400/20 bg-rose-500/10 text-rose-200 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200",
  learning:
    "border-amber-400/20 bg-amber-500/10 text-amber-200 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200",
  mature:
    "border-emerald-400/20 bg-emerald-500/10 text-emerald-200 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200",
  new: "border-zinc-400/20 bg-zinc-500/10 text-zinc-200 dark:border-zinc-400/20 dark:bg-zinc-500/10 dark:text-zinc-200",
  relearning:
    "border-orange-400/20 bg-orange-500/10 text-orange-200 dark:border-orange-400/20 dark:bg-orange-500/10 dark:text-orange-200",
  suspended:
    "border-stone-400/20 bg-stone-500/10 text-stone-200 dark:border-stone-400/20 dark:bg-stone-500/10 dark:text-stone-200",
  young:
    "border-teal-400/20 bg-teal-500/10 text-teal-200 dark:border-teal-400/20 dark:bg-teal-500/10 dark:text-teal-200",
};

const DAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  month: "short",
});

function startOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function addUtcDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function toDayKey(date: Date) {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

function parseDayKey(dayKey: string) {
  return new Date(`${dayKey}T00:00:00.000Z`);
}

function rangeLabel(range: CalendarRangeValue | undefined) {
  const resolved = resolveRange(range);
  return `${DAY_FORMATTER.format(resolved.from)} - ${DAY_FORMATTER.format(resolved.to)}`;
}

function resolveRange(range: CalendarRangeValue | undefined) {
  const fallbackFrom = startOfUtcDay(new Date());
  const from = startOfUtcDay(range?.from ?? fallbackFrom);
  const to = startOfUtcDay(range?.to ?? range?.from ?? addUtcDays(from, 13));

  return {
    from: from.getTime() <= to.getTime() ? from : to,
    to: from.getTime() <= to.getTime() ? to : from,
  };
}

function buildReviewedToday(events: FlashcardReviewEventRecord[]) {
  const latestByCard = new Map<string, FlashcardReviewEventRecord>();

  for (const event of events) {
    if (!latestByCard.has(event.flashcardId)) {
      latestByCard.set(event.flashcardId, event);
    }
  }

  return Array.from(latestByCard.values());
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

function buildDayStats(set: FlashcardSetRecord) {
  const stats = new Map<string, { due: number; studied: number }>();

  for (const snapshot of set.cardSnapshots) {
    if (
      !snapshot.dueAt ||
      snapshot.displayState === "killed" ||
      snapshot.displayState === "suspended"
    ) {
      continue;
    }

    const dayKey = toDayKey(new Date(snapshot.dueAt));
    const existing = stats.get(dayKey) ?? { due: 0, studied: 0 };
    existing.due += 1;
    stats.set(dayKey, existing);
  }

  for (const event of set.reviewEventsToday) {
    const dayKey = toDayKey(new Date(event.reviewedAt));
    const existing = stats.get(dayKey) ?? { due: 0, studied: 0 };
    existing.studied += 1;
    stats.set(dayKey, existing);
  }

  return stats;
}

function buildGroupedDueCards(
  set: FlashcardSetRecord,
  range: { from: Date; to: Date }
) {
  const groups = new Map<string, (typeof set.cardSnapshots)[number][]>();

  for (const snapshot of set.cardSnapshots) {
    if (
      !snapshot.dueAt ||
      snapshot.displayState === "killed" ||
      snapshot.displayState === "suspended"
    ) {
      continue;
    }

    const dueDay = startOfUtcDay(new Date(snapshot.dueAt));
    if (
      dueDay.getTime() < range.from.getTime() ||
      dueDay.getTime() > range.to.getTime()
    ) {
      continue;
    }

    const dayKey = toDayKey(dueDay);
    const existing = groups.get(dayKey) ?? [];
    existing.push(snapshot);
    groups.set(dayKey, existing);
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dayKey, cards]) => ({
      dayKey,
      cards: cards.slice().sort((left, right) => {
        const dueDiff =
          new Date(left.dueAt ?? 0).getTime() -
          new Date(right.dueAt ?? 0).getTime();
        if (dueDiff !== 0) {
          return dueDiff;
        }

        return left.card.ordinal - right.card.ordinal;
      }),
    }));
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This screen intentionally co-locates review, enrollment, editing, and calendar flows.
export function FlashcardSetDetail({
  initialQueue,
  initialSet,
}: {
  initialQueue: FlashcardReviewQueueItem[];
  initialSet: FlashcardSetRecord;
}) {
  const [set, setSet] = useState(initialSet);
  const [queue, setQueue] = useState(initialQueue);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState(queue.length > 0 ? "study" : "cards");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<FlashcardCardRecord | null>(
    null
  );
  const [frontMarkdown, setFrontMarkdown] = useState("");
  const [backMarkdown, setBackMarkdown] = useState("");
  const [notesMarkdown, setNotesMarkdown] = useState("");
  const [tags, setTags] = useState("");
  const [studyRevealed, setStudyRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [calendarRange, setCalendarRange] = useState<
    CalendarRangeValue | undefined
  >({
    from: startOfUtcDay(new Date()),
    to: addUtcDays(startOfUtcDay(new Date()), 13),
  });
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    setSet(initialSet);
  }, [initialSet]);

  useEffect(() => {
    setQueue(initialQueue);
  }, [initialQueue]);

  useEffect(() => {
    setStudyRevealed(false);
  }, [queue]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        tab !== "study" ||
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
      if (rating && studyRevealed && queue[0]) {
        event.preventDefault();
        submitReview(rating).catch(() => undefined);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [queue, studyRevealed, tab]);

  const snapshotByCardId = new Map(
    set.cardSnapshots.map((snapshot) => [snapshot.card.id, snapshot])
  );
  const filteredCards = set.cards.filter((card) => {
    if (!deferredSearch.trim()) {
      return true;
    }

    const searchNeedle = deferredSearch.toLowerCase();
    return (
      card.frontMarkdown.toLowerCase().includes(searchNeedle) ||
      card.backMarkdown.toLowerCase().includes(searchNeedle) ||
      (card.notesMarkdown ?? "").toLowerCase().includes(searchNeedle) ||
      card.tags.some((tag) => tag.toLowerCase().includes(searchNeedle))
    );
  });
  const activeCard = queue[0] ?? null;
  const reviewedToday = buildReviewedToday(set.reviewEventsToday);
  const dayStats = buildDayStats(set);
  const groupedDueCards = buildGroupedDueCards(
    set,
    resolveRange(calendarRange)
  );
  const activeSnapshot = activeCard
    ? (snapshotByCardId.get(activeCard.card.id) ?? null)
    : null;

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
    const response = await fetch(
      `/api/flashcards/review/queue?setId=${set.id}&limit=20`,
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

    setBusy(true);
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

      await Promise.all([loadSet(), loadQueue()]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:px-6">
        <Card>
          <CardHeader className="gap-3 border-border/70 border-b pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="rounded-sm" variant="outline">
                    {set.sourceType === "ai-generated"
                      ? "AI-generated set"
                      : "Manual set"}
                  </Badge>
                  <Badge className="rounded-sm" variant="outline">
                    {set.cardCount} cards
                  </Badge>
                  <Badge className="rounded-sm" variant="outline">
                    {set.stateCounts.killed} killed
                  </Badge>
                </div>
                <div>
                  <CardTitle>{set.title}</CardTitle>
                  <CardDescription>
                    {set.description ?? "No description set for this deck."}
                  </CardDescription>
                </div>
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
                  <DialogContent className="max-w-3xl">
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
                          busy || !frontMarkdown.trim() || !backMarkdown.trim()
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
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <MetricCard icon={Clock3} label="Due" value={set.dueCount} />
            <MetricCard icon={Sparkles} label="New" value={set.newCount} />
            <MetricCard
              icon={BookOpenCheck}
              label="Studied today"
              value={set.reviewCountToday}
            />
            <MetricCard
              icon={Layers3}
              label="Last 7 days"
              value={set.reviewCount7d}
            />
          </CardContent>
        </Card>

        <Tabs onValueChange={setTab} value={tab}>
          <TabsList variant="line">
            <TabsTrigger value="study">Study</TabsTrigger>
            <TabsTrigger value="cards">Cards</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
          </TabsList>

          <TabsContent value="study">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Review lane</CardTitle>
                    <CardDescription>
                      Click the card or press space to flip. Keys 1-4 submit
                      Again, Hard, Good, Easy.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  {activeCard ? (
                    <FlashcardFlipCard
                      back={
                        <div className="w-full max-w-lg space-y-5">
                          <Markdown
                            className="max-w-none text-sm"
                            content={activeCard.card.backMarkdown}
                            id={`study-back-${activeCard.card.id}`}
                            parseIncompleteMarkdown={false}
                          />
                          {activeCard.card.notesMarkdown ? (
                            <div className="rounded-md border border-border/70 bg-muted/20 p-3">
                              <p className="mb-2 text-[11px] text-muted-foreground">
                                Notes
                              </p>
                              <Markdown
                                className="max-w-none text-sm"
                                content={activeCard.card.notesMarkdown}
                                id={`study-notes-${activeCard.card.id}`}
                                parseIncompleteMarkdown={false}
                              />
                            </div>
                          ) : null}
                        </div>
                      }
                      backBodyClassName="px-8"
                      backMeta={
                        <div className="flex items-center justify-between gap-3">
                          <span>
                            {activeSnapshot?.dueAt
                              ? `Due ${DATE_TIME_FORMATTER.format(new Date(activeSnapshot.dueAt))}`
                              : "Answer"}
                          </span>
                          {activeSnapshot
                            ? stateBadge(activeSnapshot.displayState)
                            : null}
                        </div>
                      }
                      className="mx-auto w-full max-w-3xl"
                      flipped={studyRevealed}
                      front={
                        <div className="w-full max-w-xl">
                          <Markdown
                            className="max-w-none text-center text-base [&_p]:text-center"
                            content={activeCard.card.frontMarkdown}
                            id={`study-front-${activeCard.card.id}`}
                            parseIncompleteMarkdown={false}
                          />
                        </div>
                      }
                      frontBodyClassName="px-10 text-center"
                      frontMeta={
                        <div className="flex items-center justify-between gap-3">
                          <span>
                            Card {activeCard.position} ·{" "}
                            {activeCard.remainingDueCount} left
                          </span>
                          <span>{activeCard.set.title}</span>
                        </div>
                      }
                      onFlippedChange={setStudyRevealed}
                      surfaceClassName="bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(0,0,0,0.05))]"
                    />
                  ) : (
                    <div className="rounded-lg border border-border/70 border-dashed px-4 py-10 text-center text-muted-foreground text-xs">
                      No cards are queued right now.
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Current card</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {activeCard ? (
                      <>
                        <StatusRow
                          label="Queue position"
                          value={`${activeCard.position}`}
                        />
                        <StatusRow
                          label="State"
                          value={
                            activeSnapshot
                              ? STATE_LABELS[activeSnapshot.displayState]
                              : "New"
                          }
                        />
                        <StatusRow
                          label="Due"
                          value={
                            activeSnapshot?.dueAt
                              ? DATE_TIME_FORMATTER.format(
                                  new Date(activeSnapshot.dueAt)
                                )
                              : "Introduced when reviewed"
                          }
                        />
                        <StatusRow
                          label="Remaining"
                          value={`${activeCard.remainingDueCount}`}
                        />
                      </>
                    ) : (
                      <p className="text-muted-foreground text-xs">
                        Queue metadata appears here when a card is active.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Recall rating</CardTitle>
                    <CardDescription>
                      Ratings stay visually neutral until the answer is visible.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    <RatingButton
                      disabled={busy || !studyRevealed}
                      label="1 · Again"
                      onClick={() => submitReview("again")}
                      tone="again"
                    />
                    <RatingButton
                      disabled={busy || !studyRevealed}
                      label="2 · Hard"
                      onClick={() => submitReview("hard")}
                      tone="hard"
                    />
                    <RatingButton
                      disabled={busy || !studyRevealed}
                      label="3 · Good"
                      onClick={() => submitReview("good")}
                      tone="good"
                    />
                    <RatingButton
                      disabled={busy || !studyRevealed}
                      label="4 · Easy"
                      onClick={() => submitReview("easy")}
                      tone="easy"
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="cards">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Card bank</CardTitle>
                    <CardDescription>
                      Search, edit, or kill cards. State and due metadata
                      reflect your personal scheduler state.
                    </CardDescription>
                  </div>
                  <Input
                    className="max-w-xs"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search front, back, notes, or tags"
                    value={search}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[30rem] rounded-lg border border-border/70">
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
                              {snapshot
                                ? stateBadge(snapshot.displayState)
                                : null}
                            </TableCell>
                            <TableCell className="align-top text-muted-foreground text-xs">
                              {snapshot?.dueAt
                                ? DATE_TIME_FORMATTER.format(
                                    new Date(snapshot.dueAt)
                                  )
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
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="insights">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(22rem,0.92fr)]">
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle>Schedule view</CardTitle>
                      <CardDescription>
                        The calendar marks upcoming due cards and today&apos;s
                        study activity for this set.
                      </CardDescription>
                    </div>
                    <Badge className="rounded-sm" variant="outline">
                      <CalendarRange className="mr-1 size-3.5" />
                      {rangeLabel(calendarRange)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.9fr)]">
                  <div className="overflow-x-auto rounded-lg border border-border/70">
                    <Calendar
                      className="min-w-[38rem]"
                      components={{
                        DayButton: (props) => {
                          const stats = dayStats.get(toDayKey(props.day.date));

                          return (
                            <CalendarDayButton
                              {...props}
                              className="items-start px-1.5 py-1"
                            >
                              <span>{props.day.date.getUTCDate()}</span>
                              {stats ? (
                                <span className="mt-auto flex w-full items-end justify-between gap-1 text-[10px] leading-none">
                                  <span
                                    className={cn(
                                      "rounded-sm px-1 py-0.5",
                                      stats.due > 0
                                        ? "bg-primary/15 text-primary"
                                        : "bg-transparent text-transparent"
                                    )}
                                  >
                                    {stats.due > 0 ? stats.due : "0"}
                                  </span>
                                  {stats.studied > 0 ? (
                                    <span className="text-muted-foreground">
                                      {stats.studied}s
                                    </span>
                                  ) : null}
                                </span>
                              ) : null}
                            </CalendarDayButton>
                          );
                        },
                      }}
                      mode="range"
                      numberOfMonths={2}
                      onSelect={setCalendarRange}
                      selected={calendarRange}
                    />
                  </div>

                  <ScrollArea className="h-[25rem] rounded-lg border border-border/70">
                    <div className="space-y-3 p-3">
                      {groupedDueCards.length === 0 ? (
                        <div className="rounded-lg border border-border/70 border-dashed px-4 py-8 text-center text-muted-foreground text-xs">
                          No scheduled cards in this range.
                        </div>
                      ) : (
                        groupedDueCards.map(({ dayKey, cards }) => (
                          <div className="space-y-2" key={dayKey}>
                            <div className="flex items-center justify-between">
                              <p className="font-medium text-foreground text-sm">
                                {DAY_FORMATTER.format(parseDayKey(dayKey))}
                              </p>
                              <span className="text-[11px] text-muted-foreground">
                                {cards.length} due
                              </span>
                            </div>
                            <div className="space-y-2">
                              {cards.map((snapshot) => (
                                <div
                                  className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3"
                                  key={snapshot.card.id}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="line-clamp-2 text-foreground text-sm">
                                        {snapshot.card.frontMarkdown}
                                      </p>
                                      <p className="text-[11px] text-muted-foreground">
                                        {snapshot.dueAt
                                          ? DATE_TIME_FORMATTER.format(
                                              new Date(snapshot.dueAt)
                                            )
                                          : "Not scheduled"}
                                      </p>
                                    </div>
                                    {stateBadge(snapshot.displayState)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <div className="grid gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>State counts</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    {(
                      Object.entries(set.stateCounts) as [
                        FlashcardDisplayState,
                        number,
                      ][]
                    ).map(([state, count]) => (
                      <div
                        className={cn(
                          "flex items-center justify-between rounded-lg border px-3 py-2",
                          count > 0
                            ? "border-border/70 bg-muted/20"
                            : "border-border/40 bg-transparent opacity-55"
                        )}
                        key={state}
                      >
                        <span className="flex items-center gap-2">
                          {stateBadge(state)}
                          <span className="text-muted-foreground text-xs">
                            {STATE_LABELS[state]}
                          </span>
                        </span>
                        <span className="font-medium text-foreground text-sm">
                          {count}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Studied today</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[12rem] rounded-lg border border-border/70">
                      <div className="space-y-2 p-3">
                        {reviewedToday.length === 0 ? (
                          <div className="rounded-lg border border-border/70 border-dashed px-4 py-8 text-center text-muted-foreground text-xs">
                            No cards reviewed from this set today.
                          </div>
                        ) : (
                          reviewedToday.map((event) => (
                            <div
                              className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3"
                              key={event.id}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="line-clamp-2 text-foreground text-sm">
                                    {event.card.frontMarkdown}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {DATE_TIME_FORMATTER.format(
                                      new Date(event.reviewedAt)
                                    )}
                                  </p>
                                </div>
                                <Badge
                                  className="rounded-sm capitalize"
                                  variant="outline"
                                >
                                  {event.rating}
                                </Badge>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Recent reviews</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {set.recentReviews.length === 0 ? (
                      <p className="text-muted-foreground text-xs">
                        No review history yet for this set.
                      </p>
                    ) : (
                      set.recentReviews.map((review) => (
                        <div
                          className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-3 py-2"
                          key={review.id}
                        >
                          <div>
                            <p className="font-medium text-foreground capitalize">
                              {review.rating}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {DATE_TIME_FORMATTER.format(
                                new Date(review.reviewedAt)
                              )}
                            </p>
                          </div>
                          <Badge className="rounded-sm" variant="outline">
                            {review.previousState ?? "new"} → {review.nextState}
                          </Badge>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: number;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-md border border-border/70 bg-muted/25">
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="space-y-0.5">
          <p className="text-[11px] text-muted-foreground">{label}</p>
          <p className="font-medium text-foreground text-lg">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function RatingButton({
  disabled,
  label,
  onClick,
  tone,
}: {
  disabled?: boolean;
  label: string;
  onClick: () => void;
  tone: "again" | "hard" | "good" | "easy";
}) {
  let toneClass =
    "border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/10";

  if (tone === "again") {
    toneClass = "border-rose-400/30 text-rose-200 hover:bg-rose-500/10";
  } else if (tone === "hard") {
    toneClass = "border-orange-400/30 text-orange-200 hover:bg-orange-500/10";
  } else if (tone === "good") {
    toneClass = "border-teal-400/30 text-teal-200 hover:bg-teal-500/10";
  }

  return (
    <Button
      className={cn(
        "justify-between border-border/70 bg-muted/15 text-foreground transition-colors",
        disabled ? "bg-muted/10 text-muted-foreground" : toneClass
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

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-medium text-base text-foreground">{value}</span>
    </div>
  );
}
