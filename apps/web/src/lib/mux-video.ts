const MUX_API_BASE_URL = "https://api.mux.com/video/v1";
const MUX_IMAGE_BASE_URL = "https://image.mux.com";
const MUX_STREAM_BASE_URL = "https://stream.mux.com";
const MUX_PLAYBACK_POLICY = "public";

export interface MuxAssetPlaybackId {
  id: string;
  policy: "drm" | "public" | "signed";
}

interface MuxAssetTrack {
  max_height?: number;
  max_width?: number;
  type?: string;
}

export interface MuxAsset {
  aspect_ratio?: string;
  created_at?: string;
  duration?: number;
  id: string;
  max_stored_resolution?: string;
  playback_ids?: MuxAssetPlaybackId[];
  resolution_tier?: string;
  status: string;
  tracks?: MuxAssetTrack[];
}

function getMuxCredentials() {
  const tokenId = (process.env.MUX_TOKEN_ID ?? "").trim();
  const tokenSecret = (process.env.MUX_TOKEN_SECRET ?? "").trim();
  if (!(tokenId && tokenSecret)) {
    return null;
  }
  return { tokenId, tokenSecret };
}

function getMuxAuthorizationHeader() {
  const credentials = getMuxCredentials();
  if (!credentials) {
    throw new Error("Mux credentials are not configured");
  }
  return `Basic ${Buffer.from(
    `${credentials.tokenId}:${credentials.tokenSecret}`
  ).toString("base64")}`;
}

async function muxRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${MUX_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: getMuxAuthorizationHeader(),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Mux request failed (${response.status}): ${body || response.statusText}`
    );
  }

  const payload = (await response.json()) as { data: T };
  return payload.data;
}

export function hasMuxVideoCredentials() {
  return Boolean(getMuxCredentials());
}

export async function createMuxAssetFromUrl(input: {
  passthrough?: string;
  sourceUrl: string;
}) {
  return await muxRequest<MuxAsset>("/assets", {
    body: JSON.stringify({
      inputs: [{ url: input.sourceUrl }],
      passthrough: input.passthrough,
      playback_policies: [MUX_PLAYBACK_POLICY],
      video_quality: "basic",
    }),
    method: "POST",
  });
}

export async function getMuxAsset(assetId: string) {
  return await muxRequest<MuxAsset>(`/assets/${assetId}`, {
    method: "GET",
  });
}

export function getMuxPlaybackId(asset: Pick<MuxAsset, "playback_ids">) {
  return (
    asset.playback_ids?.find((playbackId) => playbackId.policy === "public") ??
    asset.playback_ids?.[0] ??
    null
  );
}

export function buildMuxPlaybackUrl(playbackId: string) {
  return `${MUX_STREAM_BASE_URL}/${playbackId}.m3u8`;
}

export function buildMuxPosterUrl(playbackId: string) {
  return `${MUX_IMAGE_BASE_URL}/${playbackId}/thumbnail.jpg?time=1`;
}

export function getMuxAssetVideoTrack(asset: Pick<MuxAsset, "tracks">) {
  return asset.tracks?.find((track) => track.type === "video") ?? null;
}
