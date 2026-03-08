import {
  insertIngestionChunks,
  insertIngestionEmbeddings,
  upsertIngestionResource,
} from "@avenire/database";
import { config } from "../config";
import {
  embedMultimodal,
  type MultimodalInput,
  textToMultimodalInput,
} from "./embeddings";
import type { CanonicalResource } from "./types";

const splitIntoBatches = <T>(values: T[], batchSize: number): T[][] => {
  if (values.length === 0) {
    return [];
  }
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += batchSize) {
    out.push(values.slice(i, i + batchSize));
  }
  return out;
};

const runWithConcurrency = async <T>(
  values: T[],
  concurrency: number,
  run: (value: T, index: number) => Promise<void>
): Promise<void> => {
  if (values.length === 0) {
    return;
  }

  const limit = Math.max(1, Math.floor(concurrency));
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, values.length) },
    async () => {
      while (true) {
        const current = cursor;
        cursor += 1;
        if (current >= values.length) {
          return;
        }
        await run(values[current] as T, current);
      }
    }
  );

  await Promise.all(workers);
};

const logPersistStageTiming = (params: {
  stage: string;
  durationMs: number;
  workspaceId: string;
  resourceSource: string;
  chunkCount: number;
}) => {
  if (!config.ingestionStageTimingLog) {
    return;
  }

  console.log(
    JSON.stringify({
      event: "ingestion.persist.stage_timing",
      ...params,
    })
  );
};

const chunkToEmbeddingInput = (
  chunk: CanonicalResource["chunks"][number]
): MultimodalInput => {
  if (chunk.embeddingInput?.type === "multimodal") {
    return { content: chunk.embeddingInput.content };
  }

  if (chunk.embeddingInput?.type === "text") {
    return textToMultimodalInput(chunk.embeddingInput.text);
  }

  return textToMultimodalInput(chunk.content);
};

export const persistCanonicalResource = async (
  workspaceId: string,
  fileId: string | null,
  resource: CanonicalResource
): Promise<{ resourceId: string; chunks: number }> => {
  const startedAtMs = Date.now();
  if (resource.chunks.length === 0) {
    throw new Error(
      `No chunks were produced for ${resource.sourceType}:${resource.source}`
    );
  }

  const resourceId = await upsertIngestionResource({
    workspaceId,
    fileId,
    sourceType: resource.sourceType,
    source: resource.source,
    provider: resource.provider,
    title: resource.title,
    metadata: resource.metadata ?? {},
  });

  const insertedChunkRows = await insertIngestionChunks({
    resourceId,
    chunks: resource.chunks.map((chunk) => ({
      chunkIndex: chunk.chunkIndex,
      kind: chunk.kind,
      content: chunk.content,
      page: chunk.metadata.page,
      startMs: chunk.metadata.startMs,
      endMs: chunk.metadata.endMs,
      metadata: {
        sourceType: chunk.metadata.sourceType,
        source: chunk.metadata.source,
        provider: chunk.metadata.provider,
        topic: chunk.metadata.topic,
        difficulty: chunk.metadata.difficulty,
        prerequisites: chunk.metadata.prerequisites,
        modality: chunk.metadata.modality,
        ...(chunk.metadata.extra ?? {}),
      },
    })),
  });

  const chunkByIndex = new Map(
    insertedChunkRows.map((row) => [row.chunkIndex, row])
  );

  const batches = splitIntoBatches(resource.chunks, config.ingestionEmbedBatchSize);
  const embedStartedAtMs = Date.now();
  let dbInsertMs = 0;
  await runWithConcurrency(
    batches,
    config.ingestionEmbedConcurrency,
    async (batch) => {
      const { model, embeddings: vectors } = await embedMultimodal(
        batch.map(chunkToEmbeddingInput)
      );

      const rows = batch.map((chunk, index) => {
        const row = chunkByIndex.get(chunk.chunkIndex);
        if (!row) {
          throw new Error(
            `Missing inserted chunk row for chunkIndex=${chunk.chunkIndex}`
          );
        }

        const vector = vectors[index];
        if (!vector) {
          throw new Error(
            `Missing embedding for chunkIndex=${chunk.chunkIndex}`
          );
        }

        return {
          chunkId: row.id,
          model,
          embedding: vector,
        };
      });

      for (const dbBatch of splitIntoBatches(rows, config.ingestionDbBatchSize)) {
        const dbBatchStartedAt = Date.now();
        await insertIngestionEmbeddings({ rows: dbBatch });
        dbInsertMs += Date.now() - dbBatchStartedAt;
      }
    }
  );
  logPersistStageTiming({
    stage: "embed-and-insert",
    durationMs: Date.now() - embedStartedAtMs,
    workspaceId,
    resourceSource: resource.source,
    chunkCount: resource.chunks.length,
  });
  logPersistStageTiming({
    stage: "db-insert-only",
    durationMs: dbInsertMs,
    workspaceId,
    resourceSource: resource.source,
    chunkCount: resource.chunks.length,
  });
  logPersistStageTiming({
    stage: "total-persist-resource",
    durationMs: Date.now() - startedAtMs,
    workspaceId,
    resourceSource: resource.source,
    chunkCount: resource.chunks.length,
  });

  return {
    resourceId,
    chunks: insertedChunkRows.length,
  };
};
