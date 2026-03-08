import type { UIMessage } from "../../ai/message-type";
import { and, asc, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "./client";
import { chatMessage, chatThread, resourceShareGrant } from "./schema";

export interface ChatSummary {
  id: string;
  slug: string;
  branching: string | null;
  title: string;
  pinned: boolean;
  readOnly?: boolean;
  ownerUserId?: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
}

type ChatSummaryRecord = Pick<
  typeof chatThread.$inferSelect,
  | "id"
  | "slug"
  | "branching"
  | "title"
  | "pinned"
  | "createdAt"
  | "updatedAt"
  | "lastMessageAt"
>;

const mapChatSummary = (thread: ChatSummaryRecord): ChatSummary => ({
  id: thread.id,
  slug: thread.slug,
  branching: thread.branching ?? null,
  title: thread.title,
  pinned: thread.pinned,
  createdAt: thread.createdAt.toISOString(),
  updatedAt: thread.updatedAt.toISOString(),
  lastMessageAt: thread.lastMessageAt.toISOString(),
});

const sanitizeTitle = (title?: string | null) => {
  const clean = title?.trim();
  return clean?.length ? clean.slice(0, 120) : "New Chat";
};

export async function listChatsForUser(userId: string) {
  const ownedThreads = await db
    .select()
    .from(chatThread)
    .where(eq(chatThread.userId, userId))
    .orderBy(desc(chatThread.pinned), desc(chatThread.lastMessageAt));

  const grantedThreads = await db
    .select({ thread: chatThread })
    .from(resourceShareGrant)
    .innerJoin(chatThread, eq(chatThread.slug, resourceShareGrant.resourceId))
    .where(
      and(
        eq(resourceShareGrant.resourceType, "chat"),
        eq(resourceShareGrant.granteeUserId, userId),
      ),
    )
    .orderBy(desc(chatThread.lastMessageAt));

  const merged = new Map<string, ChatSummary>();
  for (const thread of ownedThreads) {
    merged.set(thread.slug, {
      ...mapChatSummary(thread),
      readOnly: false,
      ownerUserId: thread.userId,
    });
  }
  for (const row of grantedThreads) {
    if (merged.has(row.thread.slug)) {
      continue;
    }
    merged.set(row.thread.slug, {
      ...mapChatSummary(row.thread),
      readOnly: true,
      ownerUserId: row.thread.userId,
    });
  }

  return Array.from(merged.values()).sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });
}

export async function createChatForUser(userId: string, title?: string) {
  const now = new Date();
  const cleanTitle = sanitizeTitle(title);
  const slug = randomUUID();
  const newThread: typeof chatThread.$inferInsert = {
    id: randomUUID(),
    userId,
    slug,
    branching: null,
    title: cleanTitle,
    pinned: false,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
  };

  const [thread] = await db.insert(chatThread).values(newThread).returning();
  return mapChatSummary(thread);
}

export async function branchChatForUser(userId: string, slug: string) {
  const [source] = await db
    .select()
    .from(chatThread)
    .where(and(eq(chatThread.userId, userId), eq(chatThread.slug, slug)))
    .limit(1);

  if (!source) {
    return null;
  }

  const now = new Date();
  const branchedSlug = randomUUID();
  const [branched] = await db
    .insert(chatThread)
    .values({
      id: randomUUID(),
      userId,
      slug: branchedSlug,
      branching: source.id,
      title: source.title,
      pinned: false,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    })
    .returning();

  const sourceMessages = await db
    .select()
    .from(chatMessage)
    .where(eq(chatMessage.chatId, source.id))
    .orderBy(asc(chatMessage.position));

  if (sourceMessages.length > 0) {
    await db.insert(chatMessage).values(
      sourceMessages.map((message) => ({
        id: randomUUID(),
        chatId: branched.id,
        position: message.position,
        role: message.role,
        payload: message.payload,
        createdAt: now,
      })),
    );
  }

  return mapChatSummary(branched);
}

export async function getChatBySlugForUser(userId: string, slug: string) {
  const [thread] = await db
    .select()
    .from(chatThread)
    .where(and(eq(chatThread.userId, userId), eq(chatThread.slug, slug)))
    .limit(1);

  if (thread) {
    return {
      ...mapChatSummary(thread),
      readOnly: false,
      ownerUserId: thread.userId,
    };
  }

  const [granted] = await db
    .select({ thread: chatThread })
    .from(resourceShareGrant)
    .innerJoin(chatThread, eq(chatThread.slug, resourceShareGrant.resourceId))
    .where(
      and(
        eq(resourceShareGrant.resourceType, "chat"),
        eq(resourceShareGrant.granteeUserId, userId),
        eq(chatThread.slug, slug),
      ),
    )
    .limit(1);

  if (!granted) {
    return null;
  }

  return {
    ...mapChatSummary(granted.thread),
    readOnly: true,
    ownerUserId: granted.thread.userId,
  };
}

export async function getChatBySlug(slug: string) {
  const [thread] = await db
    .select()
    .from(chatThread)
    .where(eq(chatThread.slug, slug))
    .limit(1);

  return thread ? mapChatSummary(thread) : null;
}

export async function getMessagesByChatSlugForUser(
  userId: string,
  slug: string,
) {
  const chat = await getChatBySlugForUser(userId, slug);
  if (!chat) {
    return null;
  }

  const rows = await db
    .select()
    .from(chatMessage)
    .where(eq(chatMessage.chatId, chat.id))
    .orderBy(asc(chatMessage.position));

  return rows.map((row) => row.payload as unknown as UIMessage);
}

export async function isChatOwnerForUser(userId: string, slug: string) {
  const [thread] = await db
    .select({ id: chatThread.id })
    .from(chatThread)
    .where(and(eq(chatThread.userId, userId), eq(chatThread.slug, slug)))
    .limit(1);

  return Boolean(thread);
}

export async function getMessagesByChatSlug(slug: string) {
  const [thread] = await db
    .select({ id: chatThread.id })
    .from(chatThread)
    .where(eq(chatThread.slug, slug))
    .limit(1);

  if (!thread) {
    return null;
  }

  const rows = await db
    .select()
    .from(chatMessage)
    .where(eq(chatMessage.chatId, thread.id))
    .orderBy(asc(chatMessage.position));

  return rows.map((row) => row.payload as unknown as UIMessage);
}

export async function updateChatForUser(
  userId: string,
  slug: string,
  updates: { title?: string; pinned?: boolean },
) {
  const nextTitle = updates.title ? sanitizeTitle(updates.title) : undefined;

  const [thread] = await db
    .update(chatThread)
    .set({
      ...(nextTitle ? { title: nextTitle } : {}),
      ...(typeof updates.pinned === "boolean"
        ? { pinned: updates.pinned }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(chatThread.userId, userId), eq(chatThread.slug, slug)))
    .returning();

  return thread ? mapChatSummary(thread) : null;
}

export async function deleteChatForUser(userId: string, slug: string) {
  const [deleted] = await db
    .delete(chatThread)
    .where(and(eq(chatThread.userId, userId), eq(chatThread.slug, slug)))
    .returning();

  return Boolean(deleted);
}

export async function saveMessagesForChatSlug(
  userId: string,
  slug: string,
  messages: UIMessage[],
) {
  const [thread] = await db
    .select()
    .from(chatThread)
    .where(and(eq(chatThread.userId, userId), eq(chatThread.slug, slug)))
    .limit(1);

  if (!thread) {
    return null;
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.delete(chatMessage).where(eq(chatMessage.chatId, thread.id));

    if (messages.length > 0) {
      await tx.insert(chatMessage).values(
        messages.map((message, index) => ({
          id: message.id,
          chatId: thread.id,
          position: index,
          role: message.role,
          payload: message as unknown as Record<string, unknown>,
          createdAt: now,
        })),
      );
    }

    await tx
      .update(chatThread)
      .set({
        updatedAt: now,
        lastMessageAt: now,
      })
      .where(eq(chatThread.id, thread.id));
  });

  const [updated] = await db
    .select()
    .from(chatThread)
    .where(eq(chatThread.id, thread.id))
    .limit(1);

  return updated ? mapChatSummary(updated) : null;
}

export async function getOrCreateLatestChatForUser(userId: string) {
  const [latest] = await db
    .select()
    .from(chatThread)
    .where(eq(chatThread.userId, userId))
    .orderBy(desc(chatThread.pinned), desc(chatThread.lastMessageAt))
    .limit(1);

  if (latest) {
    return mapChatSummary(latest);
  }

  return createChatForUser(userId);
}
