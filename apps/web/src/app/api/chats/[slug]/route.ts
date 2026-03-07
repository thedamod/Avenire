import { auth } from "@avenire/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  branchChatForUser,
  deleteChatForUser,
  getChatBySlugForUser,
  getMessagesByChatSlugForUser,
  updateChatForUser
} from "@/lib/chat-data";

/**
 * Retrieve the current authenticated user from the active session.
 *
 * @returns The authenticated user object, or `null` if no active session exists.
 */
async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

/**
 * Retrieve a chat identified by slug for the authenticated user and return it with its messages.
 *
 * Returns JSON `{ chat, messages }` when the chat is found. If the request is unauthenticated, returns JSON `{ error: "Unauthorized" }` with HTTP status 401. If the chat does not exist for the user, returns JSON `{ error: "Chat not found" }` with HTTP status 404.
 *
 * @returns JSON response containing the chat and its messages on success, or an `{ error: string }` object with an appropriate HTTP status on failure.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await context.params;
  const chat = await getChatBySlugForUser(user.id, slug);

  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const messages = (await getMessagesByChatSlugForUser(user.id, slug)) ?? [];

  return NextResponse.json({ chat, messages });
}

/**
 * Update a chat's title and/or pinned state for the authenticated user.
 *
 * Updates the chat identified by the route `slug` using `title` and/or `pinned`
 * fields from the request body.
 *
 * @returns A JSON response containing `{ chat }` with the updated chat on success.
 * Responds with a 401 status and `{ error: "Unauthorized" }` if no authenticated user,
 * or a 404 status and `{ error: "Chat not found" }` if the chat does not exist.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    pinned?: boolean;
  };

  const chat = await updateChatForUser(user.id, slug, {
    title: body.title,
    pinned: body.pinned
  });

  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  return NextResponse.json({ chat });
}

/**
 * Branches (creates or retrieves) a chat for the authenticated user identified by the route `slug` and returns the chat.
 *
 * @param _request - The incoming HTTP request (unused).
 * @param context - Route context containing `params.slug`, the chat identifier.
 * @returns JSON response containing the `chat` when successful (HTTP 201), or an error object with an `error` message on failure (HTTP 401 for unauthorized, HTTP 404 for not found).
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await context.params;
  const chat = await branchChatForUser(user.id, slug);

  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  return NextResponse.json({ chat }, { status: 201 });
}

/**
 * Delete the chat with the given slug for the authenticated user.
 *
 * @returns A JSON HTTP response: `{"ok": true}` on successful deletion; `{"error": "Unauthorized"}` with HTTP 401 if the requester is not authenticated; `{"error": "Chat not found"}` with HTTP 404 if the chat does not exist for the user.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await context.params;
  const deleted = await deleteChatForUser(user.id, slug);

  if (!deleted) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
