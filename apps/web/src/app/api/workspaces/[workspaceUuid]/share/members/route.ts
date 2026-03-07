import {
  findAuthUserByEmail,
  grantAllChatsFromUserToUser,
  listWorkspaceMembers,
  listWorkspacesForUser,
} from "@/lib/file-data";
import { auth, sendWorkspaceShareEmail } from "@avenire/auth/server";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createApiLogger } from "@/lib/observability";
import { resolveAppBaseUrl } from "@/lib/app-base-url";

/**
 * Adds a user to a workspace, grants them access to chats owned by existing workspace members, and optionally sends a workspace share email.
 *
 * @returns A JSON response containing `status: "added"`, the added member object under `member`, an `emailSent` boolean indicating whether the notification email was sent, and `workspaceUrl` for accessing the workspace.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceUuid: string }> },
) {
  const user = await getSessionUser();
  const apiLogger = createApiLogger({
    request,
    route: "/api/workspaces/[workspaceUuid]/share/members",
    feature: "workspace-sharing",
    userId: user?.id ?? null,
  });
  void apiLogger.requestStarted();

  if (!user) {
    void apiLogger.requestFailed(401, "Unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid } = await context.params;
  const canAccess = await ensureWorkspaceAccessForUser(user.id, workspaceUuid);
  if (!canAccess) {
    void apiLogger.requestFailed(403, "Forbidden", { workspaceUuid });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const members = await listWorkspaceMembers(workspaceUuid);
  const currentMember = members.find((member) => member.userId === user.id);
  if (!currentMember || !["owner", "admin"].includes(currentMember.role)) {
    void apiLogger.requestFailed(403, "Only admins can share this workspace", { workspaceUuid });
    return NextResponse.json({ error: "Only admins can share this workspace" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { email?: string };
  if (!body.email) {
    void apiLogger.requestFailed(400, "Missing email", { workspaceUuid });
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  const summaries = await listWorkspacesForUser(user.id);
  const summary = summaries.find((item) => item.workspaceId === workspaceUuid);
  if (!summary) {
    void apiLogger.requestFailed(404, "Workspace not found", { workspaceUuid });
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }
  const normalizedEmail = body.email.trim().toLowerCase();

  const targetUser = await findAuthUserByEmail(normalizedEmail);
  if (!targetUser) {
    void apiLogger.requestFailed(404, "User not found", { workspaceUuid });
    return NextResponse.json(
      { error: "User not found. Ask them to sign up first." },
      { status: 404 },
    );
  }

  try {
    await auth.api.addMember({
      body: {
        userId: targetUser.id,
        organizationId: summary.organizationId,
        role: "member",
      },
      headers: await headers(),
    });
  } catch (error) {
    void apiLogger.requestFailed(400, error, { workspaceUuid });
    return NextResponse.json(
      { error: "Unable to add member", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 },
    );
  }

  await Promise.all(
    members
      .filter((member) => member.userId !== targetUser.id)
      .map((member) =>
        grantAllChatsFromUserToUser({
          workspaceId: workspaceUuid,
          ownerUserId: member.userId,
          granteeUserId: targetUser.id,
          createdBy: user.id,
        }),
      ),
  );

  const workspaceName = summary?.name ?? "Workspace";
  const rootFolderId = summary?.rootFolderId ?? "";
  const baseUrl = resolveAppBaseUrl(request);
  const workspaceUrl = rootFolderId
    ? `${baseUrl}/dashboard/files/${workspaceUuid}/folder/${rootFolderId}`
    : `${baseUrl}/dashboard/files`;

  let emailSent = false;
  try {
    await sendWorkspaceShareEmail({
      toEmail: normalizedEmail,
      workspaceName,
      workspaceUrl,
      sharedByName: user.name ?? undefined,
    });
    emailSent = true;
  } catch (error) {
    console.error("Failed to send workspace share email", {
      workspaceUuid,
      recipient: normalizedEmail,
      error,
    });
    void apiLogger.error("error.integration", {
      integration: "email",
      workspaceUuid,
      action: "sendWorkspaceShareEmail",
    });
  }

  void apiLogger.meter("meter.share.created", {
    resourceType: "workspace-member",
    workspaceUuid,
    emailSent,
  });
  void apiLogger.featureUsed("workspace.sharing.member.added", {
    workspaceUuid,
    emailSent,
  });
  void apiLogger.requestSucceeded(201, { workspaceUuid, emailSent });

  return NextResponse.json(
    {
      status: "added",
      member: targetUser,
      emailSent,
      workspaceUrl,
    },
    { status: 201 },
  );
}

/**
 * Lists members of the specified workspace.
 *
 * @param _request - Incoming HTTP request (unused).
 * @param context - Route context containing `params.workspaceUuid` which identifies the workspace.
 * @returns An object with a `members` array; each member contains `id`, `userId`, `email`, `name`, and `role` (defaults to `"member"` when missing).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceUuid: string }> },
) {
  const user = await getSessionUser();
  const apiLogger = createApiLogger({
    request: _request,
    route: "/api/workspaces/[workspaceUuid]/share/members",
    feature: "workspace-sharing",
    userId: user?.id ?? null,
  });
  void apiLogger.requestStarted();

  if (!user) {
    void apiLogger.requestFailed(401, "Unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid } = await context.params;
  const canAccess = await ensureWorkspaceAccessForUser(user.id, workspaceUuid);
  if (!canAccess) {
    void apiLogger.requestFailed(403, "Forbidden", { workspaceUuid });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const summaries = await listWorkspacesForUser(user.id);
  const summary = summaries.find((item) => item.workspaceId === workspaceUuid);
  if (!summary) {
    void apiLogger.requestFailed(404, "Workspace not found", { workspaceUuid });
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const membersResult = await auth.api.listMembers({
    query: {
      organizationId: summary.organizationId,
    },
    headers: await headers(),
  });

  const members = (
    Array.isArray(membersResult)
      ? membersResult
      : (membersResult as { members?: unknown[] }).members ?? []
  ) as Array<{
    id?: string | null;
    role?: string | null;
    userId?: string | null;
    user?: { id?: string | null; email?: string | null; name?: string | null } | null;
  }>;

  void apiLogger.featureUsed("workspace.sharing.members.listed", { workspaceUuid });
  void apiLogger.requestSucceeded(200, { workspaceUuid, memberCount: members.length });

  return NextResponse.json({
    members: members.map((member) => ({
      id: member.id ?? null,
      userId: member.userId ?? member.user?.id ?? null,
      email: member.user?.email ?? null,
      name: member.user?.name ?? null,
      role: member.role ?? "member",
    })),
  });
}

/**
 * Remove a member from the specified workspace.
 *
 * @param context - Contains route parameters; `context.params` must resolve to an object with `workspaceUuid` identifying the workspace.
 * @returns An HTTP JSON response. On success returns an object with `status: "removed"` and `removed` containing the removal result; on error returns an `error` message and optional `detail`.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ workspaceUuid: string }> },
) {
  const user = await getSessionUser();
  const apiLogger = createApiLogger({
    request,
    route: "/api/workspaces/[workspaceUuid]/share/members",
    feature: "workspace-sharing",
    userId: user?.id ?? null,
  });
  void apiLogger.requestStarted();

  if (!user) {
    void apiLogger.requestFailed(401, "Unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid } = await context.params;
  const canAccess = await ensureWorkspaceAccessForUser(user.id, workspaceUuid);
  if (!canAccess) {
    void apiLogger.requestFailed(403, "Forbidden", { workspaceUuid });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const summaries = await listWorkspacesForUser(user.id);
  const summary = summaries.find((item) => item.workspaceId === workspaceUuid);
  if (!summary) {
    void apiLogger.requestFailed(404, "Workspace not found", { workspaceUuid });
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const membersResult = await auth.api.listMembers({
    query: {
      organizationId: summary.organizationId,
    },
    headers: await headers(),
  });
  const members = (
    Array.isArray(membersResult)
      ? membersResult
      : (membersResult as { members?: unknown[] }).members ?? []
  ) as Array<{
    role?: string | null;
    user?: { id?: string | null } | null;
    userId?: string | null;
  }>;
  const currentMember = members.find(
    (member) => (member.userId ?? member.user?.id ?? null) === user.id,
  );
  if (!currentMember || !["owner", "admin"].includes(currentMember.role ?? "")) {
    void apiLogger.requestFailed(403, "Only admins can remove members", { workspaceUuid });
    return NextResponse.json({ error: "Only admins can remove members" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    memberIdOrEmail?: string;
  };
  const memberIdOrEmail = body.memberIdOrEmail?.trim();
  if (!memberIdOrEmail) {
    void apiLogger.requestFailed(400, "Missing memberIdOrEmail", { workspaceUuid });
    return NextResponse.json({ error: "Missing memberIdOrEmail" }, { status: 400 });
  }

  try {
    const removed = await auth.api.removeMember({
      body: {
        organizationId: summary.organizationId,
        memberIdOrEmail,
      },
      headers: await headers(),
    });

    void apiLogger.meter("meter.share.created", {
      resourceType: "workspace-member-removed",
      workspaceUuid,
    });
    void apiLogger.featureUsed("workspace.sharing.member.removed", { workspaceUuid });
    void apiLogger.requestSucceeded(200, { workspaceUuid });

    return NextResponse.json({ status: "removed", removed });
  } catch (error) {
    void apiLogger.requestFailed(400, error, { workspaceUuid });
    return NextResponse.json(
      { error: "Unable to remove member", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 },
    );
  }
}
