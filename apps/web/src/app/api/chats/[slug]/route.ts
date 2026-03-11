import { auth } from "@avenire/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  branchChatForUser,
  deleteChatForUser,
  getChatBySlugForUser,
  getMessagesByChatSlugForUser,
  isChatOwnerForUser,
  updateChatForUser
} from "@/lib/chat-data";

async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await context.params;
  const chat = await getChatBySlugForUser(user.id, slug);
  const isOwner = await isChatOwnerForUser(user.id, slug, chat?.workspaceId);
  if (!isOwner) {
    return NextResponse.json({ error: "Read-only chat" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    pinned?: boolean;
  };

  const updated = await updateChatForUser(user.id, slug, {
    title: body.title,
    pinned: body.pinned
  }, chat?.workspaceId);

  if (!updated) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  return NextResponse.json({ chat: updated });
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await context.params;
  const existing = await getChatBySlugForUser(user.id, slug);
  const isOwner = await isChatOwnerForUser(user.id, slug, existing?.workspaceId);
  if (!isOwner) {
    return NextResponse.json({ error: "Read-only chat" }, { status: 403 });
  }
  const chat = await branchChatForUser(user.id, slug, existing?.workspaceId);

  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  return NextResponse.json({ chat }, { status: 201 });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await context.params;
  const existing = await getChatBySlugForUser(user.id, slug);
  const isOwner = await isChatOwnerForUser(user.id, slug, existing?.workspaceId);
  if (!isOwner) {
    return NextResponse.json({ error: "Read-only chat" }, { status: 403 });
  }
  const deleted = await deleteChatForUser(user.id, slug, existing?.workspaceId);

  if (!deleted) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
