import { listWorkspacesForUser } from "@/lib/file-data";
import { getSessionUser } from "@/lib/workspace";
import { NextResponse } from "next/server";

/**
 * Handle GET requests to return the authenticated user's workspaces.
 *
 * @returns A NextResponse with JSON `{ workspaces }` for the authenticated user, or `{ error: "Unauthorized" }` with HTTP status 401 when there is no session.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaces = await listWorkspacesForUser(user.id);
  return NextResponse.json({ workspaces });
}
