import { NextResponse } from "next/server";
import { getUploadSession } from "@/lib/upload-session-store";
import { getSessionUser } from "@/lib/workspace";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await context.params;
  const session = await getUploadSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ session });
}
