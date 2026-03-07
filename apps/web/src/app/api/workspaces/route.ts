import { NextResponse } from "next/server";
import { createWorkspaceForUser } from "@/lib/file-data";
import { getWorkspaceContextForUser } from "@/lib/workspace";

/**
 * Retrieve the current user's workspace context and return key identifiers.
 *
 * @returns A JSON response containing `workspaceUuid`, `organizationId`, and `rootFolderUuid` when the user is authorized; otherwise a JSON error `{ error: "Unauthorized" }` with HTTP status 401.
 */
export async function GET() {
  const ctx = await getWorkspaceContextForUser();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    workspaceUuid: ctx.workspace.workspaceId,
    organizationId: ctx.workspace.organizationId,
    rootFolderUuid: ctx.workspace.rootFolderId,
  });
}

/**
 * Create a new workspace for the current authenticated user.
 *
 * @param request - Incoming HTTP request whose JSON body may include an optional `name` property to set the workspace name; defaults to `"New Workspace"` when omitted.
 * @returns A JSON response with a `workspace` property containing the created workspace; returns HTTP 201 on success and HTTP 401 with `{ error: "Unauthorized" }` when the user is not authenticated.
 */
export async function POST(request: Request) {
  const ctx = await getWorkspaceContextForUser();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const workspace = await createWorkspaceForUser(ctx.user.id, body.name ?? "New Workspace");

  return NextResponse.json({ workspace }, { status: 201 });
}
