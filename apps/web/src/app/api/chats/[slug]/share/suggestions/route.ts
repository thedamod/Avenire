import { listWorkspaceShareSuggestions, resolveWorkspaceForUser } from "@/lib/file-data";
import { auth } from "@avenire/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getChatBySlugForUser } from "@/lib/chat-data";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await context.params;
  const chat = await getChatBySlugForUser(session.user.id, slug);
  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }
  if (chat.ownerUserId !== session.user.id) {
    return NextResponse.json({ error: "Read-only chat" }, { status: 403 });
  }

  const activeOrganizationId =
    (session as { session?: { activeOrganizationId?: string | null } }).session
      ?.activeOrganizationId ?? null;
  const ws = await resolveWorkspaceForUser(session.user.id, activeOrganizationId);
  if (!ws) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const query = new URL(request.url).searchParams.get("q") ?? "";
  const suggestions = await listWorkspaceShareSuggestions({
    workspaceId: ws.workspaceId,
    userId: session.user.id,
    userEmail: session.user.email,
    query,
    limit: 8,
  });

  return NextResponse.json({ suggestions });
}
