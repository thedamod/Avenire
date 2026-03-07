import { grantResourceToUserByEmail, resolveWorkspaceForUser } from "@/lib/file-data";
import { auth } from "@avenire/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getChatBySlugForUser } from "@/lib/chat-data";

/**
 * Creates a read permission grant for a chat identified by slug, assigning access to the specified email.
 *
 * Expects a JSON body with an `email` field and uses the authenticated session to locate the chat and the user's workspace.
 *
 * @param request - Incoming HTTP request; body must be JSON containing `email`.
 * @param context - Route context whose `params` promise resolves to an object with `slug` (the chat identifier).
 * @returns A NextResponse containing the created `grant` object with HTTP status 201 on success. Returns JSON error responses for:
 * - 401 Unauthorized when no authenticated user is present.
 * - 400 Missing email when the request body lacks `email`.
 * - 404 Chat not found when the chat slug is not found for the user.
 * - 404 Workspace not found when no workspace can be resolved for the user.
 * - 404 User not found when the grant could not be created for the provided email.
 */
export async function POST(
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

  const activeOrganizationId =
    (session as { session?: { activeOrganizationId?: string | null } }).session
      ?.activeOrganizationId ?? null;
  const ws = await resolveWorkspaceForUser(session.user.id, activeOrganizationId);
  if (!ws) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { email?: string };
  if (!body.email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  const grant = await grantResourceToUserByEmail({
    workspaceId: ws.workspaceId,
    resourceType: "chat",
    resourceId: chat.slug,
    email: body.email,
    createdBy: session.user.id,
    permission: "read",
  });

  if (!grant) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ grant }, { status: 201 });
}
