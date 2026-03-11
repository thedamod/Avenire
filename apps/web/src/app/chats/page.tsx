import { auth } from "@avenire/auth/server";
import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function ChatsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  redirect("/dashboard/chats" as Route);
}
