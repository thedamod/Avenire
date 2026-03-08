import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendIngestionJobEvent,
  claimNextIngestionJob,
  getFileForIngestion,
  markIngestionJobFailed,
  markIngestionJobSucceeded,
  replaceFileTranscriptCues,
} from "@avenire/database";
import { assertRequiredSecrets, ingestStoredFile } from "@avenire/ingestion";
import { serve } from "@hono/node-server";
import { Hono } from "hono";

// Prefer backend-local env; keep repo root as fallback.
const here = fileURLToPath(new URL(".", import.meta.url));
loadEnv({ path: resolve(here, "../.env") });
loadEnv({ path: resolve(here, "../../../.env"), override: false });

const port = Number.parseInt(process.env.INGESTION_WORKER_PORT ?? "3010", 10);
const pollMs = Number.parseInt(
  process.env.INGESTION_WORKER_POLL_MS ?? "1200",
  10,
);
const workerConcurrency = Math.max(
  1,
  Number.parseInt(process.env.INGESTION_WORKER_CONCURRENCY ?? "3", 10),
);

assertRequiredSecrets();

const app = new Hono();

let activeJobs = 0;
let schedulerRunning = false;
let lastTickAt: string | null = null;
let lastError: string | null = null;
let lastJobDurationMs: number | null = null;

async function processClaimedJob(
  job: NonNullable<Awaited<ReturnType<typeof claimNextIngestionJob>>>,
) {
  const startedAtMs = Date.now();
  let stage = "fetch-file";
  activeJobs += 1;

  try {
    await appendIngestionJobEvent({
      workspaceId: job.workspaceId,
      jobId: job.id,
      eventType: "job.processing",
      payload: {
        status: "running",
        stage,
      },
    });

    stage = "load-file";
    const file = await getFileForIngestion(job.workspaceId, job.fileId);
    if (!file) {
      throw new Error("File not found for ingestion job.");
    }

    stage = "ingest";
    await appendIngestionJobEvent({
      workspaceId: job.workspaceId,
      jobId: job.id,
      eventType: "job.processing",
      payload: {
        status: "running",
        stage: "ingest",
        fileId: file.id,
        name: file.name,
      },
    });

    const result = await ingestStoredFile({
      workspaceId: job.workspaceId,
      fileId: job.fileId,
      storageUrl: file.storageUrl,
      fileName: file.name,
      mimeType: file.mimeType,
      metadata: file.metadata,
    });

    stage = "persist-transcript";
    await replaceFileTranscriptCues({
      workspaceId: job.workspaceId,
      fileId: job.fileId,
      cues: result.transcriptCues,
    });

    stage = "mark-success";
    const chunkCount = result.resources.reduce(
      (sum: number, item: { chunks: number }) => sum + item.chunks,
      0,
    );

    await markIngestionJobSucceeded({
      workspaceId: job.workspaceId,
      jobId: job.id,
      payload: {
        resources: result.resources.length,
        chunks: chunkCount,
        fileId: job.fileId,
        durationMs: Date.now() - startedAtMs,
      },
    });

    lastError = null;
    lastJobDurationMs = Date.now() - startedAtMs;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown ingestion worker error.";
    const causeMessage =
      error instanceof Error &&
      error.cause instanceof Error &&
      error.cause.message
        ? error.cause.message
        : null;
    const enrichedMessage = causeMessage
      ? `[${stage}] ${message} | cause=${causeMessage}`
      : `[${stage}] ${message}`;
    lastError = enrichedMessage;

    console.error("ingestion.worker.job_failed", {
      workspaceId: job.workspaceId,
      jobId: job.id,
      fileId: job.fileId,
      stage,
      message,
      causeMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    let markError: unknown = null;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        await markIngestionJobFailed({
          workspaceId: job.workspaceId,
          jobId: job.id,
          error: enrichedMessage,
        });
        markError = null;
        break;
      } catch (error) {
        markError = error;
        if (attempt < 4) {
          const backoffMs = 250 * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }

    if (markError) {
      throw markError;
    }
  } finally {
    activeJobs = Math.max(0, activeJobs - 1);
    void tickScheduler();
  }
}

async function tickScheduler() {
  if (schedulerRunning) {
    return;
  }

  schedulerRunning = true;
  lastTickAt = new Date().toISOString();

  try {
    while (activeJobs < workerConcurrency) {
      const job = await claimNextIngestionJob();
      if (!job) {
        break;
      }

      void processClaimedJob(job);
    }
  } finally {
    schedulerRunning = false;
  }
}

setInterval(() => {
  void tickScheduler();
}, pollMs);
void tickScheduler();

app.get("/health", (c) => {
  return c.json({
    ok: true,
    service: "ingestion-worker",
    isRunning: activeJobs > 0 || schedulerRunning,
    activeJobs,
    workerConcurrency,
    pollMs,
    lastTickAt,
    lastError,
    lastJobDurationMs,
  });
});

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`Ingestion worker listening on http://localhost:${info.port}`);
  },
);
