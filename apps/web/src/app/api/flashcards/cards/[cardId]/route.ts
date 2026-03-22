import { assertFlashcardTaxonomy } from "@avenire/database";
import { NextResponse } from "next/server";
import {
  archiveFlashcardCardForUser,
  updateFlashcardCardForUser,
} from "@/lib/flashcards";
import { getWorkspaceContextForUser } from "@/lib/workspace";
import { publishWorkspaceStreamEvent } from "@/lib/workspace-event-stream";

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
    source?: Record<string, unknown>;
    tags?: string[];
  };
  const { cardId } = await context.params;

  let taxonomy: ReturnType<typeof assertFlashcardTaxonomy> | null = null;
  try {
    taxonomy = assertFlashcardTaxonomy(body.source, "flashcard update");
  } catch {
    return NextResponse.json(
      {
        error:
          "source with subject, topic, and concept is required for flashcard update",
      },
      { status: 400 }
    );
  }
  const source = {
    ...(body.source ?? {}),
    ...(taxonomy ?? {}),
  };

  const card = await updateFlashcardCardForUser({
    backMarkdown: body.backMarkdown,
    cardId,
    frontMarkdown: body.frontMarkdown,
    notesMarkdown: body.notesMarkdown,
    source,
    tags: body.tags,
    userId: ctx.user.id,
    workspaceId: ctx.workspace.workspaceId,
  });

  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  void publishWorkspaceStreamEvent({
    workspaceUuid: ctx.workspace.workspaceId,
    type: "flashcards.invalidate",
    payload: {
      action: "updated",
      cardId: card.id,
      setId: card.setId,
      workspaceUuid: ctx.workspace.workspaceId,
    },
  });

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

  void publishWorkspaceStreamEvent({
    workspaceUuid: ctx.workspace.workspaceId,
    type: "flashcards.invalidate",
    payload: {
      action: "deleted",
      cardId,
      setId: card.setId,
      workspaceUuid: ctx.workspace.workspaceId,
    },
  });

  return NextResponse.json({ ok: true });
}
