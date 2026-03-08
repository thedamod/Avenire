import {
  getFileAssetByContentHash,
  getFileAssetByStorageKey,
  isSharedFilesVirtualFolderId,
  listWorkspaceMembers,
  registerFileAsset,
  softDeleteFileAsset,
  updateFileAssetStorageMetadata,
} from "@/lib/file-data";
import { UTApi } from "@avenire/storage";
import { publishFilesInvalidationEvent } from "@/lib/files-realtime-publisher";
import { NextResponse } from "next/server";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";
import { consumeUploadUnits } from "@/lib/billing";
import { createApiLogger } from "@/lib/observability";
import { enqueueIngestionJob, hasSuccessfulIngestionForFile } from "@/lib/ingestion-data";
import { optimizeAndReuploadVideo } from "@/lib/video-optimization";

function classifyStoredFileType(mimeType: string | null) {
  if (!mimeType) {
    return "unknown";
  }

  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("text/")) return "text";
  if (mimeType.startsWith("audio/")) return "audio";
  return "other";
}

function normalizeSha256(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceUuid: string }> }
) {
  const user = await getSessionUser();
  const apiLogger = createApiLogger({
    request,
    route: "/api/workspaces/[workspaceUuid]/files/register",
    feature: "files",
    userId: user?.id ?? null,
  });
  void apiLogger.requestStarted();

  if (!user) {
    void apiLogger.requestFailed(401, "Unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid } = await context.params;
  const canAccess = await ensureWorkspaceAccessForUser(user.id, workspaceUuid);
  if (!canAccess) {
    void apiLogger.requestFailed(403, "Forbidden", { workspaceUuid });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const members = await listWorkspaceMembers(workspaceUuid);
  const currentMember = members.find((member) => member.userId === user.id);
  if (!currentMember || !["owner", "admin"].includes(currentMember.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    folderId?: string;
    storageKey?: string;
    storageUrl?: string;
    name?: string;
    mimeType?: string | null;
    sizeBytes?: number;
    metadata?: Record<string, unknown>;
    contentHashSha256?: string | null;
    hashComputedBy?: "client" | "server" | null;
  };

  if (
    !body.folderId ||
    !body.storageKey ||
    !body.storageUrl ||
    !body.name ||
    typeof body.sizeBytes !== "number"
  ) {
    void apiLogger.requestFailed(400, "Missing file metadata", {
      workspaceUuid,
    });
    return NextResponse.json(
      { error: "Missing file metadata" },
      { status: 400 }
    );
  }
  if (isSharedFilesVirtualFolderId(body.folderId, workspaceUuid)) {
    void apiLogger.requestFailed(400, "Cannot create items in Shared Files", {
      workspaceUuid,
    });
    return NextResponse.json(
      { error: "Cannot create items in Shared Files" },
      { status: 400 }
    );
  }

  const normalizedHash = normalizeSha256(body.contentHashSha256);
  const existingByHashRaw = normalizedHash
    ? await getFileAssetByContentHash(workspaceUuid, normalizedHash)
    : null;
  const existingByHash =
    existingByHashRaw?.hashVerificationStatus === "verified"
      ? existingByHashRaw
      : null;
  const existing =
    existingByHash ??
    (await getFileAssetByStorageKey(workspaceUuid, body.storageKey));
  if (existing) {
    const hasSucceeded = await hasSuccessfulIngestionForFile(
      workspaceUuid,
      existing.id
    ).catch(() => false);
    const maybeJob = hasSucceeded
      ? null
      : await enqueueIngestionJob({
          workspaceId: workspaceUuid,
          fileId: existing.id,
        }).catch(() => null);
    void apiLogger.requestSucceeded(200, {
      workspaceUuid,
      fileId: existing.id,
      deduplicated: true,
    });
    return NextResponse.json(
      { file: existing, ingestionJob: maybeJob },
      { status: 200 }
    );
  }

  let file;
  try {
    file = await registerFileAsset(workspaceUuid, user.id, {
      folderId: body.folderId,
      storageKey: body.storageKey,
      storageUrl: body.storageUrl,
      name: body.name,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
      metadata: body.metadata,
      contentHashSha256: normalizedHash,
      hashComputedBy: normalizedHash ? body.hashComputedBy ?? "client" : null,
      hashVerificationStatus: normalizedHash ? "pending" : null,
    });
  } catch {
    return NextResponse.json({ error: "Invalid folder" }, { status: 400 });
  }

  const usage = await consumeUploadUnits(user.id, 1);
  if (!usage.ok) {
    await softDeleteFileAsset(workspaceUuid, file.id, user.id);
    const retryAfter = usage.retryAfter?.toISOString() ?? null;
    void apiLogger.rateLimited("upload", retryAfter, {
      workspaceUuid,
      fileId: file.id,
    });
    return NextResponse.json(
      {
        error: "Upload usage limit reached",
        retryAfter,
      },
      { status: 429 }
    );
  }

  let storedFile = file;
  if (storedFile.mimeType?.startsWith("video/")) {
    const originalStorageKey = storedFile.storageKey;
    const optimized = await optimizeAndReuploadVideo({
      sourceUrl: storedFile.storageUrl,
      sourceName: storedFile.name,
    }).catch(() => null);

    if (optimized) {
      try {
        const updated = await updateFileAssetStorageMetadata(
          workspaceUuid,
          storedFile.id,
          user.id,
          {
            optimizedStorageKey: optimized.storageKey,
            optimizedStorageUrl: optimized.storageUrl,
            optimizedName: optimized.name,
            optimizedMimeType: optimized.mimeType,
            optimizedSizeBytes: optimized.sizeBytes,
          }
        );

        if (updated) {
          storedFile = updated;
          if (
            process.env.UPLOADTHING_TOKEN &&
            originalStorageKey &&
            originalStorageKey !== optimized.storageKey
          ) {
            const utapi = new UTApi({ token: process.env.UPLOADTHING_TOKEN });
            await utapi.deleteFiles(originalStorageKey).catch(() => undefined);
          }
        } else if (process.env.UPLOADTHING_TOKEN) {
          const utapi = new UTApi({ token: process.env.UPLOADTHING_TOKEN });
          await utapi.deleteFiles(optimized.storageKey).catch(() => undefined);
        }
      } catch (error) {
        if (process.env.UPLOADTHING_TOKEN) {
          const utapi = new UTApi({ token: process.env.UPLOADTHING_TOKEN });
          await utapi.deleteFiles(optimized.storageKey).catch(() => undefined);
        }
        void apiLogger.error("files.video_optimization.failed", {
          workspaceUuid,
          fileId: storedFile.id,
          optimizedStorageKey: optimized.storageKey,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  await publishFilesInvalidationEvent({
    workspaceUuid,
    folderId: body.folderId,
    reason: "file.created",
  });
  await publishFilesInvalidationEvent({
    workspaceUuid,
    reason: "tree.changed",
  });

  const hasSucceededIngestion = await hasSuccessfulIngestionForFile(
    workspaceUuid,
    storedFile.id
  ).catch(() => false);
  const ingestionJob = hasSucceededIngestion
    ? null
    : await enqueueIngestionJob({
        workspaceId: workspaceUuid,
        fileId: storedFile.id,
      }).catch((error) => {
        console.error("Failed to enqueue ingestion job", {
          workspaceUuid,
          fileId: storedFile.id,
          error,
        });
        return null;
      });

  void apiLogger.meter("meter.upload.filesystem.registered", {
    workspaceUuid,
    fileId: storedFile.id,
    mimeType: storedFile.mimeType,
    fileType: classifyStoredFileType(storedFile.mimeType),
    sizeBytes: storedFile.sizeBytes,
  });
  void apiLogger.meter("meter.upload.file_type", {
    workspaceUuid,
    fileType: classifyStoredFileType(storedFile.mimeType),
    mimeType: storedFile.mimeType,
  });
  void apiLogger.featureUsed("workspace.filesystem.upload", {
    workspaceUuid,
    fileId: storedFile.id,
  });
  void apiLogger.requestSucceeded(201, {
    workspaceUuid,
    fileId: storedFile.id,
    mimeType: storedFile.mimeType,
    sizeBytes: storedFile.sizeBytes,
  });

  return NextResponse.json({ file: storedFile, ingestionJob }, { status: 201 });
}
