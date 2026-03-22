import { assertFlashcardTaxonomy } from "@avenire/database";
import { NextResponse } from "next/server";
import { createFlashcardCardForUser } from "@/lib/flashcards";
import { getWorkspaceContextForUser } from "@/lib/workspace";
import { publishWorkspaceStreamEvent } from "@/lib/workspace-event-stream";

export async function POST(
  request: Request,
  context: { params: Promise<{ setId: string }> }
) {
  const ctx = await getWorkspaceContextForUser();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { setId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    backMarkdown?: string;
    frontMarkdown?: string;
    notesMarkdown?: string | null;
    source?: Record<string, unknown>;
    tags?: string[];
  };

  if (!(body.frontMarkdown?.trim() && body.backMarkdown?.trim())) {
    return NextResponse.json(
      { error: "frontMarkdown and backMarkdown are required" },
      { status: 400 }
    );
  }

  let taxonomy: ReturnType<typeof assertFlashcardTaxonomy> | null = null;
  try {
    taxonomy = assertFlashcardTaxonomy(body.source, "flashcard creation");
  } catch {
    return NextResponse.json(
      {
        error:
          "source with subject, topic, and concept is required for flashcard creation",
      },
      { status: 400 }
    );
  }
  const source = {
    ...(body.source ?? {}),
    ...(taxonomy ?? {}),
  };

  const card = await createFlashcardCardForUser({
    backMarkdown: body.backMarkdown,
    frontMarkdown: body.frontMarkdown,
    notesMarkdown: body.notesMarkdown,
    setId,
    source,
    tags: body.tags,
    userId: ctx.user.id,
    workspaceId: ctx.workspace.workspaceId,
  });

  if (!card) {
    return NextResponse.json({ error: "Set not found" }, { status: 404 });
  }

  void publishWorkspaceStreamEvent({
    workspaceUuid: ctx.workspace.workspaceId,
    type: "flashcards.invalidate",
    payload: {
      action: "created",
      cardId: card.id,
      setId,
      workspaceUuid: ctx.workspace.workspaceId,
    },
  });

  return NextResponse.json({ card }, { status: 201 });
}
