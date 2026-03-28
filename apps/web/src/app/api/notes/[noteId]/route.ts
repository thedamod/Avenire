import { NextResponse } from "next/server";
import { scheduleIngestionJob } from "@avenire/ingestion/queue";
import {
  deleteIngestionDataForFile,
  getFileAssetById,
  isMarkdownFileRecord,
  getWorkspaceIdForFile,
  updateFileAsset,
  upsertMarkdownFileContent,
  userCanEditFile,
} from "@/lib/file-data";
import { publishFilesInvalidationEvent } from "@/lib/files-realtime-publisher";
import {
  normalizeFrontmatterProperties,
  normalizePageMetadataState,
} from "@/lib/frontmatter";
import { getSessionUser } from "@/lib/workspace";

const NOTE_REINDEX_DEBOUNCE_MS = 3000;

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
  if (!isMarkdownFileRecord(file)) {
    return NextResponse.json({ error: "Not a markdown file" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    content?: string;
    page?: {
      bannerUrl?: string | null;
      icon?: string | null;
      properties?: Record<string, unknown>;
    };
  };
  const hasContent = typeof body.content === "string";
  const hasPage = body.page !== undefined;

  if (!(hasContent || hasPage)) {
    return NextResponse.json({ error: "Invalid note update" }, { status: 400 });
  }

  const nextContent = hasContent ? body.content ?? "" : undefined;
  const trimmed = nextContent?.trim() ?? "";
  const nextPage = hasPage
    ? normalizePageMetadataState({
        ...file.page,
        ...body.page,
        properties:
          body.page?.properties === undefined
            ? file.page?.properties ?? {}
            : normalizeFrontmatterProperties(body.page.properties),
      })
    : file.page ?? null;

  const [updatedNote, updatedFile] = await Promise.all([
    hasContent
      ? upsertMarkdownFileContent({
          fileId: noteId,
          userId: user.id,
          content: nextContent ?? "",
          workspaceId,
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
  } else if (hasContent) {
    await scheduleIngestionJob({
      workspaceId,
      fileId: noteId,
      sourceType: "markdown",
      delayMs: NOTE_REINDEX_DEBOUNCE_MS,
    });
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
