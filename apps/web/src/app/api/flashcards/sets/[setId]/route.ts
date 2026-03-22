import { NextResponse } from "next/server";
import {
  archiveFlashcardSetForUser,
  getFlashcardSetForUser,
  updateFlashcardSetForUser,
} from "@/lib/flashcards";
import { getWorkspaceContextForUser } from "@/lib/workspace";
import { publishWorkspaceStreamEvent } from "@/lib/workspace-event-stream";

export async function GET(
  _request: Request,
  context: { params: Promise<{ setId: string }> }
) {
  const ctx = await getWorkspaceContextForUser();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { setId } = await context.params;
  const set = await getFlashcardSetForUser(
    ctx.user.id,
    ctx.workspace.workspaceId,
    setId
  );

  if (!set) {
    return NextResponse.json({ error: "Set not found" }, { status: 404 });
  }

  void publishWorkspaceStreamEvent({
    workspaceUuid: ctx.workspace.workspaceId,
    type: "flashcards.invalidate",
    payload: {
      action: "updated",
      setId: set.id,
      workspaceUuid: ctx.workspace.workspaceId,
    },
  });

  return NextResponse.json({ set });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ setId: string }> }
) {
  const ctx = await getWorkspaceContextForUser();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    description?: string | null;
    tags?: string[];
    title?: string;
  };
  const { setId } = await context.params;
  const set = await updateFlashcardSetForUser({
    description: body.description,
    setId,
    tags: body.tags,
    title: body.title,
    userId: ctx.user.id,
    workspaceId: ctx.workspace.workspaceId,
  });

  if (!set) {
    return NextResponse.json({ error: "Set not found" }, { status: 404 });
  }

  return NextResponse.json({ set });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ setId: string }> }
) {
  const ctx = await getWorkspaceContextForUser();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { setId } = await context.params;
  const archived = await archiveFlashcardSetForUser(
    ctx.user.id,
    ctx.workspace.workspaceId,
    setId
  );

  if (!archived) {
    return NextResponse.json({ error: "Set not found" }, { status: 404 });
  }

  void publishWorkspaceStreamEvent({
    workspaceUuid: ctx.workspace.workspaceId,
    type: "flashcards.invalidate",
    payload: {
      action: "deleted",
      setId,
      workspaceUuid: ctx.workspace.workspaceId,
    },
  });

  return NextResponse.json({ ok: true });
}
