import { auth } from "@avenire/auth/server";
import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/shell";
import { FlashcardSetDetail } from "@/components/flashcards/set-detail";
import { getFacehashUrl } from "@/lib/avatar";
import { listChatsForUser } from "@/lib/chat-data";
import { resolveWorkspaceForUser } from "@/lib/file-data";
import {
  getFlashcardSetForUser,
  listDueFlashcardsForUser,
} from "@/lib/flashcards";

export default async function DashboardFlashcardSetPage({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  const { setId } = await params;
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

  const [chats, set, queue] = await Promise.all([
    listChatsForUser(session.user.id, workspace.workspaceId),
    getFlashcardSetForUser(session.user.id, workspace.workspaceId, setId),
    listDueFlashcardsForUser({
      limit: 20,
      setId,
      userId: session.user.id,
      workspaceId: workspace.workspaceId,
    }),
  ]);

  if (!set) {
    redirect("/dashboard/flashcards" as Route);
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
      <FlashcardSetDetail initialQueue={queue} initialSet={set} />
    </DashboardLayout>
  );
}
