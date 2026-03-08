const DEFAULT_MEDIA_TYPE = "application/octet-stream";

const MEDIA_TYPE_ALIASES: Record<string, string> = {
  audio: "audio/*",
  image: "image/*",
  text: "text/plain",
  video: "video/*",
};

export function normalizeMediaType(value: string | null | undefined): string {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .split(";")[0]
    ?.trim();

  if (!normalized) {
    return DEFAULT_MEDIA_TYPE;
  }

  if (normalized.includes("/")) {
    return normalized;
  }

  return MEDIA_TYPE_ALIASES[normalized] ?? DEFAULT_MEDIA_TYPE;
}
