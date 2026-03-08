import { createClient, type RedisClientType } from "redis";

export interface WorkspaceStreamEvent {
  payload: Record<string, unknown>;
  requestId: string | null;
  streamId: string;
  ts: number;
  type: string;
  workspaceUuid: string;
}

const redisUrl = process.env.REDIS_URL;
const DEFAULT_MAX_LEN = 5_000;
const DEFAULT_BLOCK_MS = 15_000;

let publisher: RedisClientType | null = null;

function getStreamKey(workspaceUuid: string) {
  return `workspace:events:${workspaceUuid}`;
}

function toPositiveInt(raw: string | undefined, fallback: number) {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toWorkspaceEvent(
  workspaceUuid: string,
  entry: unknown
): WorkspaceStreamEvent | null {
  if (!Array.isArray(entry) || entry.length < 2) {
    return null;
  }

  const streamId = typeof entry[0] === "string" ? entry[0] : null;
  const fields = entry[1];
  if (!streamId || !Array.isArray(fields)) {
    return null;
  }

  const kv = new Map<string, string>();
  for (let index = 0; index < fields.length - 1; index += 2) {
    const key = fields[index];
    const value = fields[index + 1];
    if (typeof key === "string" && typeof value === "string") {
      kv.set(key, value);
    }
  }

  const type = kv.get("type") ?? "workspace.event";
  const tsRaw = Number.parseInt(kv.get("ts") ?? "", 10);
  const ts = Number.isFinite(tsRaw) ? tsRaw : Date.now();
  const payloadRaw = kv.get("payload") ?? "{}";
  const requestIdRaw = kv.get("requestId");

  let payload: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(payloadRaw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    payload = { raw: payloadRaw };
  }

  return {
    streamId,
    workspaceUuid,
    type,
    payload,
    ts,
    requestId:
      typeof requestIdRaw === "string" && requestIdRaw.length > 0
        ? requestIdRaw
        : null,
  };
}

async function getPublisherClient() {
  if (!redisUrl) {
    throw new Error("REDIS_URL is not configured");
  }

  if (!publisher) {
    publisher = createClient({ url: redisUrl });
    publisher.on("error", (error) => {
      console.error("Redis publisher error in workspace-event-stream", error);
    });
  }

  if (!publisher.isOpen) {
    await publisher.connect();
  }

  return publisher;
}

export function hasWorkspaceEventStreamConfigured() {
  return Boolean(redisUrl);
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
  const streamKey = getStreamKey(input.workspaceUuid);
  const ts = input.ts ?? Date.now();

  try {
    const streamId = await client.sendCommand<string>([
      "XADD",
      streamKey,
      "MAXLEN",
      "~",
      String(maxLen),
      "*",
      "type",
      input.type,
      "payload",
      JSON.stringify(input.payload ?? {}),
      "ts",
      String(ts),
      "requestId",
      input.requestId ?? "",
    ]);

    return {
      streamId,
      workspaceUuid: input.workspaceUuid,
      type: input.type,
      payload: input.payload ?? {},
      ts,
      requestId: input.requestId ?? null,
    } satisfies WorkspaceStreamEvent;
  } catch (error) {
    console.error("Failed to publish workspace stream event", {
      workspaceUuid: input.workspaceUuid,
      type: input.type,
      error,
    });
    return null;
  }
}

export async function listWorkspaceStreamEvents(input: {
  workspaceUuid: string;
  afterStreamId?: string | null;
  limit?: number;
}) {
  if (!redisUrl) {
    return [] as WorkspaceStreamEvent[];
  }

  const client = await getPublisherClient();
  const streamKey = getStreamKey(input.workspaceUuid);
  const limit = Math.min(500, Math.max(1, input.limit ?? 200));
  const start = input.afterStreamId ? `(${input.afterStreamId}` : "-";

  try {
    const rows = await client.sendCommand<unknown>([
      "XRANGE",
      streamKey,
      start,
      "+",
      "COUNT",
      String(limit),
    ]);

    if (!Array.isArray(rows)) {
      return [];
    }

    return rows
      .map((row) => toWorkspaceEvent(input.workspaceUuid, row))
      .filter((event): event is WorkspaceStreamEvent => Boolean(event));
  } catch (error) {
    console.error("Failed to list workspace stream events", {
      workspaceUuid: input.workspaceUuid,
      error,
    });
    return [];
  }
}

export async function waitForWorkspaceStreamEvents(input: {
  workspaceUuid: string;
  afterStreamId?: string | null;
  limit?: number;
  blockMs?: number;
}) {
  if (!redisUrl) {
    return [] as WorkspaceStreamEvent[];
  }

  const streamKey = getStreamKey(input.workspaceUuid);
  const blockMs = Math.max(
    1_000,
    toPositiveInt(process.env.WORKSPACE_EVENTS_STREAM_BLOCK_MS, DEFAULT_BLOCK_MS)
  );
  const limit = Math.min(200, Math.max(1, input.limit ?? 100));
  const after = input.afterStreamId ?? "$";
  const client = (await getPublisherClient()).duplicate();

  client.on("error", (error) => {
    console.error("Redis subscriber error in workspace-event-stream", error);
  });

  if (!client.isOpen) {
    await client.connect();
  }

  try {
    const rows = await client.sendCommand<unknown>([
      "XREAD",
      "BLOCK",
      String(input.blockMs ?? blockMs),
      "COUNT",
      String(limit),
      "STREAMS",
      streamKey,
      after,
    ]);

    if (!Array.isArray(rows) || rows.length === 0) {
      return [];
    }

    const firstRow = rows[0];
    if (!Array.isArray(firstRow) || firstRow.length < 2) {
      return [];
    }

    const entries = firstRow[1];
    if (!Array.isArray(entries)) {
      return [];
    }

    return entries
      .map((entry) => toWorkspaceEvent(input.workspaceUuid, entry))
      .filter((event): event is WorkspaceStreamEvent => Boolean(event));
  } catch (error) {
    console.error("Failed to wait for workspace stream events", {
      workspaceUuid: input.workspaceUuid,
      error,
    });
    return [];
  } finally {
    try {
      await client.quit();
    } catch {
      // ignore
    }
  }
}
