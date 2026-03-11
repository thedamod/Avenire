import {
  createWorkspaceInvitationByEmail,
  findAuthUserByEmail,
  listWorkspaceMembers,
  listWorkspacesForUser,
} from "@/lib/file-data";
import { auth, sendWorkspaceShareEmail } from "@avenire/auth/server";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createApiLogger } from "@/lib/observability";
import { resolveAppBaseUrl } from "@/lib/app-base-url";

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
  const invite = await createWorkspaceInvitationByEmail({
    workspaceId: workspaceUuid,
    email: normalizedEmail,
    inviterUserId: user.id,
    role: "member",
    expiresInDays: 7,
  });
  if (invite.status === "workspace-not-found") {
    void apiLogger.requestFailed(404, "Workspace not found", { workspaceUuid });
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }
  if (invite.status === "invalid-email") {
    void apiLogger.requestFailed(400, "Invalid email", { workspaceUuid });
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  if (invite.status === "already-member") {
    void apiLogger.requestSucceeded(200, {
      workspaceUuid,
      emailSent: false,
      status: "already-member",
    });
    return NextResponse.json({ status: "already-member" }, { status: 200 });
  }

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
  void apiLogger.requestSucceeded(200, { workspaceUuid, emailSent });

  return NextResponse.json(
    {
      status: "invited",
      member: targetUser ?? null,
      invitationId: invite.invitationId,
      emailSent,
      workspaceUrl,
    },
    { status: 200 },
  );
}

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
