import { auth } from "@avenire/auth/server";
import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getOrCreateLatestChatForUser } from "@/lib/chat-data";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  const latestChat = await getOrCreateLatestChatForUser(session.user.id);
  redirect(`/dashboard/chats/${latestChat.slug}` as Route);
}
