import { createResourceShareLink, resolveWorkspaceForUser } from "@/lib/file-data";
import { auth } from "@avenire/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getChatBySlugForUser } from "@/lib/chat-data";
import { createApiLogger } from "@/lib/observability";
import { resolveAppBaseUrl } from "@/lib/app-base-url";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  const apiLogger = createApiLogger({
    request,
    route: "/api/chats/[slug]/share/link",
    feature: "chat-sharing",
    userId: session?.user?.id ?? null,
  });
  void apiLogger.requestStarted();

  if (!session?.user) {
    void apiLogger.requestFailed(401, "Unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await context.params;
  const chat = await getChatBySlugForUser(session.user.id, slug);
  if (!chat || chat.ownerUserId !== session.user.id) {
    void apiLogger.requestFailed(403, "Chat not found", { slug });
    return NextResponse.json({ error: "Chat not found" }, { status: 403 });
  }

  const activeOrganizationId =
    (session as { session?: { activeOrganizationId?: string | null } }).session
      ?.activeOrganizationId ?? null;
  const ws = await resolveWorkspaceForUser(session.user.id, activeOrganizationId);
  if (!ws) {
    void apiLogger.requestFailed(404, "Workspace not found", { slug });
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const link = await createResourceShareLink({
    workspaceId: ws.workspaceId,
    resourceType: "chat",
    resourceId: chat.slug,
    createdBy: session.user.id,
    expiresInDays: 7,
    allowPublic: true,
  });

  const baseUrl = resolveAppBaseUrl(request);
  void apiLogger.meter("meter.share.created", {
    resourceType: "chat-link",
    slug,
    workspaceUuid: ws.workspaceId,
  });
  void apiLogger.featureUsed("chat.sharing.link.created", { slug });
  void apiLogger.requestSucceeded(200, { slug });
  return NextResponse.json({
    link,
    shareUrl: `${baseUrl}/share/${link.token}`,
  });
}
