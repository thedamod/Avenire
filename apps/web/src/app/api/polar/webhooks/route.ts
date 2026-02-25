import { handlePolarWebhook } from "@avenire/payments";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const signature = request.headers.get("polar-signature") ?? "";

  const valid = await handlePolarWebhook(payload, signature);

  return NextResponse.json({ ok: valid }, { status: valid ? 200 : 400 });
}
