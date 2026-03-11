import { NextResponse } from "next/server";
import { reviewFlashcardForUser } from "@/lib/flashcards";
import { getWorkspaceContextForUser } from "@/lib/workspace";

export async function POST(request: Request) {
  const ctx = await getWorkspaceContextForUser();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    cardId?: string;
    rating?: "again" | "hard" | "good" | "easy";
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
    userId: ctx.user.id,
    workspaceId: ctx.workspace.workspaceId,
  });

  if (!result) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
