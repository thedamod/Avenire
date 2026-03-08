import { NextResponse } from "next/server";
import { z } from "zod";
import { userCanEditFolder } from "@/lib/file-data";
import { createApiLogger } from "@/lib/observability";
import { createUploadSession } from "@/lib/upload-session-store";
import { normalizeSha256 } from "@/lib/upload-registration";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";

const createSessionSchema = z.object({
  workspaceUuid: z.string().uuid(),
  folderId: z.string().uuid(),
  name: z.string().min(1).max(255),
  mimeType: z.string().nullable().optional(),
  sizeBytes: z.number().int().nonnegative(),
  checksumSha256: z.string().optional(),
});

function resolveRecommendedPartSize() {
  const parsed = Number.parseInt(process.env.UPLOAD_SESSION_MAX_PART_BYTES ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 16 * 1024 * 1024;
  }
  return parsed;
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  const apiLogger = createApiLogger({
    request,
    route: "/api/uploads/sessions",
    feature: "uploads",
    userId: user?.id ?? null,
  });
  void apiLogger.requestStarted();

  if (!user) {
    void apiLogger.requestFailed(401, "Unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createSessionSchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) {
    void apiLogger.requestFailed(400, "Invalid payload");
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const canAccess = await ensureWorkspaceAccessForUser(
    user.id,
    parsed.data.workspaceUuid
  );
  if (!canAccess) {
    void apiLogger.requestFailed(403, "Forbidden", {
      workspaceUuid: parsed.data.workspaceUuid,
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const canEdit = await userCanEditFolder({
    workspaceId: parsed.data.workspaceUuid,
    folderId: parsed.data.folderId,
    userId: user.id,
  });
  if (!canEdit) {
    void apiLogger.requestFailed(403, "Read-only folder");
    return NextResponse.json({ error: "Read-only folder" }, { status: 403 });
  }

  const session = await createUploadSession({
    userId: user.id,
    workspaceUuid: parsed.data.workspaceUuid,
    folderId: parsed.data.folderId,
    name: parsed.data.name.trim(),
    mimeType: parsed.data.mimeType ?? null,
    sizeBytes: parsed.data.sizeBytes,
    checksumSha256: normalizeSha256(parsed.data.checksumSha256),
  });

  void apiLogger.requestSucceeded(201, {
    workspaceUuid: session.workspaceUuid,
    sessionId: session.id,
    folderId: session.folderId,
  });

  return NextResponse.json(
    {
      session,
      multipart: {
        recommendedPartSizeBytes: resolveRecommendedPartSize(),
      },
    },
    { status: 201 }
  );
}
