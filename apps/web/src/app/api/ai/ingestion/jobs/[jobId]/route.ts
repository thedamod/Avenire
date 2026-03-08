import { NextResponse } from "next/server";
import { getIngestionJobByIdForWorkspace } from "@/lib/ingestion-data";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const workspaceUuid = searchParams.get("workspaceUuid");
  if (!workspaceUuid) {
    return NextResponse.json(
      { error: "Missing workspaceUuid" },
      { status: 400 }
    );
  }

  const canAccess = await ensureWorkspaceAccessForUser(user.id, workspaceUuid);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { jobId } = await context.params;
  const job = await getIngestionJobByIdForWorkspace(workspaceUuid, jobId);
  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ job });
}
