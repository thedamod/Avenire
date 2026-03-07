import { auth } from "@avenire/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createChatForUser } from "@/lib/chat-data";

/**
 * Retrieve the current authenticated session user using the request's headers.
 *
 * @returns The authenticated session user, or `null` if no session is present.
 */
async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

/**
 * Creates a new chat for the authenticated user from the request body.
 *
 * @param request - Incoming request; expects a JSON body with an optional `title` field
 * @returns A response containing the created `chat` with HTTP 201 on success, or `{ error: "Unauthorized" }` with HTTP 401 when no user is authenticated
 */
export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { title?: string };
  const chat = await createChatForUser(user.id, body.title);

  return NextResponse.json({ chat }, { status: 201 });
}
