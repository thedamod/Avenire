import {
  getFileAssetById,
  isSharedFilesVirtualFolderId,
  softDeleteFileAsset,
  userCanEditFile,
  updateFileAsset,
} from "@/lib/file-data";
import { publishFilesInvalidationEvent } from "@/lib/files-realtime-publisher";
import { listWorkspaceMembers } from "@/lib/file-data";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/workspace";

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
  };
  if (body.folderId && isSharedFilesVirtualFolderId(body.folderId, workspaceUuid)) {
    return NextResponse.json({ error: "Cannot move items into Shared Files" }, { status: 400 });
  }

  const file = await updateFileAsset(workspaceUuid, fileUuid, user.id, {
    folderId: body.folderId,
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

  const ok = await softDeleteFileAsset(workspaceUuid, fileUuid);
  if (!ok) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  await publishFilesInvalidationEvent({
    workspaceUuid,
    folderId: existingFile.folderId || undefined,
    reason: "file.deleted",
  });
  await publishFilesInvalidationEvent({
    workspaceUuid,
    reason: "tree.changed",
  });

  return NextResponse.json({ ok: true });
}
