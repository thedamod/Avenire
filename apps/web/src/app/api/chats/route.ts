import { auth } from "@avenire/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createChatForUser } from "@/lib/chat-data";
import {
  grantResourceToUserId,
  listWorkspaceMembers,
  resolveWorkspaceForUser,
} from "@/lib/file-data";

async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session ?? null;
}

export async function POST(request: Request) {
  const session = await getSessionUser();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { title?: string };
  const chat = await createChatForUser(session.user.id, body.title);

  const activeOrganizationId =
    (session as { session?: { activeOrganizationId?: string | null } }).session
      ?.activeOrganizationId ?? null;
  const workspace = await resolveWorkspaceForUser(session.user.id, activeOrganizationId);
  if (workspace) {
    const members = await listWorkspaceMembers(workspace.workspaceId);
    await Promise.all(
      members
        .filter((member) => member.userId !== session.user.id)
        .map((member) =>
          grantResourceToUserId({
            workspaceId: workspace.workspaceId,
            resourceType: "chat",
            resourceId: chat.slug,
            granteeUserId: member.userId,
            createdBy: session.user.id,
            permission: "read",
          }),
        ),
    );
  }

  return NextResponse.json({ chat }, { status: 201 });
}
