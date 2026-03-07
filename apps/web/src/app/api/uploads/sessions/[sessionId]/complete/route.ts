import { NextResponse } from "next/server";
import { UTApi, UTFile } from "@avenire/storage";
import { z } from "zod";
import { userCanEditFolder } from "@/lib/file-data";
import { clearMultipartParts, assembleMultipartParts } from "@/lib/upload-multipart-store";
import { createApiLogger } from "@/lib/observability";
import { saveUploadSession, getUploadSession } from "@/lib/upload-session-store";
import { normalizeSha256, registerWorkspaceUploadedFile } from "@/lib/upload-registration";
import { getSessionUser } from "@/lib/workspace";

const completeSchema = z
  .object({
    storageKey: z.string().min(1).optional(),
    storageUrl: z.string().url().optional(),
    mimeType: z.string().nullable().optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
    checksumSha256: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    multipart: z
      .object({
        partNumbers: z.array(z.number().int().positive()).optional(),
      })
      .optional(),
  })
  .refine(
    (value) =>
      (Boolean(value.storageKey) &&
        Boolean(value.storageUrl) &&
        typeof value.sizeBytes === "number") ||
      Boolean(value.multipart),
    {
      message: "Provide direct upload metadata or multipart completion payload.",
    }
  );

function asNullableString(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function uploadMultipartAsSingleObject(input: {
  sessionId: string;
  name: string;
  mimeType: string | null;
  expectedPartNumbers?: number[];
}) {
  if (!process.env.UPLOADTHING_TOKEN) {
    throw Object.assign(new Error("UPLOADTHING_TOKEN missing"), {
      code: "UPLOADTHING_UNAVAILABLE",
    });
  }

  const assembled = await assembleMultipartParts(input.sessionId);
  if (Array.isArray(input.expectedPartNumbers) && input.expectedPartNumbers.length > 0) {
    const normalizedExpected = [...new Set(input.expectedPartNumbers.map((value) => Math.max(1, Math.trunc(value))))].sort(
      (a, b) => a - b
    );
    const normalizedActual = [...assembled.partNumbers].sort((a, b) => a - b);
    if (JSON.stringify(normalizedExpected) !== JSON.stringify(normalizedActual)) {
      throw Object.assign(new Error("Multipart part list mismatch"), {
        code: "MULTIPART_PART_MISMATCH",
      });
    }
  }
  const utapi = new UTApi({ token: process.env.UPLOADTHING_TOKEN });
  const uploadResult = await utapi.uploadFiles(
    new UTFile([assembled.buffer], input.name, {
      type: input.mimeType ?? undefined,
    })
  );
  const result = Array.isArray(uploadResult) ? uploadResult[0] : uploadResult;
  const uploaded = result?.data;
  if (!uploaded || typeof uploaded.key !== "string" || typeof uploaded.ufsUrl !== "string") {
    throw new Error("Multipart upload assembly succeeded but UploadThing upload failed.");
  }

  return {
    checksumSha256: assembled.checksumSha256,
    partNumbers: assembled.partNumbers,
    partCount: assembled.partCount,
    sizeBytes: assembled.totalSizeBytes,
    storageKey: uploaded.key,
    storageUrl: uploaded.ufsUrl,
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  const user = await getSessionUser();
  const apiLogger = createApiLogger({
    request,
    route: "/api/uploads/sessions/[sessionId]/complete",
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

  const canEdit = await userCanEditFolder({
    workspaceId: session.workspaceUuid,
    folderId: session.folderId,
    userId: user.id,
  });
  if (!canEdit) {
    void apiLogger.requestFailed(403, "Read-only folder");
    return NextResponse.json({ error: "Read-only folder" }, { status: 403 });
  }

  const parsed = completeSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    void apiLogger.requestFailed(400, "Invalid payload");
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (session.result?.fileId) {
    void apiLogger.requestSucceeded(200, {
      workspaceUuid: session.workspaceUuid,
      sessionId: session.id,
      fileId: session.result.fileId,
      idempotentReplay: true,
    });
    return NextResponse.json(
      {
        ok: true,
        session,
        fileId: session.result.fileId,
        ingestionJobId: session.result.ingestionJobId,
        deduplicated: session.result.deduplicated,
      },
      { status: 200 }
    );
  }

  let storageKey = parsed.data.storageKey;
  let storageUrl = parsed.data.storageUrl;
  let sizeBytes = parsed.data.sizeBytes;
  let checksumSha256 = normalizeSha256(parsed.data.checksumSha256);
  let multipartPartCount = 0;

  if (!storageKey || !storageUrl || typeof sizeBytes !== "number") {
    try {
      const multipartUpload = await uploadMultipartAsSingleObject({
        sessionId,
        name: session.name,
        mimeType: asNullableString(parsed.data.mimeType) ?? session.mimeType,
        expectedPartNumbers: parsed.data.multipart?.partNumbers,
      });
      storageKey = multipartUpload.storageKey;
      storageUrl = multipartUpload.storageUrl;
      sizeBytes = multipartUpload.sizeBytes;
      checksumSha256 = checksumSha256 ?? multipartUpload.checksumSha256;
      multipartPartCount = multipartUpload.partCount;
    } catch (error) {
      const isUnavailable =
        (error as { code?: string } | null | undefined)?.code ===
        "UPLOADTHING_UNAVAILABLE";
      const isPartMismatch =
        (error as { code?: string } | null | undefined)?.code ===
        "MULTIPART_PART_MISMATCH";
      void apiLogger.requestFailed(isUnavailable ? 503 : 500, error, {
        workspaceUuid: session.workspaceUuid,
        sessionId: session.id,
      });
      return NextResponse.json(
        {
          error: isPartMismatch
            ? "Multipart parts mismatch"
            : isUnavailable
            ? "Multipart completion unavailable"
            : "Multipart completion failed",
        },
        { status: isPartMismatch ? 422 : isUnavailable ? 503 : 500 }
      );
    }
  }

  if (!storageKey || !storageUrl || typeof sizeBytes !== "number") {
    void apiLogger.requestFailed(400, "Missing upload metadata after completion");
    return NextResponse.json(
      { error: "Missing upload metadata after completion" },
      { status: 400 }
    );
  }

  const expectedChecksum = normalizeSha256(session.checksumSha256);
  if (expectedChecksum && checksumSha256 && expectedChecksum !== checksumSha256) {
    void apiLogger.requestFailed(422, "Checksum mismatch");
    return NextResponse.json({ error: "Checksum mismatch" }, { status: 422 });
  }

  if (session.sizeBytes > 0 && sizeBytes !== session.sizeBytes) {
    void apiLogger.requestFailed(422, "Size mismatch");
    return NextResponse.json({ error: "Size mismatch" }, { status: 422 });
  }

  if (session.mimeType && parsed.data.mimeType && session.mimeType !== parsed.data.mimeType) {
    void apiLogger.requestFailed(422, "MIME type mismatch");
    return NextResponse.json({ error: "MIME type mismatch" }, { status: 422 });
  }

  const uploadedSession = await saveUploadSession({
    ...session,
    status: "uploaded",
    upload: {
      storageKey,
      storageUrl,
      mimeType: asNullableString(parsed.data.mimeType) ?? session.mimeType,
      sizeBytes,
      checksumSha256,
    },
  });

  const verifiedSession = await saveUploadSession({
    ...uploadedSession,
    status: "verified",
  });

  try {
    const result = await registerWorkspaceUploadedFile({
      workspaceUuid: session.workspaceUuid,
      userId: user.id,
      folderId: session.folderId,
      storageKey,
      storageUrl,
      name: session.name,
      mimeType: parsed.data.mimeType ?? session.mimeType,
      sizeBytes,
      metadata: parsed.data.metadata,
      contentHashSha256: checksumSha256 ?? session.checksumSha256,
      hashComputedBy: "client",
    });

    const completedSession = await saveUploadSession({
      ...verifiedSession,
      status: "ingestion_queued",
      result: {
        fileId: result.file.id,
        ingestionJobId: result.ingestionJob?.id ?? null,
        deduplicated: result.status === "deduplicated",
      },
    });

    await clearMultipartParts(sessionId);

    void apiLogger.requestSucceeded(200, {
      workspaceUuid: session.workspaceUuid,
      sessionId: session.id,
      fileId: result.file.id,
      ingestionJobId: result.ingestionJob?.id ?? null,
      deduplicated: result.status === "deduplicated",
      multipartPartCount: multipartPartCount || undefined,
    });
    return NextResponse.json(
      {
        ok: true,
        session: completedSession,
        file: result.file,
        ingestionJob: result.ingestionJob,
      },
      { status: 200 }
    );
  } catch (error) {
    const failedSession = await saveUploadSession({
      ...verifiedSession,
      status: "failed",
    });
    const isRateLimit =
      (error as { code?: string } | null | undefined)?.code ===
      "UPLOAD_RATE_LIMIT";
    const retryAfter =
      (error as { retryAfter?: string | null } | null | undefined)?.retryAfter ??
      null;

    void apiLogger.requestFailed(isRateLimit ? 429 : 500, error, {
      workspaceUuid: session.workspaceUuid,
      sessionId: session.id,
      retryAfter,
    });
    return NextResponse.json(
      {
        error: isRateLimit ? "Upload usage limit reached" : "Upload finalize failed",
        retryAfter,
        session: failedSession,
      },
      { status: isRateLimit ? 429 : 500 }
    );
  }
}
