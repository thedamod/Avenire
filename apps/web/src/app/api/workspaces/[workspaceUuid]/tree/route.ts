import { listWorkspaceFiles, listWorkspaceFolders } from "@/lib/file-data";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";
import { NextResponse } from "next/server";

/**
 * List the folders and files of a workspace for an authorized session user.
 *
 * @param context - An object whose `params` promise resolves to `{ workspaceUuid: string }`
 * @returns A NextResponse containing `{ folders, files }` on success; on failure a JSON error object with status `401` (unauthorized) or `403` (forbidden)
 */
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
    listWorkspaceFolders(workspaceUuid),
    listWorkspaceFiles(workspaceUuid),
  ]);
  return NextResponse.json({ folders, files });
}
