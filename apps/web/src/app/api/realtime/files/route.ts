import { createFilesRealtimeSubscriber, hasFilesRealtimeConfigured } from "@/lib/files-realtime-publisher";
import { verifyFilesRealtimeToken } from "@/lib/files-realtime-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const workspaceUuid = url.searchParams.get("workspaceUuid")?.trim();
  const token = url.searchParams.get("token")?.trim();

  if (!workspaceUuid || !token) {
    return Response.json({ error: "Missing workspaceUuid or token" }, { status: 400 });
  }

  if (!hasFilesRealtimeConfigured()) {
    return Response.json({ error: "Realtime unavailable" }, { status: 503 });
  }

  const verification = verifyFilesRealtimeToken(token, workspaceUuid);
  if (!verification.ok) {
    return Response.json({ error: "Unauthorized", reason: verification.reason }, { status: 401 });
  }

  const encoder = new TextEncoder();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let streamClosed = false;
  let channel: string | null = null;
  let subscriber: Awaited<ReturnType<typeof createFilesRealtimeSubscriber>>["subscriber"] | null = null;

  const body = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      try {
        const created = await createFilesRealtimeSubscriber(workspaceUuid);
        channel = created.channel;
        subscriber = created.subscriber;
      } catch {
        streamClosed = true;
        controller.error(new Error("Unable to start realtime stream"));
        return;
      }

      const write = (chunk: string) => {
        if (streamClosed) {
          return;
        }
        controller.enqueue(encoder.encode(chunk));
      };

      const disconnect = async () => {
        if (!subscriber || !channel) {
          return;
        }

        try {
          await subscriber.unsubscribe(channel);
        } catch {
          // ignore
        }

        try {
          await subscriber.quit();
        } catch {
          // ignore
        }
      };

      const closeStream = async () => {
        if (streamClosed) {
          return;
        }
        streamClosed = true;

        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }

        await disconnect();

        try {
          controller.close();
        } catch {
          // Stream might already be closed by runtime.
        }
      };

      write("retry: 5000\n\n");

      heartbeatTimer = setInterval(() => {
        write(`: keepalive ${Date.now()}\n\n`);
      }, 20_000);

      void subscriber.subscribe(channel, (rawMessage) => {
        try {
          const payload = JSON.parse(rawMessage) as unknown;
          write("event: files.invalidate\n");
          write(`data: ${JSON.stringify(payload)}\n\n`);
        } catch {
          // Ignore malformed messages.
        }
      });

      request.signal.addEventListener("abort", () => {
        void closeStream();
      });
    },
    cancel: async () => {
      if (streamClosed) {
        return;
      }
      streamClosed = true;

      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }

      if (!subscriber || !channel) {
        return;
      }

      try {
        await subscriber.unsubscribe(channel);
      } catch {
        // ignore
      }

      try {
        await subscriber.quit();
      } catch {
        // ignore
      }
    },
  });

  return new Response(body, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    },
  });
}
