import { createClient, type RedisClientType } from "redis";

const redisUrl = process.env.REDIS_URL;
const ACTIVE_STREAM_KEY_PREFIX = "chat-active-stream:";

let redisClient: RedisClientType | null = null;
let redisSubscriber: RedisClientType | null = null;

/**
 * Determines whether a Redis URL is configured via the `REDIS_URL` environment variable.
 *
 * @returns `true` if a Redis URL is set, `false` otherwise.
 */
function hasRedisConfigured() {
  return Boolean(redisUrl);
}

/**
 * Provides a connected Redis client for the chat stream store.
 *
 * Ensures a Redis client instance exists and is connected before returning it.
 *
 * @returns The Redis client instance connected to the configured Redis URL.
 * @throws If REDIS_URL is not configured.
 */
export async function getRedisClient() {
  if (!redisUrl) {
    throw new Error("REDIS_URL is not configured");
  }

  if (!redisClient) {
    redisClient = createClient({ url: redisUrl });
    redisClient.on("error", (error) => {
      console.error("Redis client error in chat-stream-store", error);
    });
  }

  if (!redisClient.isOpen) {
    await redisClient.connect();
  }

  return redisClient;
}

/**
 * Obtain a connected Redis client configured as the subscriber for the chat stream store.
 *
 * @returns The connected Redis client used for subscribing to Redis events.
 * @throws If REDIS_URL is not configured.
 */
export async function getRedisSubscriber() {
  if (!redisUrl) {
    throw new Error("REDIS_URL is not configured");
  }

  if (!redisSubscriber) {
    redisSubscriber = createClient({ url: redisUrl });
    redisSubscriber.on("error", (error) => {
      console.error("Redis subscriber error in chat-stream-store", error);
    });
  }

  if (!redisSubscriber.isOpen) {
    await redisSubscriber.connect();
  }

  return redisSubscriber;
}

/**
 * Retrieve the active stream ID for a chat from Redis.
 *
 * @param chatId - The chat identifier used to form the Redis key
 * @returns The active stream ID for the chat, or `null` if none is set or Redis is unavailable
 */
export async function getActiveStreamId(chatId: string) {
  if (!hasRedisConfigured()) {
    return null;
  }

  try {
    const client = await getRedisClient();
    const value = await client.get(`${ACTIVE_STREAM_KEY_PREFIX}${chatId}`);
    return value ?? null;
  } catch (error) {
    console.error("Failed to read active stream id", { chatId, error });
    return null;
  }
}

/**
 * Set the active stream ID for a chat in Redis.
 *
 * If Redis is not configured this function is a no-op. Errors encountered while
 * writing to Redis are caught and logged.
 *
 * @param chatId - The chat identifier used to namespace the active stream key
 * @param streamId - The stream identifier to store as the active stream for the chat
 */
export async function setActiveStreamId(chatId: string, streamId: string) {
  if (!hasRedisConfigured()) {
    return;
  }

  try {
    const client = await getRedisClient();
    await client.set(`${ACTIVE_STREAM_KEY_PREFIX}${chatId}`, streamId);
  } catch (error) {
    console.error("Failed to set active stream id", { chatId, streamId, error });
  }
}

/**
 * Remove the active stream ID for a chat from Redis.
 *
 * If Redis is not configured, this function returns without performing any action.
 *
 * @param chatId - The chat identifier whose active stream key will be deleted
 */
export async function clearActiveStreamId(chatId: string) {
  if (!hasRedisConfigured()) {
    return;
  }

  try {
    const client = await getRedisClient();
    await client.del(`${ACTIVE_STREAM_KEY_PREFIX}${chatId}`);
  } catch (error) {
    console.error("Failed to clear active stream id", { chatId, error });
  }
}
