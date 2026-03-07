import { listWorkspaceMembers, softDeleteFileAsset, updateFileAsset } from "@/lib/file-data";
import { NextResponse } from "next/server";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ workspaceUuid: string; fileUuid: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid, fileUuid } = await context.params;
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
    folderId?: string;
  };

  const file = await updateFileAsset(workspaceUuid, fileUuid, {
    folderId: body.folderId,
    name: body.name,
  });

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

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
  const canAccess = await ensureWorkspaceAccessForUser(user.id, workspaceUuid);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const members = await listWorkspaceMembers(workspaceUuid);
  const currentMember = members.find((member) => member.userId === user.id);
  if (!currentMember || !["owner", "admin"].includes(currentMember.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ok = await softDeleteFileAsset(workspaceUuid, fileUuid);
  if (!ok) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
