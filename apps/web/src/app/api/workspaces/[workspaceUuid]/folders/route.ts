import {
  createFolder,
  isSharedFilesVirtualFolderId,
  userCanAccessWorkspace,
  userCanEditFolder,
} from "@/lib/file-data";
import { publishFilesInvalidationEvent } from "@/lib/files-realtime-publisher";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/workspace";

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceUuid: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    parentId?: string | null;
    name?: string;
  };

  if (typeof body.parentId === "undefined" || !body.name) {
    return NextResponse.json({ error: "Missing parentId or name" }, { status: 400 });
  }
  if (body.parentId && isSharedFilesVirtualFolderId(body.parentId, workspaceUuid)) {
    return NextResponse.json({ error: "Cannot create items in Shared Files" }, { status: 400 });
  }
  const canEdit =
    typeof body.parentId === "string"
      ? await userCanEditFolder({
          workspaceId: workspaceUuid,
          folderId: body.parentId,
          userId: user.id,
        })
      : await userCanAccessWorkspace(user.id, workspaceUuid);
  if (!canEdit) {
    return NextResponse.json({ error: "Read-only folder" }, { status: 403 });
  }

  const folder = await createFolder(workspaceUuid, body.parentId, body.name, user.id);
  if (!folder) {
    return NextResponse.json({ error: "Unable to create folder" }, { status: 400 });
  }

  await publishFilesInvalidationEvent({
    workspaceUuid,
    folderId: body.parentId ?? undefined,
    reason: "folder.created",
  });
  await publishFilesInvalidationEvent({
    workspaceUuid,
    reason: "tree.changed",
  });

  return NextResponse.json({ folder }, { status: 201 });
}
