import { NextResponse } from "next/server";
import { z } from "zod";
import { getFileAssetById } from "@/lib/file-data";
import { enqueueIngestionJob } from "@/lib/ingestion-data";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";

const enqueueSchema = z.object({
  workspaceUuid: z.string().uuid(),
  fileUuid: z.string().uuid(),
  sourceType: z.string().optional(),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = enqueueSchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const canAccess = await ensureWorkspaceAccessForUser(
    user.id,
    parsed.data.workspaceUuid
  );
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const file = await getFileAssetById(
    parsed.data.workspaceUuid,
    parsed.data.fileUuid
  );
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const job = await enqueueIngestionJob({
    workspaceId: parsed.data.workspaceUuid,
    fileId: file.id,
    sourceType: parsed.data.sourceType,
  });

  return NextResponse.json({ job }, { status: 202 });
}
