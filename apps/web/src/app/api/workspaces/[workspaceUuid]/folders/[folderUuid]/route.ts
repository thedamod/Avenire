import {
  getFolderWithAncestors,
  listFolderContents,
  softDeleteFolder,
  updateFolder,
} from "@/lib/file-data";
import { NextResponse } from "next/server";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";

/**
 * Handle GET requests to return a workspace folder's details, its ancestor chain, and its immediate contents.
 *
 * @param context - Contains `params`, a promise that resolves to `{ workspaceUuid, folderUuid }`
 * @returns A NextResponse JSON payload containing either:
 * - the folder data and its contents: `{ folder, ancestors, folders, files }`, or
 * - an error object with an appropriate HTTP status (`401` for unauthorized, `403` for forbidden, `404` for not found)
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceUuid: string; folderUuid: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid, folderUuid } = await context.params;
  const canAccess = await ensureWorkspaceAccessForUser(user.id, workspaceUuid);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const folder = await getFolderWithAncestors(workspaceUuid, folderUuid);
  if (!folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const children = await listFolderContents(workspaceUuid, folderUuid);
  return NextResponse.json({
    folder: folder.folder,
    ancestors: folder.ancestors,
    folders: children.folders,
    files: children.files,
  });
}

/**
 * Update a folder's metadata (name and/or parent) within a workspace.
 *
 * Enforces authentication and workspace access. Accepts an optional JSON body with `name` and `parentId`.
 *
 * @param request - HTTP request whose JSON body may include `name?: string` and `parentId?: string | null`
 * @param context - Route context with `params` resolving to `{ workspaceUuid: string; folderUuid: string }`
 * @returns On success, an object with the updated folder: `{ folder: Folder }`. Returns an error payload and status code `401` (unauthorized), `403` (forbidden), or `404` (folder not found) when applicable.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ workspaceUuid: string; folderUuid: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid, folderUuid } = await context.params;
  const canAccess = await ensureWorkspaceAccessForUser(user.id, workspaceUuid);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    parentId?: string | null;
  };

  const folder = await updateFolder(workspaceUuid, folderUuid, {
    name: body.name,
    parentId: body.parentId,
  });

  if (!folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  return NextResponse.json({ folder });
}

/**
 * Soft-deletes the specified folder in a workspace after verifying the current user's session and workspace access.
 *
 * @param context - An object whose `params` promise resolves to `{ workspaceUuid, folderUuid }` identifying the workspace and folder to delete.
 * @returns A JSON response containing `{ ok: true }` on successful deletion; on failure returns a JSON error with HTTP status `401` (Unauthorized) or `403` (Forbidden).
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ workspaceUuid: string; folderUuid: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid, folderUuid } = await context.params;
  const canAccess = await ensureWorkspaceAccessForUser(user.id, workspaceUuid);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await softDeleteFolder(workspaceUuid, folderUuid);
  return NextResponse.json({ ok: true });
}
