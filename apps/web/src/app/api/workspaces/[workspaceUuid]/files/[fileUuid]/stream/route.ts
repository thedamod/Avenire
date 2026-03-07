import { getFileAssetById } from "@/lib/file-data";
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

  const upstreamHeaders = new Headers();
  const range = request.headers.get("range");
  if (range) {
    upstreamHeaders.set("range", range);
  }

  const upstream = await fetch(file.storageUrl, {
    headers: upstreamHeaders,
    redirect: "follow",
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
    "cache-control",
    "content-disposition",
    "content-length",
    "content-range",
    "content-type",
    "etag",
    "last-modified",
  ];

  for (const key of passthrough) {
    const value = upstream.headers.get(key);
    if (value) {
      headers.set(key, value);
    }
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
