import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT_DIR =
  process.env.UPLOAD_SESSION_PARTS_DIR ??
  join(tmpdir(), "avenire-upload-session-parts");

function toSafeSessionSegment(sessionId: string) {
  return sessionId.replace(/[^a-zA-Z0-9-_]/g, "_");
}

function toSafePartNumber(partNumber: number) {
  return Math.max(1, Math.trunc(partNumber));
}

function getSessionDirectory(sessionId: string) {
  return join(ROOT_DIR, toSafeSessionSegment(sessionId));
}

function getPartPath(sessionId: string, partNumber: number) {
  const safePartNumber = toSafePartNumber(partNumber);
  return join(getSessionDirectory(sessionId), `${safePartNumber}.part`);
}

export async function writeMultipartPart(input: {
  sessionId: string;
  partNumber: number;
  bytes: Uint8Array;
}) {
  const dir = getSessionDirectory(input.sessionId);
  const partPath = getPartPath(input.sessionId, input.partNumber);
  await mkdir(dir, { recursive: true });
  await writeFile(partPath, input.bytes);

  const checksum = createHash("sha256")
    .update(input.bytes)
    .digest("hex");
  return {
    etag: checksum,
    partNumber: toSafePartNumber(input.partNumber),
    sizeBytes: input.bytes.byteLength,
  };
}

export async function listMultipartParts(sessionId: string) {
  const dir = getSessionDirectory(sessionId);
  const names = await readdir(dir).catch(() => [] as string[]);
  const parts = await Promise.all(
    names
      .map((name) => {
        const match = /^(\d+)\.part$/.exec(name);
        if (!match?.[1]) {
          return null;
        }
        return {
          fileName: name,
          partNumber: Number.parseInt(match[1], 10),
          path: join(dir, name),
        };
      })
      .filter((part): part is NonNullable<typeof part> => Boolean(part))
      .sort((a, b) => a.partNumber - b.partNumber)
      .map(async (part) => {
        const info = await stat(part.path).catch(() => null);
        if (!info || !info.isFile()) {
          return null;
        }
        return {
          ...part,
          sizeBytes: info.size,
        };
      })
  );

  return parts.filter((part): part is NonNullable<typeof part> => Boolean(part));
}

export async function assembleMultipartParts(sessionId: string) {
  const parts = await listMultipartParts(sessionId);
  if (parts.length === 0) {
    throw new Error("No uploaded multipart parts found.");
  }

  const buffers = await Promise.all(parts.map((part) => readFile(part.path)));
  const totalSize = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
  const merged = Buffer.concat(buffers, totalSize);
  const checksumSha256 = createHash("sha256").update(merged).digest("hex");

  return {
    buffer: merged,
    checksumSha256,
    partNumbers: parts.map((part) => part.partNumber),
    partCount: parts.length,
    totalSizeBytes: merged.byteLength,
  };
}

export async function clearMultipartParts(sessionId: string) {
  await rm(getSessionDirectory(sessionId), { recursive: true, force: true });
}
