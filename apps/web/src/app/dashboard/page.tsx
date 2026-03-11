import { auth } from "@avenire/auth/server";
import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardOverview } from "@/components/dashboard/overview";
import { DashboardLayout } from "@/components/dashboard/shell";
import { getFacehashUrl } from "@/lib/avatar";
import { listChatsForUser } from "@/lib/chat-data";
import { resolveWorkspaceForUser, listWorkspaceFiles } from "@/lib/file-data";
import { listFlashcardSetSummariesForUser } from "@/lib/flashcards";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  const activeOrganizationId =
    (session as { session?: { activeOrganizationId?: string | null } }).session
      ?.activeOrganizationId ?? null;
  const workspace = await resolveWorkspaceForUser(session.user.id, activeOrganizationId);
  if (!workspace) {
    redirect("/dashboard/chats" as Route);
  }

  const [chats, files, flashcardSets] = await Promise.all([
    listChatsForUser(session.user.id, workspace.workspaceId),
    listWorkspaceFiles(workspace.workspaceId, session.user.id),
    listFlashcardSetSummariesForUser(session.user.id, workspace.workspaceId),
  ]);

  return (
    <DashboardLayout
      activeChatSlug={chats[0]?.slug ?? ""}
      initialChats={chats}
      user={{
        name: session.user.name ?? "User",
        email: session.user.email,
        avatar:
          session.user.image ??
          getFacehashUrl(session.user.name ?? session.user.email),
      }}
    >
      <DashboardOverview chats={chats} files={files} flashcardSets={flashcardSets} />
    </DashboardLayout>
  );
}
