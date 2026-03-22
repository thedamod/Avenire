import type { Route } from "next";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { listChatsForUser } from "@/lib/chat-data";
import { listWorkspaceFiles } from "@/lib/file-data";
import {
  type ConceptMasteryRecord,
  type ConceptMasterySubjectRecord,
  getConceptMasteryDashboardData,
  getFlashcardDashboardForUser,
  listFlashcardReviewCountsByDayForUser,
  listFlashcardSetSummariesForUser,
  resolveWeakestConceptDrillTarget,
} from "@/lib/flashcards";
import { getActiveMisconceptions } from "@/lib/learning-data";
import { getUserSettings } from "@/lib/user-settings";
import { requireWorkspaceRouteContext } from "@/lib/workspace-route-context";

const startOfUtcDay = (date: Date) =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );

const addUtcDays = (date: Date, days: number) =>
  new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days
    )
  );

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { session, workspace } = await requireWorkspaceRouteContext(
    "/workspace/chats" as Route
  );

  const query = await searchParams;
  const requestedSubject =
    typeof query.subject === "string" ? query.subject : undefined;
  const startDate = addUtcDays(startOfUtcDay(new Date()), -29);
  const emptyMastery: {
    concepts: ConceptMasteryRecord[];
    selectedSubject: null;
    subjects: ConceptMasterySubjectRecord[];
    weakestConcepts: ConceptMasteryRecord[];
  } = {
    concepts: [],
    selectedSubject: null,
    subjects: [],
    weakestConcepts: [],
  };
  const [
    chats,
    files,
    flashcardSets,
    reviewCounts,
    mastery,
    activeMisconceptions,
    flashcardDashboard,
    userSettings,
  ] = await Promise.all([
    listChatsForUser(session.user.id, workspace.workspaceId),
    listWorkspaceFiles(workspace.workspaceId, session.user.id).catch(
      (error) => {
        console.error("[dashboard] Failed to load workspace files", {
          error,
          userId: session.user.id,
          workspaceId: workspace.workspaceId,
        });
        return [];
      }
    ),
    listFlashcardSetSummariesForUser(session.user.id, workspace.workspaceId),
    listFlashcardReviewCountsByDayForUser(
      session.user.id,
      workspace.workspaceId,
      startDate
    ),
    getConceptMasteryDashboardData(
      session.user.id,
      workspace.workspaceId,
      requestedSubject
    ).catch((error) => {
      console.error("[dashboard] Failed to load concept mastery data", {
        error,
        userId: session.user.id,
        workspaceId: workspace.workspaceId,
      });
      return emptyMastery;
    }),
    getActiveMisconceptions({
      limit: 12,
      userId: session.user.id,
      workspaceId: workspace.workspaceId,
      subject: requestedSubject,
    }).catch((error) => {
      console.error("[dashboard] Failed to load active misconceptions", {
        error,
        userId: session.user.id,
        workspaceId: workspace.workspaceId,
      });
      return [];
    }),
    getFlashcardDashboardForUser(session.user.id, workspace.workspaceId).catch(
      (error) => {
        console.error("[dashboard] Failed to load flashcard dashboard data", {
          error,
          userId: session.user.id,
          workspaceId: workspace.workspaceId,
        });
        return null;
      }
    ),
    getUserSettings(session.user.id).catch((error) => {
      console.error("[dashboard] Failed to load user settings", {
        error,
        userId: session.user.id,
      });
      return {
        emailReceipts: true,
        onboardingCompleted: false,
      };
    }),
  ]);

  const countByDay = new Map(
    reviewCounts.map((entry) => [entry.day, entry.count])
  );
  const studySessions = Array.from({ length: 30 }, (_, index) => {
    const day = addUtcDays(startDate, index).toISOString().slice(0, 10);
    return {
      day,
      count: countByDay.get(day) ?? 0,
    };
  });
  const weakestDrillTarget = flashcardDashboard
    ? resolveWeakestConceptDrillTarget(
        flashcardDashboard,
        mastery.weakestConcepts
      )
    : null;

  return (
    <DashboardHome
      activeMisconceptions={activeMisconceptions}
      chats={chats}
      files={files}
      flashcardSets={flashcardSets}
      masteryConcepts={mastery.concepts}
      masterySelectedSubject={mastery.selectedSubject}
      masterySubjects={mastery.subjects}
      onboardingCompleted={userSettings.onboardingCompleted}
      rootFolderId={workspace.rootFolderId}
      studySessions={studySessions}
      userName={session.user.name ?? undefined}
      weakestConcepts={mastery.weakestConcepts}
      weakestDrillTarget={weakestDrillTarget}
      workspaceUuid={workspace.workspaceId}
    />
  );
}
