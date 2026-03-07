import type { Metadata } from "next";
import type { UIMessage } from "@avenire/ai/message-types";
import { auth } from "@avenire/auth/server";
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
import { buildPageMetadata } from "@/lib/page-metadata";

/**
 * Build metadata for a chat page using the authenticated user's chat title.
 *
 * @param params - A promise that resolves to an object with `slug`, the chat identifier
 * @returns Page metadata with `title` set to the chat's trimmed title when available, otherwise `"Chat"`
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return buildPageMetadata({ title: "Chat" });
  }

  const { slug } = await params;
  const chat = await getChatBySlugForUser(session.user.id, slug);

  return buildPageMetadata({
    title: chat?.title?.trim() || "Chat",
  });
}

/**
 * Render the dashboard chat page for a given chat slug.
 *
 * Authenticates the request and:
 * - Redirects to "/login" if the user is not authenticated.
 * - Loads the chat, the user's chat list, and the chat's initial messages.
 * - Redirects to "/dashboard" if the requested chat does not exist.
 *
 * The rendered layout receives the active chat slug, the user's chats, and
 * a user object (name, email, avatar). The workspace receives the chat slug,
 * chat title, initial messages, and a read-only flag derived from the chat.
 *
 * @param params - An object with a `slug` promise resolving to the chat's slug.
 * @returns The page React element for the dashboard chat view.
 */
export default async function DashboardChatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  const { slug } = await params;
  const [chat, chats, initialMessages] = await Promise.all([
    getChatBySlugForUser(session.user.id, slug),
    listChatsForUser(session.user.id),
    getMessagesByChatSlugForUser(session.user.id, slug),
  ]);

  if (!chat) {
    redirect("/dashboard");
  }

  return (
    <DashboardLayout
      activeChatSlug={chat.slug}
      initialChats={chats}
      user={{
        name: session.user.name ?? "User",
        email: session.user.email,
        avatar: session.user.image ?? getFacehashUrl(session.user.name ?? session.user.email),
      }}
    >
      <ChatWorkspace
        chatSlug={chat.slug}
        chatTitle={chat.title}
        initialMessages={(initialMessages ?? []) as UIMessage[]}
        isReadonly={Boolean(chat.readOnly)}
      />
    </DashboardLayout>
  );
}
