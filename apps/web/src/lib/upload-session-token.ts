import { createHmac, randomUUID } from "node:crypto";

interface UploadSessionTokenPayload {
  exp: number;
  iat: number;
  jti: string;
  pn: number;
  sid: string;
  uid: string;
  wid: string;
}

function base64UrlEncode(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function getSecret() {
  return (
    process.env.UPLOAD_SESSION_TOKEN_SECRET ??
    process.env.SSE_TOKEN_SECRET ??
    process.env.BETTER_AUTH_SECRET ??
    null
  );
}

function signPayload(payloadSegment: string, secret: string) {
  return createHmac("sha256", secret).update(payloadSegment).digest("base64url");
}

export function createUploadSessionPartToken(input: {
  userId: string;
  workspaceUuid: string;
  sessionId: string;
  partNumber: number;
  ttlSeconds?: number;
}) {
  const secret = getSecret();
  if (!secret) {
    throw new Error("UPLOAD_SESSION_TOKEN_SECRET is not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: UploadSessionTokenPayload = {
    exp: now + (input.ttlSeconds ?? 15 * 60),
    iat: now,
    jti: randomUUID(),
    sid: input.sessionId,
    uid: input.userId,
    wid: input.workspaceUuid,
    pn: Math.max(1, Math.trunc(input.partNumber)),
  };

  const payloadSegment = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(payloadSegment, secret);
  return `${payloadSegment}.${signature}`;
}

export function verifyUploadSessionPartToken(
  token: string,
  expected: {
    sessionId: string;
    workspaceUuid: string;
    partNumber: number;
  }
) {
  const secret = getSecret();
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
  if (signature !== expectedSignature) {
    return { ok: false as const, reason: "signature" };
  }

  let payload: UploadSessionTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadSegment)) as UploadSessionTokenPayload;
  } catch {
    return { ok: false as const, reason: "payload" };
  }

  if (
    typeof payload.exp !== "number" ||
    typeof payload.iat !== "number" ||
    typeof payload.sid !== "string" ||
    typeof payload.uid !== "string" ||
    typeof payload.wid !== "string" ||
    typeof payload.pn !== "number"
  ) {
    return { ok: false as const, reason: "payload" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    return { ok: false as const, reason: "expired" };
  }

  if (payload.sid !== expected.sessionId) {
    return { ok: false as const, reason: "session" };
  }
  if (payload.wid !== expected.workspaceUuid) {
    return { ok: false as const, reason: "workspace" };
  }
  if (payload.pn !== Math.max(1, Math.trunc(expected.partNumber))) {
    return { ok: false as const, reason: "part" };
  }

  return { ok: true as const, payload };
}
