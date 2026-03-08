import { retrieveWorkspaceChunks } from "@avenire/ingestion";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createApiLogger } from "@/lib/observability";
import {
  createRetrievalCacheKey,
  getCachedRetrievalResult,
  setCachedRetrievalResult,
} from "@/lib/retrieval-cache";
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
  const apiLogger = createApiLogger({
    request,
    route: "/api/ai/retrieval/query",
    feature: "retrieval",
    userId: user?.id ?? null,
  });
  void apiLogger.requestStarted();

  try {
    if (!user) {
      void apiLogger.requestFailed(401, "Unauthorized");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = querySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      void apiLogger.requestFailed(400, "Invalid payload");
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const canAccess = await ensureWorkspaceAccessForUser(
      user.id,
      parsed.data.workspaceUuid
    );
    if (!canAccess) {
      void apiLogger.requestFailed(403, "Forbidden", {
        workspaceUuid: parsed.data.workspaceUuid,
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const cacheKey = createRetrievalCacheKey({
      workspaceUuid: parsed.data.workspaceUuid,
      query: parsed.data.query,
      limit: parsed.data.limit,
      sourceType: parsed.data.sourceType,
      provider: parsed.data.provider,
    });
    const cached = await getCachedRetrievalResult<unknown>(cacheKey);
    if (cached) {
      void apiLogger.requestSucceeded(200, {
        workspaceUuid: parsed.data.workspaceUuid,
        cache: "hit",
      });
      return NextResponse.json(cached, {
        headers: { "x-rag-cache": "hit" },
      });
    }

    const result = await retrieveWorkspaceChunks({
      workspaceId: parsed.data.workspaceUuid,
      query: parsed.data.query,
      limit: parsed.data.limit,
      sourceType: parsed.data.sourceType,
      provider: parsed.data.provider,
    });
    await setCachedRetrievalResult(cacheKey, result);

    void apiLogger.requestSucceeded(200, {
      workspaceUuid: parsed.data.workspaceUuid,
      cache: "miss",
      resultCount: Array.isArray((result as { results?: unknown[] }).results)
        ? ((result as { results: unknown[] }).results.length)
        : null,
    });
    return NextResponse.json(result, {
      headers: { "x-rag-cache": "miss" },
    });
  } catch (error) {
    void apiLogger.requestFailed(500, error);
    return NextResponse.json(
      { error: "Failed to query retrieval index" },
      { status: 500 },
    );
  }
}
