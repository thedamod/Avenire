"use client";

import type { MediaPlaybackSource } from "@avenire/ui/media";
import type { VideoDeliveryRecord, VideoDeliveryStatus } from "@/lib/file-data";

export type ProgressivePlaybackSource = Extract<
  MediaPlaybackSource,
  { kind: "progressive" }
>;

export interface MediaPlaybackDescriptor {
  fallbackSource: ProgressivePlaybackSource;
  posterUrl: string | null;
  preferredSource: MediaPlaybackSource;
  status: VideoDeliveryStatus;
}

export function buildProgressivePlaybackSource(
  url: string,
  mimeType?: string | null
): ProgressivePlaybackSource {
  return {
    kind: "progressive",
    mimeType: mimeType ?? undefined,
    url,
  };
}

export function buildVideoPlaybackDescriptor(input: {
  fallbackUrl: string;
  mimeType?: string | null;
  videoDelivery?: VideoDeliveryRecord | null;
}): MediaPlaybackDescriptor {
  const fallbackSource = buildProgressivePlaybackSource(
    input.fallbackUrl,
    input.mimeType
  );
  const preferredSource =
    input.videoDelivery?.status === "ready" &&
    input.videoDelivery.hls?.manifestUrl
      ? {
          fallbackUrl: fallbackSource.url,
          kind: "hls" as const,
          manifestUrl: input.videoDelivery.hls.manifestUrl,
          mimeType: input.mimeType ?? undefined,
          playbackId: input.videoDelivery.mux?.playbackId ?? undefined,
          provider: input.videoDelivery.mux?.playbackId
            ? ("mux" as const)
            : ("generic" as const),
        }
      : fallbackSource;

  return {
    fallbackSource,
    posterUrl: input.videoDelivery?.poster?.url ?? null,
    preferredSource,
    status: input.videoDelivery?.status ?? "ready",
  };
}

export function getPlaybackSourceCacheKey(playbackSource: MediaPlaybackSource) {
  return playbackSource.kind === "hls"
    ? `hls:${playbackSource.manifestUrl}`
    : `progressive:${playbackSource.url}`;
}

export function getPlaybackSourcePrimaryUrl(
  playbackSource: MediaPlaybackSource
) {
  return playbackSource.kind === "hls"
    ? playbackSource.manifestUrl
    : playbackSource.url;
}
