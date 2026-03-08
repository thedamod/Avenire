import { auth } from "@avenire/auth/server";
import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { listChatsForUser } from "@/lib/chat-data";
import { resolveWorkspaceForUser } from "@/lib/file-data";

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
    redirect("/dashboard/chats/new" as Route);
  }

  const chats = await listChatsForUser(session.user.id, workspace.workspaceId);
  const latestChat = chats[0];
  if (latestChat) {
    redirect(`/dashboard/chats/${latestChat.slug}` as Route);
  }
  redirect("/dashboard/chats/new" as Route);
}
