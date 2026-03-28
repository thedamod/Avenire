import {
  getFileAssetById,
  getNoteContent,
  isMarkdownFileRecord,
  isTrustedStorageUrl,
} from "@/lib/file-data";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";

const STREAM_CHUNK_BYTES = 4 * 1024 * 1024;

function normalizeSingleRange(input: {
  rangeHeader: string;
  sizeBytes: number;
}) {
  const { rangeHeader, sizeBytes } = input;
  if (!rangeHeader.startsWith("bytes=")) {
    return null;
  }
  const value = rangeHeader.slice("bytes=".length).trim();
  if (!value || value.includes(",")) {
    return null;
  }

  const [startRaw, endRaw] = value.split("-", 2);
  const parsedStart = Number.parseInt(startRaw ?? "", 10);
  const parsedEnd =
    typeof endRaw === "string" && endRaw.trim().length > 0
      ? Number.parseInt(endRaw, 10)
      : Number.NaN;

  if (!Number.isFinite(parsedStart) || parsedStart < 0 || parsedStart >= sizeBytes) {
    return null;
  }

  const naturalEnd =
    Number.isFinite(parsedEnd) && parsedEnd >= parsedStart
      ? Math.min(sizeBytes - 1, parsedEnd)
      : sizeBytes - 1;
  const cappedEnd = Math.min(naturalEnd, parsedStart + STREAM_CHUNK_BYTES - 1);

  return `bytes=${parsedStart}-${cappedEnd}`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceUuid: string; fileUuid: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { workspaceUuid, fileUuid } = await context.params;
  const canAccess = await ensureWorkspaceAccessForUser(user.id, workspaceUuid);
  if (!canAccess) {
    return new Response("Forbidden", { status: 403 });
  }

  const file = await getFileAssetById(workspaceUuid, fileUuid);
  if (!file?.storageUrl) {
    return new Response("File not found", { status: 404 });
  }

  if (isMarkdownFileRecord(file)) {
    const note = await getNoteContent(file.id);
    if (note?.content != null) {
      return new Response(note.content, {
        status: 200,
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "cache-control": "private, no-store, max-age=0",
        },
      });
    }
  }

  if (!isTrustedStorageUrl(file.storageUrl)) {
    return new Response("Invalid file source", { status: 400 });
  }

  const upstreamHeaders = new Headers();
  const requestedRange = request.headers.get("range");
  const mimeType = (file.mimeType ?? "").toLowerCase();
  const isStreamableMedia =
    mimeType.startsWith("video/") || mimeType.startsWith("audio/");
  // Force a startup byte-range on cold media requests so playback can begin
  // before the entire file is transferred.
  const startupRange =
    !requestedRange && isStreamableMedia ? "bytes=0-4194303" : null;
  const normalizedRequestedRange =
    requestedRange && Number.isFinite(file.sizeBytes) && file.sizeBytes > 0
      ? normalizeSingleRange({
          rangeHeader: requestedRange,
          sizeBytes: file.sizeBytes,
        })
      : null;
  const forwardedRange = normalizedRequestedRange ?? requestedRange ?? startupRange;
  if (forwardedRange) {
    upstreamHeaders.set("Range", forwardedRange);
  }

  const upstreamAbortController = new AbortController();
  const abortUpstream = () => upstreamAbortController.abort();
  if (request.signal.aborted) {
    abortUpstream();
  } else {
    request.signal.addEventListener("abort", abortUpstream, { once: true });
  }

  const upstream = await fetch(file.storageUrl, {
    headers: upstreamHeaders,
    redirect: "follow",
    signal: upstreamAbortController.signal,
  }).catch(() => null);

  if (!upstream) {
    return new Response("Unable to stream file", { status: 502 });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new Response("Unable to stream file", { status: upstream.status });
  }

  const headers = new Headers();
  const passthrough = [
    "accept-ranges",
    "content-disposition",
    "etag",
    "content-length",
    "content-range",
    "content-type",
    "last-modified",
  ];

  for (const key of passthrough) {
    const value = upstream.headers.get(key);
    if (value) {
      headers.set(key, value);
    }
  }
  if (!headers.get("accept-ranges")) {
    headers.set("accept-ranges", "bytes");
  }
  if (requestedRange && upstream.status === 200) {
    headers.set("x-avenire-range-supported", "false");
  }
  headers.set(
    "cache-control",
    "private, no-store, max-age=0"
  );
  headers.set("vary", "Range, Cookie");

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
