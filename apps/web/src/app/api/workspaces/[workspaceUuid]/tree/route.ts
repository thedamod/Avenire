import { listWorkspaceFiles, listWorkspaceFolders } from "@/lib/file-data";
import { getIngestionFlagsByFileIds } from "@/lib/ingestion-data";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceUuid: string }> },
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

  const [folders, files] = await Promise.all([
    listWorkspaceFolders(workspaceUuid, user.id),
    listWorkspaceFiles(workspaceUuid, user.id),
  ]);
  const ingestionFlags = await getIngestionFlagsByFileIds(
    workspaceUuid,
    files.map((file) => file.id)
  );
  return NextResponse.json({
    folders,
    files: files.map((file) => ({
      ...file,
      isIngested: ingestionFlags[file.id] ?? false,
    })),
  });
}
