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

const runFfprobe = async (args: string[]): Promise<string> => {
  return await new Promise<string>((resolve, reject) => {
    const proc = spawn('ffprobe', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdoutText = '';
    let stderrText = '';

    proc.stdout.on('data', chunk => {
      stdoutText += chunk.toString();
    });
    proc.stderr.on('data', chunk => {
      stderrText += chunk.toString();
    });
    proc.on('error', error => reject(error));
    proc.on('close', code => {
      if (code === 0) {
        resolve(stdoutText.trim());
        return;
      }

      reject(new Error(`ffprobe failed (${code}): ${stderrText}`));
    });
  });
};

export const getMediaDurationSeconds = async (
  inputPathOrUrl: string,
): Promise<number | null> => {
  try {
    const output = await runFfprobe([
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      inputPathOrUrl,
    ]);
    const value = Number.parseFloat(output);
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }
    return value;
  } catch {
    return null;
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

export type ExtractedAudioSegment = {
  index: number;
  startMs: number;
  bytes: Uint8Array;
};

const extractKeyframesFromPreparedInput = async (params: {
  dir: string;
  inputPath: string;
  intervalSeconds?: number;
  maxFrames?: number;
  durationSeconds?: number | null;
}): Promise<ExtractedVideoKeyframe[]> => {
  const requestedIntervalSeconds = Math.max(
    1,
    Math.floor(params.intervalSeconds ?? config.videoKeyframeIntervalSeconds),
  );
  const maxFrames = Math.max(1, params.maxFrames ?? config.videoKeyframeMaxFrames);
  let intervalSeconds = requestedIntervalSeconds;
  if (params.durationSeconds && params.durationSeconds > 0) {
    const projectedFrames = params.durationSeconds / intervalSeconds;
    if (projectedFrames > maxFrames) {
      intervalSeconds = Math.max(
        intervalSeconds,
        Math.ceil(params.durationSeconds / maxFrames),
      );
    }
  }
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
    const durationSeconds = await getMediaDurationSeconds(inputPath);
    return extractKeyframesFromPreparedInput({
      dir,
      inputPath,
      intervalSeconds: options?.intervalSeconds,
      maxFrames: options?.maxFrames,
      durationSeconds,
    });
  });
};

export const extractKeyframesFromVideoUrl = async (
  videoUrl: string,
  options?: { intervalSeconds?: number; maxFrames?: number },
): Promise<ExtractedVideoKeyframe[]> => {
  return withTempDir('ingest-video-url-frames-', async dir => {
    const durationSeconds = await getMediaDurationSeconds(videoUrl);
    return extractKeyframesFromPreparedInput({
      dir,
      inputPath: videoUrl,
      intervalSeconds: options?.intervalSeconds,
      maxFrames: options?.maxFrames,
      durationSeconds,
    });
  });
};

const extractAudioSegmentsFromPreparedInput = async (params: {
  dir: string;
  inputPath: string;
  segmentSeconds: number;
  maxSegments?: number;
}): Promise<ExtractedAudioSegment[]> => {
  const segmentSeconds = Math.max(30, Math.floor(params.segmentSeconds));
  const outputPattern = join(params.dir, 'audio-%04d.mp3');
  await runFfmpeg([
    '-y',
    '-i',
    params.inputPath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-f',
    'segment',
    '-segment_time',
    String(segmentSeconds),
    '-reset_timestamps',
    '1',
    '-map',
    '0:a:0',
    outputPattern,
  ]);

  const files = (await readdir(params.dir))
    .filter(name => name.startsWith('audio-') && name.endsWith('.mp3'))
    .sort((a, b) => a.localeCompare(b));

  const limited =
    typeof params.maxSegments === 'number'
      ? files.slice(0, Math.max(1, params.maxSegments))
      : files;

  const segments: ExtractedAudioSegment[] = [];
  for (let index = 0; index < limited.length; index += 1) {
    const file = limited[index];
    if (!file) continue;
    const bytes = await readFile(join(params.dir, file));
    segments.push({
      index,
      startMs: index * segmentSeconds * 1000,
      bytes: new Uint8Array(bytes),
    });
  }

  return segments;
};

export const extractAudioSegmentsFromVideoFile = async (
  videoBytes: Uint8Array,
  extension: string,
  options?: { segmentSeconds?: number; maxSegments?: number },
): Promise<ExtractedAudioSegment[]> => {
  return withTempDir('ingest-video-audio-segments-', async dir => {
    const inputPath = join(dir, `input.${extension || 'mp4'}`);
    await writeFile(inputPath, Buffer.from(videoBytes));
    return extractAudioSegmentsFromPreparedInput({
      dir,
      inputPath,
      segmentSeconds: options?.segmentSeconds ?? config.videoTranscriptionSegmentSeconds,
      maxSegments: options?.maxSegments ?? config.videoTranscriptionMaxSegments,
    });
  });
};

export const extractAudioSegmentsFromVideoUrl = async (
  videoUrl: string,
  options?: { segmentSeconds?: number; maxSegments?: number },
): Promise<ExtractedAudioSegment[]> => {
  return withTempDir('ingest-video-url-audio-segments-', async dir => {
    return extractAudioSegmentsFromPreparedInput({
      dir,
      inputPath: videoUrl,
      segmentSeconds: options?.segmentSeconds ?? config.videoTranscriptionSegmentSeconds,
      maxSegments: options?.maxSegments ?? config.videoTranscriptionMaxSegments,
    });
  });
};
