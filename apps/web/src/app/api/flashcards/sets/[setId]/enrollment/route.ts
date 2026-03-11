import { NextResponse } from "next/server";
import { upsertFlashcardSetEnrollmentForUser } from "@/lib/flashcards";
import { getWorkspaceContextForUser } from "@/lib/workspace";

export async function POST(
  request: Request,
  context: { params: Promise<{ setId: string }> }
) {
  const ctx = await getWorkspaceContextForUser();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    newCardsPerDay?: number;
    status?: "active" | "paused";
  };
  const { setId } = await context.params;

  const enrollment = await upsertFlashcardSetEnrollmentForUser({
    newCardsPerDay: body.newCardsPerDay,
    setId,
    status: body.status,
    userId: ctx.user.id,
    workspaceId: ctx.workspace.workspaceId,
  });

  if (!enrollment) {
    return NextResponse.json({ error: "Set not found" }, { status: 404 });
  }

  return NextResponse.json({ enrollment });
}
