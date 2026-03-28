import { NextResponse } from "next/server";
import {
  getFileAssetById,
  isMarkdownFileRecord,
  isTrustedStorageUrl,
  replaceFileAssetContent,
  upsertMarkdownFileContent,
  userCanEditFile,
} from "@/lib/file-data";
import { publishFilesInvalidationEvent } from "@/lib/files-realtime-publisher";
import { normalizePageMetadataState } from "@/lib/frontmatter";
import { deleteUploadThingFile } from "@/lib/upload-registration";
import { getSessionUser } from "@/lib/workspace";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ workspaceUuid: string; fileUuid: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid, fileUuid } = await context.params;
  const canEdit = await userCanEditFile({
    workspaceId: workspaceUuid,
    fileId: fileUuid,
    userId: user.id,
  });
  if (!canEdit) {
    return NextResponse.json({ error: "Read-only file" }, { status: 403 });
  }

  const existing = await getFileAssetById(workspaceUuid, fileUuid);
  if (!existing) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  if (existing.isNote) {
    return NextResponse.json(
      { error: "Use the note update route" },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    content?: string;
    mimeType?: string | null;
    page?: {
      bannerUrl?: string | null;
      icon?: string | null;
      properties?: Record<string, unknown>;
    };
    sizeBytes?: number;
    storageKey?: string;
    storageUrl?: string;
  };

  const storageKey = String(body.storageKey ?? "").trim();
  const storageUrl = String(body.storageUrl ?? "").trim();
  const sizeBytes = Number(body.sizeBytes);
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : null;
  const content =
    typeof body.content === "string" ? body.content : null;
  const isMarkdownFile = isMarkdownFileRecord(existing);

  const nextPage =
    body.page === undefined ? undefined : normalizePageMetadataState(body.page);

  if (isMarkdownFile && content !== null) {
    const replaced = await upsertMarkdownFileContent({
      content,
      fileId: fileUuid,
      metadata: nextPage === undefined ? undefined : { page: nextPage },
      userId: user.id,
      workspaceId: workspaceUuid,
    });

    if (!replaced) {
      return NextResponse.json(
        { error: "Unable to replace file content" },
        { status: 404 }
      );
    }

    await publishFilesInvalidationEvent({
      workspaceUuid,
      folderId: replaced.file.folderId || undefined,
      reason: "file.updated",
    });

    if (
      replaced.previousStorageKey &&
      replaced.previousStorageKey !== replaced.file.storageKey
    ) {
      void deleteUploadThingFile(replaced.previousStorageKey);
    }

    return NextResponse.json({ file: replaced.file });
  }

  if (!storageKey || !storageUrl || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!isTrustedStorageUrl(storageUrl)) {
    return NextResponse.json({ error: "Invalid file source" }, { status: 400 });
  }

  const replaced = await replaceFileAssetContent(workspaceUuid, fileUuid, user.id, {
    storageKey,
    storageUrl,
    sizeBytes,
    mimeType,
    metadata: nextPage === undefined ? undefined : { page: nextPage },
    hashComputedBy: null,
    hashVerificationStatus: null,
    contentHashSha256: null,
  });

  if (!replaced) {
    return NextResponse.json({ error: "Unable to replace file content" }, { status: 404 });
  }

  await publishFilesInvalidationEvent({
    workspaceUuid,
    folderId: replaced.file.folderId || undefined,
    reason: "file.updated",
  });

  // Best-effort cleanup of the old blob.
  if (
    replaced.previousStorageKey &&
    replaced.previousStorageKey !== replaced.file.storageKey
  ) {
    void deleteUploadThingFile(replaced.previousStorageKey);
  }

  return NextResponse.json({ file: replaced.file });
}
