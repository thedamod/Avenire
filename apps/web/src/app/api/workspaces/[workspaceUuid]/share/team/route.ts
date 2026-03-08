import { listWorkspacesForUser } from "@/lib/file-data";
import { auth, sendWorkspaceShareEmail } from "@avenire/auth/server";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";
import { NextResponse, after } from "next/server";
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
    route: "/api/workspaces/[workspaceUuid]/share/team",
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
    user?: { id?: string | null; email?: string | null } | null;
    userId?: string | null;
    email?: string | null;
  }>;
  const currentMember = members.find(
    (member) => (member.userId ?? member.user?.id ?? null) === user.id,
  );
  if (!currentMember || !["owner", "admin"].includes(currentMember.role ?? "")) {
    void apiLogger.requestFailed(403, "Only admins can share this workspace", { workspaceUuid });
    return NextResponse.json({ error: "Only admins can share this workspace" }, { status: 403 });
  }
  const workspaceName = summary?.name ?? "Workspace";
  const rootFolderId = summary?.rootFolderId ?? "";
  const baseUrl = resolveAppBaseUrl(request);
  const workspaceUrl = rootFolderId
    ? `${baseUrl}/dashboard/files/${workspaceUuid}/folder/${rootFolderId}`
    : `${baseUrl}/dashboard/files`;

  const recipients = members
    .map((member) => ({
      userId: member.userId ?? member.user?.id ?? null,
      email: member.user?.email ?? member.email ?? null,
    }))
    .filter((member) => member.userId !== user.id && typeof member.email === "string");
  after(async () => {
    let emailSentCount = 0;
    await Promise.all(
      recipients.map(async (member) => {
        try {
          await sendWorkspaceShareEmail({
            toEmail: member.email as string,
            workspaceName,
            workspaceUrl,
            sharedByName: user.name ?? undefined,
          });
          emailSentCount += 1;
        } catch (error) {
          const errorSummary =
            error instanceof Error
              ? { name: error.name, message: error.message }
              : { value: String(error) };
          console.error("Failed to send workspace share team email", {
            workspaceUuid,
            recipient: member.email as string,
            error: errorSummary,
          });
          void apiLogger.error("error.integration", {
            integration: "email",
            workspaceUuid,
            action: "sendWorkspaceShareEmail",
          });
        }
      }),
    );

    void apiLogger.meter("meter.share.created", {
      resourceType: "workspace-team",
      workspaceUuid,
      recipients: recipients.length,
      emailSentCount,
    });
    void apiLogger.featureUsed("workspace.sharing.team", {
      workspaceUuid,
      recipients: recipients.length,
      emailSentCount,
    });
  });

  void apiLogger.requestSucceeded(200, {
    workspaceUuid,
    recipients: recipients.length,
    queued: true,
  });

  return NextResponse.json({
    recipients: recipients.length,
    queued: true,
    workspaceUrl,
  });
}
