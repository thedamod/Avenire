import { createResourceShareLink, resolveWorkspaceForUser } from "@/lib/file-data";
import { auth } from "@avenire/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getChatBySlugForUser, isChatOwnerForUser } from "@/lib/chat-data";
import { createApiLogger } from "@/lib/observability";
import { resolveAppBaseUrl } from "@/lib/app-base-url";

/**
 * Create a shareable link for the chat identified by the route `slug`.
 *
 * Attempts to authenticate the caller, verifies chat ownership, resolves the user's workspace, and creates a public share link that expires in 7 days. Returns an HTTP JSON response with error statuses for common failure cases (401 when unauthenticated, 403 when not owner, 404 when chat or workspace is not found).
 *
 * @returns An HTTP JSON response. On success the response body contains `link` (the created share link object) and `shareUrl` (the absolute URL to access the shared chat); on failure the response body contains an `error` message and an appropriate HTTP status (401, 403, or 404).
 */
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
  const isOwner = await isChatOwnerForUser(session.user.id, slug);
  if (!isOwner) {
    void apiLogger.requestFailed(403, "Read-only chat", { slug });
    return NextResponse.json({ error: "Read-only chat" }, { status: 403 });
  }
  const chat = await getChatBySlugForUser(session.user.id, slug);
  if (!chat) {
    void apiLogger.requestFailed(404, "Chat not found", { slug });
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
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
