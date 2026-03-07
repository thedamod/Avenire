import { auth } from "@avenire/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { listChatsForUser } from "@/lib/chat-data";

/**
 * Handle GET requests for the authenticated user's chat history.
 *
 * Returns a 401 Unauthorized JSON response when no user session is found; otherwise returns a JSON response containing the user's chats.
 *
 * @returns A NextResponse with `{ error: "Unauthorized" }` and HTTP status 401 if the request is unauthenticated; otherwise a NextResponse with `{ chats }` where `chats` is the array of chats for the authenticated user.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const chats = await listChatsForUser(session.user.id);
  return NextResponse.json({ chats });
}
