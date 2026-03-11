import { NextResponse } from "next/server";
import { scheduleIngestionJob } from "@avenire/ingestion/queue";
import {
  acquireMaintenanceLock,
  listNotesNeedingReindex,
  releaseMaintenanceLock,
} from "@/lib/file-data";

const LOCK_NAME = "notes.reindex";
const LOCK_TTL_MS = 10 * 60 * 1000;
const BATCH_LIMIT = 100;

function isAuthorized(request: Request) {
  const token = process.env.MAINTENANCE_CRON_TOKEN;
  if (!token) {
    return false;
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${token}`;
  return authHeader === expected;
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
    const staleNotes = await listNotesNeedingReindex({ limit: BATCH_LIMIT });
    let enqueued = 0;

    for (const note of staleNotes) {
      await scheduleIngestionJob({
        workspaceId: note.workspaceId,
        fileId: note.fileId,
        sourceType: "markdown",
      });
      enqueued += 1;
    }

    return NextResponse.json({
      ok: true,
      found: staleNotes.length,
      enqueued,
    });
  } finally {
    await releaseMaintenanceLock(LOCK_NAME);
  }
}
