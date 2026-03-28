import { NextResponse } from "next/server";
import {
  acquireMaintenanceLock,
  listLegacyMarkdownFilesForMigration,
  releaseMaintenanceLock,
  upsertMarkdownFileContent,
} from "@/lib/file-data";
import { deleteUploadThingFile } from "@/lib/upload-registration";

const LOCK_NAME = "markdown.migrate";
const LOCK_TTL_MS = 10 * 60 * 1000;
const BATCH_LIMIT = 100;

function isAuthorized(request: Request) {
  const token = process.env.MAINTENANCE_CRON_TOKEN;
  if (!token) {
    return false;
  }

  const authHeader = request.headers.get("authorization") ?? "";
  return authHeader === `Bearer ${token}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const acquired = await acquireMaintenanceLock({
    name: LOCK_NAME,
    ttlMs: LOCK_TTL_MS,
  });
  if (!acquired) {
    return NextResponse.json({ ok: false, skipped: true });
  }

  try {
    const candidates = await listLegacyMarkdownFilesForMigration({
      limit: BATCH_LIMIT,
    });

    let migrated = 0;
    let failed = 0;
    let deleted = 0;
    const errors: Array<{ fileId: string; message: string }> = [];

    for (const file of candidates) {
      try {
        const response = await fetch(file.storageUrl, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Failed to fetch markdown (${response.status})`);
        }

        const content = await response.text();
        const result = await upsertMarkdownFileContent({
          content,
          fileId: file.id,
          userId: file.userId,
          workspaceId: file.workspaceId,
        });

        if (!result) {
          throw new Error("Failed to persist markdown content");
        }

        migrated += 1;
        if (result.previousStorageKey !== result.file.storageKey) {
          void deleteUploadThingFile(result.previousStorageKey);
          deleted += 1;
        }
      } catch (error) {
        failed += 1;
        errors.push({
          fileId: file.id,
          message:
            error instanceof Error ? error.message : "Unknown migration error",
        });
      }
    }

    const remaining = await listLegacyMarkdownFilesForMigration({
      limit: BATCH_LIMIT,
    });

    return NextResponse.json({
      ok: true,
      batchSize: BATCH_LIMIT,
      scanned: candidates.length,
      migrated,
      failed,
      uploadThingDeletesScheduled: deleted,
      remainingEstimate: remaining.length,
      hasMore: remaining.length === BATCH_LIMIT,
      errors,
    });
  } finally {
    await releaseMaintenanceLock(LOCK_NAME);
  }
}
