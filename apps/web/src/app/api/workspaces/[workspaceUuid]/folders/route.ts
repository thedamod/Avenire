import { createFolder, listWorkspaceMembers } from "@/lib/file-data";
import { NextResponse } from "next/server";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceUuid: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid } = await context.params;
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
    parentId?: string | null;
    name?: string;
  };

  if (typeof body.parentId === "undefined" || !body.name) {
    return NextResponse.json({ error: "Missing parentId or name" }, { status: 400 });
  }

  const folder = await createFolder(workspaceUuid, body.parentId, body.name, user.id);
  if (!folder) {
    return NextResponse.json({ error: "Unable to create folder" }, { status: 400 });
  }

  return NextResponse.json({ folder }, { status: 201 });
}
