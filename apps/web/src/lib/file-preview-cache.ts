"use client";

import type { MediaPlaybackSource } from "@avenire/ui/media";
import {
  getPlaybackSourceCacheKey,
  getPlaybackSourcePrimaryUrl,
} from "@/lib/media-playback";

type PreviewKind = "audio" | "image" | "pdf" | "video";
type WarmState = "cold" | "warm" | "warming";

const OPENED_FILES_MAX = 300;
const WARM_CACHE_MAX = 120;
const WARM_TTL_MS = 15 * 60 * 1000;
const PREVIEW_BLOB_CACHE_MAX_BYTES = 48 * 1024 * 1024;
const HLS_MAP_URI_PATTERN = /#EXT-X-MAP:.*URI="([^"]+)"/;
const PLAYLIST_LINE_SPLIT_PATTERN = /\r?\n/;

const openedFiles = new Map<string, number>();
const preconnectedOrigins = new Set<string>();

interface WarmEntry {
  cachedUrl?: string;
  cachePromise?: Promise<void>;
  cleanup?: () => void;
  refs: number;
  source: MediaPlaybackSource;
  state: WarmState;
  touchedAt: number;
}

const warmByKey = new Map<string, WarmEntry>();

function now() {
  return Date.now();
}

function getEntryKey(input: MediaPlaybackSource | string) {
  return typeof input === "string"
    ? `progressive:${input}`
    : getPlaybackSourceCacheKey(input);
}

function pruneOpenedFiles() {
  while (openedFiles.size > OPENED_FILES_MAX) {
    const oldest = openedFiles.keys().next().value;
    if (!oldest) {
      return;
    }
    openedFiles.delete(oldest);
  }
}

function disposeEntry(key: string, entry: WarmEntry) {
  entry.cleanup?.();
  if (entry.cachedUrl) {
    URL.revokeObjectURL(entry.cachedUrl);
  }
  warmByKey.delete(key);
}

function pruneWarmCache() {
  const cutoff = now() - WARM_TTL_MS;
  for (const [key, entry] of warmByKey.entries()) {
    if (entry.refs === 0 && entry.touchedAt < cutoff) {
      disposeEntry(key, entry);
    }
  }

  while (warmByKey.size > WARM_CACHE_MAX) {
    const oldest = warmByKey.keys().next().value;
    if (!oldest) {
      return;
    }
    const entry = warmByKey.get(oldest);
    if (!entry) {
      return;
    }
    disposeEntry(oldest, entry);
  }
}

function shouldCachePreviewBlob(
  mediaType: "audio" | "video" | null,
  sizeBytes?: number | null
) {
  return (
    mediaType === "video" &&
    typeof sizeBytes === "number" &&
    sizeBytes > 0 &&
    sizeBytes <= PREVIEW_BLOB_CACHE_MAX_BYTES
  );
}

function preconnectOrigin(url: string) {
  try {
    const origin = new URL(url).origin;
    if (preconnectedOrigins.has(origin)) {
      return;
    }
    preconnectedOrigins.add(origin);
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = origin;
    document.head.appendChild(link);
  } catch {
    // Ignore malformed URLs.
  }
}

function buildWarmFetchInit(signal?: AbortSignal): RequestInit {
  return {
    cache: "force-cache",
    credentials: "same-origin",
    ...(signal ? { signal } : {}),
  };
}

async function fetchText(url: string, signal?: AbortSignal) {
  const response = await fetch(url, buildWarmFetchInit(signal));
  if (!response.ok) {
    throw new Error(`Warm request failed: ${response.status}`);
  }
  return await response.text();
}

function parsePlaylistUris(playlistText: string, baseUrl: string) {
  return playlistText
    .split(PLAYLIST_LINE_SPLIT_PATTERN)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => new URL(line, baseUrl).toString());
}

function parseMapUri(playlistText: string, baseUrl: string) {
  const match = playlistText.match(HLS_MAP_URI_PATTERN);
  if (!match?.[1]) {
    return null;
  }
  return new URL(match[1], baseUrl).toString();
}

function parseWarmMediaUrls(playlistText: string, baseUrl: string) {
  const urls = parsePlaylistUris(playlistText, baseUrl).slice(0, 2);
  const initUrl = parseMapUri(playlistText, baseUrl);
  return initUrl ? [initUrl, ...urls] : urls;
}

function setWarmState(key: string, nextState: WarmState) {
  const current = warmByKey.get(key);
  if (!current) {
    return;
  }
  current.state = nextState;
  current.touchedAt = now();
}

function warmProgressiveMedia(input: {
  entry: WarmEntry;
  key: string;
  mediaType: "audio" | "video";
}) {
  const { entry, key, mediaType } = input;
  const media = document.createElement(mediaType);
  media.preload = "auto";
  media.muted = true;
  if (mediaType === "video") {
    (media as HTMLVideoElement).playsInline = true;
  }

  let settled = false;
  const resolveReady = () => {
    settled = true;
    setWarmState(key, "warm");
    media.remove();
  };
  const resolveFailure = () => {
    settled = true;
    const current = warmByKey.get(key);
    if (!current) {
      media.remove();
      return;
    }
    if (current.refs === 0) {
      disposeEntry(key, current);
    } else {
      current.cleanup = undefined;
      setWarmState(key, "cold");
    }
    media.remove();
  };

  const onReady = () => resolveReady();
  const onError = () => resolveFailure();

  media.addEventListener("loadeddata", onReady, { once: true });
  media.addEventListener("error", onError, { once: true });
  preconnectOrigin(
    entry.source.kind === "hls" ? entry.source.fallbackUrl : entry.source.url
  );
  media.src =
    entry.source.kind === "hls" ? entry.source.fallbackUrl : entry.source.url;
  media.load();

  return () => {
    if (settled) {
      return;
    }
    media.removeEventListener("loadeddata", onReady);
    media.removeEventListener("error", onError);
    media.src = "";
    media.load();
    media.remove();
  };
}

async function primePreviewBlob(key: string, entry: WarmEntry, url: string) {
  if (entry.cachedUrl || entry.cachePromise) {
    return;
  }

  entry.cachePromise = fetch(url, {
    ...buildWarmFetchInit(),
  })
    .then(async (response) => {
      if (!response.ok) {
        return;
      }

      const blob = await response.blob();
      const current = warmByKey.get(key);
      if (current !== entry) {
        return;
      }

      current.cachedUrl = URL.createObjectURL(blob);
      current.touchedAt = now();
    })
    .catch(() => undefined)
    .finally(() => {
      const current = warmByKey.get(key);
      if (current === entry) {
        current.cachePromise = undefined;
      }
    });

  await entry.cachePromise;
}

function warmHlsPlayback(input: {
  entry: WarmEntry;
  key: string;
  posterUrl?: string | null;
}) {
  const controller = new AbortController();
  const { entry, key, posterUrl } = input;
  const { manifestUrl } =
    entry.source.kind === "hls" ? entry.source : { manifestUrl: "" };

  entry.cachePromise = (async () => {
    try {
      preconnectOrigin(manifestUrl);
      const manifestText = await fetchText(manifestUrl, controller.signal);
      const playlistUrls = parsePlaylistUris(manifestText, manifestUrl);
      const mediaPlaylistUrl =
        playlistUrls.find((url) => url.endsWith(".m3u8")) ?? null;
      const mediaAssetUrls = mediaPlaylistUrl
        ? parseWarmMediaUrls(
            await fetchText(mediaPlaylistUrl, controller.signal),
            mediaPlaylistUrl
          )
        : parseWarmMediaUrls(manifestText, manifestUrl);

      await Promise.all([
        ...(mediaPlaylistUrl
          ? [
              fetch(
                mediaPlaylistUrl,
                buildWarmFetchInit(controller.signal)
              ).catch(() => undefined),
            ]
          : []),
        ...mediaAssetUrls.map((url) =>
          fetch(url, buildWarmFetchInit(controller.signal)).catch(
            () => undefined
          )
        ),
        posterUrl
          ? fetch(posterUrl, buildWarmFetchInit(controller.signal)).catch(
              () => undefined
            )
          : Promise.resolve(undefined),
      ]);

      setWarmState(key, "warm");
    } catch {
      const current = warmByKey.get(key);
      if (!current) {
        return;
      }
      if (current.refs === 0) {
        disposeEntry(key, current);
      } else {
        current.cleanup = undefined;
        setWarmState(key, "cold");
      }
    } finally {
      const current = warmByKey.get(key);
      if (current === entry) {
        current.cachePromise = undefined;
      }
    }
  })();

  return () => {
    controller.abort();
  };
}

export function markFileOpened(fileId: string) {
  openedFiles.delete(fileId);
  openedFiles.set(fileId, now());
  pruneOpenedFiles();
}

export function isFileOpenedCached(fileId: string) {
  return openedFiles.has(fileId);
}

export async function primeMediaPlayback(
  playbackSource: MediaPlaybackSource,
  options: {
    mediaType?: "audio" | "video";
    posterUrl?: string | null;
    sizeBytes?: number | null;
    surface?: "attachment" | "thumbnail" | "viewer";
  } = {}
) {
  if (typeof window === "undefined") {
    return;
  }

  pruneWarmCache();

  const key = getEntryKey(playbackSource);
  const existing = warmByKey.get(key);
  if (existing) {
    existing.refs += 1;
    existing.touchedAt = now();
    if (
      playbackSource.kind === "progressive" &&
      shouldCachePreviewBlob(options.mediaType ?? null, options.sizeBytes)
    ) {
      await primePreviewBlob(key, existing, playbackSource.url);
    }
    return;
  }

  const entry: WarmEntry = {
    refs: 1,
    source: playbackSource,
    state: "warming",
    touchedAt: now(),
  };
  warmByKey.set(key, entry);

  preconnectOrigin(getPlaybackSourcePrimaryUrl(playbackSource));
  if (playbackSource.kind === "progressive") {
    if (options.mediaType === "audio" || options.mediaType === "video") {
      entry.cleanup = warmProgressiveMedia({
        entry,
        key,
        mediaType: options.mediaType,
      });
    } else {
      entry.state = "warm";
    }
    if (shouldCachePreviewBlob(options.mediaType ?? null, options.sizeBytes)) {
      await primePreviewBlob(key, entry, playbackSource.url);
    }
    return;
  }

  entry.cleanup = warmHlsPlayback({
    entry,
    key,
    posterUrl: options.posterUrl,
  });
  await entry.cachePromise;
}

export async function primeFilePreview(
  url: string,
  kind: PreviewKind,
  options: { sizeBytes?: number | null } = {}
) {
  if (!(kind === "audio" || kind === "video")) {
    return;
  }

  await primeMediaPlayback(
    {
      kind: "progressive",
      url,
    },
    {
      mediaType: kind,
      sizeBytes: options.sizeBytes,
    }
  );
}

export function releaseMediaPlaybackPrime(
  playbackSource: MediaPlaybackSource | string
) {
  const key = getEntryKey(playbackSource);
  const entry = warmByKey.get(key);
  if (!entry) {
    return;
  }

  entry.refs = Math.max(0, entry.refs - 1);
  entry.touchedAt = now();

  if (entry.refs > 0) {
    return;
  }

  if (entry.state === "warming") {
    // Keep in-flight warm requests alive after a brief hover/open interaction.
    // This avoids repeated abort/restart churn and improves warm-hit rates.
    pruneWarmCache();
    return;
  }

  pruneWarmCache();
}

export function releasePreviewPrime(url: string) {
  releaseMediaPlaybackPrime(url);
}

export function getWarmState(
  playbackSource: MediaPlaybackSource | string
): WarmState {
  const key = getEntryKey(playbackSource);
  const entry = warmByKey.get(key);
  if (!entry) {
    return "cold";
  }

  if (entry.refs === 0 && entry.touchedAt < now() - WARM_TTL_MS) {
    disposeEntry(key, entry);
    return "cold";
  }

  return entry.state;
}

export function getCachedPreviewUrl(
  playbackSource: MediaPlaybackSource | string
) {
  const key = getEntryKey(playbackSource);
  return warmByKey.get(key)?.cachedUrl ?? null;
}

export function resolveCachedPlaybackSource(
  playbackSource: MediaPlaybackSource
): MediaPlaybackSource {
  if (playbackSource.kind !== "progressive") {
    return playbackSource;
  }

  const cachedUrl = getCachedPreviewUrl(playbackSource);
  if (!cachedUrl) {
    return playbackSource;
  }

  return {
    ...playbackSource,
    url: cachedUrl,
  };
}

export function getPlaybackCacheKey(playbackSource: MediaPlaybackSource) {
  return getPlaybackSourceCacheKey(playbackSource);
}
