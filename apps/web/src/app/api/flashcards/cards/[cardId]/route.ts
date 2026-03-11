import { NextResponse } from "next/server";
import {
  archiveFlashcardCardForUser,
  updateFlashcardCardForUser,
} from "@/lib/flashcards";
import { getWorkspaceContextForUser } from "@/lib/workspace";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ cardId: string }> }
) {
  const ctx = await getWorkspaceContextForUser();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    backMarkdown?: string;
    frontMarkdown?: string;
    notesMarkdown?: string | null;
    tags?: string[];
  };
  const { cardId } = await context.params;

  const card = await updateFlashcardCardForUser({
    backMarkdown: body.backMarkdown,
    cardId,
    frontMarkdown: body.frontMarkdown,
    notesMarkdown: body.notesMarkdown,
    tags: body.tags,
    userId: ctx.user.id,
    workspaceId: ctx.workspace.workspaceId,
  });

  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  return NextResponse.json({ card });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ cardId: string }> }
) {
  const ctx = await getWorkspaceContextForUser();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { cardId } = await context.params;
  const card = await archiveFlashcardCardForUser(
    ctx.user.id,
    ctx.workspace.workspaceId,
    cardId
  );

  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
