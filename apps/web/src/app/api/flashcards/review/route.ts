import { NextResponse } from "next/server";
import { reviewFlashcardForUser } from "@/lib/flashcards";
import "@/lib/learning-automation";
import { getWorkspaceContextForUser } from "@/lib/workspace";
import { publishWorkspaceStreamEvent } from "@/lib/workspace-event-stream";

export async function POST(request: Request) {
  const ctx = await getWorkspaceContextForUser();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    cardId?: string;
    rating?: "again" | "hard" | "good" | "easy";
    answerText?: string | null;
  };

  if (!(body.cardId && body.rating)) {
    return NextResponse.json(
      { error: "cardId and rating are required" },
      { status: 400 }
    );
  }

  const result = await reviewFlashcardForUser({
    cardId: body.cardId,
    rating: body.rating,
    answerText: body.answerText ?? null,
    userId: ctx.user.id,
    workspaceId: ctx.workspace.workspaceId,
  });

  if (!result) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  void publishWorkspaceStreamEvent({
    workspaceUuid: ctx.workspace.workspaceId,
    type: "flashcards.invalidate",
    payload: {
      action: "reviewed",
      cardId: body.cardId,
      workspaceUuid: ctx.workspace.workspaceId,
    },
  });

  return NextResponse.json(result);
}
