import { NextResponse } from "next/server";
import { respondToInvitationForUser } from "@/lib/file-data";
import { getSessionUser } from "@/lib/workspace";
import { listWorkspacesForUser } from "@/lib/file-data";

type ActionBody = {
  action?: "accept" | "decline";
};

export async function POST(
  request: Request,
  context: { params: Promise<{ invitationId: string }> },
) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { invitationId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as ActionBody;
  if (!(body.action === "accept" || body.action === "decline")) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const result = await respondToInvitationForUser({
    invitationId,
    userId: sessionUser.id,
    userEmail: sessionUser.email,
    action: body.action,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (result.action === "accepted") {
    const workspaces = await listWorkspacesForUser(sessionUser.id);
    const workspace = workspaces.find(
      (item) => item.workspaceId === result.workspaceId
    );
    return NextResponse.json({
      ...result,
      workspace: workspace ?? null,
    });
  }

  return NextResponse.json(result);
}
