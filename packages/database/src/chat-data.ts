import type { UIMessage } from "../../ai/message-type";
import { and, asc, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "./client";
import { chatMessage, chatThread } from "./schema";

export interface ChatSummary {
  id: string;
  slug: string;
  branching: string | null;
  title: string;
  pinned: boolean;
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

/**
 * Retrieves summaries of chats owned by the given user, ordered by pinned status and recent activity.
 *
 * @param userId - ID of the user whose chats to list
 * @returns An array of ChatSummary objects with pinned chats first and then sorted by most recent message time
 */
export async function listChatsForUser(userId: string) {
  const threads = await db
    .select()
    .from(chatThread)
    .where(eq(chatThread.userId, userId))
    .orderBy(desc(chatThread.pinned), desc(chatThread.lastMessageAt));

  return threads.map(mapChatSummary);
}

/**
 * Create a new chat thread for the given user with a sanitized title and initial timestamps.
 *
 * @param title - Optional title for the chat; it is trimmed, truncated to 120 characters, and if empty set to "New Chat"
 * @returns A ChatSummary representing the newly created chat thread
 */
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

/**
 * Creates a branched copy of a user's chat thread and duplicates its messages into the new thread.
 *
 * @returns The created `ChatSummary` for the branched thread, or `null` if the source thread was not found.
 */
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

/**
 * Fetches a user's chat thread by slug and returns its public summary.
 *
 * @param userId - ID of the user who owns the chat
 * @param slug - The chat thread's slug
 * @returns The chat's summary as `ChatSummary` if found, `null` otherwise
 */
export async function getChatBySlugForUser(userId: string, slug: string) {
  const [thread] = await db
    .select()
    .from(chatThread)
    .where(and(eq(chatThread.userId, userId), eq(chatThread.slug, slug)))
    .limit(1);

  return thread ? mapChatSummary(thread) : null;
}

/**
 * Retrieve a chat thread by its slug across all users.
 *
 * @param slug - The unique slug identifier of the chat thread
 * @returns The chat summary for the matching thread, or `null` if no thread is found
 */
export async function getChatBySlug(slug: string) {
  const [thread] = await db
    .select()
    .from(chatThread)
    .where(eq(chatThread.slug, slug))
    .limit(1);

  return thread ? mapChatSummary(thread) : null;
}

/**
 * Retrieves the messages for a user's chat identified by slug, ordered by position.
 *
 * @param userId - ID of the owning user
 * @param slug - Chat thread slug scoped to the user
 * @returns An array of `UIMessage` objects ordered by message position, or `null` if the chat doesn't exist.
 */
export async function getMessagesByChatSlugForUser(
  userId: string,
  slug: string,
) {
  const [thread] = await db
    .select({ id: chatThread.id })
    .from(chatThread)
    .where(and(eq(chatThread.userId, userId), eq(chatThread.slug, slug)))
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

/**
 * Retrieve ordered UI messages for a chat identified by its slug.
 *
 * @param slug - The chat thread slug
 * @returns `UIMessage[]` of messages ordered by `position`, or `null` if no chat with the given `slug` exists
 */
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

/**
 * Update a user's chat thread title and/or pinned state.
 *
 * @param userId - ID of the owner of the chat thread
 * @param slug - Slug identifying the chat thread
 * @param updates - Fields to update; if `title` is provided it will be sanitized (trimmed and truncated to the configured maximum)
 * @returns The updated ChatSummary, or `null` if no matching thread was found
 */
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

/**
 * Delete a user's chat thread identified by its slug.
 *
 * @returns `true` if a chat thread was deleted, `false` otherwise.
 */
export async function deleteChatForUser(userId: string, slug: string) {
  const [deleted] = await db
    .delete(chatThread)
    .where(and(eq(chatThread.userId, userId), eq(chatThread.slug, slug)))
    .returning();

  return Boolean(deleted);
}

/**
 * Replace a user's chat messages for the thread identified by `slug` and return the updated chat summary.
 *
 * @param userId - The ID of the chat owner
 * @param slug - The slug identifying the chat thread for the user
 * @param messages - Ordered array of `UIMessage` objects to save as the thread's messages
 * @returns The updated `ChatSummary` for the thread, or `null` if the thread was not found
 */
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

/**
 * Get the user's most recent chat summary, creating a new chat if the user has none.
 *
 * @returns The user's latest ChatSummary; if none exists, a newly created ChatSummary
 */
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
