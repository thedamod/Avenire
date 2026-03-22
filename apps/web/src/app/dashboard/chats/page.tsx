import type { Route } from "next";
import { ChatWorkspace } from "@/components/dashboard/chat-workspace";
import { requireWorkspaceRouteContext } from "@/lib/workspace-route-context";

export default async function DashboardChatsIndexPage() {
  const { session, workspace } = await requireWorkspaceRouteContext(
    "/workspace" as Route
  );

  return (
    <ChatWorkspace
      chatSlug="new"
      chatTitle="New Chat"
      initialMessages={[]}
      initialPrompt={null}
      isReadonly={false}
      userName={session.user.name ?? undefined}
      workspaceUuid={workspace.workspaceId}
    />
  );
}
