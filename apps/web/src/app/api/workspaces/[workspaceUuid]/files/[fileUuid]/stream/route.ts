import { getFileAssetById, isTrustedStorageUrl } from "@/lib/file-data";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";

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
  if (!isTrustedStorageUrl(file.storageUrl)) {
    return new Response("Invalid file source", { status: 400 });
  }

  const upstreamHeaders = new Headers();
  const range = request.headers.get("range");
  if (range) {
    upstreamHeaders.set("range", range);
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
    "content-length",
    "content-range",
    "content-type",
  ];

  for (const key of passthrough) {
    const value = upstream.headers.get(key);
    if (value) {
      headers.set(key, value);
    }
  }
  headers.set("cache-control", "private, no-store, max-age=0");

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
