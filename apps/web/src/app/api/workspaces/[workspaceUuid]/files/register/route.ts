import { registerFileAsset } from "@/lib/file-data";
import { NextResponse } from "next/server";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";

/**
 * Register a new file asset in a workspace using metadata supplied in the request body.
 *
 * @param request - HTTP request whose JSON body must include `folderId`, `storageKey`, `storageUrl`, `name`, and `sizeBytes`; `mimeType` and `metadata` are optional.
 * @param context - Route context with `params` resolving to an object containing the `workspaceUuid` path parameter.
 * @returns A NextResponse containing `{ file }` with the created file and status `201` on success; or an error JSON with status `400` (missing/invalid metadata), `401` (unauthorized), or `403` (forbidden).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceUuid: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid } = await context.params;
  const canAccess = await ensureWorkspaceAccessForUser(user.id, workspaceUuid);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    folderId?: string;
    storageKey?: string;
    storageUrl?: string;
    name?: string;
    mimeType?: string | null;
    sizeBytes?: number;
    metadata?: Record<string, unknown>;
  };

  if (
    !body.folderId ||
    !body.storageKey ||
    !body.storageUrl ||
    !body.name ||
    typeof body.sizeBytes !== "number"
  ) {
    return NextResponse.json({ error: "Missing file metadata" }, { status: 400 });
  }

  const file = await registerFileAsset(workspaceUuid, user.id, {
    folderId: body.folderId,
    storageKey: body.storageKey,
    storageUrl: body.storageUrl,
    name: body.name,
    mimeType: body.mimeType,
    sizeBytes: body.sizeBytes,
    metadata: body.metadata,
  });

  return NextResponse.json({ file }, { status: 201 });
}
