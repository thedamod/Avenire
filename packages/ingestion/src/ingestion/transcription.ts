import { createGroq } from '@ai-sdk/groq';
import { experimental_transcribe as transcribe } from 'ai';
import { config } from '../config';

export type TranscriptSegment = {
  startMs: number;
  endMs: number;
  text: string;
};

export const transcribeAudio = async (
  audioBytes: Uint8Array,
): Promise<{ text: string; segments: TranscriptSegment[] }> => {
  const groq = createGroq({
    apiKey: config.groqApiKey,
  });

  let result: Awaited<ReturnType<typeof transcribe>>;
  try {
    result = await transcribe({
      model: groq.transcription(config.groqTranscriptionModel),
      audio: audioBytes,
      providerOptions: {
        groq: {
          responseFormat: 'verbose_json',
          timestampGranularities: ['segment'],
        },
      },
    });
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
    .map(segment => ({
      startMs: Math.floor((segment.startSecond ?? 0) * 1000),
      endMs: Math.floor((segment.endSecond ?? 0) * 1000),
      text: segment.text,
    }))
    .filter(segment => segment.text.trim().length > 0);

  return {
    text:
      result.text?.trim() ||
      segments.map(segment => segment.text).join(' ').trim(),
    segments,
  };
};
