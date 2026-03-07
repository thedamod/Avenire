import { grantResourceToUserByEmail } from "@/lib/file-data";
import { auth } from "@avenire/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getChatBySlugForUser, isChatOwnerForUser } from "@/lib/chat-data";
import { createApiLogger } from "@/lib/observability";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  const apiLogger = createApiLogger({
    request,
    route: "/api/chats/[slug]/share/grants",
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
  if (!chat) {
    void apiLogger.requestFailed(404, "Chat not found", { slug });
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }
  const isOwner = await isChatOwnerForUser(session.user.id, slug, chat.workspaceId);
  if (!isOwner) {
    void apiLogger.requestFailed(403, "Read-only chat", { slug });
    return NextResponse.json({ error: "Read-only chat" }, { status: 403 });
  }
  if (!chat.workspaceId) {
    void apiLogger.requestFailed(400, "Chat workspace missing", { slug });
    return NextResponse.json({ error: "Chat workspace missing" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { email?: string };
  if (!body.email) {
    void apiLogger.requestFailed(400, "Missing email", { slug });
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  const grant = await grantResourceToUserByEmail({
    workspaceId: chat.workspaceId,
    resourceType: "chat",
    resourceId: chat.slug,
    email: body.email,
    createdBy: session.user.id,
    permission: "viewer",
  });

  if (!grant) {
    void apiLogger.requestFailed(404, "User not found", { slug });
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  void apiLogger.meter("meter.share.created", {
    resourceType: "chat",
    slug,
    workspaceUuid: chat.workspaceId,
  });
  void apiLogger.featureUsed("chat.sharing.grant.created", { slug });
  void apiLogger.requestSucceeded(201, { slug });

  return NextResponse.json({ grant }, { status: 201 });
}
