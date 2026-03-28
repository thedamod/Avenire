import { NextResponse } from "next/server";
import {
  isSharedFilesVirtualFolderId,
  createWorkspaceNoteFile,
  userCanEditFolder,
} from "@/lib/file-data";
import { createApiLogger } from "@/lib/observability";
import { publishFilesInvalidationEvent } from "@/lib/files-realtime-publisher";
import { extractMarkdownNotePageMetadata } from "@/lib/markdown-note-template";
import { registerWorkspaceUploadedFile } from "@/lib/upload-registration";
import { scheduleAsyncVideoDeliveryOptimization } from "@/lib/video-delivery";
import { getSessionUser } from "@/lib/workspace";

function classifyStoredFileType(mimeType: string | null) {
  if (!mimeType) {
    return "unknown";
  }

  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  if (mimeType === "application/pdf") {
    return "pdf";
  }
  if (mimeType.startsWith("text/")) {
    return "text";
  }
  if (mimeType.startsWith("audio/")) {
    return "audio";
  }
  return "other";
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

  const body = (await request.json().catch(() => ({}))) as {
    folderId?: string;
    content?: string;
    storageKey?: string;
    storageUrl?: string;
    name?: string;
    mimeType?: string | null;
    sizeBytes?: number;
    metadata?: Record<string, unknown>;
    contentHashSha256?: string | null;
    hashComputedBy?: "client" | "server" | null;
  };

  if (!body.folderId) {
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
  const canEdit = await userCanEditFolder({
    workspaceId: workspaceUuid,
    folderId: body.folderId,
    userId: user.id,
  });
  if (!canEdit) {
    void apiLogger.requestFailed(403, "Read-only folder", { workspaceUuid });
    return NextResponse.json({ error: "Read-only folder" }, { status: 403 });
  }

  const nextMetadata = {
    ...(body.metadata ?? {}),
  };

  if (typeof body.content === "string") {
    if (!body.name) {
      void apiLogger.requestFailed(400, "Missing note metadata", {
        workspaceUuid,
      });
      return NextResponse.json(
        { error: "Missing note metadata" },
        { status: 400 }
      );
    }

    const templatePage = extractMarkdownNotePageMetadata(body.content);
    const currentPage =
      nextMetadata.page &&
      typeof nextMetadata.page === "object" &&
      !Array.isArray(nextMetadata.page)
        ? (nextMetadata.page as Record<string, unknown>)
        : null;

    if (templatePage || currentPage) {
      nextMetadata.page = {
        ...(currentPage ?? {}),
        ...(templatePage ?? {}),
        properties: {
          ...(((currentPage?.properties as Record<string, unknown> | undefined) ??
            {}) as Record<string, unknown>),
          ...(templatePage?.properties ?? {}),
        },
      };
    }

    const file = await createWorkspaceNoteFile({
      workspaceId: workspaceUuid,
      userId: user.id,
      folderId: body.folderId,
      name: body.name,
      baseContent: body.content,
      content: body.content,
      metadata: nextMetadata,
    });

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
      fileId: file.id,
      mimeType: file.mimeType,
      fileType: classifyStoredFileType(file.mimeType),
      sizeBytes: file.sizeBytes,
    });
    void apiLogger.meter("meter.upload.file_type", {
      workspaceUuid,
      fileType: classifyStoredFileType(file.mimeType),
      mimeType: file.mimeType,
    });
    void apiLogger.featureUsed("workspace.filesystem.upload", {
      workspaceUuid,
      fileId: file.id,
    });
    void apiLogger.requestSucceeded(201, {
      workspaceUuid,
      fileId: file.id,
      deduplicated: false,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    });

    return NextResponse.json(
      {
        file,
        ingestionJob: null,
        deduplicated: false,
      },
      { status: 201 }
    );
  }

  if (
    !(body.folderId && body.storageKey && body.storageUrl && body.name) ||
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

  let registrationResult: Awaited<
    ReturnType<typeof registerWorkspaceUploadedFile>
  >;
  try {
    registrationResult = await registerWorkspaceUploadedFile({
      workspaceUuid,
      userId: user.id,
      folderId: body.folderId,
      storageKey: body.storageKey,
      storageUrl: body.storageUrl,
      name: body.name,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
      metadata: nextMetadata,
      contentHashSha256: body.contentHashSha256,
      hashComputedBy: body.hashComputedBy,
    });
  } catch (error) {
    const isRateLimit =
      (error as { code?: string } | null | undefined)?.code ===
      "UPLOAD_RATE_LIMIT";
    const retryAfter =
      (error as { retryAfter?: string | null } | null | undefined)
        ?.retryAfter ?? null;
    if (isRateLimit) {
      void apiLogger.rateLimited("upload", retryAfter, { workspaceUuid });
      return NextResponse.json(
        {
          error: "Upload usage limit reached",
          retryAfter,
        },
        { status: 429 }
      );
    }
    void apiLogger.requestFailed(500, error, { workspaceUuid });
    return NextResponse.json(
      { error: "Failed to register file" },
      { status: 500 }
    );
  }

  const storedFile = registrationResult.file;
  const ingestionJob = registrationResult.ingestionJob;

  if (
    registrationResult.status === "created" &&
    storedFile.mimeType?.startsWith("video/")
  ) {
    scheduleAsyncVideoDeliveryOptimization({
      file: storedFile,
      userId: user.id,
      workspaceUuid,
    });
  }

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
    deduplicated: registrationResult.status === "deduplicated",
    mimeType: storedFile.mimeType,
    sizeBytes: storedFile.sizeBytes,
  });

  return NextResponse.json(
    {
      file: storedFile,
      ingestionJob,
      deduplicated: registrationResult.status === "deduplicated",
    },
    { status: registrationResult.status === "deduplicated" ? 200 : 201 }
  );
}
