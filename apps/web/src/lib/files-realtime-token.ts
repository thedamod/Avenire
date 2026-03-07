import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

interface FilesRealtimeTokenPayload {
  exp: number;
  iat: number;
  jti: string;
  sub: string;
  wid: string;
}

function base64UrlEncode(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function signPayload(payloadSegment: string, secret: string) {
  return createHmac("sha256", secret).update(payloadSegment).digest("base64url");
}

function base64UrlDecode(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

export function createFilesRealtimeToken(input: {
  userId: string;
  workspaceUuid: string;
  ttlSeconds?: number;
}) {
  const secret = process.env.SSE_TOKEN_SECRET;

  if (!secret) {
    throw new Error("SSE_TOKEN_SECRET is not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: FilesRealtimeTokenPayload = {
    exp: now + (input.ttlSeconds ?? 60),
    iat: now,
    jti: randomUUID(),
    sub: input.userId,
    wid: input.workspaceUuid,
  };

  const payloadSegment = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(payloadSegment, secret);

  return `${payloadSegment}.${signature}`;
}

export function verifyFilesRealtimeToken(token: string, workspaceUuid: string) {
  const secret = process.env.SSE_TOKEN_SECRET;

  if (!secret) {
    return { ok: false as const, reason: "secret-missing" };
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return { ok: false as const, reason: "malformed" };
  }

  const [payloadSegment, signature] = parts;
  if (!payloadSegment || !signature) {
    return { ok: false as const, reason: "malformed" };
  }

  const expectedSignature = signPayload(payloadSegment, secret);
  const signatureBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  if (signatureBuffer.length !== expectedBuffer.length) {
    return { ok: false as const, reason: "signature" };
  }
  try {
    if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return { ok: false as const, reason: "signature" };
    }
  } catch {
    return { ok: false as const, reason: "signature" };
  }

  let payload: FilesRealtimeTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadSegment)) as FilesRealtimeTokenPayload;
  } catch {
    return { ok: false as const, reason: "payload" };
  }

  if (
    typeof payload.exp !== "number" ||
    typeof payload.iat !== "number" ||
    typeof payload.jti !== "string" ||
    typeof payload.sub !== "string" ||
    typeof payload.wid !== "string"
  ) {
    return { ok: false as const, reason: "payload" };
  }

  if (payload.wid !== workspaceUuid) {
    return { ok: false as const, reason: "workspace" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp <= nowSeconds) {
    return { ok: false as const, reason: "expired" };
  }

  return { ok: true as const, payload };
}
