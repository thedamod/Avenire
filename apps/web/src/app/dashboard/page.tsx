import type { Route } from "next";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import {
  getFlashcardDashboardForUser,
  getWeakestConcepts,
  listFlashcardSetSummariesForUser,
  resolveWeakestConceptDrillTarget,
} from "@/lib/flashcards";
import { getActiveMisconceptions } from "@/lib/learning-data";
import { buildPageMetadata } from "@/lib/page-metadata";
import { requireWorkspaceRouteContext } from "@/lib/workspace-route-context";

export const metadata = buildPageMetadata({
  title: "Workspace",
});

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
  const [
    flashcardSets,
    weakestConcepts,
    activeMisconceptions,
    flashcardDashboard,
  ] = await Promise.all([
    listFlashcardSetSummariesForUser(session.user.id, workspace.workspaceId),
    getWeakestConcepts(session.user.id, workspace.workspaceId, {
      limit: 5,
      subject: requestedSubject,
    }).catch((error) => {
      console.error("[dashboard] Failed to load weakest concepts", {
        error,
        userId: session.user.id,
        workspaceId: workspace.workspaceId,
        requestedSubject,
      });
      return [];
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
  ]);
  const weakestDrillTarget = flashcardDashboard
    ? resolveWeakestConceptDrillTarget(flashcardDashboard, weakestConcepts)
    : null;

  return (
    <DashboardHome
      activeMisconceptions={activeMisconceptions}
      flashcardSets={flashcardSets}
      userName={session.user.name ?? undefined}
      weakestConcepts={weakestConcepts}
      weakestDrillTarget={weakestDrillTarget}
    />
  );
}
