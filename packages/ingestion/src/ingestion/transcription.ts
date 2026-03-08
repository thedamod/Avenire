import { openAsBlob } from "node:fs";
import { config } from "../config";

export type TranscriptSegment = {
  startMs: number;
  endMs: number;
  text: string;
};

export const transcribeAudio = async (
  audio:
    | Uint8Array
    | {
        filePath: string;
        mimeType?: string;
        filename?: string;
      }
): Promise<{ text: string; segments: TranscriptSegment[] }> => {
  let fileBlob: Blob;
  let filename = "audio.mp3";

  if (audio instanceof Uint8Array) {
    fileBlob = new File([Uint8Array.from(audio).buffer], filename, {
      type: "audio/mpeg",
    });
  } else {
    filename = audio.filename ?? filename;
    fileBlob = await openAsBlob(audio.filePath, {
      type: audio.mimeType ?? "audio/mpeg",
    });
  }

  const formData = new FormData();
  formData.append("file", fileBlob, filename);
  formData.append("model", config.groqTranscriptionModel);
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "segment");

  let result: {
    text?: string;
    segments?: Array<{
      start?: number;
      end?: number;
      text?: string;
    }>;
  };
  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.groqApiKey}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Groq transcription failed (${response.status}): ${detail || response.statusText}`
      );
    }

    result = (await response.json()) as typeof result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/invalid api key|unauthorized|authentication/i.test(message)) {
      throw new Error(
        "Groq transcription auth failed: check GROQ_API_KEY value and formatting."
      );
    }
    throw error;
  }

  const segments = (result.segments ?? [])
    .map((segment) => ({
      startMs: Math.floor((segment.start ?? 0) * 1000),
      endMs: Math.floor((segment.end ?? 0) * 1000),
      text: segment.text ?? "",
    }))
    .filter((segment) => segment.text.trim().length > 0);

  return {
    text:
      result.text?.trim() ||
      segments
        .map((segment) => segment.text)
        .join(" ")
        .trim(),
    segments,
  };
};
