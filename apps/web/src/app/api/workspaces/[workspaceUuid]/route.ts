import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  deleteWorkspaceForUser,
  listWorkspacesForUser,
  updateWorkspaceLogoForUser,
} from "@/lib/file-data";
import { SUDO_COOKIE_NAME, validateSudoCookie } from "@/lib/sudo";
import { getSessionUser } from "@/lib/workspace";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ workspaceUuid: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const sudoCookie = cookieStore.get(SUDO_COOKIE_NAME)?.value ?? null;
  const hasSudo = validateSudoCookie({ userId: user.id, cookieValue: sudoCookie });
  if (!hasSudo) {
    return NextResponse.json({ error: "Sudo verification required" }, { status: 403 });
  }

  const { workspaceUuid } = await context.params;
  const result = await deleteWorkspaceForUser(user.id, workspaceUuid);
  if (result.status === "workspace-not-found") {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }
  if (result.status === "forbidden") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (result.status === "not-owner") {
    return NextResponse.json({ error: "Only owners can delete workspaces" }, { status: 403 });
  }

  const workspaces = await listWorkspacesForUser(user.id);
  return NextResponse.json({ ok: true, workspaces });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ workspaceUuid: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    logo?: string | null;
  };

  const result = await updateWorkspaceLogoForUser(
    user.id,
    workspaceUuid,
    typeof body.logo === "string" ? body.logo.trim() || null : null
  );

  if (result.status === "workspace-not-found") {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }
  if (result.status === "forbidden") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const workspaces = await listWorkspacesForUser(user.id);
  return NextResponse.json({ ok: true, workspaces });
}
