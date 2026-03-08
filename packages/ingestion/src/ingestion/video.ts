import { semanticChunkText } from "./chunking";
import { assertSafeUrl } from "../utils/safety";
import type { CanonicalChunk, CanonicalResource } from "./types";
import { ingestLink } from "./link";
import { extractFromSupportedProvider } from "./provider-extractors";
import {
  extractKeyframesFromVideoFile,
  extractKeyframesFromVideoUrl,
  type ExtractedVideoKeyframe,
  withExtractedAudioFromVideoFile,
  withExtractedAudioFromVideoUrl,
} from "../utils/ffmpeg";
import { transcribeAudio, type TranscriptSegment } from "./transcription";
import { config } from "../config";

const logVideoStageTiming = (params: {
  stage: string;
  durationMs: number;
  source: string;
}) => {
  if (!config.ingestionStageTimingLog) {
    return;
  }

  console.log(
    JSON.stringify({
      event: "ingestion.video.stage_timing",
      ...params,
    })
  );
};

const cleanTranscriptText = (value: string): string => {
  const normalized = value
    .replace(/\uFFFD/g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  if (
    /(x264|mpeg-4|h\.264|cabac|deblock|bframes|keyint|qcomp|chroma_qp_offset|rc_lookahead|threads=)/i.test(
      normalized
    )
  ) {
    return "";
  }

  const words = normalized
    .split(" ")
    .map((word) => word.replace(/[^\p{L}\p{N}'-]/gu, ""))
    .filter(Boolean);

  if (words.length === 0) {
    return "";
  }

  const numericRatio =
    words.filter((word) => /^\d+$/.test(word)).length / words.length;
  const shortRatio =
    words.filter((word) => word.length <= 2).length / words.length;

  const cleanedWords =
    numericRatio > 0.18 || shortRatio > 0.52
      ? words.filter((word) => !/^\d+$/.test(word) && word.length > 1)
      : words;

  return cleanedWords.join(" ").trim();
};

const splitTranscriptByTime = (
  transcript: string,
  transcriptSegments?: TranscriptSegment[]
): Array<{ startMs: number; endMs: number; text: string }> => {
  if (transcriptSegments && transcriptSegments.length > 0) {
    return transcriptSegments
      .map((segment) => ({
        startMs: Math.max(0, segment.startMs),
        endMs: Math.max(segment.endMs, segment.startMs + 1000),
        text: cleanTranscriptText(segment.text),
      }))
      .filter((segment) => segment.text.length > 0);
  }

  const lines = transcript
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed = lines
    .map((line) => {
      const match = line.match(/^(\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d+)?\s+(.+)$/);
      if (!match) return null;
      const raw = match[0].split(/\s+/, 2)[0] ?? "";
      const text = line.slice(raw.length).trim();
      const parts = raw.split(":").map(Number);
      const seconds =
        parts.length === 3
          ? (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0)
          : (parts[0] ?? 0) * 60 + (parts[1] ?? 0);

      return {
        startMs: Math.floor(seconds * 1000),
        text,
      };
    })
    .filter((value): value is { startMs: number; text: string } =>
      Boolean(value)
    );

  if (parsed.length > 0) {
    return parsed.map((item, index) => {
      const next = parsed[index + 1];
      return {
        startMs: item.startMs,
        endMs: next
          ? Math.max(item.startMs + 20000, next.startMs)
          : item.startMs + 30000,
        text: item.text,
      };
    });
  }

  const words = transcript.split(/\s+/).filter(Boolean);
  const approxWordsPer30s = 75;
  const windows: Array<{ startMs: number; endMs: number; text: string }> = [];

  let startWord = 0;
  let windowIndex = 0;
  while (startWord < words.length) {
    const endWord = Math.min(words.length, startWord + approxWordsPer30s);
    windows.push({
      startMs: windowIndex * 30000,
      endMs: windowIndex * 30000 + 30000,
      text: words.slice(startWord, endWord).join(" "),
    });
    startWord = endWord;
    windowIndex += 1;
  }

  return windows;
};

const buildVideoResource = (params: {
  source: string;
  title?: string;
  transcript: string;
  transcriptSegments?: TranscriptSegment[];
  keyframes?: Array<{
    timestampMs: number;
    imageBase64?: string;
    labels?: string[];
    ocrText?: string;
    caption?: string;
  }>;
  transcriptionStatus?: "fallback" | "missing" | "ok" | "provided";
}): CanonicalResource => {
  const segments = splitTranscriptByTime(
    params.transcript,
    params.transcriptSegments
  );
  const keyframes = params.keyframes ?? [];

  const chunks: CanonicalChunk[] = [
    {
      chunkIndex: 0,
      content:
        params.title?.trim() ||
        params.transcript.trim().slice(0, 300) ||
        "Video content",
      kind: "visualization",
      metadata: {
        sourceType: "video",
        source: params.source,
        modality: "text",
        extra: {
          section: "video-metadata",
          transcriptionStatus: params.transcriptionStatus ?? "missing",
        },
      },
    },
  ];
  for (const segment of segments) {
    const nearbyFrames = keyframes.filter(
      (frame) =>
        frame.timestampMs >= segment.startMs &&
        frame.timestampMs <= segment.endMs
    );

    const frameContext = nearbyFrames
      .map((frame) => {
        const labels = frame.labels?.length
          ? `labels: ${frame.labels.join(", ")}`
          : "";
        const ocrText = frame.ocrText ? `ocr: ${frame.ocrText}` : "";
        const caption = frame.caption ? `caption: ${frame.caption}` : "";
        return [labels, ocrText, caption].filter(Boolean).join(" | ");
      })
      .filter(Boolean)
      .join("\n");

    const multimodal = [segment.text, frameContext]
      .filter(Boolean)
      .join("\n\n");
    const segmentChunks = semanticChunkText({
      text: multimodal,
      sourceType: "video",
      source: params.source,
      startMs: segment.startMs,
      endMs: segment.endMs,
      baseMetadata: {
        section: "video-transcript",
        modality: "mixed",
        keyframeCount: nearbyFrames.length,
      },
    });

    chunks.push(...segmentChunks);
  }

  for (const [index, frame] of keyframes.entries()) {
    if (!frame.imageBase64) {
      continue;
    }

    const windowStart = Math.max(0, frame.timestampMs - 15000);
    const windowEnd = frame.timestampMs + 15000;
    const nearbyTranscript = segments
      .filter(
        (segment) =>
          segment.startMs <= windowEnd && segment.endMs >= windowStart
      )
      .map((segment) => segment.text)
      .join(" ")
      .trim();

    const contextText = [
      params.title ? `Video: ${params.title}` : "Video frame",
      `Timestamp: ${Math.floor(frame.timestampMs / 1000)}s`,
      frame.caption ? `Caption: ${frame.caption}` : "",
      frame.labels?.length ? `Labels: ${frame.labels.join(", ")}` : "",
      frame.ocrText ? `OCR: ${frame.ocrText}` : "",
      nearbyTranscript ? `Nearby transcript: ${nearbyTranscript}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    chunks.push({
      chunkIndex: chunks.length,
      content: contextText,
      kind: "visualization",
      embeddingInput: {
        type: "multimodal",
        content: [
          { type: "text", text: contextText },
          {
            type: "image_base64",
            image_base64: frame.imageBase64,
            mime_type: "image/jpeg",
          },
        ],
      },
      metadata: {
        sourceType: "video",
        source: params.source,
        startMs: frame.timestampMs,
        endMs: frame.timestampMs,
        modality: "mixed",
        extra: {
          section: "video-keyframe",
          keyframeIndex: index,
        },
      },
    });
  }

  chunks.forEach((chunk, index) => {
    chunk.chunkIndex = index;
  });

  return {
    sourceType: "video",
    source: params.source,
    title: params.title,
    metadata: {
      hasTranscript: segments.length > 0 || params.transcript.trim().length > 0,
      segmentCount: segments.length,
      keyframeCount: keyframes.length,
      transcriptionStatus: params.transcriptionStatus ?? "missing",
    },
    chunks,
  };
};

const isLowQualityTranscript = (text: string): boolean => {
  const cleaned = cleanTranscriptText(text);
  if (!cleaned) {
    return true;
  }

  const words = cleaned.toLowerCase().split(/\s+/).filter(Boolean);

  if (words.length < 8) {
    return true;
  }

  const numericCount = words.filter((word) => /^\d+$/.test(word)).length;
  const shortCount = words.filter((word) => word.length <= 2).length;
  const uniqueRatio = new Set(words).size / words.length;

  return (
    numericCount / words.length > 0.22 ||
    shortCount / words.length > 0.55 ||
    uniqueRatio < 0.28
  );
};

const isDirectMediaUrl = (url: string): boolean =>
  /\.(mp4|mov|mkv|webm|avi|m4v|mp3|wav|m4a|aac|ogg|flac)(\?|#|$)/i.test(url);

const isLikelyVideoFileUrl = (url: string): boolean =>
  /\.(mp4|mov|mkv|webm)(\?|#|$)/i.test(url);

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const MAX_MEDIA_HEAD_REDIRECTS = 3;

const PROVIDER_MEDIA_HOST_ALLOWLIST: Record<
  "instagram" | "pinterest" | "reddit" | "twitter" | "youtube",
  string[]
> = {
  youtube: ["youtube.com", "youtu.be", "googlevideo.com", "ytimg.com"],
  pinterest: ["pinterest.com", "pin.it", "pinimg.com"],
  reddit: ["reddit.com", "redd.it", "redditmedia.com", "redditstatic.com"],
  twitter: ["x.com", "twitter.com", "twimg.com"],
  instagram: ["instagram.com", "cdninstagram.com", "fbcdn.net"],
};

const hostnameMatches = (candidate: string, domain: string): boolean =>
  candidate === domain || candidate.endsWith(`.${domain}`);

const isAllowedProviderMediaHost = (params: {
  provider: "instagram" | "pinterest" | "reddit" | "twitter" | "youtube";
  sourceHost: string;
  mediaHost: string;
}): boolean => {
  if (hostnameMatches(params.mediaHost, params.sourceHost)) {
    return true;
  }

  const allowlist = PROVIDER_MEDIA_HOST_ALLOWLIST[params.provider];
  return allowlist.some((domain) => hostnameMatches(params.mediaHost, domain));
};

const headIsSafeVideoContent = async (url: URL): Promise<boolean> => {
  let current = url;

  for (
    let redirectCount = 0;
    redirectCount <= MAX_MEDIA_HEAD_REDIRECTS;
    redirectCount += 1
  ) {
    const response = await fetch(current, {
      method: "HEAD",
      redirect: "manual",
    });

    if (REDIRECT_STATUS_CODES.has(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirectCount === MAX_MEDIA_HEAD_REDIRECTS) {
        return false;
      }

      current = await assertSafeUrl(new URL(location, current).toString());
      continue;
    }

    if (!response.ok) {
      return false;
    }

    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";
    return contentType.startsWith("video/");
  }

  return false;
};

const canFallbackToLinkExtraction = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) {
      return false;
    }
    return !isDirectMediaUrl(parsed.pathname);
  } catch {
    return false;
  }
};

const resolveVideoMediaSource = async (url: string): Promise<string> => {
  const providerExtracted = await extractFromSupportedProvider(url);
  const sourceUrl = await assertSafeUrl(url);
  const sourceHost = sourceUrl.hostname.toLowerCase();
  const targetMedia = providerExtracted?.mediaUrls.filter((mediaUrl) =>
    isLikelyVideoFileUrl(mediaUrl)
  );

  if (!providerExtracted || !targetMedia?.length) {
    return url;
  }

  for (const mediaUrl of targetMedia) {
    try {
      const parsedMediaUrl = await assertSafeUrl(mediaUrl);
      if (
        !isAllowedProviderMediaHost({
          provider: providerExtracted.provider,
          sourceHost,
          mediaHost: parsedMediaUrl.hostname.toLowerCase(),
        })
      ) {
        continue;
      }

      if (await headIsSafeVideoContent(parsedMediaUrl)) {
        return parsedMediaUrl.toString();
      }
    } catch {
      continue;
    }
  }

  return url;
};

const transcribeFromResolvedUrl = async (
  sourceForFfmpeg: string
): Promise<{ text: string; segments: TranscriptSegment[] }> => {
  return withExtractedAudioFromVideoUrl(
    sourceForFfmpeg,
    ({ audioPath, mimeType }) =>
      transcribeAudio({
        filePath: audioPath,
        mimeType,
        filename: "audio.mp3",
      })
  );
};

const extractKeyframesFromResolvedUrl = async (
  sourceForFfmpeg: string
): Promise<Array<{ timestampMs: number; imageBase64: string }>> => {
  const keyframes = await extractKeyframesFromVideoUrl(sourceForFfmpeg);
  return keyframes.map((frame) => ({
    timestampMs: frame.timestampMs,
    imageBase64: frame.imageBase64,
  }));
};

export const ingestVideo = async (input: {
  url?: string;
  transcript?: string;
  title?: string;
  keyframes?: Array<{
    timestampMs: number;
    imageBase64?: string;
    labels?: string[];
    ocrText?: string;
    caption?: string;
  }>;
}): Promise<CanonicalResource> => {
  const source = input.url?.trim() || `video:inline:${crypto.randomUUID()}`;
  const startedAtMs = Date.now();
  if (input.url) {
    await assertSafeUrl(input.url);
  }

  let transcript = input.transcript?.trim() ?? "";
  let transcriptSegments: TranscriptSegment[] = [];
  let keyframes = input.keyframes;
  let transcriptionStatus: "fallback" | "missing" | "ok" | "provided" =
    transcript ? "provided" : "missing";

  if (input.url && (!transcript || !keyframes || keyframes.length === 0)) {
    const resolveStartedAt = Date.now();
    const sourceForFfmpeg = await resolveVideoMediaSource(input.url);
    logVideoStageTiming({
      stage: "resolve-media-source",
      durationMs: Date.now() - resolveStartedAt,
      source,
    });
    const shouldTranscribe = !transcript;
    const shouldExtractKeyframes = !keyframes || keyframes.length === 0;
    const transcriptionPromise = shouldTranscribe
      ? (() => {
          const transcribeStartedAt = Date.now();
          return transcribeFromResolvedUrl(sourceForFfmpeg).finally(() => {
            logVideoStageTiming({
              stage: "transcribe-audio",
              durationMs: Date.now() - transcribeStartedAt,
              source,
            });
          });
        })()
      : undefined;
    const keyframePromise = shouldExtractKeyframes
      ? (() => {
          const keyframesStartedAt = Date.now();
          return extractKeyframesFromResolvedUrl(sourceForFfmpeg).finally(
            () => {
              logVideoStageTiming({
                stage: "extract-keyframes",
                durationMs: Date.now() - keyframesStartedAt,
                source,
              });
            }
          );
        })()
      : undefined;

    const [transcriptionResult, keyframeResult] = await Promise.all([
      transcriptionPromise
        ? transcriptionPromise.then(
            (value) => ({ ok: true as const, value }),
            (_error: unknown) => ({ ok: false as const })
          )
        : Promise.resolve(null),
      keyframePromise
        ? keyframePromise.then(
            (value) => ({ ok: true as const, value }),
            (_error: unknown) => ({ ok: false as const })
          )
        : Promise.resolve(null),
    ]);

    if (transcriptionResult?.ok) {
      const transcription = transcriptionResult.value;
      transcript = transcription.text.trim();
      const segmentText = transcription.segments
        .map((segment) => segment.text)
        .join(" ")
        .trim();
      transcriptSegments = isLowQualityTranscript(segmentText)
        ? []
        : transcription.segments;
      transcriptionStatus = transcript ? "ok" : "missing";
    } else if (shouldTranscribe) {
      if (canFallbackToLinkExtraction(input.url)) {
        const link = await ingestLink(input.url);
        transcript = link.chunks.map((chunk) => chunk.content).join("\n\n");
        transcriptionStatus = transcript ? "fallback" : "missing";
      } else {
        transcript = "";
        transcriptSegments = [];
        transcriptionStatus = "missing";
      }
    }

    if (keyframeResult?.ok) {
      keyframes = keyframeResult.value;
    } else if (shouldExtractKeyframes) {
      // Keyframes are optional for successful ingestion if transcript exists.
      keyframes = [];
    }
  } else if ((!keyframes || keyframes.length === 0) && input.url) {
    try {
      const sourceForFfmpeg = await resolveVideoMediaSource(input.url);
      keyframes = await extractKeyframesFromResolvedUrl(sourceForFfmpeg);
    } catch {
      keyframes = [];
    }
  }

  if (isLowQualityTranscript(transcript)) {
    transcript = "";
    transcriptSegments = [];
    transcriptionStatus = "missing";
  }

  if (!transcript && (!keyframes || keyframes.length === 0)) {
    throw new Error(
      "Video ingestion requires transcript or extractable keyframes from the provided URL."
    );
  }

  const buildStartedAt = Date.now();
  const built = buildVideoResource({
    source,
    title: input.title,
    transcript,
    transcriptSegments,
    keyframes,
    transcriptionStatus,
  });
  logVideoStageTiming({
    stage: "build-resource",
    durationMs: Date.now() - buildStartedAt,
    source,
  });
  logVideoStageTiming({
    stage: "total-video-ingest",
    durationMs: Date.now() - startedAtMs,
    source,
  });

  return built;
};

export const ingestVideoFile = async (input: {
  filename: string;
  bytes: Uint8Array;
  title?: string;
}): Promise<CanonicalResource> => {
  const extension = input.filename.split(".").pop() ?? "mp4";
  const [transcription, extractedKeyframes] = await Promise.all([
    withExtractedAudioFromVideoFile(
      input.bytes,
      extension,
      ({ audioPath, mimeType }) =>
        transcribeAudio({
          filePath: audioPath,
          mimeType,
          filename: "audio.mp3",
        })
    ),
    extractKeyframesFromVideoFile(input.bytes, extension),
  ]);
  const transcriptText = transcription.text.trim();
  const useTranscript = !isLowQualityTranscript(transcriptText);
  const segmentText = transcription.segments
    .map((segment) => segment.text)
    .join(" ")
    .trim();
  const useSegments = !isLowQualityTranscript(segmentText);

  return buildVideoResource({
    source: `video:file:${input.filename}`,
    title: input.title,
    transcript: useTranscript ? transcriptText : "",
    transcriptSegments: useSegments ? transcription.segments : [],
    keyframes: extractedKeyframes.map((frame: ExtractedVideoKeyframe) => ({
      timestampMs: frame.timestampMs,
      imageBase64: frame.imageBase64,
    })),
    transcriptionStatus: useTranscript || useSegments ? "ok" : "missing",
  });
};
