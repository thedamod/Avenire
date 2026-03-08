import { withExtractedAudioFromVideoUrl } from "../utils/ffmpeg";
import { config } from "../config";
import { assertSafeUrl } from "../utils/safety";
import { semanticChunkText } from "./chunking";
import { transcribeAudio } from "./transcription";
import type { CanonicalChunk, CanonicalResource } from "./types";

const cleanTranscriptText = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

export const ingestAudio = async (input: {
  url: string;
  title?: string;
}): Promise<CanonicalResource> => {
  const source = (await assertSafeUrl(input.url)).toString();
  let transcription: {
    text: string;
    segments: Array<{ startMs: number; endMs: number; text: string }>;
  } | null = null;
  let transcriptionError: string | null = null;
  let transcriptionStatus: "ok" | "fallback" = "ok";
  try {
    transcription = await withExtractedAudioFromVideoUrl(
      source,
      ({ audioPath, mimeType }) =>
        transcribeAudio({
          filePath: audioPath,
          mimeType,
          filename: "audio.mp3",
        }),
      {
        maxBytes: config.maxAudioBytes,
        maxDurationSeconds: config.maxAudioDurationSeconds,
      }
    );
  } catch (error) {
    transcriptionStatus = "fallback";
    transcriptionError =
      error instanceof Error ? error.message : "Audio transcription failed";
  }

  const transcript = cleanTranscriptText(transcription?.text ?? "");
  if (!transcript && !input.title) {
    throw new Error(
      transcriptionError
        ? `Audio transcription failed and no fallback metadata available: ${transcriptionError}`
        : "Audio transcription produced no usable content."
    );
  }

  const metadataContent =
    input.title?.trim() || transcript.slice(0, 300) || "Audio content";

  const chunks: CanonicalChunk[] = [
    {
      chunkIndex: 0,
      content: metadataContent,
      kind: "visualization" as const,
      metadata: {
        sourceType: "audio" as const,
        source,
        modality: "text" as const,
        extra: {
          section: "audio-metadata",
          transcriptionStatus,
        },
      },
    },
  ];

  const transcriptSegments = transcription?.segments ?? [];

  if (transcriptSegments.length > 0) {
    for (const segment of transcriptSegments) {
      const segmentText = cleanTranscriptText(segment.text);
      if (!segmentText) {
        continue;
      }

      const segmentChunks = semanticChunkText({
        text: segmentText,
        sourceType: "audio",
        source,
        startMs: Math.max(0, segment.startMs),
        endMs: Math.max(segment.startMs, segment.endMs),
        baseMetadata: {
          section: "audio-transcript",
        },
      });

      chunks.push(...segmentChunks);
    }
  } else if (transcript) {
    chunks.push(
      ...semanticChunkText({
        text: transcript,
        sourceType: "audio",
        source,
        baseMetadata: {
          section: "audio-transcript",
        },
      })
    );
  } else if (input.title) {
    chunks.push(
      ...semanticChunkText({
        text: input.title,
        sourceType: "audio",
        source,
        baseMetadata: {
          section: "audio-title-fallback",
        },
      })
    );
  }

  chunks.forEach((chunk, index) => {
    chunk.chunkIndex = index;
  });

  return {
    sourceType: "audio",
    source,
    title: input.title,
    metadata: {
      hasTranscript: Boolean(transcript),
      segmentCount: transcriptSegments.length,
      transcriptionStatus,
    },
    chunks,
  };
};
