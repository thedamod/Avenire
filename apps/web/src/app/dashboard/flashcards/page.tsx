import type { Route } from "next";
import { redirect } from "next/navigation";
import { FlashcardsDashboard } from "@/components/flashcards/dashboard";
import { getFlashcardDashboardForUser } from "@/lib/flashcards";
import { requireWorkspaceRouteContext } from "@/lib/workspace-route-context";

export default async function DashboardFlashcardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { session, workspace } = await requireWorkspaceRouteContext(
    "/workspace" as Route
  );

  const dashboard = await getFlashcardDashboardForUser(
    session.user.id,
    workspace.workspaceId
  );

  if (!dashboard) {
    redirect("/workspace" as Route);
  }

  const query = await searchParams;
  const generationRequest =
    typeof query.generate === "string" && query.generate === "onboarding"
      ? {
          concept:
            typeof query.concept === "string" && query.concept.trim()
              ? query.concept.trim()
              : "Concept check",
          count: 5,
          reason:
            typeof query.reason === "string" && query.reason.trim()
              ? query.reason.trim()
              : "This concept surfaced during onboarding.",
          subject:
            typeof query.subject === "string" && query.subject.trim()
              ? query.subject.trim()
              : "General",
          title:
            typeof query.title === "string" && query.title.trim()
              ? query.title.trim()
              : undefined,
          topic:
            typeof query.topic === "string" && query.topic.trim()
              ? query.topic.trim()
              : "Review",
        }
      : null;

  return (
    <FlashcardsDashboard
      generationRequest={generationRequest}
      initialDashboard={dashboard}
    />
  );
}
