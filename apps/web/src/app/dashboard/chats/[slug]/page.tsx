import type { UIMessage } from "@avenire/ai/message-types";
import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ChatWorkspace } from "@/components/dashboard/chat-workspace";
import {
  getChatBySlugForUser,
  getMessagesByChatSlugForUser,
} from "@/lib/chat-data";
import { buildPageMetadata } from "@/lib/page-metadata";
import { getWorkspaceRouteContext } from "@/lib/workspace-route-context";

const getChatRouteContext = cache(async (slug: string) => {
  const { session, workspace } = await getWorkspaceRouteContext();
  if (!(session?.user && workspace)) {
    return { session: null, workspace: null, chat: null, slug };
  }

  if (slug === "new") {
    return { session, workspace, chat: null, slug };
  }

  const chat = await getChatBySlugForUser(
    session.user.id,
    slug,
    workspace.workspaceId
  );

  return { session, workspace, chat, slug };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const context = await getChatRouteContext(slug);

  if (!context.chat) {
    return buildPageMetadata({
      title: slug === "new" ? "New Chat" : "Chat",
    });
  }

  return buildPageMetadata({
    title: context.chat.title,
  });
}

export default async function DashboardChatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { session, workspace } = await getWorkspaceRouteContext();

  if (!(session?.user && workspace)) {
    redirect("/workspace" as Route);
  }

  if (slug === "new") {
    return (
      <ChatWorkspace
        chatIcon={null}
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

  const [chat, initialMessages] = await Promise.all([
    getChatBySlugForUser(session.user.id, slug, workspace.workspaceId),
    getMessagesByChatSlugForUser(session.user.id, slug, workspace.workspaceId),
  ]);

  if (!chat) {
    redirect("/workspace" as Route);
  }

  return (
    <ChatWorkspace
      chatIcon={chat.icon ?? null}
      chatSlug={chat.slug}
      chatTitle={chat.title}
      initialMessages={(initialMessages ?? []) as UIMessage[]}
      initialPrompt={null}
      isReadonly={Boolean(chat.readOnly)}
      userName={session.user.name ?? undefined}
      workspaceUuid={workspace.workspaceId}
    />
  );
}
