import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  consumeSudoChallenge,
  createSudoChallenge as createSudoChallengeRecord,
  getLatestActiveSudoChallenge,
} from "@avenire/database";

export const SUDO_COOKIE_NAME = "avenire_sudo";
export const SUDO_CHALLENGE_TTL_SECONDS = 10 * 60;
export const SUDO_SESSION_TTL_SECONDS = 12 * 60 * 60;

function getSudoSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "BETTER_AUTH_SECRET must be configured for sudo verification"
    );
  }
  return secret;
}

function toBase64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function fromBase64Url(input: string) {
  return Buffer.from(input, "base64url");
}

function safeCompare(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function generateSudoCode() {
  const value = Math.floor(100_000 + Math.random() * 900_000);
  return String(value);
}

export function hashSudoCode(code: string) {
  const secret = getSudoSecret();
  return createHash("sha256").update(`${secret}:${code}`).digest("hex");
}

export async function createSudoChallenge(userId: string) {
  const code = generateSudoCode();
  const expiresAt = new Date(Date.now() + SUDO_CHALLENGE_TTL_SECONDS * 1000);
  const codeHash = hashSudoCode(code);

  const challenge = await createSudoChallengeRecord({
    userId,
    codeHash,
    expiresAt,
  });

  return {
    id: challenge.id,
    code,
    expiresAt,
  };
}

export async function invalidateSudoChallenge(challengeId: string) {
  await invalidateSudoChallengeRecord(challengeId);
}

export async function verifySudoCode(input: { userId: string; code: string }) {
  const expectedHash = hashSudoCode(input.code.trim());
  const verification = await verifyAndConsumeLatestSudoChallenge({
    userId: input.userId,
    expectedCodeHash: expectedHash,
  });
  if (!verification.ok) {
    return verification;
  }

  const expiresAt = new Date(Date.now() + SUDO_SESSION_TTL_SECONDS * 1000);
  return {
    ok: true as const,
    expiresAt,
    cookieValue: createSudoCookieValue(input.userId, expiresAt),
  };
}

export function createSudoCookieValue(userId: string, expiresAt: Date) {
  const payload = JSON.stringify({ userId, exp: expiresAt.getTime() });
  const encodedPayload = toBase64Url(payload);
  const signature = createHmac("sha256", getSudoSecret())
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function validateSudoCookie(input: {
  userId: string;
  cookieValue?: string | null;
}) {
  if (!input.cookieValue) {
    return false;
  }

  const [encodedPayload, signature] = input.cookieValue.split(".");
  if (!(encodedPayload && signature)) {
    return false;
  }

  const expectedSignature = createHmac("sha256", getSudoSecret())
    .update(encodedPayload)
    .digest("base64url");
  if (!safeCompare(expectedSignature, signature)) {
    return false;
  }

  let payload: { userId?: string; exp?: number };
  try {
    payload = JSON.parse(fromBase64Url(encodedPayload).toString("utf8")) as {
      userId?: string;
      exp?: number;
    };
  } catch {
    return false;
  }

  if (!payload.userId || typeof payload.exp !== "number") {
    return false;
  }
  if (payload.userId !== input.userId) {
    return false;
  }
  if (Date.now() >= payload.exp) {
    return false;
  }

  return true;
}

export function getSudoCookieExpiresAt(input: { userId: string; cookieValue?: string | null }) {
  if (!input.cookieValue) {
    return null;
  }

  const [encodedPayload, signature] = input.cookieValue.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = createHmac("sha256", getSudoSecret())
    .update(encodedPayload)
    .digest("base64url");
  if (!safeCompare(expectedSignature, signature)) {
    return null;
  }

  let payload: { userId?: string; exp?: number };
  try {
    payload = JSON.parse(fromBase64Url(encodedPayload).toString("utf8")) as {
      userId?: string;
      exp?: number;
    };
  } catch {
    return null;
  }

  if (!payload.userId || typeof payload.exp !== "number") {
    return null;
  }
  if (payload.userId !== input.userId) {
    return null;
  }

  return new Date(payload.exp);
}
