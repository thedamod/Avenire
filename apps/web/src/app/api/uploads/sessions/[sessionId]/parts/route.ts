import { NextResponse } from "next/server";
import { z } from "zod";
import { createApiLogger } from "@/lib/observability";
import { createUploadSessionPartToken } from "@/lib/upload-session-token";
import { getUploadSession, saveUploadSession } from "@/lib/upload-session-store";
import { getSessionUser } from "@/lib/workspace";

const partsSchema = z.object({
  partNumbers: z.array(z.number().int().positive()).min(1).max(10_000),
});

function resolveMaxPartBytes() {
  const parsed = Number.parseInt(process.env.UPLOAD_SESSION_MAX_PART_BYTES ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 16 * 1024 * 1024;
  }
  return parsed;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  const user = await getSessionUser();
  const apiLogger = createApiLogger({
    request,
    route: "/api/uploads/sessions/[sessionId]/parts",
    feature: "uploads",
    userId: user?.id ?? null,
  });
  void apiLogger.requestStarted();

  if (!user) {
    void apiLogger.requestFailed(401, "Unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await context.params;
  const session = await getUploadSession(sessionId);
  if (!session) {
    void apiLogger.requestFailed(404, "Session not found");
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (session.userId !== user.id) {
    void apiLogger.requestFailed(403, "Forbidden");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    void apiLogger.requestFailed(410, "Session expired");
    return NextResponse.json({ error: "Session expired" }, { status: 410 });
  }

  const parsed = partsSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    void apiLogger.requestFailed(400, "Invalid payload");
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const updated = await saveUploadSession({
    ...session,
    status: "uploading",
  });
  const ttlSeconds = 15 * 60;
  const baseUrl = new URL(request.url);
  const partUrls = parsed.data.partNumbers.map((partNumber) => {
    const token = createUploadSessionPartToken({
      userId: session.userId,
      workspaceUuid: session.workspaceUuid,
      sessionId: session.id,
      partNumber,
      ttlSeconds,
    });
    const uploadUrl = new URL(
      `/api/uploads/sessions/${session.id}/parts/${partNumber}`,
      baseUrl.origin
    );
    uploadUrl.searchParams.set("token", token);
    return {
      expiresInSeconds: ttlSeconds,
      method: "PUT" as const,
      partNumber,
      uploadUrl: uploadUrl.toString(),
    };
  });

  void apiLogger.requestSucceeded(200, {
    workspaceUuid: updated.workspaceUuid,
    sessionId: updated.id,
    partCount: parsed.data.partNumbers.length,
  });
  return NextResponse.json({
    ok: true,
    session: updated,
    mode: "session-multipart",
    maxPartBytes: resolveMaxPartBytes(),
    parts: partUrls,
    message:
      "Upload each part using PUT to the provided uploadUrl. Call /complete once all parts are uploaded.",
  });
}
