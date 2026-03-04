import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { config } from '../config';

const runFfmpeg = async (args: string[]): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('ffmpeg', args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderrText = '';

    proc.stderr.on('data', chunk => {
      stderrText += chunk.toString();
    });
    proc.on('error', error => reject(error));
    proc.on('close', code => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`ffmpeg failed (${code}): ${stderrText}`));
    });
  });
};

const withTempDir = async <T>(
  prefix: string,
  run: (dir: string) => Promise<T>,
): Promise<T> => {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

export const extractAudioFromVideoFile = async (
  videoBytes: Uint8Array,
  extension: string,
): Promise<Uint8Array> => {
  return withTempDir('ingest-video-', async dir => {
    const inputPath = join(dir, `input.${extension || 'mp4'}`);
    const outputPath = join(dir, 'audio.mp3');
    await writeFile(inputPath, Buffer.from(videoBytes));
    await runFfmpeg([
      '-y',
      '-i',
      inputPath,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-f',
      'mp3',
      outputPath,
    ]);

    return new Uint8Array(await readFile(outputPath));
  });
};

export const extractAudioFromVideoUrl = async (videoUrl: string): Promise<Uint8Array> => {
  return withTempDir('ingest-video-url-', async dir => {
    const outputPath = join(dir, 'audio.mp3');
    await runFfmpeg([
      '-y',
      '-i',
      videoUrl,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-f',
      'mp3',
      outputPath,
    ]);

    return new Uint8Array(await readFile(outputPath));
  });
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
    Math.floor(params.intervalSeconds ?? config.videoKeyframeIntervalSeconds),
  );
  const maxFrames = Math.max(1, params.maxFrames ?? config.videoKeyframeMaxFrames);
  const framesDir = join(params.dir, 'frames');

  await mkdir(framesDir, { recursive: true });
  await runFfmpeg([
    '-y',
    '-i',
    params.inputPath,
    '-vf',
    `fps=1/${intervalSeconds},scale='min(960,iw)':-2`,
    '-q:v',
    '5',
    '-frames:v',
    String(maxFrames),
    join(framesDir, 'frame-%04d.jpg'),
  ]);

  const files = (await readdir(framesDir))
    .filter(name => name.endsWith('.jpg'))
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
      imageBase64: imageBytes.toString('base64'),
    });
  }

  return keyframes;
};

export const extractKeyframesFromVideoFile = async (
  videoBytes: Uint8Array,
  extension: string,
  options?: { intervalSeconds?: number; maxFrames?: number },
): Promise<ExtractedVideoKeyframe[]> => {
  return withTempDir('ingest-video-frames-', async dir => {
    const inputPath = join(dir, `input.${extension || 'mp4'}`);
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
  options?: { intervalSeconds?: number; maxFrames?: number },
): Promise<ExtractedVideoKeyframe[]> => {
  return withTempDir('ingest-video-url-frames-', async dir => {
    return extractKeyframesFromPreparedInput({
      dir,
      inputPath: videoUrl,
      intervalSeconds: options?.intervalSeconds,
      maxFrames: options?.maxFrames,
    });
  });
};
