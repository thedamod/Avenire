import {
  type ExplorerFileRecord,
  listVideoDeliveryStorageKeys,
  updateFileAssetStorageMetadata,
  type VideoDeliveryRecord,
} from "@/lib/file-data";
import { publishFilesInvalidationEvent } from "@/lib/files-realtime-publisher";
import {
  buildMuxPlaybackUrl,
  buildMuxPosterUrl,
  createMuxAssetFromUrl,
  getMuxAsset,
  getMuxAssetVideoTrack,
  getMuxPlaybackId,
  hasMuxVideoCredentials,
  type MuxAsset,
} from "@/lib/mux-video";
import { deleteUploadThingFile } from "@/lib/upload-registration";
import { optimizeAndReuploadVideo } from "@/lib/video-optimization";

const MUX_POLL_INTERVAL_MS = Math.max(
  2000,
  Number.parseInt(process.env.MUX_POLL_INTERVAL_MS ?? "", 10) || 5000
);
const MUX_POLL_MAX_ATTEMPTS = Math.max(
  1,
  Number.parseInt(process.env.MUX_POLL_MAX_ATTEMPTS ?? "", 10) || 120
);

function buildProgressiveRecord(input: {
  mimeType: string | null;
  sizeBytes: number;
  storageKey: string;
  storageUrl: string;
}) {
  return {
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    storageKey: input.storageKey,
    url: input.storageUrl,
  };
}

function buildPendingVideoDelivery(input: {
  mimeType: string | null;
  sizeBytes: number;
  storageKey: string;
  storageUrl: string;
}): VideoDeliveryRecord {
  return {
    analysis: null,
    error: null,
    hls: null,
    mux: null,
    poster: null,
    progressive: buildProgressiveRecord(input),
    status: "pending",
    strategy: hasMuxVideoCredentials() ? "mux" : "progressive",
    updatedAt: new Date().toISOString(),
    version: 2,
  };
}

function buildFailedVideoDelivery(
  previous: VideoDeliveryRecord,
  error: unknown
): VideoDeliveryRecord {
  return {
    ...previous,
    error:
      error instanceof Error
        ? error.message.slice(0, 500)
        : "Video optimization failed",
    status: "failed",
    updatedAt: new Date().toISOString(),
  };
}

function canOptimizeVideoDelivery(file: Pick<ExplorerFileRecord, "mimeType">) {
  return file.mimeType?.startsWith("video/") ?? false;
}

function isAsyncVideoOptimizationEnabled() {
  return (
    (process.env.ENABLE_ASYNC_MEDIA_OPTIMIZATION ?? "true").toLowerCase() !==
    "false"
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapMuxStatusToVideoDeliveryStatus(status: string) {
  if (status === "ready") {
    return "ready";
  }
  if (status === "errored") {
    return "failed";
  }
  return "pending";
}

function buildMuxVideoDelivery(input: {
  asset: MuxAsset;
  file: Pick<
    ExplorerFileRecord,
    "mimeType" | "sizeBytes" | "storageKey" | "storageUrl" | "videoDelivery"
  >;
}): VideoDeliveryRecord {
  const playback = getMuxPlaybackId(input.asset);
  const videoTrack = getMuxAssetVideoTrack(input.asset);
  const previous = input.file.videoDelivery;

  return {
    analysis: {
      bitrateKbps: previous?.analysis?.bitrateKbps ?? null,
      durationSeconds:
        typeof input.asset.duration === "number"
          ? input.asset.duration
          : (previous?.analysis?.durationSeconds ?? null),
      height:
        typeof videoTrack?.max_height === "number"
          ? videoTrack.max_height
          : (previous?.analysis?.height ?? null),
      width:
        typeof videoTrack?.max_width === "number"
          ? videoTrack.max_width
          : (previous?.analysis?.width ?? null),
    },
    error:
      input.asset.status === "errored"
        ? (previous?.error ?? "Mux asset processing failed")
        : null,
    hls: playback
      ? {
          manifestStorageKey: null,
          manifestUrl: buildMuxPlaybackUrl(playback.id),
          segmentDurationSeconds: null,
          segmentStorageKeys: null,
          variants: null,
        }
      : null,
    mux: {
      aspectRatio: input.asset.aspect_ratio ?? null,
      assetId: input.asset.id,
      createdAt: input.asset.created_at ?? null,
      maxStoredResolution: input.asset.max_stored_resolution ?? null,
      playbackId: playback?.id ?? null,
      playbackIds: input.asset.playback_ids ?? null,
      resolutionTier: input.asset.resolution_tier ?? null,
      status: input.asset.status,
    },
    poster: playback
      ? {
          mimeType: "image/jpeg",
          storageKey: null,
          url: buildMuxPosterUrl(playback.id),
        }
      : null,
    progressive: buildProgressiveRecord(input.file),
    status: mapMuxStatusToVideoDeliveryStatus(input.asset.status),
    strategy: "mux",
    updatedAt: new Date().toISOString(),
    version: 2,
  };
}

async function pollMuxAsset(assetId: string) {
  let asset = await getMuxAsset(assetId);
  for (
    let attempt = 0;
    attempt < MUX_POLL_MAX_ATTEMPTS &&
    asset.status !== "ready" &&
    asset.status !== "errored";
    attempt += 1
  ) {
    await sleep(MUX_POLL_INTERVAL_MS);
    asset = await getMuxAsset(assetId);
  }
  return asset;
}

async function runLegacyVideoOptimization(input: {
  file: Pick<
    ExplorerFileRecord,
    | "folderId"
    | "id"
    | "mimeType"
    | "name"
    | "sizeBytes"
    | "storageKey"
    | "storageUrl"
  >;
  userId: string;
  workspaceUuid: string;
  pendingVideoDelivery: VideoDeliveryRecord;
}) {
  const { file, pendingVideoDelivery, userId, workspaceUuid } = input;
  const optimized = await optimizeAndReuploadVideo({
    sourceName: file.name,
    sourceUrl: file.storageUrl,
  });

  if (!optimized) {
    await updateFileAssetStorageMetadata(workspaceUuid, file.id, userId, {
      videoDelivery: buildFailedVideoDelivery(
        pendingVideoDelivery,
        new Error("Video optimization returned no assets")
      ),
    });
    return;
  }

  const updated = await updateFileAssetStorageMetadata(
    workspaceUuid,
    file.id,
    userId,
    {
      optimizedStorageKey: optimized.progressive.storageKey,
      optimizedStorageUrl: optimized.progressive.storageUrl,
      optimizedName: optimized.progressive.name,
      optimizedMimeType: optimized.progressive.mimeType,
      optimizedSizeBytes: optimized.progressive.sizeBytes,
      videoDelivery: optimized.videoDelivery,
    }
  );

  if (!updated) {
    const cleanupKeys = Array.from(
      new Set([
        optimized.progressive.storageKey,
        ...listVideoDeliveryStorageKeys(optimized.videoDelivery),
      ])
    );
    await Promise.all(
      cleanupKeys.map((storageKey) => deleteUploadThingFile(storageKey))
    );
    return;
  }

  if (optimized.progressive.storageKey !== file.storageKey) {
    await deleteUploadThingFile(file.storageKey);
  }

  await publishFilesInvalidationEvent({
    workspaceUuid,
    folderId: file.folderId,
    reason: "file.updated",
  });
  await publishFilesInvalidationEvent({
    workspaceUuid,
    reason: "tree.changed",
  });
}

async function runMuxVideoDelivery(input: {
  file: Pick<
    ExplorerFileRecord,
    | "folderId"
    | "id"
    | "mimeType"
    | "name"
    | "sizeBytes"
    | "storageKey"
    | "storageUrl"
    | "videoDelivery"
  >;
  userId: string;
  workspaceUuid: string;
}) {
  const { file, userId, workspaceUuid } = input;
  const createdAsset = await createMuxAssetFromUrl({
    passthrough: file.id,
    sourceUrl: file.storageUrl,
  });

  const initialVideoDelivery = buildMuxVideoDelivery({
    asset: createdAsset,
    file,
  });
  await updateFileAssetStorageMetadata(workspaceUuid, file.id, userId, {
    videoDelivery: initialVideoDelivery,
  });

  if (createdAsset.status === "ready" || createdAsset.status === "errored") {
    return;
  }

  const finalAsset = await pollMuxAsset(createdAsset.id);
  const finalVideoDelivery = buildMuxVideoDelivery({
    asset: finalAsset,
    file: {
      ...file,
      videoDelivery: initialVideoDelivery,
    },
  });
  await updateFileAssetStorageMetadata(workspaceUuid, file.id, userId, {
    videoDelivery: finalVideoDelivery,
  });

  if (finalVideoDelivery.status === "ready") {
    await publishFilesInvalidationEvent({
      workspaceUuid,
      folderId: file.folderId,
      reason: "file.updated",
    });
    await publishFilesInvalidationEvent({
      workspaceUuid,
      reason: "tree.changed",
    });
  }
}

export async function syncMuxVideoDeliveryForFile(input: {
  file: ExplorerFileRecord;
  userId: string;
  workspaceUuid: string;
}) {
  const { file, userId, workspaceUuid } = input;
  const assetId = file.videoDelivery?.mux?.assetId;
  if (!(assetId && hasMuxVideoCredentials())) {
    return file;
  }

  const asset = await getMuxAsset(assetId);
  const nextVideoDelivery = buildMuxVideoDelivery({
    asset,
    file,
  });
  if (
    JSON.stringify(nextVideoDelivery) === JSON.stringify(file.videoDelivery)
  ) {
    return file;
  }

  return (
    (await updateFileAssetStorageMetadata(workspaceUuid, file.id, userId, {
      videoDelivery: nextVideoDelivery,
    })) ?? file
  );
}

export function scheduleAsyncVideoDeliveryOptimization(input: {
  file: Pick<
    ExplorerFileRecord,
    | "folderId"
    | "id"
    | "mimeType"
    | "name"
    | "sizeBytes"
    | "storageKey"
    | "storageUrl"
    | "videoDelivery"
  >;
  userId: string;
  workspaceUuid: string;
}) {
  const { file, userId, workspaceUuid } = input;
  if (!(isAsyncVideoOptimizationEnabled() && canOptimizeVideoDelivery(file))) {
    return false;
  }

  const pendingVideoDelivery = buildPendingVideoDelivery({
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    storageKey: file.storageKey,
    storageUrl: file.storageUrl,
  });

  const runOptimization = async () => {
    try {
      await updateFileAssetStorageMetadata(workspaceUuid, file.id, userId, {
        videoDelivery: pendingVideoDelivery,
      });

      if (hasMuxVideoCredentials()) {
        try {
          await runMuxVideoDelivery({
            file: {
              ...file,
              videoDelivery: pendingVideoDelivery,
            },
            userId,
            workspaceUuid,
          });
          return;
        } catch (error) {
          console.warn(
            "Mux video delivery failed, falling back to legacy optimization",
            {
              workspaceUuid,
              fileId: file.id,
              error,
            }
          );
        }
      }

      await runLegacyVideoOptimization({
        file,
        pendingVideoDelivery,
        userId,
        workspaceUuid,
      });
    } catch (error) {
      await updateFileAssetStorageMetadata(workspaceUuid, file.id, userId, {
        videoDelivery: buildFailedVideoDelivery(pendingVideoDelivery, error),
      });
      console.warn("Async video optimization skipped", {
        workspaceUuid,
        fileId: file.id,
        error,
      });
    }
  };

  runOptimization();

  return true;
}
