import { auth } from "@avenire/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createChatForUser } from "@/lib/chat-data";
import { resolveWorkspaceForUser } from "@/lib/file-data";

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

  const activeOrganizationId =
    (session as { session?: { activeOrganizationId?: string | null } }).session
      ?.activeOrganizationId ?? null;
  const workspace = await resolveWorkspaceForUser(session.user.id, activeOrganizationId);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }
  const chat = await createChatForUser(session.user.id, workspace.workspaceId, body.title);

  return NextResponse.json({ chat }, { status: 201 });
}
