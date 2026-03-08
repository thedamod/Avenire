import {
  db,
  ingestionChunk,
  ingestionEmbedding,
  ingestionResource,
  retrieveWorkspaceChunks,
} from "@avenire/database";
import { eq, sql } from "drizzle-orm";
import { config } from "../config";
import type {
  CorpusStats,
  VectorSearchResult,
  VectorStore,
} from "./vector-store";

export class PostgresVectorStore implements VectorStore {
  constructor(private readonly workspaceId: string) {}

  async search(
    queryEmbedding: number[],
    options: {
      limit: number;
      filter?: {
        sourceType?:
          | "pdf"
          | "image"
          | "video"
          | "audio"
          | "markdown"
          | "link";
        provider?: string;
      };
    }
  ): Promise<VectorSearchResult[]> {
    const rows = await retrieveWorkspaceChunks({
      workspaceId: this.workspaceId,
      queryEmbedding,
      model: config.cohereEmbedModel,
      limit: options.limit,
      sourceType: options.filter?.sourceType,
      provider: options.filter?.provider,
    });

    return rows.map((row) => ({
      resourceId: String(row.resourceId),
      fileId: (row.fileId as string | null) ?? null,
      sourceType: row.sourceType as VectorSearchResult["sourceType"],
      source: String(row.source),
      provider: (row.provider as string | null) ?? null,
      title: (row.title as string | null) ?? null,
      chunkId: String(row.chunkId),
      chunkIndex: Number(row.chunkIndex),
      page: row.page === null ? null : Number(row.page),
      startMs: row.startMs === null ? null : Number(row.startMs),
      endMs: row.endMs === null ? null : Number(row.endMs),
      content: String(row.content),
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      // DB already computes vector distance score, so avoid re-scoring in JS.
      score: Number(row.score) || 0,
    }));
  }

  async corpusStats(): Promise<CorpusStats> {
    const [resourceCountRow, chunkCountRow, embeddingCountRow] =
      await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(ingestionResource)
          .where(eq(ingestionResource.workspaceId, this.workspaceId))
          .then((rows) => rows[0]?.count ?? 0),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(ingestionChunk)
          .innerJoin(
            ingestionResource,
            eq(ingestionResource.id, ingestionChunk.resourceId)
          )
          .where(eq(ingestionResource.workspaceId, this.workspaceId))
          .then((rows) => rows[0]?.count ?? 0),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(ingestionEmbedding)
          .innerJoin(
            ingestionChunk,
            eq(ingestionChunk.id, ingestionEmbedding.chunkId)
          )
          .innerJoin(
            ingestionResource,
            eq(ingestionResource.id, ingestionChunk.resourceId)
          )
          .where(eq(ingestionResource.workspaceId, this.workspaceId))
          .then((rows) => rows[0]?.count ?? 0),
      ]);

    return {
      resources: resourceCountRow,
      chunks: chunkCountRow,
      embeddings: embeddingCountRow,
    };
  }
}
