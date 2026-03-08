import { UTApi, UTFile } from "@avenire/storage";
import { spawn } from "node:child_process";
import { lookup } from "node:dns/promises";
import { mkdtemp, open, readFile, rm, stat } from "node:fs/promises";
import { isIP } from "node:net";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { isTrustedStorageUrl } from "@/lib/file-data";

const DOWNLOAD_TIMEOUT_MS = 60_000;
const DOWNLOAD_MAX_BYTES = 500 * 1024 * 1024;
const FFMPEG_TIMEOUT_MS = 3 * 60_000;
const DEFAULT_MAX_UPLOAD_BUFFER_BYTES = 500 * 1024 * 1024;
const parsedMaxUploadBufferBytes = Number.parseInt(
  process.env.VIDEO_OPTIMIZATION_MAX_UPLOAD_BUFFER_BYTES ?? "",
  10
);
const MAX_UPLOAD_BUFFER_BYTES =
  Number.isFinite(parsedMaxUploadBufferBytes) && parsedMaxUploadBufferBytes > 0
    ? parsedMaxUploadBufferBytes
    : DEFAULT_MAX_UPLOAD_BUFFER_BYTES;

interface OptimizeAndReuploadVideoInput {
  sourceUrl: string;
  sourceName: string;
}

interface OptimizedVideoUpload {
  storageKey: string;
  storageUrl: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

const VIDEO_OPT_FETCH_TIMEOUT_MS = Math.max(
  5000,
  Number.parseInt(process.env.VIDEO_OPT_FETCH_TIMEOUT_MS ?? "25000", 10),
);

function buildMp4Name(sourceName: string) {
  const trimmed = sourceName.trim();
  if (!trimmed) {
    return "video.mp4";
  }

  const extension = extname(trimmed);
  if (!extension) {
    return `${trimmed}.mp4`;
  }

  return `${trimmed.slice(0, -extension.length)}.mp4`;
}

async function runFfmpeg(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGKILL");
      reject(
        new Error(
          `ffmpeg timed out after ${FFMPEG_TIMEOUT_MS}ms\n${stderr}`.trim()
        )
      );
    }, FFMPEG_TIMEOUT_MS);

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
  });
}

export async function optimizeAndReuploadVideo(
  input: OptimizeAndReuploadVideoInput
): Promise<OptimizedVideoUpload | null> {
  if (!process.env.UPLOADTHING_TOKEN) {
    return null;
  }

  const sourceUrl = await validateSourceUrl(input.sourceUrl);
  const tempDir = await mkdtemp(join(tmpdir(), "avenire-video-opt-"));
  const sourcePath = join(tempDir, "input");
  const remuxPath = join(tempDir, "remuxed.mp4");
  const transcodePath = join(tempDir, "transcoded.mp4");

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, VIDEO_OPT_FETCH_TIMEOUT_MS);

    const response = await fetch(input.sourceUrl, {
      signal: controller.signal,
    }).finally(() => {
      clearTimeout(timer);
    });
    if (!response.ok || !response.body) {
      return null;
    }

    const sourceFile = await open(sourcePath, "w");
    const reader = response.body.getReader();
    let downloadedBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (!value) {
          continue;
        }
        downloadedBytes += value.byteLength;
        if (downloadedBytes > DOWNLOAD_MAX_BYTES) {
          throw new Error("Source video exceeds maximum download size");
        }
        await sourceFile.write(value);
      }
    } finally {
      await sourceFile.close();
      reader.releaseLock();
    }

    let optimizedPath = remuxPath;
    try {
      await runFfmpeg([
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        sourcePath,
        "-movflags",
        "+faststart",
        "-c",
        "copy",
        remuxPath,
      ]);
    } catch {
      optimizedPath = transcodePath;
      await runFfmpeg([
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        sourcePath,
        "-map",
        "0:v:0?",
        "-map",
        "0:a:0?",
        "-movflags",
        "+faststart",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        transcodePath,
      ]);
    }

    const optimizedStats = await stat(optimizedPath);
    const optimizedName = buildMp4Name(input.sourceName);
    // UTFile upload is buffered in memory here, so oversized transcodes are rejected early.
    if (optimizedStats.size > MAX_UPLOAD_BUFFER_BYTES) {
      throw new Error(
        `Optimized video exceeds upload buffer limit (${MAX_UPLOAD_BUFFER_BYTES} bytes)`
      );
    }
    const optimizedBytes = await readFile(optimizedPath);

    const utapi = new UTApi({ token: process.env.UPLOADTHING_TOKEN });
    const uploadResult = await utapi.uploadFiles(
      new UTFile([optimizedBytes], optimizedName, { type: "video/mp4" })
    );
    const result = Array.isArray(uploadResult) ? uploadResult[0] : uploadResult;
    const uploaded = result?.data;

    if (
      !uploaded ||
      typeof uploaded.key !== "string" ||
      typeof uploaded.ufsUrl !== "string"
    ) {
      return null;
    }

    return {
      storageKey: uploaded.key,
      storageUrl: uploaded.ufsUrl,
      name: optimizedName,
      mimeType: "video/mp4",
      sizeBytes: optimizedStats.size,
    };
  } catch {
    return null;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
