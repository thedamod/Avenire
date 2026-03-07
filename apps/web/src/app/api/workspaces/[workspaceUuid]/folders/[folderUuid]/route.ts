import {
  getFolderWithAncestors,
  isSharedFilesVirtualFolderId,
  listFolderContentsForUser,
  listWorkspaceMembers,
  softDeleteFolder,
  userCanEditFolder,
  userCanViewFolder,
  updateFolder,
} from "@/lib/file-data";
import { publishFilesInvalidationEvent } from "@/lib/files-realtime-publisher";
import { getIngestionFlagsByFileIds } from "@/lib/ingestion-data";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/workspace";

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceUuid: string; folderUuid: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid, folderUuid } = await context.params;
  const canView = await userCanViewFolder({
    workspaceId: workspaceUuid,
    folderId: folderUuid,
    userId: user.id,
  });
  if (!canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const folder = await getFolderWithAncestors(workspaceUuid, folderUuid, user.id);
  if (!folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const children = await listFolderContentsForUser(workspaceUuid, folderUuid, user.id);
  const ingestionFlags = await getIngestionFlagsByFileIds(
    workspaceUuid,
    (children.files ?? []).map((file) => file.id)
  );
  return NextResponse.json({
    folder: folder.folder,
    ancestors: folder.ancestors,
    folders: children.folders,
    files: (children.files ?? []).map((file) => ({
      ...file,
      isIngested: ingestionFlags[file.id] ?? false,
    })),
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ workspaceUuid: string; folderUuid: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid, folderUuid } = await context.params;
  const canEdit = await userCanEditFolder({
    workspaceId: workspaceUuid,
    folderId: folderUuid,
    userId: user.id,
  });
  if (!canEdit) {
    return NextResponse.json({ error: "Read-only folder" }, { status: 403 });
  }
  if (isSharedFilesVirtualFolderId(folderUuid, workspaceUuid)) {
    return NextResponse.json({ error: "Shared Files is read-only" }, { status: 400 });
  }
  const members = await listWorkspaceMembers(workspaceUuid);
  const currentMember = members.find((member) => member.userId === user.id);
  if (!currentMember || !["owner", "admin"].includes(currentMember.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    bannerUrl?: string | null;
    iconColor?: string | null;
    name?: string;
    parentId?: string | null;
  };
  if (body.parentId && isSharedFilesVirtualFolderId(body.parentId, workspaceUuid)) {
    return NextResponse.json({ error: "Cannot move items into Shared Files" }, { status: 400 });
  }

  const existing = await getFolderWithAncestors(workspaceUuid, folderUuid, user.id);
  if (!existing) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }
  const oldParentId = existing.folder.parentId;

  const folder = await updateFolder(workspaceUuid, folderUuid, user.id, {
    bannerUrl: body.bannerUrl,
    iconColor: body.iconColor,
    name: body.name,
    parentId: body.parentId,
  });

  if (!folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  await publishFilesInvalidationEvent({
    workspaceUuid,
    folderId: folder.id,
    reason: "folder.updated",
  });
  const parentIds = new Set<string>();
  if (oldParentId) {
    parentIds.add(oldParentId);
  }
  if (folder.parentId) {
    parentIds.add(folder.parentId);
  }
  await Promise.all(
    [...parentIds].map((parentId) =>
      publishFilesInvalidationEvent({
        workspaceUuid,
        folderId: parentId,
        reason: "tree.changed",
      }),
    ),
  );

  return NextResponse.json({ folder });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ workspaceUuid: string; folderUuid: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid, folderUuid } = await context.params;
  const canEdit = await userCanEditFolder({
    workspaceId: workspaceUuid,
    folderId: folderUuid,
    userId: user.id,
  });
  if (!canEdit) {
    return NextResponse.json({ error: "Read-only folder" }, { status: 403 });
  }
  if (isSharedFilesVirtualFolderId(folderUuid, workspaceUuid)) {
    return NextResponse.json({ error: "Shared Files is read-only" }, { status: 400 });
  }
  const members = await listWorkspaceMembers(workspaceUuid);
  const currentMember = members.find((member) => member.userId === user.id);
  if (!currentMember || !["owner", "admin"].includes(currentMember.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deletedFolder = await softDeleteFolder(workspaceUuid, folderUuid, user.id);
  if (!deletedFolder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }
  await publishFilesInvalidationEvent({
    workspaceUuid,
    folderId: folderUuid,
    reason: "folder.deleted",
  });
  await publishFilesInvalidationEvent({
    workspaceUuid,
    reason: "tree.changed",
  });
  return NextResponse.json({ ok: true });
}
