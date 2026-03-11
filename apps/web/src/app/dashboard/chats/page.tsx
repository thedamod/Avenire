import { auth } from "@avenire/auth/server";
import type { UIMessage } from "@avenire/ai/message-types";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ChatWorkspace } from "@/components/dashboard/chat-workspace";
import { DashboardLayout } from "@/components/dashboard/shell";
import { getFacehashUrl } from "@/lib/avatar";
import {
  getChatBySlugForUser,
  getMessagesByChatSlugForUser,
  listChatsForUser,
} from "@/lib/chat-data";
import { resolveWorkspaceForUser } from "@/lib/file-data";

export default async function DashboardChatsIndexPage() {
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

  const chats = await listChatsForUser(session.user.id, workspace.workspaceId);
  const latestChat = chats[0];
  const [chat, initialMessages] = latestChat
    ? await Promise.all([
        getChatBySlugForUser(
          session.user.id,
          latestChat.slug,
          workspace.workspaceId
        ),
        getMessagesByChatSlugForUser(
          session.user.id,
          latestChat.slug,
          workspace.workspaceId
        ),
      ])
    : [null, []];

  return (
    <DashboardLayout
      activeChatSlug={chat?.slug ?? ""}
      initialChats={chats}
      user={{
        name: session.user.name ?? "User",
        email: session.user.email,
        avatar:
          session.user.image ??
          getFacehashUrl(session.user.name ?? session.user.email),
      }}
    >
      <ChatWorkspace
        chatSlug={chat?.slug ?? "new"}
        chatTitle={chat?.title ?? "New Chat"}
        initialMessages={(initialMessages ?? []) as UIMessage[]}
        isReadonly={false}
        workspaceUuid={workspace.workspaceId}
      />
    </DashboardLayout>
  );
}
