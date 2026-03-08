import { retrieveWorkspaceChunks } from "@avenire/ingestion";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";

const querySchema = z.object({
  workspaceUuid: z.string().uuid(),
  query: z.string().min(1),
  limit: z.number().int().positive().max(50).optional(),
  sourceType: z
    .enum(["pdf", "image", "video", "audio", "markdown", "link"])
    .optional(),
  provider: z.string().optional(),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = querySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const canAccess = await ensureWorkspaceAccessForUser(
    user.id,
    parsed.data.workspaceUuid
  );
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await retrieveWorkspaceChunks({
    workspaceId: parsed.data.workspaceUuid,
    query: parsed.data.query,
    limit: parsed.data.limit,
    sourceType: parsed.data.sourceType,
    provider: parsed.data.provider,
  });

  return NextResponse.json(result);
}
