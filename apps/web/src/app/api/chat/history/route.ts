import { auth } from "@avenire/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { listChatsForUser } from "@/lib/chat-data";
import { resolveWorkspaceForUser } from "@/lib/file-data";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeOrganizationId =
    (session as { session?: { activeOrganizationId?: string | null } }).session
      ?.activeOrganizationId ?? null;
  const ws = await resolveWorkspaceForUser(session.user.id, activeOrganizationId);
  if (!ws) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const chats = await listChatsForUser(session.user.id, ws.workspaceId);
  return NextResponse.json({ chats });
}
