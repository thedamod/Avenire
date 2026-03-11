import { NextResponse } from "next/server";
import { listDueFlashcardsForUser } from "@/lib/flashcards";
import { getWorkspaceContextForUser } from "@/lib/workspace";

export async function GET(request: Request) {
  const ctx = await getWorkspaceContextForUser();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const setId = searchParams.get("setId")?.trim() || undefined;
  const limitParam = Number.parseInt(searchParams.get("limit") ?? "20", 10);

  const queue = await listDueFlashcardsForUser({
    limit: Number.isFinite(limitParam) ? limitParam : 20,
    setId,
    userId: ctx.user.id,
    workspaceId: ctx.workspace.workspaceId,
  });

  return NextResponse.json({ queue });
}
