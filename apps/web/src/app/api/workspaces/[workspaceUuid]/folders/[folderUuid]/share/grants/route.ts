import {
  createResourceShareLink,
  getFolderWithAncestors,
  grantResourceToUserByEmail,
  userCanAccessWorkspace,
} from "@/lib/file-data";
import { auth } from "@avenire/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { resolveAppBaseUrl } from "@/lib/app-base-url";

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceUuid: string; folderUuid: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid, folderUuid } = await context.params;
  const canAccess = await userCanAccessWorkspace(session.user.id, workspaceUuid);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    permission?: "viewer" | "editor";
  };
  if (!body.email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  const folder = await getFolderWithAncestors(
    workspaceUuid,
    folderUuid,
    session.user.id,
  );
  if (!folder?.folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const grant = await grantResourceToUserByEmail({
    workspaceId: workspaceUuid,
    resourceType: "folder",
    resourceId: folderUuid,
    email: body.email,
    createdBy: session.user.id,
    permission: body.permission === "editor" ? "editor" : "viewer",
  });
  if (!grant) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const link = await createResourceShareLink({
    workspaceId: workspaceUuid,
    resourceType: "folder",
    resourceId: folderUuid,
    createdBy: session.user.id,
    expiresInDays: 7,
    allowPublic: false,
  });

  const baseUrl = resolveAppBaseUrl(request);
  return NextResponse.json(
    {
      grant,
      emailSent: false,
      shareUrl: `${baseUrl}/share/${link.token}`,
    },
    { status: 201 },
  );
}
