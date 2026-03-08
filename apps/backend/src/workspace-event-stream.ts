import { createClient, type RedisClientType } from "redis";

const redisUrl = process.env.REDIS_URL;
const DEFAULT_MAX_LEN = 5_000;

let publisher: RedisClientType | null = null;

function getStreamKey(workspaceUuid: string) {
  return `workspace:events:${workspaceUuid}`;
}

function toPositiveInt(raw: string | undefined, fallback: number) {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function getPublisherClient() {
  if (!redisUrl) {
    throw new Error("REDIS_URL is not configured");
  }

  if (!publisher) {
    publisher = createClient({ url: redisUrl });
    publisher.on("error", (error) => {
      console.error("Redis publisher error in backend workspace-event-stream", error);
    });
  }

  if (!publisher.isOpen) {
    await publisher.connect();
  }

  return publisher;
}

export async function publishWorkspaceStreamEvent(input: {
  workspaceUuid: string;
  type: string;
  payload?: Record<string, unknown>;
  requestId?: string | null;
  ts?: number;
}) {
  if (!redisUrl) {
    return null;
  }

  const client = await getPublisherClient();
  const maxLen = toPositiveInt(
    process.env.WORKSPACE_EVENTS_STREAM_MAXLEN,
    DEFAULT_MAX_LEN
  );

  try {
    return await client.sendCommand<string>([
      "XADD",
      getStreamKey(input.workspaceUuid),
      "MAXLEN",
      "~",
      String(maxLen),
      "*",
      "type",
      input.type,
      "payload",
      JSON.stringify(input.payload ?? {}),
      "ts",
      String(input.ts ?? Date.now()),
      "requestId",
      input.requestId ?? "",
    ]);
  } catch (error) {
    console.error("Failed to publish backend workspace stream event", {
      workspaceUuid: input.workspaceUuid,
      type: input.type,
      error,
    });
    return null;
  }
}
