import { NextResponse } from "next/server";
import { createFlashcardCardForUser } from "@/lib/flashcards";
import { getWorkspaceContextForUser } from "@/lib/workspace";

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

  const card = await createFlashcardCardForUser({
    backMarkdown: body.backMarkdown,
    frontMarkdown: body.frontMarkdown,
    notesMarkdown: body.notesMarkdown,
    setId,
    source: body.source,
    tags: body.tags,
    userId: ctx.user.id,
    workspaceId: ctx.workspace.workspaceId,
  });

  if (!card) {
    return NextResponse.json({ error: "Set not found" }, { status: 404 });
  }

  return NextResponse.json({ card }, { status: 201 });
}
