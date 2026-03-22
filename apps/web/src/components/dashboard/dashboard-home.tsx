"use client";

import { Badge } from "@avenire/ui/components/badge";
import { Button } from "@avenire/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@avenire/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@avenire/ui/components/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@avenire/ui/components/tabs";
import {
  ArrowRight,
  BookOpenCheck,
  Files,
  FileText,
  MessageSquareText,
  Plus,
  TriangleAlert,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { startTransition, useEffect, useMemo, useState } from "react";
import { QuickCaptureDialog } from "@/components/dashboard/quick-capture-dialog";
import { WorkspaceHeader } from "@/components/dashboard/workspace-header";
import type { ChatSummary } from "@/lib/chat-data";
import type { ExplorerFileRecord } from "@/lib/file-data";
import type {
  ConceptDrillTarget,
  ConceptMasteryRecord,
  ConceptMasterySubjectRecord,
  FlashcardSetSummary,
  FlashcardTaxonomy,
} from "@/lib/flashcards";
import type { MisconceptionRecord } from "@/lib/learning-data";
import {
  dashboardUiActions,
  useDashboardUiStore,
} from "@/stores/dashboardUiStore";
import { useWorkspaceHistoryStore } from "@/stores/workspaceHistoryStore";

const DashboardTaskManager = dynamic(
  () =>
    import("@/components/dashboard/task-manager").then((module) => ({
      default: module.DashboardTaskManager,
    })),
  {
    loading: () => (
      <div className="rounded-lg border border-border/70 bg-background px-4 py-10 text-center text-muted-foreground text-sm">
        Loading tasks...
      </div>
    ),
  }
);

const StudentCalendar = dynamic(
  () =>
    import("@/components/student-calendar").then((module) => ({
      default: module.StudentCalendar,
    })),
  {
    loading: () => (
      <div className="rounded-lg border border-border/70 bg-background px-4 py-10 text-center text-muted-foreground text-sm">
        Loading calendar...
      </div>
    ),
  }
);

interface DashboardHomeProps {
  activeMisconceptions: MisconceptionRecord[];
  chats: ChatSummary[];
  files: ExplorerFileRecord[];
  flashcardSets: FlashcardSetSummary[];
  masteryConcepts: ConceptMasteryRecord[];
  masterySelectedSubject: string | null;
  masterySubjects: ConceptMasterySubjectRecord[];
  studySessions: Array<{ count: number; day: string }>;
  onboardingCompleted: boolean;
  rootFolderId: string | null;
  userName?: string;
  workspaceUuid: string;
  weakestConcepts: ConceptMasteryRecord[];
  weakestDrillTarget: ConceptDrillTarget | null;
}

interface ActivityEvent {
  action: "created" | "updated" | "reviewed";
  createdAt: string;
  href: string;
  id: string;
  subtitle?: string;
  title: string;
  type: "chat" | "file" | "flashcard" | "note";
}

interface WeakPointGroup {
  concepts: ConceptMasteryRecord[];
  misconceptionCount: number;
  subject: string;
  topic: string;
}

function buildDrillQuery(concepts: FlashcardTaxonomy[]) {
  const params = new URLSearchParams();
  for (const concept of concepts) {
    params.append("drill", JSON.stringify(concept));
  }
  return params.toString();
}

function formatRelativeTime(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) {
    return "just now";
  }
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return then.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function groupWeakPoints(
  concepts: ConceptMasteryRecord[],
  misconceptions: MisconceptionRecord[]
) {
  const byTopic = new Map<string, WeakPointGroup>();

  for (const concept of concepts) {
    const key = `${concept.subject}::${concept.topic}`;
    const existing = byTopic.get(key) ?? {
      concepts: [],
      misconceptionCount: 0,
      subject: concept.subject,
      topic: concept.topic,
    };
    existing.concepts.push(concept);
    existing.concepts.sort((left, right) => left.score - right.score);
    existing.misconceptionCount = misconceptions.filter(
      (item) =>
        item.subject === concept.subject &&
        item.topic === concept.topic &&
        item.active
    ).length;
    byTopic.set(key, existing);
  }

  return Array.from(byTopic.values()).sort((left, right) => {
    const leftScore =
      left.concepts.reduce((sum, concept) => sum + concept.score, 0) /
      Math.max(left.concepts.length, 1);
    const rightScore =
      right.concepts.reduce((sum, concept) => sum + concept.score, 0) /
      Math.max(right.concepts.length, 1);

    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }

    return `${left.subject}::${left.topic}`.localeCompare(
      `${right.subject}::${right.topic}`
    );
  });
}

function UpcomingFlashcardList({
  flashcardSets,
  onStartReview,
}: {
  flashcardSets: FlashcardSetSummary[];
  onStartReview: (setId: string) => void;
}) {
  const orderedSets = flashcardSets
    .slice()
    .sort(
      (left, right) =>
        right.dueCount + right.newCount - (left.dueCount + left.newCount)
    )
    .slice(0, 8);

  if (orderedSets.length === 0) {
    return (
      <div className="rounded-lg border border-border/70 border-dashed px-4 py-10 text-center text-muted-foreground text-sm">
        Nothing is waiting right now.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {orderedSets.map((set) => (
        <button
          className="flex w-full items-start justify-between gap-3 rounded-lg border border-border/70 bg-background px-3 py-3 text-left transition-colors hover:bg-muted/40"
          key={set.id}
          onClick={() => onStartReview(set.id)}
          type="button"
        >
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground text-sm">
              {set.title}
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              {set.dueCount + set.newCount} cards ready
            </p>
          </div>
          <Badge className="shrink-0 rounded-sm" variant="outline">
            Start
          </Badge>
        </button>
      ))}
    </div>
  );
}

export function DashboardHome({
  activeMisconceptions,
  chats: _chats,
  files: _files,
  flashcardSets,
  masteryConcepts: _masteryConcepts,
  masterySelectedSubject: _masterySelectedSubject,
  masterySubjects: _masterySubjects,
  studySessions: _studySessions,
  onboardingCompleted: _onboardingCompleted,
  rootFolderId: _rootFolderId,
  userName,
  workspaceUuid: _workspaceUuid,
  weakestConcepts,
  weakestDrillTarget,
}: DashboardHomeProps) {
  const router = useRouter();
  const recordRoute = useWorkspaceHistoryStore((state) => state.recordRoute);
  const homeTab = useDashboardUiStore((state) => state.homeTab);
  const insightsTab = useDashboardUiStore((state) => state.insightsTab);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [selectedMisconception, setSelectedMisconception] =
    useState<MisconceptionRecord | null>(null);

  const weakPointGroups = useMemo(
    () => groupWeakPoints(weakestConcepts, activeMisconceptions),
    [activeMisconceptions, weakestConcepts]
  );

  useEffect(() => {
    recordRoute("/workspace");
  }, [recordRoute]);

  useEffect(() => {
    const loadActivities = async () => {
      try {
        const response = await fetch("/api/activity?limit=6");
        if (response.ok) {
          const data = (await response.json()) as { events: ActivityEvent[] };
          setActivities(data.events);
        }
      } catch {
        // ignore
      } finally {
        setLoadingActivities(false);
      }
    };

    loadActivities().catch(() => undefined);
  }, []);

  const promptForMisconception = (misconception: MisconceptionRecord) =>
    encodeURIComponent(
      `Help me fix this misconception.\n\nConcept: ${misconception.concept}\nSubject: ${misconception.subject}\nTopic: ${misconception.topic}\nReason: ${misconception.reason}\n\nFirst check the current misconception context, then teach the correct model, and test me with a few questions.`
    );

  const promptForFlashcards = (misconception: MisconceptionRecord) =>
    encodeURIComponent(
      `Generate a flashcard set from this misconception and focus on correcting the wrong model.\n\nConcept: ${misconception.concept}\nSubject: ${misconception.subject}\nTopic: ${misconception.topic}\nReason: ${misconception.reason}\n\nUse the misconception tools if needed, then create the flashcard set from the wrong model and the corrected model.`
    );

  const resolveMisconception = async (misconception: MisconceptionRecord) => {
    const response = await fetch("/api/misconceptions/resolve", {
      body: JSON.stringify({
        concept: misconception.concept,
        subject: misconception.subject,
        topic: misconception.topic,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (response.ok) {
      setSelectedMisconception(null);
      router.refresh();
    }
  };

  const startReview = (setId: string) => {
    startTransition(() => {
      router.push(`/workspace/flashcards/${setId}?study=1` as Route);
    });
  };

  let activityContent: React.ReactNode;
  if (loadingActivities) {
    activityContent = (
      <div className="rounded-lg border border-border/70 bg-background px-4 py-10 text-center text-muted-foreground text-sm">
        Loading activity...
      </div>
    );
  } else if (activities.length === 0) {
    activityContent = (
      <div className="rounded-lg border border-border/70 bg-background px-4 py-10 text-center text-muted-foreground text-sm">
        No recent activity.
      </div>
    );
  } else {
    activityContent = activities.slice(0, 6).map((event) => (
      <Link
        className="flex items-center gap-3 rounded-lg border border-border/70 bg-background px-3 py-3 transition-colors hover:bg-muted/40"
        href={event.href as Route}
        key={event.id}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-foreground text-sm">{event.title}</p>
          {event.subtitle ? (
            <p className="mt-0.5 truncate text-muted-foreground text-xs">
              {event.subtitle}
            </p>
          ) : null}
        </div>
        <span className="shrink-0 text-muted-foreground text-xs">
          {formatRelativeTime(event.createdAt)}
        </span>
      </Link>
    ));
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-none flex-col gap-5 px-4 py-4 md:px-6">
        <WorkspaceHeader className="-mx-4 md:-mx-6">
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground text-sm">
              Desktop
            </p>
          </div>
        </WorkspaceHeader>

        <div className="-mx-4 overflow-hidden border-border/70 border-y md:-mx-6">
          <img
            alt="Workspace banner"
            className="h-36 w-full object-cover md:h-48"
            height={192}
            src="/images/folder-banner-default.svg"
            width={2400}
          />
        </div>

        <div className="grid w-full gap-2 sm:grid-cols-2 md:grid-cols-3 lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none">
          <div className="flex min-w-0">
            <QuickCaptureDialog
              initialKind="task"
              trigger={
                <Button
                  className="h-10 w-full justify-start px-3 text-sm"
                  type="button"
                  variant="outline"
                >
                  <Plus className="size-3.5" />
                  Task
                </Button>
              }
            />
          </div>

          <div className="flex min-w-0">
            <QuickCaptureDialog
              initialKind="note"
              trigger={
                <Button
                  className="h-10 w-full justify-start px-3 text-sm"
                  type="button"
                  variant="outline"
                >
                  <FileText className="size-3.5" />
                  Note
                </Button>
              }
            />
          </div>

          <div className="flex min-w-0">
            <QuickCaptureDialog
              initialKind="misconception"
              trigger={
                <Button
                  className="h-10 w-full justify-start px-3 text-sm"
                  type="button"
                  variant="outline"
                >
                  <TriangleAlert className="size-3.5" />
                  Misconception
                </Button>
              }
            />
          </div>

          <div className="flex min-w-0">
            <Button
              className="h-10 w-full justify-start px-3 text-sm"
              onClick={() => {
                router.push("/workspace/chats" as Route);
              }}
              type="button"
              variant="outline"
            >
              <MessageSquareText className="size-3.5" />
              Chat
            </Button>
          </div>

          <div className="flex min-w-0">
            <Button
              className="h-10 w-full justify-start px-3 text-sm"
              onClick={() => {
                router.push("/workspace/flashcards" as Route);
              }}
              type="button"
              variant="outline"
            >
              <BookOpenCheck className="size-3.5" />
              Flashcards
            </Button>
          </div>

          <div className="flex min-w-0">
            <Button
              className="h-10 w-full justify-start px-3 text-sm"
              onClick={() => {
                router.push("/workspace/files" as Route);
              }}
              type="button"
              variant="outline"
            >
              <Files className="size-3.5" />
              Files
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-4">
          <p className="text-center text-muted-foreground text-sm">
            Hey {userName ?? "there"}! Welcome back!
          </p>
        </div>

        <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(16rem,0.6fr)_minmax(0,1.4fr)]">
          <Card className="flex h-full min-h-[30rem] flex-col overflow-hidden">
            <CardContent className="min-h-0 flex-1 overflow-y-auto pt-4">
              <Tabs
                className="space-y-4"
                onValueChange={(value) => {
                  if (value === "tasks" || value === "activity") {
                    dashboardUiActions.setHomeTab(value);
                  }
                }}
                value={homeTab}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="tasks">Tasks</TabsTrigger>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                </TabsList>

                <TabsContent value="tasks">
                  <DashboardTaskManager />
                </TabsContent>

                <TabsContent className="space-y-2" value="activity">
                  {activityContent}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card className="flex h-full min-h-[34rem] flex-col overflow-hidden">
            <CardContent className="min-h-0 flex-1 overflow-y-auto pt-4">
              <Tabs
                className="space-y-4"
                onValueChange={(value) => {
                  if (
                    value === "weak-points" ||
                    value === "misconceptions" ||
                    value === "upcoming"
                  ) {
                    dashboardUiActions.setInsightsTab(value);
                  }
                }}
                value={insightsTab}
              >
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="weak-points">Weak points</TabsTrigger>
                  <TabsTrigger value="misconceptions">
                    Misconceptions
                  </TabsTrigger>
                  <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                </TabsList>

                <TabsContent className="space-y-3" value="weak-points">
                  {weakPointGroups.length === 0 ? (
                    <div className="rounded-lg border border-border/70 border-dashed px-4 py-10 text-center text-muted-foreground text-sm">
                      No weak points yet.
                    </div>
                  ) : (
                    weakPointGroups.slice(0, 6).map((group) => {
                      const drillConcepts = group.concepts
                        .slice(0, 3)
                        .map((concept) => ({
                          concept: concept.concept,
                          subject: concept.subject,
                          topic: concept.topic,
                        }));
                      const drillHref =
                        weakestDrillTarget && drillConcepts.length > 0
                          ? `/workspace/flashcards/${weakestDrillTarget.setId}?${buildDrillQuery(drillConcepts)}&study=1`
                          : null;

                      return (
                        <div
                          className="rounded-xl border border-border/70 bg-background p-4"
                          key={`${group.subject}:${group.topic}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-foreground text-sm">
                                {group.topic}
                              </p>
                              <p className="mt-1 text-muted-foreground text-xs">
                                {group.subject}
                              </p>
                            </div>
                            <Badge className="rounded-sm" variant="outline">
                              {group.misconceptionCount} misconceptions
                            </Badge>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {group.concepts.slice(0, 4).map((concept) => (
                              <span
                                className="rounded-md border border-border/70 bg-muted/20 px-2 py-1 text-foreground text-xs"
                                key={`${concept.subject}:${concept.topic}:${concept.concept}`}
                              >
                                {concept.concept}
                              </span>
                            ))}
                          </div>
                          <div className="mt-4 flex justify-end">
                            {drillHref ? (
                              <Link
                                className="inline-flex items-center gap-1 text-foreground text-xs"
                                href={drillHref as Route}
                              >
                                Drill
                                <ArrowRight className="size-3.5" />
                              </Link>
                            ) : (
                              <span className="text-muted-foreground text-xs">
                                No drill available
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </TabsContent>

                <TabsContent className="space-y-3" value="misconceptions">
                  {activeMisconceptions.length === 0 ? (
                    <div className="rounded-lg border border-border/70 border-dashed px-4 py-10 text-center text-muted-foreground text-sm">
                      No active misconceptions.
                    </div>
                  ) : (
                    activeMisconceptions.slice(0, 8).map((misconception) => (
                      <button
                        className="w-full rounded-xl border border-border/70 bg-background px-4 py-4 text-left transition-colors hover:bg-muted/40"
                        key={misconception.id}
                        onClick={() => setSelectedMisconception(misconception)}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground text-sm">
                              {misconception.concept}
                            </p>
                            <p className="mt-1 text-muted-foreground text-xs">
                              {misconception.subject} / {misconception.topic}
                            </p>
                          </div>
                          <Badge className="rounded-sm" variant="outline">
                            {Math.round(misconception.confidence * 100)}%
                          </Badge>
                        </div>
                        <p className="mt-2 line-clamp-2 text-muted-foreground text-xs">
                          {misconception.reason}
                        </p>
                      </button>
                    ))
                  )}
                </TabsContent>

                <TabsContent className="space-y-3" value="upcoming">
                  <UpcomingFlashcardList
                    flashcardSets={flashcardSets}
                    onStartReview={startReview}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <CardHeader className="border-border/70 border-b pb-3">
            <CardTitle className="text-sm">Student calendar</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <StudentCalendar />
          </CardContent>
        </Card>
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setSelectedMisconception(null);
          }
        }}
        open={selectedMisconception !== null}
      >
        <DialogContent className="max-w-2xl">
          {selectedMisconception ? (
            <>
              <DialogHeader>
                <DialogTitle>{selectedMisconception.concept}</DialogTitle>
                <DialogDescription>
                  {selectedMisconception.subject} /{" "}
                  {selectedMisconception.topic}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-foreground text-sm">
                  {selectedMisconception.reason}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge className="rounded-sm" variant="outline">
                    Confidence{" "}
                    {Math.round(selectedMisconception.confidence * 100)}%
                  </Badge>
                  <Badge className="rounded-sm" variant="outline">
                    {selectedMisconception.source}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      const prompt = promptForMisconception(
                        selectedMisconception
                      );
                      router.push(
                        `/workspace/chats/new?prompt=${prompt}` as Route
                      );
                    }}
                    type="button"
                  >
                    <MessageSquareText className="size-4" />
                    Chat with AI
                  </Button>
                  <Button
                    onClick={() => {
                      const prompt = promptForFlashcards(selectedMisconception);
                      router.push(
                        `/workspace/chats/new?prompt=${prompt}` as Route
                      );
                    }}
                    type="button"
                    variant="outline"
                  >
                    <BookOpenCheck className="size-4" />
                    Generate flashcards
                  </Button>
                  <Button
                    onClick={() => {
                      fetch("/api/misconceptions/improve", {
                        body: JSON.stringify({
                          concept: selectedMisconception.concept,
                          subject: selectedMisconception.subject,
                          topic: selectedMisconception.topic,
                        }),
                        headers: { "Content-Type": "application/json" },
                        method: "POST",
                      })
                        .then((response) => {
                          if (!response.ok) {
                            throw new Error("Unable to improve misconception.");
                          }
                          return response.json();
                        })
                        .then(() => {
                          setSelectedMisconception(null);
                          router.refresh();
                        })
                        .catch(() => undefined);
                    }}
                    type="button"
                    variant="outline"
                  >
                    Improve mastery
                  </Button>
                  <Button
                    onClick={() => {
                      resolveMisconception(selectedMisconception).catch(
                        () => undefined
                      );
                    }}
                    type="button"
                    variant="secondary"
                  >
                    Clear misconception
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
