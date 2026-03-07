import {
  getFolderWithAncestors,
  listWorkspaceMembers,
  listFolderContents,
  softDeleteFolder,
  updateFolder,
} from "@/lib/file-data";
import { NextResponse } from "next/server";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceUuid: string; folderUuid: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid, folderUuid } = await context.params;
  const canAccess = await ensureWorkspaceAccessForUser(user.id, workspaceUuid);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const members = await listWorkspaceMembers(workspaceUuid);
  const currentMember = members.find((member) => member.userId === user.id);
  if (!currentMember || !["owner", "admin"].includes(currentMember.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const folder = await getFolderWithAncestors(workspaceUuid, folderUuid);
  if (!folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const children = await listFolderContents(workspaceUuid, folderUuid);
  return NextResponse.json({
    folder: folder.folder,
    ancestors: folder.ancestors,
    folders: children.folders,
    files: children.files,
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
  const canAccess = await ensureWorkspaceAccessForUser(user.id, workspaceUuid);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const members = await listWorkspaceMembers(workspaceUuid);
  const currentMember = members.find((member) => member.userId === user.id);
  if (!currentMember || !["owner", "admin"].includes(currentMember.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    parentId?: string | null;
  };

  const folder = await updateFolder(workspaceUuid, folderUuid, {
    name: body.name,
    parentId: body.parentId,
  });

  if (!folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

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
  const canAccess = await ensureWorkspaceAccessForUser(user.id, workspaceUuid);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await softDeleteFolder(workspaceUuid, folderUuid);
  return NextResponse.json({ ok: true });
}
