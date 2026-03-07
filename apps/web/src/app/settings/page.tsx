import type { Metadata } from "next";
import { auth } from "@avenire/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/shell";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { getFacehashUrl } from "@/lib/avatar";
import { listChatsForUser } from "@/lib/chat-data";
import { listWorkspacesForUser } from "@/lib/file-data";
import { buildPageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Settings",
  description: "Manage your account, workspace, billing, and security settings.",
});

/**
 * Render the Settings page for an authenticated user.
 *
 * If the user is not authenticated, redirects to "/login".
 *
 * @returns The JSX element rendering the dashboard layout populated with the user's chats, workspaces, and profile.
 */
export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  const [chats, workspaces] = await Promise.all([
    listChatsForUser(session.user.id),
    listWorkspacesForUser(session.user.id),
  ]);

  return (
    <DashboardLayout
      activeChatSlug={chats[0]?.slug ?? ""}
      initialChats={chats}
      user={{
        name: session.user.name ?? "User",
        email: session.user.email,
        avatar: session.user.image ?? getFacehashUrl(session.user.name ?? session.user.email),
      }}
    >
      <SettingsPanel initialWorkspaces={workspaces} />
    </DashboardLayout>
  );
}
