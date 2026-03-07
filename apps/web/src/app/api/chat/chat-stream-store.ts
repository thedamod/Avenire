import { createClient, type RedisClientType } from "redis";

const redisUrl = process.env.REDIS_URL;
const ACTIVE_STREAM_KEY_PREFIX = "chat-active-stream:";

let redisClient: RedisClientType | null = null;
let redisSubscriber: RedisClientType | null = null;

function hasRedisConfigured() {
  return Boolean(redisUrl);
}

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

export async function clearActiveStreamId(chatId: string, streamId: string) {
  if (!hasRedisConfigured()) {
    return;
  }

  try {
    const client = await getRedisClient();
    const key = `${ACTIVE_STREAM_KEY_PREFIX}${chatId}`;
    await client.eval(
      `if redis.call("GET", KEYS[1]) == ARGV[1] then
         return redis.call("DEL", KEYS[1])
       end
       return 0`,
      {
        keys: [key],
        arguments: [streamId],
      },
    );
  } catch (error) {
    console.error("Failed to clear active stream id", { chatId, streamId, error });
  }
}
