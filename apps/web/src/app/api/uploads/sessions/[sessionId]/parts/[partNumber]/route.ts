import { NextResponse } from "next/server";
import { getUploadSession } from "@/lib/upload-session-store";
import { verifyUploadSessionPartToken } from "@/lib/upload-session-token";
import { writeMultipartPart } from "@/lib/upload-multipart-store";

function resolveMaxPartBytes() {
  const parsed = Number.parseInt(process.env.UPLOAD_SESSION_MAX_PART_BYTES ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 16 * 1024 * 1024;
  }
  return parsed;
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ sessionId: string; partNumber: string }> }
) {
  const { sessionId, partNumber: partNumberRaw } = await context.params;
  const session = await getUploadSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Session expired" }, { status: 410 });
  }

  const partNumber = Number.parseInt(partNumberRaw, 10);
  if (!Number.isFinite(partNumber) || partNumber <= 0) {
    return NextResponse.json({ error: "Invalid part number" }, { status: 400 });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
  }

  const verification = verifyUploadSessionPartToken(token, {
    sessionId,
    workspaceUuid: session.workspaceUuid,
    partNumber,
  });
  if (!verification.ok) {
    return NextResponse.json(
      { error: "Unauthorized", reason: verification.reason },
      { status: 401 }
    );
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: "Empty part payload" }, { status: 400 });
  }
  if (bytes.byteLength > resolveMaxPartBytes()) {
    return NextResponse.json(
      { error: "Part too large", maxPartBytes: resolveMaxPartBytes() },
      { status: 413 }
    );
  }

  const result = await writeMultipartPart({
    sessionId,
    partNumber,
    bytes,
  });

  return NextResponse.json({
    ok: true,
    etag: result.etag,
    partNumber: result.partNumber,
    sizeBytes: result.sizeBytes,
  });
}
