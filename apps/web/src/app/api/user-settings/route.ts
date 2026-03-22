import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/workspace";
import { getUserSettings, upsertUserSettings } from "@/lib/user-settings";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getUserSettings(user.id);
  return NextResponse.json({ settings });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = payload as {
    emailReceipts?: unknown;
    onboardingCompleted?: unknown;
  };

  const hasEmailReceipts = typeof raw.emailReceipts === "boolean";
  const hasOnboardingCompleted = typeof raw.onboardingCompleted === "boolean";
  if (!hasEmailReceipts && !hasOnboardingCompleted) {
    return NextResponse.json(
      {
        error:
          "Provide at least one boolean setting: emailReceipts, onboardingCompleted",
      },
      { status: 400 },
    );
  }

  const settings = await upsertUserSettings(user.id, {
    ...(hasEmailReceipts
      ? { emailReceipts: raw.emailReceipts as boolean }
      : {}),
    ...(hasOnboardingCompleted
      ? { onboardingCompleted: raw.onboardingCompleted as boolean }
      : {}),
  });

  return NextResponse.json({ settings });
}
