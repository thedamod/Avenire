import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendIngestionJobEvent,
  claimNextIngestionJob,
  getFileForIngestion,
  markIngestionJobFailed,
  markIngestionJobSucceeded,
  retryIngestionJob,
  replaceFileTranscriptCues,
} from "@avenire/database";
import { assertRequiredSecrets, ingestStoredFile } from "@avenire/ingestion";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { publishWorkspaceStreamEvent } from "./workspace-event-stream";

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
const maxIngestionAttempts = Math.max(
  1,
  Number.parseInt(process.env.INGESTION_WORKER_MAX_ATTEMPTS ?? "3", 10),
);
const retryBaseMs = Math.max(
  250,
  Number.parseInt(process.env.INGESTION_WORKER_RETRY_BASE_MS ?? "1200", 10),
);
const retryMaxMs = Math.max(
  retryBaseMs,
  Number.parseInt(process.env.INGESTION_WORKER_RETRY_MAX_MS ?? "30000", 10),
);

assertRequiredSecrets();

const app = new Hono();

let activeJobs = 0;
let schedulerRunning = false;
let lastTickAt: string | null = null;
let lastError: string | null = null;
let lastJobDurationMs: number | null = null;

async function publishIngestionEvent(input: {
  workspaceId: string;
  jobId: string;
  eventType: string;
  payload?: Record<string, unknown>;
}) {
  await publishWorkspaceStreamEvent({
    workspaceUuid: input.workspaceId,
    type: "ingestion.job",
    payload: {
      createdAt: new Date().toISOString(),
      eventType: input.eventType,
      jobId: input.jobId,
      payload: input.payload ?? {},
      workspaceId: input.workspaceId,
    },
  });
}

async function appendAndPublishIngestionEvent(input: {
  workspaceId: string;
  jobId: string;
  eventType: string;
  payload?: Record<string, unknown>;
}) {
  await appendIngestionJobEvent({
    workspaceId: input.workspaceId,
    jobId: input.jobId,
    eventType: input.eventType,
    payload: input.payload,
  });
  await publishIngestionEvent(input);
}

async function processClaimedJob(
  job: NonNullable<Awaited<ReturnType<typeof claimNextIngestionJob>>>,
) {
  const startedAtMs = Date.now();
  let stage = "fetch-file";
  activeJobs += 1;

  try {
    await publishIngestionEvent({
      workspaceId: job.workspaceId,
      jobId: job.id,
      eventType: "job.running",
      payload: {
        status: "running",
        attempts: job.attempts,
      },
    });

    await appendAndPublishIngestionEvent({
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
    await appendAndPublishIngestionEvent({
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
      storageKey: file.storageKey,
      fileName: file.name,
      mimeType: file.mimeType,
      metadata: file.metadata,
    });

    stage = "persist-transcript";
    if (result.transcriptCues.length > 0) {
      await replaceFileTranscriptCues({
        workspaceId: job.workspaceId,
        fileId: job.fileId,
        cues: result.transcriptCues,
      });
    }

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
    await publishIngestionEvent({
      workspaceId: job.workspaceId,
      jobId: job.id,
      eventType: "job.succeeded",
      payload: {
        status: "succeeded",
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

    try {
      if (job.attempts < maxIngestionAttempts) {
        const retryInMs = Math.min(
          retryMaxMs,
          retryBaseMs * 2 ** Math.max(0, job.attempts - 1),
        );
        await retryIngestionJob({
          workspaceId: job.workspaceId,
          jobId: job.id,
          error: enrichedMessage,
          retryInMs,
        });
        await publishIngestionEvent({
          workspaceId: job.workspaceId,
          jobId: job.id,
          eventType: "job.retry_scheduled",
          payload: {
            status: "queued",
            error: enrichedMessage,
            attempts: job.attempts,
            maxAttempts: maxIngestionAttempts,
            retryInMs,
          },
        });
      } else {
        await markIngestionJobFailed({
          workspaceId: job.workspaceId,
          jobId: job.id,
          error: enrichedMessage,
        });
        await publishIngestionEvent({
          workspaceId: job.workspaceId,
          jobId: job.id,
          eventType: "job.failed",
          payload: {
            status: "failed",
            error: enrichedMessage,
            attempts: job.attempts,
            maxAttempts: maxIngestionAttempts,
          },
        });
      }
    } catch (error) {
      console.error(error);
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
