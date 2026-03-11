import { NextResponse } from "next/server";
import { UTApi } from "@avenire/storage";
import { purgeTrashOlderThan } from "@/lib/file-data";

const RETENTION_DAYS = 30;

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

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await purgeTrashOlderThan(cutoff);
  const deletableKeys = result.storageKeys.filter(
    (storageKey) => !storageKey.startsWith("virtual:duplicate:")
  );

  if (process.env.UPLOADTHING_TOKEN && deletableKeys.length > 0) {
    try {
      const utapi = new UTApi({ token: process.env.UPLOADTHING_TOKEN });
      await utapi.deleteFiles(Array.from(new Set(deletableKeys)));
    } catch {
      // Best effort physical cleanup.
    }
  }

  return NextResponse.json({
    ok: true,
    retentionDays: RETENTION_DAYS,
    cutoff: cutoff.toISOString(),
    filesPurged: result.fileCount,
    foldersPurged: result.folderCount,
  });
}
