import { UTApi } from "@avenire/storage";
import { consumeUploadUnits } from "@/lib/billing";
import {
  getFileAssetByContentHash,
  getFileAssetByStorageKey,
  registerFileAsset,
  softDeleteFileAsset,
} from "@/lib/file-data";
import { publishFilesInvalidationEvent } from "@/lib/files-realtime-publisher";
import { enqueueIngestionJob, hasSuccessfulIngestionForFile } from "@/lib/ingestion-data";
import { publishWorkspaceStreamEvent } from "@/lib/workspace-event-stream";

export interface UploadRegistrationInput {
  workspaceUuid: string;
  userId: string;
  folderId: string;
  storageKey: string;
  storageUrl: string;
  name: string;
  mimeType?: string | null;
  sizeBytes: number;
  metadata?: Record<string, unknown>;
  contentHashSha256?: string | null;
  hashComputedBy?: "client" | "server" | null;
  dedupeMode?: "allow" | "skip";
}

export interface UploadRegistrationResult {
  file: Awaited<ReturnType<typeof registerFileAsset>>;
  ingestionJob: Awaited<ReturnType<typeof enqueueIngestionJob>> | null;
  status: "created" | "deduplicated";
}

export function normalizeSha256(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function normalizeUploadThingStorageUrl(storageUrl: string, storageKey: string) {
  try {
    const parsed = new URL(storageUrl);
    const host = parsed.hostname.toLowerCase();
    if (host === "utfs.io" || host.endsWith(".ufs.sh")) {
      return `https://utfs.io/f/${encodeURIComponent(storageKey)}`;
    }
    return storageUrl;
  } catch {
    return storageUrl;
  }
}

export async function deleteUploadThingFile(storageKey: string | null | undefined) {
  if (!(storageKey && process.env.UPLOADTHING_TOKEN)) {
    return;
  }

  try {
    const utapi = new UTApi({ token: process.env.UPLOADTHING_TOKEN });
    await utapi.deleteFiles([storageKey]);
  } catch {
    // Best effort cleanup.
  }
}

export async function registerWorkspaceUploadedFile(
  input: UploadRegistrationInput
): Promise<UploadRegistrationResult> {
  const dedupeMode = input.dedupeMode ?? "allow";
  const normalizedHash = normalizeSha256(input.contentHashSha256);

  if (dedupeMode !== "skip") {
    const existingByHash = normalizedHash
      ? await getFileAssetByContentHash(input.workspaceUuid, normalizedHash)
      : null;
    const existing =
      existingByHash ??
      (await getFileAssetByStorageKey(input.workspaceUuid, input.storageKey));

    if (existing) {
      const hasSucceeded = await hasSuccessfulIngestionForFile(
        input.workspaceUuid,
        existing.id
      ).catch(() => false);
      const ingestionJob = hasSucceeded
        ? null
        : await enqueueIngestionJob({
            workspaceId: input.workspaceUuid,
            fileId: existing.id,
          }).catch(() => null);

      const publishTasks: Promise<unknown>[] = [];

      if (ingestionJob) {
        publishTasks.push(
          publishWorkspaceStreamEvent({
            workspaceUuid: input.workspaceUuid,
            type: "ingestion.job",
            payload: {
              createdAt: new Date().toISOString(),
              eventType: "job.queued",
              jobId: ingestionJob.id,
              payload: { status: "queued", source: "upload.dedupe" },
              workspaceId: input.workspaceUuid,
            },
          })
        );
      }

      publishTasks.push(
        publishWorkspaceStreamEvent({
          workspaceUuid: input.workspaceUuid,
          type: "upload.finalized",
          payload: {
            deduplicated: true,
            fileId: existing.id,
            folderId: existing.folderId,
            workspaceUuid: input.workspaceUuid,
          },
        })
      );
      await Promise.allSettled(publishTasks);

      return {
        file: existing,
        ingestionJob,
        status: "deduplicated",
      };
    }
  }

  const file = await registerFileAsset(input.workspaceUuid, input.userId, {
    folderId: input.folderId,
    storageKey: input.storageKey,
    storageUrl: normalizeUploadThingStorageUrl(
      input.storageUrl,
      input.storageKey
    ),
    name: input.name,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    metadata: input.metadata,
    contentHashSha256: normalizedHash,
    hashComputedBy: normalizedHash ? input.hashComputedBy ?? "client" : null,
    hashVerificationStatus: normalizedHash ? "pending" : null,
  });

  const usage = await consumeUploadUnits(input.userId, 1);
  if (!usage.ok) {
    await deleteUploadThingFile(input.storageKey);
    await softDeleteFileAsset(input.workspaceUuid, file.id);
    throw Object.assign(new Error("Upload usage limit reached"), {
      code: "UPLOAD_RATE_LIMIT",
      retryAfter: usage.retryAfter?.toISOString() ?? null,
    });
  }

  const ingestionJob = await enqueueIngestionJob({
    workspaceId: input.workspaceUuid,
    fileId: file.id,
  }).catch(() => null);

  const postRegisterTasks: Promise<unknown>[] = [
    publishFilesInvalidationEvent({
      workspaceUuid: input.workspaceUuid,
      folderId: input.folderId,
      reason: "file.created",
    }),
    publishFilesInvalidationEvent({
      workspaceUuid: input.workspaceUuid,
      reason: "tree.changed",
    }),
    publishWorkspaceStreamEvent({
      workspaceUuid: input.workspaceUuid,
      type: "upload.finalized",
      payload: {
        deduplicated: false,
        fileId: file.id,
        folderId: input.folderId,
        workspaceUuid: input.workspaceUuid,
      },
    }),
  ];

  if (ingestionJob) {
    postRegisterTasks.push(
      publishWorkspaceStreamEvent({
        workspaceUuid: input.workspaceUuid,
        type: "ingestion.job",
        payload: {
          createdAt: new Date().toISOString(),
          eventType: "job.queued",
          jobId: ingestionJob.id,
          payload: { status: "queued", source: "upload.register" },
          workspaceId: input.workspaceUuid,
        },
      })
    );
  }
  await Promise.allSettled(postRegisterTasks);

  return {
    file,
    ingestionJob,
    status: "created",
  };
}
