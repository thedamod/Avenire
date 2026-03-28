import type { Route } from "next";
import { ChatWorkspace } from "@/components/dashboard/chat-workspace";
import { buildPageMetadata } from "@/lib/page-metadata";
import { requireWorkspaceRouteContext } from "@/lib/workspace-route-context";

export const metadata = buildPageMetadata({
  title: "Chats",
});

export default async function DashboardChatsIndexPage() {
  const { session, workspace } = await requireWorkspaceRouteContext(
    "/workspace" as Route
  );

  return (
    <ChatWorkspace
      chatSlug="new"
      chatTitle="New Method"
      initialMessages={[]}
      initialPrompt={null}
      isReadonly={false}
      userName={session.user.name ?? undefined}
      workspaceUuid={workspace.workspaceId}
    />
  );
}
