import {
  createResourceShareLink,
  getFileAssetById,
  grantResourceToUserByEmail,
  userCanAccessWorkspace,
} from "@/lib/file-data";
import { auth, sendFileShareEmail } from "@avenire/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createApiLogger } from "@/lib/observability";
import { resolveAppBaseUrl } from "@/lib/app-base-url";

/**
 * Create a file read grant for a user identified by email, create a private share link for the file, and attempt to send a notification email to the recipient.
 *
 * @param request - The incoming HTTP request
 * @param context - Route context containing `params`, a promise resolving to `{ workspaceUuid, fileUuid }`
 * @returns A NextResponse carrying JSON `{ grant, emailSent, shareUrl }` when successful; on failure returns an error JSON with an appropriate HTTP status (401, 403, 400, or 404)
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceUuid: string; fileUuid: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  const apiLogger = createApiLogger({
    request,
    route: "/api/workspaces/[workspaceUuid]/files/[fileUuid]/share/grants",
    feature: "file-sharing",
    userId: session?.user?.id ?? null,
  });
  void apiLogger.requestStarted();

  if (!session?.user) {
    void apiLogger.requestFailed(401, "Unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid, fileUuid } = await context.params;
  const canAccess = await userCanAccessWorkspace(session.user.id, workspaceUuid);
  if (!canAccess) {
    void apiLogger.requestFailed(403, "Forbidden", { workspaceUuid, fileUuid });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { email?: string };
  if (!body.email) {
    void apiLogger.requestFailed(400, "Missing email", { workspaceUuid, fileUuid });
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  const file = await getFileAssetById(workspaceUuid, fileUuid);
  if (!file) {
    void apiLogger.requestFailed(404, "File not found", { workspaceUuid, fileUuid });
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const grant = await grantResourceToUserByEmail({
    workspaceId: workspaceUuid,
    resourceType: "file",
    resourceId: fileUuid,
    email: body.email,
    createdBy: session.user.id,
    permission: "read",
  });

  if (!grant) {
    void apiLogger.requestFailed(404, "User not found", { workspaceUuid, fileUuid });
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const link = await createResourceShareLink({
    workspaceId: workspaceUuid,
    resourceType: "file",
    resourceId: fileUuid,
    createdBy: session.user.id,
    expiresInDays: 7,
    allowPublic: false,
  });

  const baseUrl = resolveAppBaseUrl(request);
  const shareUrl = `${baseUrl}/share/${link.token}`;
  let emailSent = false;

  try {
    await sendFileShareEmail({
      toEmail: grant.email,
      fileName: file.name,
      shareUrl,
      sharedByName: session.user.name ?? undefined,
    });
    emailSent = true;
  } catch (error) {
    console.error("Failed to send file share email", {
      workspaceUuid,
      fileUuid,
      recipient: grant.email,
      error,
    });
    void apiLogger.error("error.integration", {
      integration: "email",
      workspaceUuid,
      fileUuid,
      action: "sendFileShareEmail",
    });
  }

  void apiLogger.meter("meter.share.created", {
    resourceType: "file",
    workspaceUuid,
    fileUuid,
    emailSent,
  });
  void apiLogger.featureUsed("file.sharing.grant.created", {
    workspaceUuid,
    fileUuid,
    emailSent,
  });
  void apiLogger.requestSucceeded(201, {
    workspaceUuid,
    fileUuid,
    emailSent,
  });

  return NextResponse.json({ grant, emailSent, shareUrl }, { status: 201 });
}
