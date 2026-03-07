import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";
import {
  listWorkspaceStreamEvents,
  waitForWorkspaceStreamEvents,
} from "@/lib/workspace-event-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function toSseChunk(input: {
  event: string;
  data: Record<string, unknown>;
  id?: string;
}) {
  const lines: string[] = [];
  if (input.id) {
    lines.push(`id: ${input.id}`);
  }
  lines.push(`event: ${input.event}`);
  lines.push(`data: ${JSON.stringify(input.data)}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const workspaceUuid = searchParams.get("workspaceUuid")?.trim();
  const cursorParam = searchParams.get("cursor")?.trim() ?? null;
  const eventTypeFilter = searchParams.get("eventType")?.trim() ?? null;
  const limitRaw = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(500, Math.max(1, limitRaw))
    : 200;

  if (!workspaceUuid) {
    return new Response("Missing workspaceUuid", { status: 400 });
  }

  const canAccess = await ensureWorkspaceAccessForUser(user.id, workspaceUuid);
  if (!canAccess) {
    return new Response("Forbidden", { status: 403 });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let cursor: string | null = cursorParam;
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

      const write = (chunk: string) => {
        if (closed) {
          return;
        }
        controller.enqueue(encoder.encode(chunk));
      };

      const writeEvent = (event: {
        streamId: string;
        type: string;
        ts: number;
        payload: Record<string, unknown>;
        requestId: string | null;
      }) => {
        cursor = event.streamId;
        if (eventTypeFilter && event.type !== eventTypeFilter) {
          return;
        }

        write(
          toSseChunk({
            id: event.streamId,
            event: event.type,
            data: {
              ...event.payload,
              requestId: event.requestId,
              ts: event.ts,
              type: event.type,
              version: event.streamId,
              workspaceUuid,
            },
          })
        );
      };

      const close = () => {
        if (closed) {
          return;
        }
        closed = true;

        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }

        try {
          controller.close();
        } catch {
          // no-op
        }
      };

      const run = async () => {
        write("retry: 5000\n\n");
        write(
          toSseChunk({
            event: "ready",
            data: {
              cursor,
              workspaceUuid,
            },
          })
        );

        if (cursor) {
          const replay = await listWorkspaceStreamEvents({
            workspaceUuid,
            afterStreamId: cursor,
            limit,
          });
          for (const event of replay) {
            writeEvent(event);
          }
        }

        while (!closed) {
          const events = await waitForWorkspaceStreamEvents({
            workspaceUuid,
            afterStreamId: cursor,
            limit: Math.min(limit, 100),
            blockMs: 15_000,
          });

          if (events.length === 0) {
            write(`: keepalive ${Date.now()}\n\n`);
            continue;
          }

          for (const event of events) {
            writeEvent(event);
          }
        }
      };

      heartbeatTimer = setInterval(() => {
        write(`: keepalive ${Date.now()}\n\n`);
      }, 20_000);

      void run().catch(() => close());
      request.signal.addEventListener("abort", close, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
}
