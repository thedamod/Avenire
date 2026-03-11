import {
  enqueueIngestionJob,
  type IngestionJobRecord,
} from "@avenire/database";
import { Queue, Worker } from "bullmq";

export const INGESTION_QUEUE_NAME = "avenire-ingestion";
const INGESTION_JOB_NAME = "process";

export interface IngestionQueueJobData {
  fileId: string;
  jobId: string;
  workspaceId: string;
}

function getConnectionOptions(maxRetriesPerRequest: number | null) {
  return {
    url: getRedisUrl(),
    maxRetriesPerRequest,
  };
}

function buildQueue() {
  const ingestionQueue = new Queue(INGESTION_QUEUE_NAME, {
    connection: getConnectionOptions(null),
  });
  ingestionQueue.on("error", (error) => {
    console.error("BullMQ ingestion producer error", error);
  });
  return ingestionQueue;
}

let queue: ReturnType<typeof buildQueue> | null = null;

function getRedisUrl() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error("REDIS_URL is required for BullMQ ingestion jobs.");
  }

  return redisUrl;
}

function getQueue() {
  if (!queue) {
    queue = buildQueue();
  }

  return queue;
}

export async function enqueueIngestionQueueJob(
  input: IngestionQueueJobData & { delayMs?: number }
) {
  const ingestionQueue = getQueue();
  const delay = Math.max(0, Math.trunc(input.delayMs ?? 0));

  await ingestionQueue.add(
    INGESTION_JOB_NAME,
    {
      fileId: input.fileId,
      jobId: input.jobId,
      workspaceId: input.workspaceId,
    },
    {
      delay,
      jobId: input.jobId,
      removeOnComplete: true,
      removeOnFail: true,
    }
  );
}

export async function scheduleIngestionJob(input: {
  workspaceId: string;
  fileId: string;
  sourceType?: string | null;
}): Promise<IngestionJobRecord> {
  const job = await enqueueIngestionJob(input);

  if (job.status === "queued") {
    try {
      await enqueueIngestionQueueJob({
        workspaceId: job.workspaceId,
        fileId: job.fileId,
        jobId: job.id,
      });
    } catch (error) {
      console.error("ingestion.queue.enqueue_failed", {
        workspaceId: job.workspaceId,
        fileId: job.fileId,
        jobId: job.id,
        error,
      });
      throw error;
    }
  }

  return job;
}

export function createIngestionQueueWorker(
  processor: (job: IngestionQueueJobData) => Promise<void>,
  options?: {
    concurrency?: number;
  }
) {
  const worker = new Worker<IngestionQueueJobData>(
    INGESTION_QUEUE_NAME,
    async (job) => {
      await processor(job.data);
    },
    {
      ...options,
      connection: getConnectionOptions(null),
    }
  );

  worker.on("error", (error) => {
    console.error("BullMQ ingestion worker error", error);
  });

  return {
    worker,
    close: async () => {
      await worker.close();
    },
  };
}

export async function closeIngestionQueue() {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
