import { createHash } from "node:crypto";
import matter from "gray-matter";
import { scheduleIngestionJob } from "@avenire/ingestion/queue";
import { UTApi } from "@avenire/storage";
import { consumeUploadUnits } from "@/lib/billing";
import {
  normalizeFrontmatterProperties,
  type PageMetadataState,
} from "@/lib/frontmatter";
import {
  createWorkspaceNoteFile,
  getFileAssetByContentHash,
  getFileAssetByStorageKey,
  registerFileAsset,
  softDeleteFileAsset,
} from "@/lib/file-data";
import { publishFilesInvalidationEvent } from "@/lib/files-realtime-publisher";
import { hasSuccessfulIngestionForFile } from "@/lib/ingestion-data";
import { publishWorkspaceStreamEvent } from "@/lib/workspace-event-stream";

const SHA256_HEX_REGEX = /^[a-f0-9]{64}$/;

export interface UploadRegistrationInput {
  contentHashSha256?: string | null;
  dedupeMode?: "allow" | "skip";
  folderId: string;
  hashComputedBy?: "client" | "server" | null;
  metadata?: Record<string, unknown>;
  mimeType?: string | null;
  name: string;
  sizeBytes: number;
  storageKey: string;
  storageUrl: string;
  userId: string;
  workspaceUuid: string;
}

export interface UploadRegistrationResult {
  file: Awaited<ReturnType<typeof registerFileAsset>>;
  ingestionJob: Awaited<ReturnType<typeof scheduleIngestionJob>> | null;
  status: "created" | "deduplicated";
}

interface MarkdownNotePayload {
  content: string;
  contentHashSha256: string;
  metadata?: Record<string, unknown>;
}

export function normalizeSha256(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  return SHA256_HEX_REGEX.test(normalized) ? normalized : null;
}

function inferMimeTypeFromName(name: string): string | null {
  const normalizedName = name.trim().toLowerCase();
  if (!normalizedName) {
    return null;
  }

  if (normalizedName.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (normalizedName.endsWith(".md")) {
    return "text/markdown";
  }
  if (normalizedName.endsWith(".txt")) {
    return "text/plain";
  }
  if (normalizedName.endsWith(".url")) {
    return "application/url";
  }

  if (
    [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".heic"].some(
      (extension) => normalizedName.endsWith(extension)
    )
  ) {
    return "image/*";
  }

  if (
    [".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"].some((extension) =>
      normalizedName.endsWith(extension)
    )
  ) {
    return "video/*";
  }

  if (
    [".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"].some((extension) =>
      normalizedName.endsWith(extension)
    )
  ) {
    return "audio/*";
  }

  return null;
}

function resolveMimeType(input: { mimeType?: string | null; name: string }) {
  const normalizedMime = input.mimeType?.trim().toLowerCase() ?? "";
  if (
    normalizedMime &&
    normalizedMime !== "application/octet-stream" &&
    normalizedMime !== "unknown"
  ) {
    return normalizedMime;
  }

  return inferMimeTypeFromName(input.name) ?? input.mimeType ?? null;
}

function isMarkdownUpload(input: { mimeType?: string | null; name: string }) {
  const mime = input.mimeType?.toLowerCase() ?? "";
  const normalizedName = input.name.toLowerCase();
  return (
    mime === "text/markdown" ||
    normalizedName.endsWith(".md") ||
    normalizedName.endsWith(".mdx")
  );
}

function normalizeUploadThingStorageUrl(
  storageUrl: string,
  storageKey: string
) {
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

function inferFrontmatterProperty(value: unknown) {
  if (typeof value === "boolean") {
    return { type: "checkbox" as const, value };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return { type: "number" as const, value };
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return { type: "date" as const, value: trimmed };
    }
    return { type: "text" as const, value: trimmed };
  }
  if (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" && entry.trim().length > 0)
  ) {
    return {
      type: "multi_select" as const,
      value: value.map((entry) => entry.trim()),
    };
  }
  return null;
}

function extractMarkdownNotePayload(input: {
  metadata?: Record<string, unknown>;
  rawContent: string;
}) {
  const parsed = matter(input.rawContent);
  const frontmatterTitle =
    typeof parsed.data?.title === "string" ? parsed.data.title.trim() : "";
  const extractedProperties = Object.fromEntries(
    Object.entries(parsed.data ?? {})
      .map(([key, value]) => {
        if (key.trim().toLowerCase() === "title") {
          return null;
        }
        const normalized = inferFrontmatterProperty(value);
        return normalized ? ([key.trim(), normalized] as const) : null;
      })
      .filter(
        (
          entry
        ): entry is readonly [
          string,
          ReturnType<typeof inferFrontmatterProperty> extends infer T
            ? Exclude<T, null>
            : never,
        ] => Boolean(entry)
      )
  );

  const currentMetadata = input.metadata ?? {};
  const currentPage =
    currentMetadata.page &&
    typeof currentMetadata.page === "object" &&
    !Array.isArray(currentMetadata.page)
      ? (currentMetadata.page as Record<string, unknown>)
      : {};
  const normalizedPage = {
    bannerUrl: null,
    icon: null,
    properties: normalizeFrontmatterProperties(extractedProperties),
  } satisfies PageMetadataState;
  const mergedMetadata = {
    ...currentMetadata,
    page: {
      ...currentPage,
      properties: {
        ...((currentPage.properties as Record<string, unknown> | undefined) ?? {}),
        ...normalizedPage.properties,
      },
    },
  };
  const cleanedText = parsed.content.replace(/^\n+/, "");
  const hasHeading = /^#\s+.+$/m.test(cleanedText);
  const normalizedContent =
    frontmatterTitle && !hasHeading
      ? `# ${frontmatterTitle}\n\n${cleanedText}`.replace(/\n+$/, "\n")
      : cleanedText;

  return {
    content: normalizedContent,
    contentHashSha256: createHash("sha256")
      .update(normalizedContent)
      .digest("hex"),
    metadata: mergedMetadata,
  } satisfies MarkdownNotePayload;
}

async function publishRegisteredUpload(input: {
  deduplicated: boolean;
  file: Awaited<ReturnType<typeof registerFileAsset>>;
  folderId: string;
  ingestionJob: Awaited<ReturnType<typeof scheduleIngestionJob>> | null;
  source: "upload.dedupe" | "upload.register";
  workspaceUuid: string;
}) {
  const tasks: Promise<unknown>[] = [
    publishWorkspaceStreamEvent({
      workspaceUuid: input.workspaceUuid,
      type: "upload.finalized",
      payload: {
        deduplicated: input.deduplicated,
        fileId: input.file.id,
        folderId: input.folderId,
        workspaceUuid: input.workspaceUuid,
      },
    }),
  ];

  if (!input.deduplicated) {
    tasks.push(
      publishFilesInvalidationEvent({
        workspaceUuid: input.workspaceUuid,
        folderId: input.folderId,
        reason: "file.created",
      }),
      publishFilesInvalidationEvent({
        workspaceUuid: input.workspaceUuid,
        reason: "tree.changed",
      })
    );
  }

  if (input.ingestionJob) {
    tasks.push(
      publishWorkspaceStreamEvent({
        workspaceUuid: input.workspaceUuid,
        type: "ingestion.job",
        payload: {
          createdAt: new Date().toISOString(),
          eventType: "job.queued",
          jobId: input.ingestionJob.id,
          payload: { status: "queued", source: input.source },
          workspaceId: input.workspaceUuid,
        },
      })
    );
  }

  await Promise.allSettled(tasks);
}

export async function registerWorkspaceMarkdownNote(input: {
  content: string;
  dedupeMode?: "allow" | "skip";
  folderId: string;
  metadata?: Record<string, unknown>;
  name: string;
  userId: string;
  workspaceUuid: string;
}): Promise<UploadRegistrationResult> {
  const dedupeMode = input.dedupeMode ?? "allow";
  const normalizedNote = extractMarkdownNotePayload({
    metadata: input.metadata,
    rawContent: input.content,
  });
  const normalizedHash = normalizeSha256(normalizedNote.contentHashSha256);

  if (dedupeMode !== "skip" && normalizedHash) {
    const existing = await getFileAssetByContentHash(
      input.workspaceUuid,
      normalizedHash
    );
    if (existing) {
      const hasSucceeded = await hasSuccessfulIngestionForFile(
        input.workspaceUuid,
        existing.id
      ).catch(() => false);
      const ingestionJob = hasSucceeded
        ? null
        : await scheduleIngestionJob({
            workspaceId: input.workspaceUuid,
            fileId: existing.id,
          }).catch((error) => {
            console.error("upload.ingestion_enqueue_failed", {
              workspaceUuid: input.workspaceUuid,
              fileId: existing.id,
              error,
            });
            return null;
          });

      await publishRegisteredUpload({
        deduplicated: true,
        file: existing,
        folderId: existing.folderId,
        ingestionJob,
        source: "upload.dedupe",
        workspaceUuid: input.workspaceUuid,
      });

      return {
        file: existing,
        ingestionJob,
        status: "deduplicated",
      };
    }
  }

  const file = await createWorkspaceNoteFile({
    workspaceId: input.workspaceUuid,
    userId: input.userId,
    folderId: input.folderId,
    name: input.name,
    baseContent: normalizedNote.content,
    content: normalizedNote.content,
    metadata: {
      ...(normalizedNote.metadata ?? {}),
      type: "note",
    },
  });

  const ingestionJob = await scheduleIngestionJob({
    workspaceId: input.workspaceUuid,
    fileId: file.id,
    sourceType: "markdown",
  }).catch((error) => {
    console.error("upload.ingestion_enqueue_failed", {
      workspaceUuid: input.workspaceUuid,
      fileId: file.id,
      error,
    });
    return null;
  });

  await publishRegisteredUpload({
    deduplicated: false,
    file,
    folderId: input.folderId,
    ingestionJob,
    source: "upload.register",
    workspaceUuid: input.workspaceUuid,
  });

  return {
    file,
    ingestionJob,
    status: "created",
  };
}

export async function deleteUploadThingFile(
  storageKey: string | null | undefined
) {
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
  const resolvedMimeType = resolveMimeType({
    mimeType: input.mimeType,
    name: input.name,
  });
  if (isMarkdownUpload({ mimeType: resolvedMimeType, name: input.name })) {
    const response = await fetch(
      normalizeUploadThingStorageUrl(input.storageUrl, input.storageKey),
      { cache: "no-store" }
    );
    if (!response.ok) {
      throw new Error("Unable to read uploaded markdown file.");
    }

    const content = await response.text();
    const result = await registerWorkspaceMarkdownNote({
      content,
      dedupeMode,
      folderId: input.folderId,
      metadata: input.metadata,
      name: input.name,
      userId: input.userId,
      workspaceUuid: input.workspaceUuid,
    });
    await deleteUploadThingFile(input.storageKey);
    return result;
  }

  const normalizedUpload = {
    contentHashSha256: input.contentHashSha256 ?? null,
    metadata: input.metadata,
    sizeBytes: input.sizeBytes,
    storageKey: input.storageKey,
    storageUrl: normalizeUploadThingStorageUrl(input.storageUrl, input.storageKey),
  };
  const normalizedHash = normalizeSha256(normalizedUpload.contentHashSha256);

  if (dedupeMode !== "skip") {
    const existingByHash = normalizedHash
      ? await getFileAssetByContentHash(input.workspaceUuid, normalizedHash)
      : null;
    const existingByNormalizedStorage =
      normalizedUpload.storageKey !== input.storageKey
        ? await getFileAssetByStorageKey(
            input.workspaceUuid,
            normalizedUpload.storageKey
          )
        : null;
    const existing =
      existingByHash ??
      existingByNormalizedStorage ??
      (await getFileAssetByStorageKey(input.workspaceUuid, input.storageKey));
    if (existing) {
      const hasSucceeded = await hasSuccessfulIngestionForFile(
        input.workspaceUuid,
        existing.id
      ).catch(() => false);
      const ingestionJob = hasSucceeded
        ? null
        : await scheduleIngestionJob({
            workspaceId: input.workspaceUuid,
            fileId: existing.id,
          }).catch((error) => {
            console.error("upload.ingestion_enqueue_failed", {
              workspaceUuid: input.workspaceUuid,
              fileId: existing.id,
              error,
            });
            return null;
          });

      await publishRegisteredUpload({
        deduplicated: true,
        file: existing,
        folderId: existing.folderId,
        ingestionJob,
        source: "upload.dedupe",
        workspaceUuid: input.workspaceUuid,
      });

      return {
        file: existing,
        ingestionJob,
        status: "deduplicated",
      };
    }
  }

  const file = await registerFileAsset(input.workspaceUuid, input.userId, {
    folderId: input.folderId,
    storageKey: normalizedUpload.storageKey,
    storageUrl: normalizedUpload.storageUrl,
    name: input.name,
    mimeType: resolvedMimeType,
    sizeBytes: normalizedUpload.sizeBytes,
    metadata: normalizedUpload.metadata,
    contentHashSha256: normalizedHash,
    hashComputedBy: normalizedHash ? (input.hashComputedBy ?? "client") : null,
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

  const ingestionJob = await scheduleIngestionJob({
    workspaceId: input.workspaceUuid,
    fileId: file.id,
  }).catch((error) => {
    console.error("upload.ingestion_enqueue_failed", {
      workspaceUuid: input.workspaceUuid,
      fileId: file.id,
      error,
    });
    return null;
  });

  await publishRegisteredUpload({
    deduplicated: false,
    file,
    folderId: input.folderId,
    ingestionJob,
    source: "upload.register",
    workspaceUuid: input.workspaceUuid,
  });

  return {
    file,
    ingestionJob,
    status: "created",
  };
}
