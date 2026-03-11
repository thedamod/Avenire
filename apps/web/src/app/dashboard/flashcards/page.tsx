import { auth } from "@avenire/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/shell";
import { FlashcardsDashboard } from "@/components/flashcards/dashboard";
import { getFacehashUrl } from "@/lib/avatar";
import { listChatsForUser } from "@/lib/chat-data";
import { resolveWorkspaceForUser } from "@/lib/file-data";
import { getFlashcardDashboardForUser } from "@/lib/flashcards";

export default async function DashboardFlashcardsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  const activeOrganizationId =
    (session as { session?: { activeOrganizationId?: string | null } }).session
      ?.activeOrganizationId ?? null;
  const workspace = await resolveWorkspaceForUser(
    session.user.id,
    activeOrganizationId
  );

  if (!workspace) {
    redirect("/dashboard");
  }

  const [chats, dashboard] = await Promise.all([
    listChatsForUser(session.user.id, workspace.workspaceId),
    getFlashcardDashboardForUser(session.user.id, workspace.workspaceId),
  ]);

  if (!dashboard) {
    redirect("/dashboard");
  }

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
      <FlashcardsDashboard initialDashboard={dashboard} />
    </DashboardLayout>
  );
}
