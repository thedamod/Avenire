import { randomUUID } from "node:crypto";
import { createClient, type RedisClientType } from "redis";

export type UploadSessionStatus =
  | "created"
  | "uploading"
  | "uploaded"
  | "verified"
  | "ingestion_queued"
  | "failed";

export interface UploadSessionRecord {
  id: string;
  userId: string;
  workspaceUuid: string;
  folderId: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number;
  checksumSha256: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  status: UploadSessionStatus;
  upload?: {
    storageKey: string;
    storageUrl: string;
    mimeType: string | null;
    sizeBytes: number;
    checksumSha256: string | null;
  } | null;
  result?: {
    fileId: string;
    ingestionJobId: string | null;
    deduplicated: boolean;
  } | null;
}

const redisUrl = process.env.REDIS_URL;
const SESSION_TTL_SECONDS = 24 * 60 * 60;

let client: RedisClientType | null = null;

interface MemorySessionEntry {
  expiresAtMs: number;
  session: UploadSessionRecord;
}

const memorySessions = new Map<string, MemorySessionEntry>();

function getSessionKey(sessionId: string) {
  return `upload:session:${sessionId}`;
}

async function getRedisClient() {
  if (!redisUrl) {
    return null;
  }

  if (!client) {
    client = createClient({ url: redisUrl });
    client.on("error", (error) => {
      console.error("Redis error in upload-session-store", error);
    });
  }

  if (!client.isOpen) {
    await client.connect();
  }

  return client;
}

function cleanupMemorySessions() {
  const now = Date.now();
  for (const [key, value] of memorySessions.entries()) {
    if (value.expiresAtMs <= now) {
      memorySessions.delete(key);
    }
  }
}

export async function createUploadSession(input: {
  userId: string;
  workspaceUuid: string;
  folderId: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number;
  checksumSha256: string | null;
  ttlSeconds?: number;
}) {
  const ttlSeconds = Math.max(60, input.ttlSeconds ?? SESSION_TTL_SECONDS);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  const session: UploadSessionRecord = {
    id: randomUUID(),
    userId: input.userId,
    workspaceUuid: input.workspaceUuid,
    folderId: input.folderId,
    name: input.name,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    checksumSha256: input.checksumSha256,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    status: "created",
    upload: null,
    result: null,
  };

  const redis = await getRedisClient();
  if (redis) {
    await redis.set(getSessionKey(session.id), JSON.stringify(session), {
      EX: ttlSeconds,
    });
    return session;
  }

  memorySessions.set(session.id, {
    session,
    expiresAtMs: expiresAt.getTime(),
  });
  return session;
}

export async function getUploadSession(sessionId: string) {
  const redis = await getRedisClient();
  if (redis) {
    const raw = await redis.get(getSessionKey(sessionId));
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as UploadSessionRecord;
    } catch {
      return null;
    }
  }

  cleanupMemorySessions();
  return memorySessions.get(sessionId)?.session ?? null;
}

export async function saveUploadSession(
  session: UploadSessionRecord,
  options?: { ttlSeconds?: number }
) {
  const ttlSeconds = Math.max(60, options?.ttlSeconds ?? SESSION_TTL_SECONDS);
  const next: UploadSessionRecord = {
    ...session,
    updatedAt: new Date().toISOString(),
  };

  const redis = await getRedisClient();
  if (redis) {
    await redis.set(getSessionKey(session.id), JSON.stringify(next), {
      EX: ttlSeconds,
    });
    return next;
  }

  memorySessions.set(session.id, {
    session: next,
    expiresAtMs: Date.now() + ttlSeconds * 1000,
  });
  return next;
}
