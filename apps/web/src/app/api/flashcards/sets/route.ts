import { NextResponse } from "next/server";
import {
  createFlashcardSetForUser,
  listFlashcardSetSummariesForUser,
} from "@/lib/flashcards";
import { getWorkspaceContextForUser } from "@/lib/workspace";

export async function GET() {
  const ctx = await getWorkspaceContextForUser();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sets = await listFlashcardSetSummariesForUser(
    ctx.user.id,
    ctx.workspace.workspaceId
  );

  return NextResponse.json({ sets });
}

export async function POST(request: Request) {
  const ctx = await getWorkspaceContextForUser();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    description?: string | null;
    tags?: string[];
    title?: string;
  };

  const set = await createFlashcardSetForUser({
    description: body.description,
    tags: body.tags,
    title: body.title,
    userId: ctx.user.id,
    workspaceId: ctx.workspace.workspaceId,
  });

  if (!set) {
    return NextResponse.json(
      { error: "Unable to create set" },
      { status: 400 }
    );
  }

  return NextResponse.json({ set }, { status: 201 });
}
