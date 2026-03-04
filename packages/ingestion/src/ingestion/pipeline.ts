import { config } from "../config";
import { PostgresVectorStore } from "../retrieval/postgres-vector-store";
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

async function fetchRemoteText(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch text source (${response.status})`);
  }

  return response.text();
}

export const ingestStoredFile = async (input: {
  workspaceId: string;
  fileId: string;
  storageUrl: string;
  fileName: string;
  mimeType?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  const vectorStore = new PostgresVectorStore(input.workspaceId);
  const beforeStats = await vectorStore.corpusStats();
  const mime = input.mimeType?.toLowerCase() ?? "";
  const extractionStartedAt = Date.now();

  let resources: CanonicalResource[] = [];
  if (
    mime === "application/pdf" ||
    input.fileName.toLowerCase().endsWith(".pdf")
  ) {
    resources = await ingestPdfs([input.storageUrl]);
  } else if (mime.startsWith("image/")) {
    resources = [
      await ingestImage({
        url: input.storageUrl,
        title: input.fileName,
      }),
    ];
  } else if (mime.startsWith("video/")) {
    resources = [
      await ingestVideo({
        url: input.storageUrl,
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
        url: input.storageUrl,
        title: input.fileName,
      }),
    ];
  } else if (
    mime.startsWith("text/") ||
    input.fileName.toLowerCase().endsWith(".md") ||
    input.fileName.toLowerCase().endsWith(".txt")
  ) {
    const markdown = await fetchRemoteText(input.storageUrl);
    resources = [
      ingestMarkdown({
        markdown: markdown.slice(0, config.maxMarkdownChars),
        source: input.storageUrl,
        title: input.fileName,
      }),
    ];
  } else if (mime === "application/url" || mime === "text/uri-list") {
    resources = [await ingestLink(input.storageUrl)];
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
    mimeType: input.mimeType,
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
    mimeType: input.mimeType,
  });

  await logCorpusGrowth(beforeStats, vectorStore);
  return persisted;
};
