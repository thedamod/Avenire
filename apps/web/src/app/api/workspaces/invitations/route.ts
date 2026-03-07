import { NextResponse } from "next/server";
import { listPendingInvitationsForEmail } from "@/lib/file-data";
import { getSessionUser } from "@/lib/workspace";

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const invitations = await listPendingInvitationsForEmail(sessionUser.email);
  return NextResponse.json({ invitations });
}
