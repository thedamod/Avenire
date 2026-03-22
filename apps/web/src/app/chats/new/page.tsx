import { auth } from "@avenire/auth/server";
import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function ChatsNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const query = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") {
      params.set(key, value);
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") {
          params.append(key, item);
        }
      }
    }
  }

  const suffix = params.toString();
  redirect(`/workspace/chats/new${suffix ? `?${suffix}` : ""}` as Route);
}
