import { softDeleteFileAsset, updateFileAsset } from "@/lib/file-data";
import { NextResponse } from "next/server";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";

/**
 * Update a workspace file asset's name or folder and return the updated file.
 *
 * Validates the current session and workspace access, applies the provided `name` and/or `folderId` updates, and responds with the updated file or an error.
 *
 * @param request - HTTP request whose JSON body may include optional `name` and `folderId` fields
 * @param context - Object with a `params` promise that resolves to `{ workspaceUuid, fileUuid }` identifying the target file
 * @returns A NextResponse containing `{ file }` with the updated file on success, or `{ error }` with status `401`, `403`, or `404` on failure
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ workspaceUuid: string; fileUuid: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid, fileUuid } = await context.params;
  const canAccess = await ensureWorkspaceAccessForUser(user.id, workspaceUuid);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    folderId?: string;
  };

  const file = await updateFileAsset(workspaceUuid, fileUuid, {
    folderId: body.folderId,
    name: body.name,
  });

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  return NextResponse.json({ file });
}

/**
 * Soft-deletes a file asset in a workspace after verifying the current user and workspace access.
 *
 * @param context - An object whose `params` promise resolves to `{ workspaceUuid: string; fileUuid: string }`
 * @returns A JSON response: `{ ok: true }` when deletion succeeds; otherwise a JSON error object with an `error` message and HTTP status 401 (Unauthorized), 403 (Forbidden), or 404 (File not found)
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ workspaceUuid: string; fileUuid: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid, fileUuid } = await context.params;
  const canAccess = await ensureWorkspaceAccessForUser(user.id, workspaceUuid);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ok = await softDeleteFileAsset(workspaceUuid, fileUuid);
  if (!ok) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
