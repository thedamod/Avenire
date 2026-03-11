import { getFileAssetById } from "@/lib/file-data";
import { syncMuxVideoDeliveryForFile } from "@/lib/video-delivery";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceUuid: string; fileUuid: string }> }
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

  let file = await getFileAssetById(workspaceUuid, fileUuid);
  if (!file?.storageUrl) {
    return new Response("File not found", { status: 404 });
  }

  if (
    file.videoDelivery?.status !== "ready" &&
    file.videoDelivery?.mux?.assetId
  ) {
    file = await syncMuxVideoDeliveryForFile({
      file,
      userId: user.id,
      workspaceUuid,
    });
  }

  const progressiveSource = {
    kind: "progressive" as const,
    mimeType: file.mimeType ?? undefined,
    url: `/api/workspaces/${workspaceUuid}/files/${file.id}/stream`,
  };
  const preferredSource =
    file.videoDelivery?.status === "ready" &&
    file.videoDelivery.hls?.manifestUrl
      ? {
          fallbackUrl: progressiveSource.url,
          kind: "hls" as const,
          manifestUrl: file.videoDelivery.hls.manifestUrl,
          mimeType: file.mimeType ?? undefined,
          playbackId: file.videoDelivery.mux?.playbackId ?? undefined,
          provider: file.videoDelivery.mux?.playbackId
            ? ("mux" as const)
            : ("generic" as const),
        }
      : progressiveSource;

  return Response.json(
    {
      fallbackSource: progressiveSource,
      posterUrl: file.videoDelivery?.poster?.url ?? null,
      preferredSource,
      status: file.videoDelivery?.status ?? "ready",
    },
    {
      headers: {
        "Cache-Control":
          file.videoDelivery?.status === "ready"
            ? "private, max-age=60, stale-while-revalidate=300"
            : "private, no-store, max-age=0",
      },
    }
  );
}
