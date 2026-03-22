import { NextResponse } from "next/server";
import {
  deleteIngestionDataForFile,
  getFileAssetById,
  getNoteContent,
  getWorkspaceIdForFile,
  updateFileAsset,
  updateNoteContent,
  userCanEditFile,
} from "@/lib/file-data";
import { publishFilesInvalidationEvent } from "@/lib/files-realtime-publisher";
import {
  normalizeFrontmatterProperties,
  normalizePageMetadataState,
  resolvePageDocument,
} from "@/lib/frontmatter";
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

  const currentNote = await getNoteContent(noteId);

  const body = (await request.json().catch(() => ({}))) as {
    content?: string;
    page?: {
      bannerUrl?: string | null;
      icon?: string | null;
      properties?: Record<string, unknown>;
    };
    updatedAt?: string;
  };
  const hasContent = typeof body.content === "string";
  const hasPage = body.page !== undefined;
  const expectedUpdatedAt =
    typeof body.updatedAt === "string" && body.updatedAt.trim().length > 0
      ? body.updatedAt
      : null;

  if (
    expectedUpdatedAt &&
    currentNote?.updatedAt &&
    currentNote.updatedAt.toISOString() !== expectedUpdatedAt
  ) {
    return NextResponse.json(
      {
        content: currentNote.content,
        error: "The note changed on another device. Reload before saving.",
        page: file.page ?? null,
        updatedAt: currentNote.updatedAt.toISOString(),
      },
      { status: 409 }
    );
  }

  if (!(hasContent || hasPage)) {
    return NextResponse.json({ error: "Invalid note update" }, { status: 400 });
  }

  const resolvedDocument = hasContent
    ? resolvePageDocument({
        content: body.content ?? "",
        page: file.page ?? null,
      })
    : null;
  const nextContent = resolvedDocument?.body;
  const trimmed = nextContent?.trim() ?? "";
  const nextPage = hasPage
    ? normalizePageMetadataState({
        ...file.page,
        ...body.page,
        properties:
          body.page?.properties === undefined
            ? file.page?.properties ?? resolvedDocument?.page.properties ?? {}
            : normalizeFrontmatterProperties(body.page.properties),
      })
    : resolvedDocument?.page ?? null;

  const [updatedNote, updatedFile] = await Promise.all([
    hasContent
      ? updateNoteContent({
          fileId: noteId,
          userId: user.id,
          content: nextContent ?? "",
        })
      : Promise.resolve(null),
    nextPage
      ? updateFileAsset(workspaceId, noteId, user.id, {
          metadata: {
            page: nextPage,
          },
        })
      : Promise.resolve(file),
  ]);

  if (hasContent && !updatedNote) {
    return NextResponse.json({ error: "Unable to save note" }, { status: 500 });
  }
  if (!updatedFile) {
    return NextResponse.json(
      { error: "Unable to update note metadata" },
      { status: 500 }
    );
  }

  if (hasContent && !trimmed) {
    await deleteIngestionDataForFile(workspaceId, noteId);
  }

  await publishFilesInvalidationEvent({
    workspaceUuid: workspaceId,
    folderId: file.folderId || undefined,
    reason: "file.updated",
  });

  return NextResponse.json({
    page: updatedFile.page ?? nextPage,
    updatedAt: updatedNote?.updatedAt ?? updatedFile.updatedAt,
  });
}
