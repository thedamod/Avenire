import { createResourceShareLink, userCanAccessWorkspace } from "@/lib/file-data";
import { auth } from "@avenire/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { resolveAppBaseUrl } from "@/lib/app-base-url";

/**
 * Create a shareable link for a file within a workspace.
 *
 * Validates the caller's session and workspace access, creates a resource share link
 * (7-day expiry, publicly allowed), and returns the created link along with a full
 * share URL built from the request's base URL. Responds with HTTP 401 if there is no
 * authenticated user and HTTP 403 if the user lacks access to the workspace.
 *
 * @param _request - Incoming request used to resolve the application base URL for the share link
 * @param context - Route context whose `params` promise resolves to `{ workspaceUuid, fileUuid }`
 * @returns An object containing `link` (the created share link data) and `shareUrl` (the full URL to use for sharing)
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ workspaceUuid: string; fileUuid: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid, fileUuid } = await context.params;
  const canAccess = await userCanAccessWorkspace(session.user.id, workspaceUuid);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const link = await createResourceShareLink({
    workspaceId: workspaceUuid,
    resourceType: "file",
    resourceId: fileUuid,
    createdBy: session.user.id,
    expiresInDays: 7,
    allowPublic: true,
  });

  const baseUrl = resolveAppBaseUrl(_request);
  return NextResponse.json({
    link,
    shareUrl: `${baseUrl}/share/${link.token}`,
  });
}
