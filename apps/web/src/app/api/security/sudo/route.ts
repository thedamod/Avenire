import { sendSudoVerificationCodeEmail } from "@avenire/auth/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getLatestActiveSudoChallenge } from "@/lib/database-sudo";
import { getSessionUser } from "@/lib/workspace";
import {
  SUDO_CHALLENGE_TTL_SECONDS,
  SUDO_COOKIE_NAME,
  createSudoChallenge,
  getSudoCookieExpiresAt,
  invalidateSudoChallenge,
  verifySudoCode,
  SUDO_SESSION_TTL_SECONDS,
} from "@/lib/sudo";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SUDO_COOKIE_NAME)?.value ?? null;
  const expiresAt = getSudoCookieExpiresAt({ userId: user.id, cookieValue });
  const expiresInSeconds = expiresAt
    ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
    : 0;
  const active = expiresInSeconds > 0;

  return NextResponse.json({
    active,
    expiresInSeconds,
    expiresAt: expiresAt?.toISOString() ?? null,
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as {
    action?: "request" | "verify";
    code?: string;
  };

  if (payload.action === "request") {
    const latest = await getLatestActiveSudoChallenge(user.id);
    if (latest && Date.now() - latest.createdAt.getTime() < 45_000) {
      return NextResponse.json(
        { error: "Please wait before requesting another code." },
        { status: 429 },
      );
    }

    const challenge = await createSudoChallenge(user.id);
    try {
      await sendSudoVerificationCodeEmail({
        toEmail: user.email,
        code: challenge.code,
        expiresInMinutes: Math.floor(SUDO_CHALLENGE_TTL_SECONDS / 60),
      });
    } catch {
      await invalidateSudoChallenge(challenge.id);
      return NextResponse.json(
        { error: "Unable to send verification code." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      expiresInSeconds: SUDO_CHALLENGE_TTL_SECONDS,
    });
  }

  if (payload.action === "verify") {
    const code = payload.code?.trim() ?? "";
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Invalid code format." }, { status: 400 });
    }

    const result = await verifySudoCode({ userId: user.id, code });
    if (!result.ok) {
      return NextResponse.json(
        { error: "Invalid or expired code." },
        { status: 400 },
      );
    }

    const response = NextResponse.json({
      ok: true,
      expiresAt: result.expiresAt.toISOString(),
    });
    response.cookies.set({
      name: SUDO_COOKIE_NAME,
      value: result.cookieValue,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SUDO_SESSION_TTL_SECONDS,
    });
    return response;
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
