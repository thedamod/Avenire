import {
  getFileAssetByStorageKey,
  isSharedFilesVirtualFolderId,
  listWorkspaceMembers,
  registerFileAsset,
  softDeleteFileAsset,
} from "@/lib/file-data";
import { publishFilesInvalidationEvent } from "@/lib/files-realtime-publisher";
import { NextResponse } from "next/server";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";
import { consumeUploadUnits } from "@/lib/billing";
import { createApiLogger } from "@/lib/observability";

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

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceUuid: string }> },
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
  };

  if (
    !body.folderId ||
    !body.storageKey ||
    !body.storageUrl ||
    !body.name ||
    typeof body.sizeBytes !== "number"
  ) {
    void apiLogger.requestFailed(400, "Missing file metadata", { workspaceUuid });
    return NextResponse.json({ error: "Missing file metadata" }, { status: 400 });
  }
  if (isSharedFilesVirtualFolderId(body.folderId, workspaceUuid)) {
    void apiLogger.requestFailed(400, "Cannot create items in Shared Files", { workspaceUuid });
    return NextResponse.json({ error: "Cannot create items in Shared Files" }, { status: 400 });
  }

  const existing = await getFileAssetByStorageKey(workspaceUuid, body.storageKey);
  if (existing) {
    void apiLogger.requestSucceeded(200, {
      workspaceUuid,
      fileId: existing.id,
      deduplicated: true,
    });
    return NextResponse.json({ file: existing }, { status: 200 });
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
    });
  } catch {
    return NextResponse.json({ error: "Invalid folder" }, { status: 400 });
  }

  const usage = await consumeUploadUnits(user.id, 1);
  if (!usage.ok) {
    await softDeleteFileAsset(workspaceUuid, file.id);
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
      { status: 429 },
    );
  }

  const storedFile = file;

  await publishFilesInvalidationEvent({
    workspaceUuid,
    folderId: body.folderId,
    reason: "file.created",
  });
  await publishFilesInvalidationEvent({
    workspaceUuid,
    reason: "tree.changed",
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

  return NextResponse.json({ file: storedFile }, { status: 201 });
}
