import { auth } from "@avenire/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function ChatsNewPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  redirect("/dashboard/chats");
}
