import { auth } from "@avenire/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ChatWorkspace } from "@/components/dashboard/chat-workspace";
import { resolveWorkspaceForUser } from "@/lib/file-data";
import { buildPageMetadata } from "@/lib/page-metadata";

export const metadata = buildPageMetadata({
  title: "New Method",
});

export default async function WorkspaceChatsNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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
    redirect("/workspace");
  }

  const query = await searchParams;
  const initialPrompt =
    typeof query.prompt === "string" ? query.prompt.trim() : "";

  return (
    <ChatWorkspace
      chatIcon={null}
      chatSlug="new"
      chatTitle="New Method"
      initialMessages={[]}
      initialPrompt={initialPrompt || null}
      isReadonly={false}
      userName={session.user.name ?? undefined}
      workspaceUuid={workspace.workspaceId}
    />
  );
}
