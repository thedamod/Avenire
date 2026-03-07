"use client";

type PreviewKind = "audio" | "image" | "pdf" | "video";
type WarmState = "cold" | "warm" | "warming";

const OPENED_FILES_MAX = 300;
const WARM_CACHE_MAX = 120;
const WARM_TTL_MS = 15 * 60 * 1000;

const openedFiles = new Map<string, number>();

interface WarmEntry {
  cleanup?: () => void;
  refs: number;
  state: WarmState;
  touchedAt: number;
}

const warmByUrl = new Map<string, WarmEntry>();

/**
 * Get the current Unix timestamp in milliseconds.
 *
 * @returns The current timestamp in milliseconds since the Unix epoch
 */
function now() {
  return Date.now();
}

/**
 * Reduces the openedFiles map to at most OPENED_FILES_MAX entries by removing the oldest entries.
 */
function pruneOpenedFiles() {
  while (openedFiles.size > OPENED_FILES_MAX) {
    const oldest = openedFiles.keys().next().value;
    if (!oldest) {
      return;
    }
    openedFiles.delete(oldest);
  }
}

/**
 * Removes stale or excess entries from the warm preview cache.
 *
 * Scans the `warmByUrl` cache and deletes entries whose `refs` are 0 and whose `touchedAt` is older than the configured TTL, calling an entry's `cleanup()` if present; if the cache still exceeds the configured maximum size, evicts oldest entries (also calling `cleanup()` when present) until the size limit is satisfied.
 */
function pruneWarmCache() {
  const cutoff = now() - WARM_TTL_MS;
  for (const [url, entry] of warmByUrl.entries()) {
    if (entry.refs === 0 && entry.touchedAt < cutoff) {
      entry.cleanup?.();
      warmByUrl.delete(url);
    }
  }

  while (warmByUrl.size > WARM_CACHE_MAX) {
    const oldest = warmByUrl.keys().next().value;
    if (!oldest) {
      return;
    }
    const entry = warmByUrl.get(oldest);
    entry?.cleanup?.();
    warmByUrl.delete(oldest);
  }
}

/**
 * Begins preloading metadata for an audio or video URL and updates the warm cache entry on success or failure.
 *
 * If metadata loads successfully, the associated warm cache entry (if present) is marked "warm", its cleanup is cleared, and its touched timestamp is updated. If loading fails and the entry has no refs the entry is removed; otherwise the entry is marked "cold", its cleanup is cleared, and its touched timestamp is updated.
 *
 * @param url - The media resource URL to preload metadata for
 * @param kind - Either `"audio"` or `"video"`, determines the media element created
 * @returns A cleanup function that aborts the preload and removes the created media element; if the preload has already settled, the cleanup is a no-op
 */
function warmMediaMetadata(url: string, kind: "audio" | "video") {
  const media = document.createElement(kind);
  media.preload = "metadata";
  media.muted = true;
  if (kind === "video") {
    (media as HTMLVideoElement).playsInline = true;
  }

  let settled = false;
  const resolveReady = () => {
    settled = true;
    const current = warmByUrl.get(url);
    if (current) {
      current.state = "warm";
      current.cleanup = undefined;
      current.touchedAt = now();
    }
    media.remove();
  };
  const resolveFailure = () => {
    settled = true;
    const current = warmByUrl.get(url);
    if (current && current.refs === 0) {
      warmByUrl.delete(url);
    } else if (current) {
      current.state = "cold";
      current.cleanup = undefined;
      current.touchedAt = now();
    }
    media.remove();
  };

  const onReady = () => resolveReady();
  const onError = () => resolveFailure();

  media.addEventListener("loadedmetadata", onReady, { once: true });
  media.addEventListener("error", onError, { once: true });
  media.src = url;
  media.load();

  return () => {
    if (settled) {
      return;
    }
    media.removeEventListener("loadedmetadata", onReady);
    media.removeEventListener("error", onError);
    media.src = "";
    media.load();
    media.remove();
  };
}

/**
 * Record that a file was opened and update its last-access time.
 *
 * @param fileId - Identifier of the opened file
 */
export function markFileOpened(fileId: string) {
  openedFiles.delete(fileId);
  openedFiles.set(fileId, now());
  pruneOpenedFiles();
}

/**
 * Checks whether a file is recorded as opened in the local opened-files cache.
 *
 * @param fileId - The identifier of the file being queried.
 * @returns `true` if the file identifier is present in the opened-files cache, `false` otherwise.
 */
export function isFileOpenedCached(fileId: string) {
  return openedFiles.has(fileId);
}

/**
 * Initiates or increments a warm preview cache entry for a URL.
 *
 * Adds or updates an entry in the preview warm cache for `url` based on `kind`.
 * In browser contexts this will begin preloading metadata for audio/video previews
 * and mark non-media kinds as warm. Has no effect outside the browser or when `url` is empty.
 *
 * @param url - The resource URL to prime for preview
 * @param kind - The preview kind that determines preload behavior (`audio`, `video`, `image`, `pdf`, etc.)
 */
export async function primeFilePreview(url: string, kind: PreviewKind) {
  if (typeof window === "undefined" || !url) {
    return;
  }

  pruneWarmCache();

  const existing = warmByUrl.get(url);
  if (existing) {
    existing.refs += 1;
    existing.touchedAt = now();
    return;
  }

  const entry: WarmEntry = {
    refs: 1,
    state: "warming",
    touchedAt: now(),
  };
  warmByUrl.set(url, entry);

  if (kind === "audio" || kind === "video") {
    entry.cleanup = warmMediaMetadata(url, kind);
  } else {
    entry.state = "warm";
  }
}

/**
 * Releases a previously acquired preview prime for a URL, decrementing its reference count and triggering cleanup or cache pruning when references reach zero.
 *
 * @param url - The preview resource URL whose prime is being released
 */
export function releasePreviewPrime(url: string) {
  const entry = warmByUrl.get(url);
  if (!entry) {
    return;
  }

  entry.refs = Math.max(0, entry.refs - 1);
  entry.touchedAt = now();

  if (entry.refs > 0) {
    return;
  }

  if (entry.state === "warming") {
    entry.cleanup?.();
    warmByUrl.delete(url);
    return;
  }

  pruneWarmCache();
}

/**
 * Get the preview warm state for a given URL.
 *
 * If there is no cache entry, or the entry has zero references and its last-touch time
 * is older than the warm TTL, the entry is evicted (its `cleanup` is called if present)
 * and `"cold"` is returned.
 *
 * @param url - The preview resource URL to query
 * @returns The entry's `WarmState` (`"cold"`, `"warming"`, or `"warm"`). Returns `"cold"` when missing or after eviction due to TTL.
 */
export function getWarmState(url: string): WarmState {
  const entry = warmByUrl.get(url);
  if (!entry) {
    return "cold";
  }

  if (entry.refs === 0 && entry.touchedAt < now() - WARM_TTL_MS) {
    entry.cleanup?.();
    warmByUrl.delete(url);
    return "cold";
  }

  return entry.state;
}
