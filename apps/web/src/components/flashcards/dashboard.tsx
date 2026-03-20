"use client";

import { Badge } from "@avenire/ui/components/badge";
import { Button } from "@avenire/ui/components/button";
import { Calendar } from "@avenire/ui/components/calendar";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@avenire/ui/components/popover";
import { ScrollArea } from "@avenire/ui/components/scroll-area";
import { Textarea } from "@avenire/ui/components/textarea";
import { cn } from "@avenire/ui/lib/utils";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarRange,
  Clock3,
  LibraryBig,
  Plus,
  Sparkles,
} from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { startTransition, useEffect, useRef, useState } from "react";
import { WorkspaceHeader } from "@/components/dashboard/workspace-header";
import type {
  FlashcardCardSnapshot,
  FlashcardDashboardRecord,
  FlashcardDisplayState,
  FlashcardReviewEventRecord,
} from "@/lib/flashcards";
import { useWorkspaceHistoryStore } from "@/stores/workspaceHistoryStore";

interface CalendarRangeValue {
  from: Date | undefined;
  to?: Date;
}

interface UpcomingGroup {
  cards: FlashcardCardSnapshot[];
  dayKey: string;
}

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

function resolveRange(range: CalendarRangeValue | undefined) {
  const fallbackFrom = startOfUtcDay(new Date());
  const from = startOfUtcDay(range?.from ?? fallbackFrom);
  const to = startOfUtcDay(range?.to ?? range?.from ?? addUtcDays(from, 13));

  return {
    from: from.getTime() <= to.getTime() ? from : to,
    to: from.getTime() <= to.getTime() ? to : from,
  };
}

function formatRangeLabel(range: CalendarRangeValue | undefined) {
  const resolved = resolveRange(range);
  return `${DAY_FORMATTER.format(resolved.from)} - ${DAY_FORMATTER.format(resolved.to)}`;
}

function buildUpcomingGroups(
  snapshots: FlashcardCardSnapshot[],
  range: { from: Date; to: Date }
) {
  const groups = new Map<string, FlashcardCardSnapshot[]>();

  for (const snapshot of snapshots) {
    if (
      !snapshot.dueAt ||
      snapshot.displayState === "killed" ||
      snapshot.displayState === "suspended"
    ) {
      continue;
    }

    const dueDate = startOfUtcDay(new Date(snapshot.dueAt));
    if (
      dueDate.getTime() < range.from.getTime() ||
      dueDate.getTime() > range.to.getTime()
    ) {
      continue;
    }

    const dayKey = toDayKey(dueDate);
    const existing = groups.get(dayKey) ?? [];
    existing.push(snapshot);
    groups.set(dayKey, existing);
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dayKey, cards]) => ({
      cards: cards.slice().sort((left, right) => {
        const dueDiff =
          new Date(left.dueAt ?? 0).getTime() -
          new Date(right.dueAt ?? 0).getTime();

        if (dueDiff !== 0) {
          return dueDiff;
        }

        return left.card.ordinal - right.card.ordinal;
      }),
      dayKey,
    })) satisfies UpcomingGroup[];
}

function buildReviewedTodayForSet(
  events: FlashcardReviewEventRecord[],
  setId: string | null
) {
  if (!setId) {
    return [];
  }

  const latestByCard = new Map<string, FlashcardReviewEventRecord>();

  for (const event of events) {
    if (event.set.id !== setId || latestByCard.has(event.flashcardId)) {
      continue;
    }

    latestByCard.set(event.flashcardId, event);
  }

  return Array.from(latestByCard.values());
}

function buildStateCountsForSet(snapshots: FlashcardCardSnapshot[]) {
  const counts: Record<FlashcardDisplayState, number> = {
    killed: 0,
    learning: 0,
    mature: 0,
    new: 0,
    relearning: 0,
    suspended: 0,
    young: 0,
  };

  for (const snapshot of snapshots) {
    counts[snapshot.displayState] += 1;
  }

  return counts;
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

export function FlashcardsDashboard({
  initialDashboard,
}: {
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
  const [busy, setBusy] = useState(false);
  const [calendarRange, setCalendarRange] = useState<
    CalendarRangeValue | undefined
  >({
    from: startOfUtcDay(new Date()),
    to: addUtcDays(startOfUtcDay(new Date()), 13),
  });
  const autoOpenCreateRef = useRef(false);

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
  const selectedStateCounts = buildStateCountsForSet(selectedSnapshots);
  const selectedStateEntries = Object.entries(selectedStateCounts)
    .map(([state, count]) => ({
      count,
      state: state as FlashcardDisplayState,
    }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count);
  const selectedUpcomingGroups = buildUpcomingGroups(
    selectedSnapshots,
    resolveRange(calendarRange)
  );
  const selectedReviewedToday = buildReviewedTodayForSet(
    dashboard.reviewEventsToday,
    selectedSetId
  );
  const selectedUpcomingCount = selectedUpcomingGroups.reduce(
    (total, group) => total + group.cards.length,
    0
  );
  const activeDeckCount = orderedSets.filter(
    (set) => set.enrollmentStatus === "active"
  ).length;
  const workloadHandled = dashboard.reviewCountToday;
  const workloadTotal = Math.max(workloadHandled + dashboard.dueCount, 1);
  const workloadPercent = Math.round((workloadHandled / workloadTotal) * 100);

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

        <Card>
          <CardHeader>
            <CardTitle>Workspace progress</CardTitle>
            <CardDescription>
              A single summary for the whole workspace instead of a dashboard of
              competing widgets.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
            <div className="grid gap-3 md:grid-cols-4">
              <MetricTile
                emphasis
                icon={Clock3}
                label="Due today"
                note={dashboard.dueCount > 0 ? "Needs attention" : "Clear"}
                value={dashboard.dueCount}
              />
              <MetricTile
                icon={Sparkles}
                label="New cards"
                value={dashboard.newCount}
              />
              <MetricTile
                icon={BookOpenCheck}
                label="Studied today"
                value={dashboard.reviewCountToday}
              />
              <MetricTile
                icon={LibraryBig}
                label="Active decks"
                value={activeDeckCount}
              />
            </div>
            <div className="rounded-2xl border border-border/50 bg-muted/15 px-4 py-4 shadow-[0_1px_0_rgba(255,255,255,0.03)]">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="font-medium text-2xl text-foreground">
                    {workloadPercent}%
                  </p>
                  <p className="text-muted-foreground text-xs">
                    of today&apos;s visible workload handled
                  </p>
                </div>
                <p className="text-right text-muted-foreground text-xs">
                  {workloadHandled} reviewed · {dashboard.dueCount} still due
                </p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted/35">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${Math.max(workloadPercent, 6)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <section className="grid items-stretch gap-4 xl:grid-cols-[minmax(18rem,0.92fr)_minmax(0,1.08fr)]">
          <Card className="flex h-full min-h-[34rem] flex-col overflow-hidden">
            <CardHeader>
              <CardTitle>Decks</CardTitle>
              <CardDescription>
                Pick a deck from the library, then inspect its progress on the
                right.
              </CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 flex-1">
              <ScrollArea className="h-[28rem]">
                <div className="space-y-2 p-3">
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
                            "block w-full rounded-2xl border border-border/45 bg-background/70 px-3 py-3 text-left transition-colors hover:bg-muted/20",
                            isSelected && "border-primary/35 bg-muted/25"
                          )}
                          key={set.id}
                          onClick={() => setSelectedSetId(set.id)}
                          type="button"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-foreground text-sm">
                                {set.title}
                              </p>
                              <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                                {set.description ?? "No description yet."}
                              </p>
                            </div>
                            {set.dueCount > 0 ? (
                              <Badge className="rounded-sm" variant="outline">
                                {set.dueCount} due
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            <span>{set.cardCount} cards</span>
                            <span>{set.newCount} new</span>
                            <span>
                              {set.lastStudiedAt
                                ? `Last studied ${DAY_FORMATTER.format(new Date(set.lastStudiedAt))}`
                                : "Not studied yet"}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="flex h-full min-h-[34rem] flex-col overflow-hidden">
            {selectedSet ? (
              <>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="rounded-sm" variant="outline">
                          {selectedSet.sourceType === "ai-generated"
                            ? "AI generated"
                            : "Manual"}
                        </Badge>
                        {selectedSet.dueCount > 0 ? (
                          <Badge className="rounded-sm" variant="outline">
                            {selectedSet.dueCount} due
                          </Badge>
                        ) : null}
                      </div>
                      <CardTitle>{selectedSet.title}</CardTitle>
                      <CardDescription>
                        {selectedSet.description ?? "No description yet."}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Popover>
                        <PopoverTrigger render={<Button variant="outline" />}>
                          <CalendarRange className="size-4" />
                          {formatRangeLabel(calendarRange)}
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-auto p-0">
                          <Calendar
                            mode="range"
                            numberOfMonths={2}
                            onSelect={setCalendarRange}
                            selected={calendarRange}
                          />
                        </PopoverContent>
                      </Popover>
                      <Button
                        onClick={() =>
                          router.push(
                            `/workspace/flashcards/${selectedSet.id}` as Route
                          )
                        }
                        type="button"
                        variant="outline"
                      >
                        Open Deck
                      </Button>
                      <Button
                        onClick={() =>
                          router.push(
                            `/workspace/flashcards/${selectedSet.id}` as Route
                          )
                        }
                        type="button"
                      >
                        Go to deck
                        <ArrowRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="min-h-0 flex-1 space-y-5">
                  <div className="grid gap-3 md:grid-cols-3">
                    <DeckStat label="Due" value={selectedSet.dueCount} />
                    <DeckStat label="New" value={selectedSet.newCount} />
                    <DeckStat
                      label="Studied today"
                      value={selectedReviewedToday.length}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-foreground text-sm">
                        Deck state
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {selectedSnapshots.length} cards tracked
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedStateEntries.length === 0 ? (
                        <span className="text-muted-foreground text-xs">
                          No scheduler state yet.
                        </span>
                      ) : (
                        selectedStateEntries.map((entry) => (
                          <div
                            className="flex items-center gap-2 rounded-2xl border border-border/45 bg-muted/15 px-3 py-2"
                            key={entry.state}
                          >
                            {stateBadge(entry.state)}
                            <span className="text-muted-foreground text-xs">
                              {entry.count}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-foreground text-sm">
                          Upcoming cards
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {selectedUpcomingCount} due in range
                        </p>
                      </div>
                      <ScrollArea className="h-[18rem]">
                        <div className="space-y-3 p-3">
                          {selectedUpcomingGroups.length === 0 ? (
                            <div className="rounded-2xl border border-border/45 border-dashed px-4 py-8 text-center text-muted-foreground text-xs">
                              No cards due for this deck in the selected range.
                            </div>
                          ) : (
                            selectedUpcomingGroups.map((group) => (
                              <div className="space-y-2" key={group.dayKey}>
                                <div className="flex items-center justify-between">
                                  <p className="font-medium text-foreground text-xs">
                                    {DAY_FORMATTER.format(
                                      parseDayKey(group.dayKey)
                                    )}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {group.cards.length} due
                                  </p>
                                </div>
                                <div className="space-y-2">
                                  {group.cards.slice(0, 4).map((snapshot) => (
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
                                  {group.cards.length > 4 ? (
                                    <p className="text-[11px] text-muted-foreground">
                                      +{group.cards.length - 4} more cards on
                                      this day
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-foreground text-sm">
                          Reviewed today
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {selectedReviewedToday.length} cards
                        </p>
                      </div>
                      <ScrollArea className="h-[18rem]">
                        <div className="space-y-2 p-3">
                          {selectedReviewedToday.length === 0 ? (
                            <div className="rounded-2xl border border-border/45 border-dashed px-4 py-8 text-center text-muted-foreground text-xs">
                              Nothing reviewed from this deck today.
                            </div>
                          ) : (
                            selectedReviewedToday.map((event) => (
                              <div
                                className="rounded-2xl border border-border/45 bg-muted/15 px-3 py-3"
                                key={event.id}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="line-clamp-2 text-foreground text-sm">
                                      {event.card.frontMarkdown}
                                    </p>
                                    <p className="mt-1 text-[11px] text-muted-foreground">
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
                    </div>
                  </div>
                </CardContent>
              </>
            ) : (
              <>
                <CardHeader>
                  <CardTitle>No deck selected</CardTitle>
                  <CardDescription>
                    Create or import a deck to start using flashcards.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-2xl border border-border/45 border-dashed px-4 py-10 text-center text-muted-foreground text-xs">
                    Nothing to show yet.
                  </div>
                </CardContent>
              </>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}

function MetricTile({
  emphasis = false,
  icon: Icon,
  label,
  note,
  value,
}: {
  emphasis?: boolean;
  icon: typeof Clock3;
  label: string;
  note?: string;
  value: number;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/45 bg-muted/15 px-4 py-4 shadow-[0_1px_0_rgba(255,255,255,0.03)]",
        emphasis && "border-primary/25 bg-primary/10"
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-8 items-center justify-center rounded-xl border border-border/45 bg-background/75",
            emphasis && "border-primary/20 bg-primary/10"
          )}
        >
          <Icon
            className={cn(
              "size-4 text-muted-foreground",
              emphasis && "text-primary"
            )}
          />
        </div>
        <div className="space-y-0.5">
          <p className="text-[11px] text-muted-foreground">{label}</p>
          <p
            className={cn(
              "font-medium text-foreground text-lg",
              emphasis && "text-3xl"
            )}
          >
            {value}
          </p>
          {note ? (
            <p className="text-[11px] text-muted-foreground">{note}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DeckStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border/45 bg-muted/15 px-4 py-3 shadow-[0_1px_0_rgba(255,255,255,0.03)]">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium text-2xl text-foreground">{value}</p>
    </div>
  );
}
