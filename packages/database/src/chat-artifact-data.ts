import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "./client";
import { chatArtifact, chatThread } from "./schema";

export interface ChatArtifactRecord {
  id: string;
  chatSlug: string;
  sourceMessageId: string | null;
  toolName: string;
  kind: string;
  title: string;
  status: string;
  content: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

function mapArtifactRow(
  row: typeof chatArtifact.$inferSelect,
  slug: string,
): ChatArtifactRecord {
  return {
    id: row.id,
    chatSlug: slug,
    sourceMessageId: row.sourceMessageId ?? null,
    toolName: row.toolName,
    kind: row.kind,
    title: row.title,
    status: row.status,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function getOwnedChat(userId: string, slug: string) {
  const [thread] = await db
    .select({ id: chatThread.id, slug: chatThread.slug })
    .from(chatThread)
    .where(and(eq(chatThread.userId, userId), eq(chatThread.slug, slug)))
    .limit(1);

  return thread ?? null;
}

export async function createChatArtifactForChatSlug(input: {
  userId: string;
  chatSlug: string;
  sourceMessageId?: string | null;
  toolName: string;
  kind: string;
  title: string;
  status?: string;
  content: Record<string, unknown>;
}) {
  const chat = await getOwnedChat(input.userId, input.chatSlug);
  if (!chat) {
    return null;
  }

  const now = new Date();
  const [created] = await db
    .insert(chatArtifact)
    .values({
      id: randomUUID(),
      chatId: chat.id,
      userId: input.userId,
      sourceMessageId: input.sourceMessageId ?? null,
      toolName: input.toolName,
      kind: input.kind,
      title: input.title,
      status: input.status ?? "completed",
      content: input.content,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created ? mapArtifactRow(created, chat.slug) : null;
}

export async function listChatArtifactsByChatSlugForUser(input: {
  userId: string;
  chatSlug: string;
  kind?: string;
}) {
  const chat = await getOwnedChat(input.userId, input.chatSlug);
  if (!chat) {
    return null;
  }

  const whereClause = input.kind
    ? and(eq(chatArtifact.chatId, chat.id), eq(chatArtifact.kind, input.kind))
    : eq(chatArtifact.chatId, chat.id);

  const rows = await db
    .select()
    .from(chatArtifact)
    .where(whereClause)
    .orderBy(desc(chatArtifact.createdAt));

  return rows.map((row) => mapArtifactRow(row, chat.slug));
}

export async function upsertCanvasArtifactForChatSlug(input: {
  userId: string;
  chatSlug: string;
  scene: Record<string, unknown>;
  title?: string;
}) {
  const chat = await getOwnedChat(input.userId, input.chatSlug);
  if (!chat) {
    return null;
  }

  const [existing] = await db
    .select()
    .from(chatArtifact)
    .where(
      and(
        eq(chatArtifact.chatId, chat.id),
        eq(chatArtifact.kind, "canvas"),
        eq(chatArtifact.toolName, "excalidraw"),
      ),
    )
    .orderBy(desc(chatArtifact.updatedAt))
    .limit(1);

  const now = new Date();

  if (existing) {
    const [updated] = await db
      .update(chatArtifact)
      .set({
        title: input.title ?? existing.title,
        content: input.scene,
        status: "completed",
        updatedAt: now,
      })
      .where(eq(chatArtifact.id, existing.id))
      .returning();

    return updated ? mapArtifactRow(updated, chat.slug) : null;
  }

  const [created] = await db
    .insert(chatArtifact)
    .values({
      id: randomUUID(),
      chatId: chat.id,
      userId: input.userId,
      sourceMessageId: null,
      toolName: "excalidraw",
      kind: "canvas",
      title: input.title ?? "Whiteboard",
      status: "completed",
      content: input.scene,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created ? mapArtifactRow(created, chat.slug) : null;
}

export async function getLatestCanvasArtifactForChatSlug(input: {
  userId: string;
  chatSlug: string;
}) {
  const chat = await getOwnedChat(input.userId, input.chatSlug);
  if (!chat) {
    return null;
  }

  const [row] = await db
    .select()
    .from(chatArtifact)
    .where(
      and(
        eq(chatArtifact.chatId, chat.id),
        eq(chatArtifact.kind, "canvas"),
        eq(chatArtifact.toolName, "excalidraw"),
      ),
    )
    .orderBy(desc(chatArtifact.updatedAt))
    .limit(1);

  return row ? mapArtifactRow(row, chat.slug) : null;
}
