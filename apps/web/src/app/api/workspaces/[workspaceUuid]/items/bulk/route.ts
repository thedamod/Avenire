import { NextResponse } from "next/server";
import { UTApi } from "@avenire/storage";
import { z } from "zod";
import {
  getFileAssetById,
  getFolderWithAncestors,
  isSharedFilesVirtualFolderId,
  softDeleteFileAsset,
  softDeleteFolder,
  updateFileAsset,
  updateFolder,
} from "@/lib/file-data";
import { publishFilesInvalidationEvent } from "@/lib/files-realtime-publisher";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";

const itemSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["file", "folder"]),
});

const requestSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("delete"),
    items: z.array(itemSchema).min(1).max(500),
  }),
  z.object({
    operation: z.literal("move"),
    targetFolderId: z.string().uuid(),
    items: z.array(itemSchema).min(1).max(500),
  }),
]);

type MutationResult = {
  id: string;
  kind: "file" | "folder";
  status: "ok" | "failed";
  error?: string;
};

async function deletePhysicalFileIfNeeded(storageKey: string | null | undefined) {
  if (!(storageKey && process.env.UPLOADTHING_TOKEN)) {
    return;
  }

  try {
    const utapi = new UTApi({ token: process.env.UPLOADTHING_TOKEN });
    await utapi.deleteFiles([storageKey]);
  } catch {
    // Best effort physical cleanup.
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceUuid: string }> }
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

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const payload = parsed.data;
  if (
    payload.operation === "move" &&
    isSharedFilesVirtualFolderId(payload.targetFolderId, workspaceUuid)
  ) {
    return NextResponse.json(
      { error: "Cannot move items into Shared Files" },
      { status: 400 }
    );
  }

  const results: MutationResult[] = [];

  if (payload.operation === "delete") {
    for (const item of payload.items) {
      try {
        if (item.kind === "file") {
          const file = await getFileAssetById(workspaceUuid, item.id);
          if (!file) {
            results.push({
              id: item.id,
              kind: item.kind,
              status: "failed",
              error: "File not found",
            });
            continue;
          }

          const deleted = await softDeleteFileAsset(workspaceUuid, item.id);
          if (!deleted) {
            results.push({
              id: item.id,
              kind: item.kind,
              status: "failed",
              error: "File not found",
            });
            continue;
          }

          await deletePhysicalFileIfNeeded(file.storageKey);
          results.push({ id: item.id, kind: item.kind, status: "ok" });
          continue;
        }

        const folder = await getFolderWithAncestors(workspaceUuid, item.id, user.id);
        if (!folder || isSharedFilesVirtualFolderId(item.id, workspaceUuid)) {
          results.push({
            id: item.id,
            kind: item.kind,
            status: "failed",
            error: "Folder not found",
          });
          continue;
        }

        await softDeleteFolder(workspaceUuid, item.id);
        results.push({ id: item.id, kind: item.kind, status: "ok" });
      } catch (error) {
        results.push({
          id: item.id,
          kind: item.kind,
          status: "failed",
          error: error instanceof Error ? error.message : "Delete failed",
        });
      }
    }
  } else {
    for (const item of payload.items) {
      try {
        if (item.kind === "file") {
          const updated = await updateFileAsset(workspaceUuid, item.id, user.id, {
            folderId: payload.targetFolderId,
          });

          if (!updated) {
            results.push({
              id: item.id,
              kind: item.kind,
              status: "failed",
              error: "File not found",
            });
            continue;
          }

          results.push({ id: item.id, kind: item.kind, status: "ok" });
          continue;
        }

        const updated = await updateFolder(workspaceUuid, item.id, user.id, {
          parentId: payload.targetFolderId,
        });

        if (!updated) {
          results.push({
            id: item.id,
            kind: item.kind,
            status: "failed",
            error: "Folder not found",
          });
          continue;
        }

        results.push({ id: item.id, kind: item.kind, status: "ok" });
      } catch (error) {
        results.push({
          id: item.id,
          kind: item.kind,
          status: "failed",
          error: error instanceof Error ? error.message : "Move failed",
        });
      }
    }
  }

  const succeeded = results.filter((entry) => entry.status === "ok").length;
  if (succeeded > 0) {
    await publishFilesInvalidationEvent({
      workspaceUuid,
      reason: "tree.changed",
    });
  }

  return NextResponse.json({
    ok: true,
    summary: {
      total: results.length,
      succeeded,
      failed: results.length - succeeded,
    },
    results,
  });
}
