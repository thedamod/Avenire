import { NextResponse } from "next/server";
import {
  deleteIngestionDataForFile,
  getFileAssetById,
  getWorkspaceIdForFile,
  updateNoteContent,
  userCanEditFile,
} from "@/lib/file-data";
import { publishFilesInvalidationEvent } from "@/lib/files-realtime-publisher";
import { getSessionUser } from "@/lib/workspace";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ noteId: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { noteId } = await context.params;
  const workspaceId = await getWorkspaceIdForFile(noteId);
  if (!workspaceId) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const canEdit = await userCanEditFile({
    workspaceId,
    fileId: noteId,
    userId: user.id,
  });
  if (!canEdit) {
    return NextResponse.json({ error: "Read-only note" }, { status: 403 });
  }

  const file = await getFileAssetById(workspaceId, noteId);
  if (!file) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }
  if (!file.isNote) {
    return NextResponse.json({ error: "Not a note" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    content?: string;
  };
  const content = typeof body.content === "string" ? body.content : "";
  const trimmed = content.trim();

  const updated = await updateNoteContent({
    fileId: noteId,
    userId: user.id,
    content,
  });

  if (!updated) {
    return NextResponse.json({ error: "Unable to save note" }, { status: 500 });
  }

  if (!trimmed) {
    await deleteIngestionDataForFile(workspaceId, noteId);
  }

  await publishFilesInvalidationEvent({
    workspaceUuid: workspaceId,
    folderId: file.folderId || undefined,
    reason: "file.updated",
  });

  return NextResponse.json({ updatedAt: updated.updatedAt });
}
