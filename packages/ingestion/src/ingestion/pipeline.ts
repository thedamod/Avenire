import { config } from "../config";
import { PostgresVectorStore } from "../retrieval/postgres-vector-store";
import { assertSafeUrl } from "../utils/safety";
import { ingestAudio } from "./audio";
import { ingestImage } from "./image";
import { ingestLink } from "./link";
import { ingestMarkdown } from "./markdown";
import { ingestPdfs } from "./ocr";
import { persistCanonicalResource } from "./persist";
import type { CanonicalResource, IngestResponse } from "./types";
import { ingestVideo } from "./video";

const logCorpusGrowth = async (
  before: Awaited<ReturnType<PostgresVectorStore["corpusStats"]>>,
  vectorStore: PostgresVectorStore
): Promise<void> => {
  const after = await vectorStore.corpusStats();
  console.log(
    JSON.stringify({
      event: "ingestion.corpus_growth",
      before,
      after,
      delta: {
        resources: after.resources - before.resources,
        chunks: after.chunks - before.chunks,
        embeddings: after.embeddings - before.embeddings,
      },
    })
  );
};

const toTranscriptCues = (
  resource: CanonicalResource
): Array<{ startMs: number; endMs: number; text: string }> => {
  if (resource.sourceType !== "video") {
    return [];
  }

  return resource.chunks
    .filter(
      (chunk) =>
        (chunk.metadata.extra as Record<string, unknown> | undefined)?.section ===
          "video-transcript" &&
        typeof chunk.metadata.startMs === "number" &&
        typeof chunk.metadata.endMs === "number"
    )
    .map((chunk) => ({
      startMs: Math.max(0, chunk.metadata.startMs ?? 0),
      endMs: Math.max(chunk.metadata.startMs ?? 0, chunk.metadata.endMs ?? 0),
      text: chunk.content.replace(/\s+/g, " ").trim(),
    }))
    .filter((cue) => cue.text.length > 0)
    .slice(0, 5000);
};

const persistResources = async (input: {
  workspaceId: string;
  fileId: string | null;
  resources: CanonicalResource[];
}) => {
  const persisted: IngestResponse["resources"] = [];
  let transcriptCues: Array<{ startMs: number; endMs: number; text: string }> =
    [];

  for (const resource of input.resources) {
    const record = await persistCanonicalResource(
      input.workspaceId,
      input.fileId,
      resource
    );
    persisted.push({
      resourceId: record.resourceId,
      sourceType: resource.sourceType,
      source: resource.source,
      provider: resource.provider,
      chunks: record.chunks,
    });

    if (resource.sourceType === "video") {
      transcriptCues = toTranscriptCues(resource);
    }
  }

  return { resources: persisted, transcriptCues };
};

const logStageTiming = (params: {
  stage: string;
  durationMs: number;
  workspaceId: string;
  fileId: string;
  mimeType?: string | null;
}) => {
  if (!config.ingestionStageTimingLog) {
    return;
  }

  console.log(
    JSON.stringify({
      event: "ingestion.stage_timing",
      ...params,
    })
  );
};

const sleep = async (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const shouldRetryStatus = (status: number) =>
  status === 408 || status === 425 || status === 429 || status >= 500;

const inferMimeTypeFromName = (fileName: string): string | null => {
  const normalizedName = fileName.trim().toLowerCase();
  if (!normalizedName.includes(".")) {
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

  const imageExtensions = [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".bmp",
    ".heic",
    ".heif",
    ".tif",
    ".tiff",
    ".avif",
  ];
  if (imageExtensions.some((extension) => normalizedName.endsWith(extension))) {
    return "image/*";
  }

  const videoExtensions = [
    ".mp4",
    ".mov",
    ".m4v",
    ".webm",
    ".avi",
    ".mkv",
    ".mpeg",
    ".mpg",
  ];
  if (videoExtensions.some((extension) => normalizedName.endsWith(extension))) {
    return "video/*";
  }

  const audioExtensions = [
    ".mp3",
    ".wav",
    ".m4a",
    ".aac",
    ".ogg",
    ".flac",
  ];
  if (audioExtensions.some((extension) => normalizedName.endsWith(extension))) {
    return "audio/*";
  }

  return null;
};

const resolveEffectiveMimeType = (input: {
  fileName: string;
  mimeType?: string | null;
}) => {
  const normalizedMime = input.mimeType?.trim().toLowerCase() ?? "";
  if (
    normalizedMime &&
    normalizedMime !== "application/octet-stream" &&
    normalizedMime !== "unknown"
  ) {
    return normalizedMime;
  }

  return inferMimeTypeFromName(input.fileName) ?? normalizedMime;
};

const normalizeUploadThingStorageUrl = (
  storageUrl: string,
  storageKey?: string | null
) => {
  let parsed: URL;
  try {
    parsed = new URL(storageUrl);
  } catch {
    return storageUrl;
  }

  const host = parsed.hostname.toLowerCase();
  const isUploadThingHost = host === "utfs.io" || host.endsWith(".ufs.sh");
  if (!isUploadThingHost) {
    return storageUrl;
  }

  const keyFromPath = parsed.pathname.startsWith("/f/")
    ? decodeURIComponent(parsed.pathname.slice(3).split("/")[0] ?? "")
    : "";
  const key = (storageKey ?? keyFromPath).trim();
  if (!key) {
    return storageUrl;
  }

  return `https://utfs.io/f/${encodeURIComponent(key)}`;
};

const resolveIngestionStorageUrl = (
  storageUrl: string,
  storageKey?: string | null
) => assertSafeUrl(normalizeUploadThingStorageUrl(storageUrl, storageKey)).toString();

async function fetchRemoteText(url: string) {
  const attempts = Math.max(1, config.remoteFetchMaxAttempts);
  const timeoutMs = Math.max(1000, config.remoteFetchTimeoutMs);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = new Error(
          `Failed to fetch text source (${response.status}) from ${new URL(url).hostname}`
        );
        if (attempt < attempts && shouldRetryStatus(response.status)) {
          lastError = error;
          await sleep(Math.min(2500, 200 * 2 ** (attempt - 1)));
          continue;
        }
        Object.assign(error, { retryable: false });
        throw error;
      }

      return await response.text();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown fetch error";
      const wrapped = new Error(
        `Failed to fetch text source from ${new URL(url).hostname}: ${message}`
      );
      if (error instanceof Error && error.name === "AbortError") {
        wrapped.name = "AbortError";
      }
      if (
        typeof error === "object" &&
        error !== null &&
        "retryable" in error &&
        (error as { retryable?: boolean }).retryable === false
      ) {
        Object.assign(wrapped, { retryable: false });
      }
      lastError = wrapped;
      const retryable =
        !(
          typeof wrapped === "object" &&
          wrapped !== null &&
          "retryable" in wrapped &&
          (wrapped as { retryable?: boolean }).retryable === false
        );
      if (attempt < attempts && retryable) {
        await sleep(Math.min(2500, 200 * 2 ** (attempt - 1)));
        continue;
      }
      throw wrapped;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw (
    lastError ??
    new Error(`Failed to fetch text source from ${new URL(url).hostname}`)
  );
}

export const ingestStoredFile = async (input: {
  workspaceId: string;
  fileId: string;
  storageUrl: string;
  storageKey?: string | null;
  fileName: string;
  mimeType?: string | null;
  metadata?: Record<string, unknown>;
  content?: string | null;
}) => {
  const vectorStore = new PostgresVectorStore(input.workspaceId);
  const beforeStats = await vectorStore.corpusStats();
  const mime = resolveEffectiveMimeType({
    fileName: input.fileName,
    mimeType: input.mimeType,
  });
  const resolvedStorageUrl = resolveIngestionStorageUrl(
    input.storageUrl,
    input.storageKey
  );
  const extractionStartedAt = Date.now();

  let resources: CanonicalResource[] = [];
  if (typeof input.content === "string") {
    resources = [
      ingestMarkdown({
        markdown: input.content.slice(0, config.maxMarkdownChars),
        source: `note:${input.fileId}`,
        title: input.fileName,
      }),
    ];
  } else if (
    mime === "application/pdf" ||
    input.fileName.toLowerCase().endsWith(".pdf")
  ) {
    resources = await ingestPdfs([resolvedStorageUrl]);
  } else if (mime.startsWith("image/")) {
    resources = [
      await ingestImage({
        url: resolvedStorageUrl,
        title: input.fileName,
      }),
    ];
  } else if (mime.startsWith("video/")) {
    resources = [
      await ingestVideo({
        url: resolvedStorageUrl,
        title: input.fileName,
      }),
    ];
  } else if (
    mime.startsWith("audio/") ||
    input.fileName.toLowerCase().endsWith(".mp3") ||
    input.fileName.toLowerCase().endsWith(".wav") ||
    input.fileName.toLowerCase().endsWith(".m4a") ||
    input.fileName.toLowerCase().endsWith(".aac") ||
    input.fileName.toLowerCase().endsWith(".ogg") ||
    input.fileName.toLowerCase().endsWith(".flac")
  ) {
    resources = [
      await ingestAudio({
        url: resolvedStorageUrl,
        title: input.fileName,
      }),
    ];
  } else if (
    mime.startsWith("text/") ||
    input.fileName.toLowerCase().endsWith(".md") ||
    input.fileName.toLowerCase().endsWith(".txt")
  ) {
    const markdown = await fetchRemoteText(resolvedStorageUrl);
    resources = [
      ingestMarkdown({
        markdown: markdown.slice(0, config.maxMarkdownChars),
        source: resolvedStorageUrl,
        title: input.fileName,
      }),
    ];
  } else if (mime === "application/url" || mime === "text/uri-list") {
    resources = [await ingestLink(resolvedStorageUrl)];
  } else {
    throw new Error(
      `Unsupported file type for ingestion: ${mime || "unknown"}`
    );
  }
  logStageTiming({
    stage: "extract",
    durationMs: Date.now() - extractionStartedAt,
    workspaceId: input.workspaceId,
    fileId: input.fileId,
    mimeType: mime || input.mimeType,
  });

  const persistStartedAt = Date.now();
  const persisted = await persistResources({
    workspaceId: input.workspaceId,
    fileId: input.fileId,
    resources,
  });
  logStageTiming({
    stage: "persist",
    durationMs: Date.now() - persistStartedAt,
    workspaceId: input.workspaceId,
    fileId: input.fileId,
    mimeType: mime || input.mimeType,
  });

  await logCorpusGrowth(beforeStats, vectorStore);
  return persisted;
};
