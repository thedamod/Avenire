import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueIngestionJob } from "@/lib/ingestion-data";
import { publishWorkspaceStreamEvent } from "@/lib/workspace-event-stream";
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

  const job = await enqueueIngestionJob({
    workspaceId: parsed.data.workspaceUuid,
    fileId: parsed.data.fileUuid,
    sourceType: parsed.data.sourceType,
  });

  await publishWorkspaceStreamEvent({
    workspaceUuid: parsed.data.workspaceUuid,
    type: "ingestion.job",
    payload: {
      createdAt: new Date().toISOString(),
      eventType: "job.queued",
      jobId: job.id,
      payload: {
        status: "queued",
        sourceType: parsed.data.sourceType ?? null,
      },
      workspaceId: parsed.data.workspaceUuid,
    },
  });

  return NextResponse.json({ job }, { status: 202 });
}
