import { UI_MESSAGE_STREAM_HEADERS } from "@avenire/ai";
import { auth } from "@avenire/auth/server";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { headers } from "next/headers";
import { getChatBySlugForUser } from "@/lib/chat-data";
import {
  clearActiveStreamId,
  getActiveStreamId,
  getRedisClient,
  getRedisSubscriber,
} from "../../chat-stream-store";

/**
 * Streams a resumable chat message stream for the authenticated user's chat identified by the route `id`.
 *
 * @param context - An object whose `params` promise resolves to `{ id: string }`, where `id` is the chat slug or identifier.
 * @returns A `Response` that either contains the resumed chat message `ReadableStream` with `UI_MESSAGE_STREAM_HEADERS` and `Cache-Control: no-store`, or a `Response` with status `401` (unauthorized), `404` (chat not found), or `204` (no active or resumable stream).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return new Response(null, { status: 401 });
  }

  const { id } = await context.params;
  const chat = await getChatBySlugForUser(session.user.id, id);
  if (!chat) {
    return new Response(null, { status: 404 });
  }

  const activeStreamId = await getActiveStreamId(id);
  if (!activeStreamId) {
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const streamContext = createResumableStreamContext({
      waitUntil: after,
      publisher: await getRedisClient(),
      subscriber: await getRedisSubscriber(),
    });

    const stream = await streamContext.resumeExistingStream(activeStreamId);
    if (!stream) {
      await clearActiveStreamId(id);
      return new Response(null, {
        status: 204,
        headers: { "Cache-Control": "no-store" },
      });
    }

    return new Response(stream, {
      headers: {
        ...UI_MESSAGE_STREAM_HEADERS,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to resume chat stream", { chatId: id, error });
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
