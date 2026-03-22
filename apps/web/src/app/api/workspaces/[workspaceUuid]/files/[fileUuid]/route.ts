import {
  deleteIngestionDataForFile,
  getFileAssetById,
  isSharedFilesVirtualFolderId,
  softDeleteFileAsset,
  userCanEditFile,
  updateFileAsset,
} from "@/lib/file-data";
import { publishFilesInvalidationEvent } from "@/lib/files-realtime-publisher";
import {
  normalizeFrontmatterProperties,
  normalizePageMetadataState,
} from "@/lib/frontmatter";
import { listWorkspaceMembers } from "@/lib/file-data";
import { NextResponse } from "next/server";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceUuid: string; fileUuid: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid, fileUuid } = await context.params;
  const hasAccess = await ensureWorkspaceAccessForUser(user.id, workspaceUuid);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const file = await getFileAssetById(workspaceUuid, fileUuid);
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  return NextResponse.json({
    file: {
      id: file.id,
      folderId: file.folderId,
      mimeType: file.mimeType ?? null,
      name: file.name,
    },
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ workspaceUuid: string; fileUuid: string }> },
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
  const members = await listWorkspaceMembers(workspaceUuid);
  const currentMember = members.find((member) => member.userId === user.id);
  if (!currentMember || !["owner", "admin"].includes(currentMember.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    folderId?: string;
    metadata?: Record<string, unknown>;
    page?: {
      bannerUrl?: string | null;
      icon?: string | null;
      properties?: Record<string, unknown>;
    };
  };
  if (body.folderId && isSharedFilesVirtualFolderId(body.folderId, workspaceUuid)) {
    return NextResponse.json({ error: "Cannot move items into Shared Files" }, { status: 400 });
  }

  const nextPage =
    body.page === undefined
      ? undefined
      : normalizePageMetadataState({
          ...body.page,
          properties: normalizeFrontmatterProperties(body.page?.properties),
        });

  const file = await updateFileAsset(workspaceUuid, fileUuid, user.id, {
    folderId: body.folderId,
    metadata:
      body.metadata || nextPage !== undefined
        ? {
            ...(body.metadata ?? {}),
            ...(nextPage === undefined ? {} : { page: nextPage }),
          }
        : undefined,
    name: body.name,
  });

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
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

  return NextResponse.json({ file });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ workspaceUuid: string; fileUuid: string }> },
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
  const members = await listWorkspaceMembers(workspaceUuid);
  const currentMember = members.find((member) => member.userId === user.id);
  if (!currentMember || !["owner", "admin"].includes(currentMember.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await getFileAssetById(workspaceUuid, fileUuid);
  if (!existing) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  await deleteIngestionDataForFile(workspaceUuid, fileUuid);

  const ok = await softDeleteFileAsset(workspaceUuid, fileUuid);
  if (!ok) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  await publishFilesInvalidationEvent({
    workspaceUuid,
    folderId: existing.folderId || undefined,
    reason: "file.deleted",
  });
  await publishFilesInvalidationEvent({
    workspaceUuid,
    reason: "tree.changed",
  });

  return NextResponse.json({ ok: true });
}
