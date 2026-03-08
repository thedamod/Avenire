import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { config } from "../config";
import { assertSafeUrl } from "./safety";

const SAFE_VIDEO_EXTENSIONS = new Set([
  "avi",
  "m4v",
  "mkv",
  "mov",
  "mp4",
  "webm",
]);
const DEFAULT_AUDIO_MIME_TYPE = "audio/mpeg";

const sanitizeVideoExtension = (
  extension: string | null | undefined
): string => {
  const normalized = (extension ?? "").trim().toLowerCase().replace(/^\.+/, "");

  return SAFE_VIDEO_EXTENSIONS.has(normalized) ? normalized : "mp4";
};

const appendCappedStderr = (
  current: string,
  chunk: Buffer,
  maxStderrLen: number
): string => {
  const currentBytes = Buffer.byteLength(current);
  if (currentBytes >= maxStderrLen) {
    return current;
  }

  const remainingBytes = maxStderrLen - currentBytes;
  const nextChunk =
    chunk.byteLength <= remainingBytes
      ? chunk.toString()
      : `${chunk.subarray(0, remainingBytes).toString()}\n... truncated`;

  return current + nextChunk;
};

const runFfmpeg = async (
  args: string[],
  options?: { timeoutMs?: number; maxStderrLen?: number }
): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    const timeoutMs = Math.max(1, options?.timeoutMs ?? config.ffmpegTimeoutMs);
    const maxStderrLen = Math.max(
      1024,
      options?.maxStderrLen ?? config.ffmpegMaxStderrBytes
    );
    let stderrText = "";
    let settled = false;

    const cleanup = (): void => {
      proc.stderr.removeListener("data", onStderr);
      proc.removeListener("error", onError);
      proc.removeListener("close", onClose);
      clearTimeout(timeoutId);
    };

    const resolveOnce = (): void => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(undefined);
    };

    const rejectOnce = (error: Error): void => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(error);
    };

    const onStderr = (chunk: Buffer): void => {
      stderrText = appendCappedStderr(stderrText, chunk, maxStderrLen);
    };

    const onError = (error: Error): void => {
      rejectOnce(error);
    };

    const onClose = (code: number | null): void => {
      if (code === 0) {
        resolveOnce();
        return;
      }

      rejectOnce(new Error(`ffmpeg failed (${code}): ${stderrText}`));
    };

    const timeoutId = setTimeout(() => {
      proc.kill("SIGKILL");
      rejectOnce(new Error(`ffmpeg timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stderr.on("data", onStderr);
    proc.on("error", onError);
    proc.on("close", onClose);
  });
};

const withTempDir = async <T>(
  prefix: string,
  run: (dir: string) => Promise<T>
): Promise<T> => {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

const probeMediaDurationSeconds = async (
  inputPathOrUrl: string
): Promise<number | null> => {
  return new Promise<number | null>((resolve) => {
    const proc = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        inputPathOrUrl,
      ],
      {
        stdio: ["ignore", "pipe", "ignore"],
      }
    );
    let stdoutText = "";
    let settled = false;

    const cleanup = (): void => {
      proc.stdout.removeListener("data", onStdout);
      proc.removeListener("error", onError);
      proc.removeListener("close", onClose);
      clearTimeout(timeoutId);
    };

    const finish = (value: number | null): void => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(value);
    };

    const onStdout = (chunk: Buffer): void => {
      if (Buffer.byteLength(stdoutText) >= 4096) {
        return;
      }

      stdoutText += chunk.toString();
    };

    const onError = (): void => {
      finish(null);
    };

    const onClose = (code: number | null): void => {
      if (code !== 0) {
        finish(null);
        return;
      }

      const parsed = Number.parseFloat(stdoutText.trim());
      finish(Number.isFinite(parsed) && parsed >= 0 ? parsed : null);
    };

    const timeoutId = setTimeout(
      () => {
        proc.kill("SIGKILL");
        finish(null);
      },
      Math.max(1, config.ffmpegTimeoutMs)
    );

    proc.stdout.on("data", onStdout);
    proc.on("error", onError);
    proc.on("close", onClose);
  });
};

const normalizeAudioLimits = (limits?: {
  maxBytes?: number;
  maxDurationSeconds?: number;
}) => ({
  maxBytes: Math.max(1, limits?.maxBytes ?? config.maxAudioBytes),
  maxDurationSeconds: Math.max(
    1,
    limits?.maxDurationSeconds ?? config.maxAudioDurationSeconds
  ),
});

const extractAudioToPath = async (
  inputPathOrUrl: string,
  outputPath: string,
  limits?: { maxBytes?: number; maxDurationSeconds?: number }
): Promise<void> => {
  const { maxBytes, maxDurationSeconds } = normalizeAudioLimits(limits);
  const durationSeconds = await probeMediaDurationSeconds(inputPathOrUrl);
  if (durationSeconds !== null && durationSeconds > maxDurationSeconds) {
    throw new Error(
      `Audio duration exceeds limit (${durationSeconds.toFixed(1)}s > ${maxDurationSeconds}s).`
    );
  }

  await runFfmpeg([
    "-y",
    "-i",
    inputPathOrUrl,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-f",
    "mp3",
    outputPath,
  ]);

  const info = await stat(outputPath);
  if (info.size > maxBytes) {
    throw new Error(
      `Extracted audio exceeds limit (${info.size} bytes > ${maxBytes} bytes).`
    );
  }
};

const readAudioOutput = async (
  outputPath: string,
  limits?: { maxBytes?: number; maxDurationSeconds?: number }
): Promise<Uint8Array> => {
  const { maxBytes } = normalizeAudioLimits(limits);
  const info = await stat(outputPath);
  if (info.size > maxBytes) {
    throw new Error(
      `Extracted audio exceeds limit (${info.size} bytes > ${maxBytes} bytes).`
    );
  }

  return new Uint8Array(await readFile(outputPath));
};

export const withExtractedAudioFromVideoFile = async <T>(
  videoBytes: Uint8Array,
  extension: string,
  run: (params: { audioPath: string; mimeType: string }) => Promise<T>,
  limits?: { maxBytes?: number; maxDurationSeconds?: number }
): Promise<T> => {
  return withTempDir("ingest-video-", async (dir) => {
    const inputPath = join(dir, `input.${sanitizeVideoExtension(extension)}`);
    const outputPath = join(dir, "audio.mp3");
    await writeFile(inputPath, Buffer.from(videoBytes));
    await extractAudioToPath(inputPath, outputPath, limits);
    return run({
      audioPath: outputPath,
      mimeType: DEFAULT_AUDIO_MIME_TYPE,
    });
  });
};

export const extractAudioFromVideoFile = async (
  videoBytes: Uint8Array,
  extension: string
): Promise<Uint8Array> => {
  return withExtractedAudioFromVideoFile(
    videoBytes,
    extension,
    async ({ audioPath }) => readAudioOutput(audioPath)
  );
};

export const withExtractedAudioFromVideoUrl = async <T>(
  videoUrl: string,
  run: (params: { audioPath: string; mimeType: string }) => Promise<T>,
  limits?: { maxBytes?: number; maxDurationSeconds?: number }
): Promise<T> => {
  const safeVideoUrl = (await assertSafeUrl(videoUrl)).toString();
  return withTempDir("ingest-video-url-", async (dir) => {
    const outputPath = join(dir, "audio.mp3");
    await extractAudioToPath(safeVideoUrl, outputPath, limits);
    return run({
      audioPath: outputPath,
      mimeType: DEFAULT_AUDIO_MIME_TYPE,
    });
  });
};

export const extractAudioFromVideoUrl = async (
  videoUrl: string
): Promise<Uint8Array> => {
  return withExtractedAudioFromVideoUrl(videoUrl, async ({ audioPath }) =>
    readAudioOutput(audioPath)
  );
};

export type ExtractedVideoKeyframe = {
  index: number;
  timestampMs: number;
  imageBase64: string;
};

const extractKeyframesFromPreparedInput = async (params: {
  dir: string;
  inputPath: string;
  intervalSeconds?: number;
  maxFrames?: number;
}): Promise<ExtractedVideoKeyframe[]> => {
  const intervalSeconds = Math.max(
    1,
    Math.floor(params.intervalSeconds ?? config.videoKeyframeIntervalSeconds)
  );
  const maxFrames = Math.max(
    1,
    params.maxFrames ?? config.videoKeyframeMaxFrames
  );
  const framesDir = join(params.dir, "frames");

  await mkdir(framesDir, { recursive: true });
  await runFfmpeg([
    "-y",
    "-i",
    params.inputPath,
    "-vf",
    `fps=1/${intervalSeconds},scale='min(960,iw)':-2`,
    "-q:v",
    "5",
    "-frames:v",
    String(maxFrames),
    join(framesDir, "frame-%04d.jpg"),
  ]);

  const files = (await readdir(framesDir))
    .filter((name) => name.endsWith(".jpg"))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, maxFrames);

  const keyframes: ExtractedVideoKeyframe[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (!file) continue;
    const imageBytes = await readFile(join(framesDir, file));
    keyframes.push({
      index,
      timestampMs: index * intervalSeconds * 1000,
      imageBase64: imageBytes.toString("base64"),
    });
  }

  return keyframes;
};

export const extractKeyframesFromVideoFile = async (
  videoBytes: Uint8Array,
  extension: string,
  options?: { intervalSeconds?: number; maxFrames?: number }
): Promise<ExtractedVideoKeyframe[]> => {
  return withTempDir("ingest-video-frames-", async (dir) => {
    const inputPath = join(dir, `input.${sanitizeVideoExtension(extension)}`);
    await writeFile(inputPath, Buffer.from(videoBytes));
    return extractKeyframesFromPreparedInput({
      dir,
      inputPath,
      intervalSeconds: options?.intervalSeconds,
      maxFrames: options?.maxFrames,
    });
  });
};

export const extractKeyframesFromVideoUrl = async (
  videoUrl: string,
  options?: { intervalSeconds?: number; maxFrames?: number }
): Promise<ExtractedVideoKeyframe[]> => {
  const safeVideoUrl = (await assertSafeUrl(videoUrl)).toString();
  return withTempDir("ingest-video-url-frames-", async (dir) => {
    return extractKeyframesFromPreparedInput({
      dir,
      inputPath: safeVideoUrl,
      intervalSeconds: options?.intervalSeconds,
      maxFrames: options?.maxFrames,
    });
  });
};
