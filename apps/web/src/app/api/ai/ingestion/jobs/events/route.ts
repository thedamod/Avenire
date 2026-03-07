import { listIngestionEventsForWorkspace } from "@/lib/ingestion-data";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";
import {
  hasWorkspaceEventStreamConfigured,
  listWorkspaceStreamEvents,
  waitForWorkspaceStreamEvents,
} from "@/lib/workspace-event-stream";

const encoder = new TextEncoder();

const sleep = async (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const workspaceUuid = searchParams.get("workspaceUuid");
  if (!workspaceUuid) {
    return new Response("Missing workspaceUuid", { status: 400 });
  }

  const canAccess = await ensureWorkspaceAccessForUser(user.id, workspaceUuid);
  if (!canAccess) {
    return new Response("Forbidden", { status: 403 });
  }

  if (hasWorkspaceEventStreamConfigured()) {
    const streamCursor = searchParams.get("cursor")?.trim() ?? null;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let cancelled = false;
        let cursor = streamCursor;

        const write = (chunk: string) => {
          if (cancelled) {
            return;
          }
          controller.enqueue(encoder.encode(chunk));
        };

        const run = async () => {
          write("retry: 5000\n\n");
          write(
            `event: ready\ndata: ${JSON.stringify({
              cursor,
              mode: "workspace-stream",
            })}\n\n`
          );

          if (cursor) {
            const replay = await listWorkspaceStreamEvents({
              workspaceUuid,
              afterStreamId: cursor,
              limit: 200,
            });
            for (const event of replay) {
              cursor = event.streamId;
              if (event.type !== "ingestion.job") {
                continue;
              }
              write(`id: ${event.streamId}\n`);
              write(`event: ingestion.job\n`);
              write(
                `data: ${JSON.stringify({
                  ...event.payload,
                  version: event.streamId,
                })}\n\n`
              );
            }
          }

          while (!cancelled) {
            const events = await waitForWorkspaceStreamEvents({
              workspaceUuid,
              afterStreamId: cursor,
              limit: 100,
              blockMs: 15_000,
            });
            if (events.length === 0) {
              write(`: keepalive ${Date.now()}\n\n`);
              continue;
            }

            for (const event of events) {
              cursor = event.streamId;
              if (event.type !== "ingestion.job") {
                continue;
              }
              write(`id: ${event.streamId}\n`);
              write(`event: ingestion.job\n`);
              write(
                `data: ${JSON.stringify({
                  ...event.payload,
                  version: event.streamId,
                })}\n\n`
              );
            }
          }
        };

        void run().catch(() => {
          try {
            controller.close();
          } catch {
            // no-op
          }
        });

        const close = () => {
          cancelled = true;
          try {
            controller.close();
          } catch {
            // no-op
          }
        };

        request.signal.addEventListener("abort", close, { once: true });
      },
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        "Content-Type": "text/event-stream; charset=utf-8",
        Connection: "keep-alive",
      },
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let cancelled = false;

      const run = async () => {
        let cursor = new Date(Date.now() - 60_000).toISOString();

        controller.enqueue(encoder.encode("event: ready\ndata: {}\n\n"));

        while (!cancelled) {
          const events = await listIngestionEventsForWorkspace({
            workspaceId: workspaceUuid,
            sinceIso: cursor,
            limit: 200,
          });

          for (const event of events) {
            cursor = event.createdAt;
            controller.enqueue(
              encoder.encode(
                `event: ingestion.job\ndata: ${JSON.stringify(event)}\n\n`
              )
            );
          }

          controller.enqueue(encoder.encode("event: ping\ndata: {}\n\n"));
          await sleep(1500);
        }
      };

      void run().catch(() => {
        try {
          controller.close();
        } catch {
          // no-op
        }
      });

      const close = () => {
        cancelled = true;
        try {
          controller.close();
        } catch {
          // no-op
        }
      };

      request.signal.addEventListener("abort", close, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
    },
  });
}
