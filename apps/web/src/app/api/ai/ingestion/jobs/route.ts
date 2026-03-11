import { scheduleIngestionJob } from "@avenire/ingestion/queue";
import { NextResponse } from "next/server";
import { z } from "zod";
import { listRecentIngestionJobsForWorkspace } from "@/lib/ingestion-data";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";
import { publishWorkspaceStreamEvent } from "@/lib/workspace-event-stream";

const enqueueSchema = z.object({
  workspaceUuid: z.string().uuid(),
  fileUuid: z.string().uuid(),
  sourceType: z.string().optional(),
});

const listSchema = z.object({
  workspaceUuid: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  windowMinutes: z.coerce.number().int().min(1).max(240).optional(),
});

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = listSchema.safeParse({
    workspaceUuid: url.searchParams.get("workspaceUuid"),
    limit: url.searchParams.get("limit") ?? undefined,
    windowMinutes: url.searchParams.get("windowMinutes") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const canAccess = await ensureWorkspaceAccessForUser(
    user.id,
    parsed.data.workspaceUuid
  );
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const jobs = await listRecentIngestionJobsForWorkspace({
    workspaceId: parsed.data.workspaceUuid,
    limit: parsed.data.limit ?? 60,
  });
  const now = Date.now();
  const windowMs = (parsed.data.windowMinutes ?? 10) * 60 * 1000;

  const filtered = jobs.filter((job) => {
    if (job.status === "failed" || job.status === "queued" || job.status === "running") {
      return true;
    }
    if (job.status === "succeeded") {
      const updatedAt = new Date(job.updatedAt).getTime();
      return Number.isFinite(updatedAt) && now - updatedAt <= windowMs;
    }
    return false;
  });

  return NextResponse.json({ jobs: filtered });
}

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

  const job = await scheduleIngestionJob({
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
