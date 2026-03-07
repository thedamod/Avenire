import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "./client";
import {
  fileAsset,
  fileTranscriptCue,
  ingestionChunk,
  ingestionEmbedding,
  ingestionJob,
  ingestionJobEvent,
  ingestionResource,
} from "./schema";

export type IngestionJobStatus = "queued" | "running" | "succeeded" | "failed";

export interface IngestionJobRecord {
  attempts: number;
  createdAt: string;
  error: string | null;
  fileId: string;
  finishedAt: string | null;
  id: string;
  sourceType: string | null;
  startedAt: string | null;
  status: IngestionJobStatus;
  updatedAt: string;
  workspaceId: string;
}

const DEFAULT_DB_INSERT_BATCH_SIZE = 200;
const MAX_DB_INSERT_BATCH_SIZE = 200;
const PG_INT4_MAX = 2_147_483_647;
const PG_INT4_MIN = -2_147_483_648;

const splitIntoBatches = <T>(values: T[], batchSize: number): T[][] => {
  if (values.length === 0) {
    return [];
  }

  const safeBatchSize = Math.max(1, Math.floor(batchSize));
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += safeBatchSize) {
    out.push(values.slice(i, i + safeBatchSize));
  }
  return out;
};

function mapJobRow(row: typeof ingestionJob.$inferSelect): IngestionJobRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    fileId: row.fileId,
    status: row.status as IngestionJobStatus,
    sourceType: row.sourceType ?? null,
    attempts: row.attempts,
    error: row.error ?? null,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function enqueueIngestionJob(input: {
  workspaceId: string;
  fileId: string;
  sourceType?: string | null;
}) {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(ingestionJob)
      .where(
        and(
          eq(ingestionJob.workspaceId, input.workspaceId),
          eq(ingestionJob.fileId, input.fileId),
          inArray(ingestionJob.status, ["queued", "running"])
        )
      )
      .orderBy(desc(ingestionJob.createdAt))
      .limit(1);

    if (existing) {
      return mapJobRow(existing);
    }

    const [created] = await tx
      .insert(ingestionJob)
      .values({
        workspaceId: input.workspaceId,
        fileId: input.fileId,
        status: "queued",
        sourceType: input.sourceType ?? null,
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to enqueue ingestion job.");
    }

    await tx.insert(ingestionJobEvent).values({
      workspaceId: input.workspaceId,
      jobId: created.id,
      eventType: "job.queued",
      payload: {
        status: "queued",
      },
      createdAt: now,
    });

    return mapJobRow(created);
  });
}

export async function claimNextIngestionJob() {
  return db.transaction(async (tx) => {
    const claim = await tx.execute(sql<{ id: string }>`
      UPDATE ingestion_job
      SET
        status = 'running',
        attempts = ingestion_job.attempts + 1,
        started_at = NOW(),
        updated_at = NOW(),
        error = NULL
      WHERE id = (
        SELECT id
        FROM ingestion_job
        WHERE status = 'queued'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `);

    const claimedId = claim.rows[0]?.id ? String(claim.rows[0].id) : null;
    if (!claimedId) {
      return null;
    }

    const [row] = await tx
      .select()
      .from(ingestionJob)
      .where(eq(ingestionJob.id, claimedId))
      .limit(1);

    if (!row) {
      return null;
    }

    await tx.insert(ingestionJobEvent).values({
      workspaceId: row.workspaceId,
      jobId: row.id,
      eventType: "job.running",
      payload: {
        status: "running",
        attempts: row.attempts,
      },
      createdAt: new Date(),
    });

    return mapJobRow(row);
  });
}

export async function getIngestionJobByIdForWorkspace(
  workspaceId: string,
  jobId: string
) {
  const [row] = await db
    .select()
    .from(ingestionJob)
    .where(
      and(eq(ingestionJob.workspaceId, workspaceId), eq(ingestionJob.id, jobId))
    )
    .limit(1);

  return row ? mapJobRow(row) : null;
}

export async function hasSuccessfulIngestionForFile(
  workspaceId: string,
  fileId: string
) {
  const [row] = await db
    .select({ id: ingestionJob.id })
    .from(ingestionJob)
    .where(
      and(
        eq(ingestionJob.workspaceId, workspaceId),
        eq(ingestionJob.fileId, fileId),
        eq(ingestionJob.status, "succeeded"),
      ),
    )
    .orderBy(desc(ingestionJob.updatedAt))
    .limit(1);

  return Boolean(row);
}

export async function getIngestionFlagsByFileIds(
  workspaceId: string,
  fileIds: string[]
): Promise<Record<string, boolean>> {
  const uniqueFileIds = Array.from(new Set(fileIds.filter(Boolean)));
  if (uniqueFileIds.length === 0) {
    return {};
  }

  const [succeededJobs, resources] = await Promise.all([
    db
      .select({ fileId: ingestionJob.fileId })
      .from(ingestionJob)
      .where(
        and(
          eq(ingestionJob.workspaceId, workspaceId),
          eq(ingestionJob.status, "succeeded"),
          inArray(ingestionJob.fileId, uniqueFileIds)
        )
      ),
    db
      .select({ fileId: ingestionResource.fileId })
      .from(ingestionResource)
      .where(
        and(
          eq(ingestionResource.workspaceId, workspaceId),
          isNotNull(ingestionResource.fileId),
          inArray(ingestionResource.fileId, uniqueFileIds)
        )
      ),
  ]);

  const out: Record<string, boolean> = {};
  for (const fileId of uniqueFileIds) {
    out[fileId] = false;
  }

  for (const row of succeededJobs) {
    if (row.fileId) {
      out[row.fileId] = true;
    }
  }

  for (const row of resources) {
    if (row.fileId) {
      out[row.fileId] = true;
    }
  }

  return out;
}

export async function appendIngestionJobEvent(input: {
  workspaceId: string;
  jobId: string;
  eventType: string;
  payload?: Record<string, unknown>;
}) {
  await db.insert(ingestionJobEvent).values({
    workspaceId: input.workspaceId,
    jobId: input.jobId,
    eventType: input.eventType,
    payload: input.payload ?? {},
    createdAt: new Date(),
  });
}

export async function markIngestionJobSucceeded(input: {
  workspaceId: string;
  jobId: string;
  payload?: Record<string, unknown>;
}) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(ingestionJob)
      .set({
        status: "succeeded",
        finishedAt: now,
        updatedAt: now,
        error: null,
      })
      .where(
        and(
          eq(ingestionJob.workspaceId, input.workspaceId),
          eq(ingestionJob.id, input.jobId)
        )
      );

    await tx.insert(ingestionJobEvent).values({
      workspaceId: input.workspaceId,
      jobId: input.jobId,
      eventType: "job.succeeded",
      payload: {
        status: "succeeded",
        ...(input.payload ?? {}),
      },
      createdAt: now,
    });
  });
}

export async function markIngestionJobFailed(input: {
  workspaceId: string;
  jobId: string;
  error: string;
}) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(ingestionJob)
      .set({
        status: "failed",
        finishedAt: now,
        updatedAt: now,
        error: input.error.slice(0, 2000),
      })
      .where(
        and(
          eq(ingestionJob.workspaceId, input.workspaceId),
          eq(ingestionJob.id, input.jobId)
        )
      );

    await tx.insert(ingestionJobEvent).values({
      workspaceId: input.workspaceId,
      jobId: input.jobId,
      eventType: "job.failed",
      payload: {
        status: "failed",
        error: input.error.slice(0, 2000),
      },
      createdAt: now,
    });
  });
}

export async function retryIngestionJob(input: {
  workspaceId: string;
  jobId: string;
  error: string;
  retryInMs: number;
}) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(ingestionJob)
      .set({
        status: "queued",
        finishedAt: null,
        startedAt: null,
        updatedAt: now,
        error: input.error.slice(0, 2000),
      })
      .where(
        and(
          eq(ingestionJob.workspaceId, input.workspaceId),
          eq(ingestionJob.id, input.jobId)
        )
      );

    await tx.insert(ingestionJobEvent).values({
      workspaceId: input.workspaceId,
      jobId: input.jobId,
      eventType: "job.retry_scheduled",
      payload: {
        status: "queued",
        error: input.error.slice(0, 2000),
        retryInMs: Math.max(0, Math.trunc(input.retryInMs)),
      },
      createdAt: now,
    });
  });
}

export async function listIngestionEventsForWorkspace(input: {
  workspaceId: string;
  sinceIso?: string | null;
  limit?: number;
}) {
  const limit = Math.min(200, Math.max(1, input.limit ?? 100));
  const sinceDate = input.sinceIso ? new Date(input.sinceIso) : null;

  const rows = await db
    .select()
    .from(ingestionJobEvent)
    .where(
      and(
        eq(ingestionJobEvent.workspaceId, input.workspaceId),
        sinceDate ? gt(ingestionJobEvent.createdAt, sinceDate) : undefined
      )
    )
    .orderBy(asc(ingestionJobEvent.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    jobId: row.jobId,
    workspaceId: row.workspaceId,
    eventType: row.eventType,
    payload: row.payload as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getFileForIngestion(workspaceId: string, fileId: string) {
  const [row] = await db
    .select()
    .from(fileAsset)
    .where(
      and(
        eq(fileAsset.workspaceId, workspaceId),
        eq(fileAsset.id, fileId),
        isNull(fileAsset.deletedAt)
      )
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    workspaceId: row.workspaceId,
    storageKey: row.storageKey,
    storageUrl: row.storageUrl,
    name: row.name,
    mimeType: row.mimeType ?? null,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  };
}

export async function upsertIngestionResource(input: {
  workspaceId: string;
  fileId: string | null;
  sourceType: string;
  source: string;
  provider?: string | null;
  title?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: ingestionResource.id })
      .from(ingestionResource)
      .where(
        and(
          eq(ingestionResource.workspaceId, input.workspaceId),
          eq(ingestionResource.sourceType, input.sourceType),
          eq(ingestionResource.source, input.source)
        )
      )
      .limit(1);

    if (existing?.id) {
      const [updated] = await tx
        .update(ingestionResource)
        .set({
          fileId: input.fileId,
          provider: input.provider ?? null,
          title: input.title ?? null,
          metadata: input.metadata ?? {},
          updatedAt: now,
        })
        .where(eq(ingestionResource.id, existing.id))
        .returning({ id: ingestionResource.id });

      if (!updated?.id) {
        throw new Error("Failed to update ingestion resource.");
      }

      await tx
        .delete(ingestionChunk)
        .where(eq(ingestionChunk.resourceId, updated.id));
      return updated.id;
    }

    const [created] = await tx
      .insert(ingestionResource)
      .values({
        workspaceId: input.workspaceId,
        fileId: input.fileId,
        sourceType: input.sourceType,
        source: input.source,
        provider: input.provider ?? null,
        title: input.title ?? null,
        metadata: input.metadata ?? {},
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: ingestionResource.id });

    if (!created?.id) {
      throw new Error("Failed to create ingestion resource.");
    }

    return created.id;
  });
}

export async function insertIngestionChunks(input: {
  resourceId: string;
  chunks: Array<{
    chunkIndex: number;
    kind: string;
    content: string;
    page?: number;
    startMs?: number;
    endMs?: number;
    metadata?: Record<string, unknown>;
  }>;
}) {
  if (input.chunks.length === 0) {
    return [] as Array<{ id: string; chunkIndex: number }>;
  }

  const toNullableInt = (value: number | undefined): number | null => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }

    const rounded = Math.trunc(value);
    if (rounded > PG_INT4_MAX || rounded < PG_INT4_MIN) {
      return null;
    }
    return rounded;
  };

  const batchSize = Math.min(
    MAX_DB_INSERT_BATCH_SIZE,
    Math.max(
      1,
      Number.parseInt(
        process.env.INGESTION_CHUNK_INSERT_BATCH_SIZE ?? "200",
        10
      ) || DEFAULT_DB_INSERT_BATCH_SIZE
    )
  );

  const rows: Array<{ id: string; chunkIndex: number }> = [];
  const chunkBatches = splitIntoBatches(input.chunks, batchSize);

  try {
    for (const batch of chunkBatches) {
      const inserted = await db
        .insert(ingestionChunk)
        .values(
          batch.map((chunk) => ({
            resourceId: input.resourceId,
            chunkIndex: chunk.chunkIndex,
            kind: chunk.kind,
            content: chunk.content,
            page: toNullableInt(chunk.page),
            startMs: toNullableInt(chunk.startMs),
            endMs: toNullableInt(chunk.endMs),
            metadata: chunk.metadata ?? {},
          }))
        )
        .returning({
          id: ingestionChunk.id,
          chunkIndex: ingestionChunk.chunkIndex,
        });

      rows.push(...inserted);
    }
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Unknown ingestion chunk error";
    throw new Error(
      [
        "Failed to insert ingestion chunks",
        `resourceId=${input.resourceId}`,
        `chunkCount=${input.chunks.length}`,
        `batchSize=${batchSize}`,
        `reason=${reason}`,
      ].join(" | ")
    );
  }

  return rows;
}

export async function insertIngestionEmbeddings(input: {
  rows: Array<{
    chunkId: string;
    model: string;
    embedding: number[];
  }>;
}) {
  if (input.rows.length === 0) {
    return;
  }

  await db.insert(ingestionEmbedding).values(
    input.rows.map((row) => ({
      chunkId: row.chunkId,
      model: row.model,
      embedding: row.embedding,
    }))
  );
}

export async function replaceFileTranscriptCues(input: {
  workspaceId: string;
  fileId: string;
  cues: Array<{ startMs: number; endMs: number; text: string }>;
}) {
  await db.transaction(async (tx) => {
    await tx
      .delete(fileTranscriptCue)
      .where(
        and(
          eq(fileTranscriptCue.workspaceId, input.workspaceId),
          eq(fileTranscriptCue.fileId, input.fileId)
        )
      );

    if (input.cues.length === 0) {
      return;
    }

    await tx.insert(fileTranscriptCue).values(
      input.cues.map((cue) => ({
        workspaceId: input.workspaceId,
        fileId: input.fileId,
        startMs: Math.max(0, cue.startMs),
        endMs: Math.max(cue.startMs, cue.endMs),
        text: cue.text,
      }))
    );
  });
}

export async function listFileTranscriptCues(
  workspaceId: string,
  fileId: string
) {
  const rows = await db
    .select({
      startMs: fileTranscriptCue.startMs,
      endMs: fileTranscriptCue.endMs,
      text: fileTranscriptCue.text,
    })
    .from(fileTranscriptCue)
    .where(
      and(
        eq(fileTranscriptCue.workspaceId, workspaceId),
        eq(fileTranscriptCue.fileId, fileId)
      )
    )
    .orderBy(asc(fileTranscriptCue.startMs));

  return rows;
}

export async function retrieveWorkspaceChunks(input: {
  workspaceId: string;
  queryEmbedding: number[];
  limit: number;
  sourceType?: string;
  provider?: string;
}): Promise<
  Array<{
    resourceId: string;
    sourceType: string;
    source: string;
    fileId: string | null;
    provider: string | null;
    title: string | null;
    chunkId: string;
    chunkIndex: number;
    page: number | null;
    startMs: number | null;
    endMs: number | null;
    content: string;
    metadata: Record<string, unknown>;
    score: number;
    embedding: number[];
  }>
> {
  const vectorLiteral = `[${input.queryEmbedding.map((value) => Number(value).toString()).join(",")}]`;
  const predicates = [
    sql`r.workspace_id = ${input.workspaceId}::uuid`,
    input.sourceType ? sql`r.source_type = ${input.sourceType}` : undefined,
    input.provider ? sql`r.provider = ${input.provider}` : undefined,
  ].filter(Boolean);

  const whereClause =
    predicates.length > 0
      ? sql.join(
          predicates as [
            ReturnType<typeof sql>,
            ...Array<ReturnType<typeof sql>>,
          ],
          sql` AND `
        )
      : sql`TRUE`;

  const rows = await db.execute(sql<{
    resourceId: string;
    sourceType: string;
    source: string;
    fileId: string | null;
    provider: string | null;
    title: string | null;
    chunkId: string;
    chunkIndex: number;
    page: number | null;
    startMs: number | null;
    endMs: number | null;
    content: string;
    metadata: Record<string, unknown>;
    score: number;
    embedding: number[];
  }>`
    SELECT
      r.id AS "resourceId",
      r.source_type AS "sourceType",
      r.source AS "source",
      r.file_id AS "fileId",
      r.provider AS "provider",
      r.title AS "title",
      c.id AS "chunkId",
      c.chunk_index AS "chunkIndex",
      c.page AS "page",
      c.start_ms AS "startMs",
      c.end_ms AS "endMs",
      c.content AS "content",
      c.metadata AS "metadata",
      1 - (e.embedding <=> ${vectorLiteral}::vector) AS "score",
      e.embedding AS "embedding"
    FROM ingestion_embedding e
    INNER JOIN ingestion_chunk c ON c.id = e.chunk_id
    INNER JOIN ingestion_resource r ON r.id = c.resource_id
    WHERE ${whereClause}
    ORDER BY e.embedding <=> ${vectorLiteral}::vector
    LIMIT ${Math.max(1, input.limit)}
  `);

  return rows.rows as Array<{
    resourceId: string;
    sourceType: string;
    source: string;
    fileId: string | null;
    provider: string | null;
    title: string | null;
    chunkId: string;
    chunkIndex: number;
    page: number | null;
    startMs: number | null;
    endMs: number | null;
    content: string;
    metadata: Record<string, unknown>;
    score: number;
    embedding: number[];
  }>;
}
