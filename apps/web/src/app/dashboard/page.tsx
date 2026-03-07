import { auth } from "@avenire/auth/server";
import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getOrCreateLatestChatForUser } from "@/lib/chat-data";

/**
 * Redirects the visitor to the authenticated user's latest chat or to the login page when not authenticated.
 *
 * If a user session exists, obtains (or creates) that user's latest chat and navigates to its chat route.
 * If no authenticated user is present, navigates to the login page.
 */
export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  const latestChat = await getOrCreateLatestChatForUser(session.user.id);
  redirect(`/dashboard/chats/${latestChat.slug}` as Route);
}
