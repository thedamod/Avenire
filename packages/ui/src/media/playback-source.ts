"use client";

import type Hls from "hls.js";
import { useCallback, useEffect, useRef, useState } from "react";

const HLS_BACK_BUFFER_SECONDS = 30;
const HLS_BUFFER_SECONDS = 6;
const HLS_MAX_RECOVERY_ATTEMPTS = 1;

export interface MediaPlaybackQualityOption {
  bitrateKbps?: number;
  height?: number;
  id: string;
  label: string;
  width?: number;
}

export interface MediaPlaybackController {
  provider: "hls" | "mux" | "progressive";
  qualities: MediaPlaybackQualityOption[];
  selectedQualityId: string;
  setSelectedQualityId: (qualityId: string) => void;
}

export type MediaPlaybackSource =
  | {
      kind: "progressive";
      mimeType?: string;
      url: string;
    }
  | {
      fallbackUrl: string;
      kind: "hls";
      manifestUrl: string;
      mimeType?: string;
      playbackId?: string;
      provider?: "generic" | "mux";
    };

const DEFAULT_PLAYBACK_CONTROLLER: MediaPlaybackController = {
  provider: "progressive",
  qualities: [],
  selectedQualityId: "auto",
  setSelectedQualityId: () => undefined,
};

function setMediaUrl(
  media: HTMLAudioElement | HTMLVideoElement,
  nextUrl: string
) {
  if (media.src === nextUrl) {
    return;
  }
  media.src = nextUrl;
  media.load();
}

function resetMediaUrl(media: HTMLAudioElement | HTMLVideoElement) {
  media.removeAttribute("src");
  media.load();
}

function canUseNativeHls(media: HTMLAudioElement | HTMLVideoElement) {
  return media.canPlayType("application/vnd.apple.mpegurl") !== "";
}

export function useMediaPlaybackSource(input: {
  mediaRef: React.RefObject<HTMLAudioElement | HTMLVideoElement | null>;
  onError?: () => void;
  playbackSource: MediaPlaybackSource;
}) {
  const { mediaRef, onError, playbackSource } = input;
  const onErrorRef = useRef(onError);
  const hlsRef = useRef<Hls | null>(null);
  const [controllerState, setControllerState] =
    useState<MediaPlaybackController>(DEFAULT_PLAYBACK_CONTROLLER);
  const sourceKey =
    playbackSource.kind === "hls"
      ? `hls:${playbackSource.manifestUrl}|${playbackSource.fallbackUrl}`
      : `progressive:${playbackSource.url}`;

  const applyControllerState = useCallback(
    (input: Partial<Omit<MediaPlaybackController, "setSelectedQualityId">>) => {
      setControllerState((previous) => ({
        ...previous,
        ...input,
      }));
    },
    []
  );

  const setSelectedQualityId = useCallback(
    (qualityId: string) => {
      const hls = hlsRef.current;
      if (!hls) {
        return;
      }

      if (qualityId === "auto") {
        hls.currentLevel = -1;
        hls.nextLevel = -1;
        hls.loadLevel = -1;
        applyControllerState({ selectedQualityId: "auto" });
        return;
      }

      const nextLevel = Number.parseInt(qualityId, 10);
      if (!Number.isFinite(nextLevel) || nextLevel < 0) {
        return;
      }

      hls.loadLevel = nextLevel;
      hls.nextLevel = nextLevel;
      hls.currentLevel = nextLevel;
      applyControllerState({ selectedQualityId: String(nextLevel) });
    },
    [applyControllerState]
  );

  const updateQualityOptions = useCallback(
    (
      levels: Array<{
        bitrate?: number;
        height?: number;
        width?: number;
      }>,
      provider: "hls" | "mux",
      selectedQualityId: string
    ) => {
      const nextOptions: MediaPlaybackQualityOption[] = [
        {
          id: "auto",
          label: "Auto",
        },
        ...levels.map((level, index) => {
          const bitrateKbps =
            typeof level.bitrate === "number" && Number.isFinite(level.bitrate)
              ? Math.round(level.bitrate / 1000)
              : undefined;
          const height =
            typeof level.height === "number" && Number.isFinite(level.height)
              ? level.height
              : undefined;
          const width =
            typeof level.width === "number" && Number.isFinite(level.width)
              ? level.width
              : undefined;

          const labelParts: string[] = [];
          if (height) {
            labelParts.push(`${height}p`);
          } else if (width) {
            labelParts.push(`${width}w`);
          }
          if (bitrateKbps) {
            labelParts.push(`${bitrateKbps} kbps`);
          }

          return {
            bitrateKbps,
            height,
            id: String(index),
            label: labelParts.join(" · ") || `Level ${index + 1}`,
            width,
          };
        }),
      ];

      applyControllerState({
        provider,
        qualities: nextOptions,
        selectedQualityId,
      });
    },
    [applyControllerState]
  );

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) {
      return;
    }

    let cancelled = false;
    let fallbackApplied = false;
    let hlsInstance: Hls | null = null;

    const applyFallback = () => {
      if (fallbackApplied || playbackSource.kind !== "hls") {
        return;
      }
      fallbackApplied = true;
      setMediaUrl(media, playbackSource.fallbackUrl);
      applyControllerState({
        provider: playbackSource.provider === "mux" ? "mux" : "hls",
        qualities: [],
        selectedQualityId: "auto",
      });
    };

    const handleMediaError = () => {
      applyFallback();
      onErrorRef.current?.();
    };

    media.addEventListener("error", handleMediaError);

    if (playbackSource.kind === "progressive") {
      hlsRef.current = null;
      applyControllerState({
        provider: "progressive",
        qualities: [],
        selectedQualityId: "auto",
      });
      setMediaUrl(media, playbackSource.url);
      return () => {
        media.removeEventListener("error", handleMediaError);
      };
    }

    import("hls.js")
      .then((module) => {
        if (cancelled) {
          return;
        }

        const Hls = module.default;
        if (!Hls.isSupported()) {
          if (canUseNativeHls(media)) {
            hlsRef.current = null;
            applyControllerState({
              provider: playbackSource.provider === "mux" ? "mux" : "hls",
              qualities: [],
              selectedQualityId: "auto",
            });
            setMediaUrl(media, playbackSource.manifestUrl);
            return;
          }
          applyFallback();
          return;
        }

        const hls = new Hls({
          backBufferLength: HLS_BACK_BUFFER_SECONDS,
          capLevelToPlayerSize: media instanceof HTMLVideoElement,
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: HLS_BUFFER_SECONDS,
          maxMaxBufferLength: HLS_BUFFER_SECONDS * 2,
          startFragPrefetch: true,
          startLevel: 0,
          testBandwidth: false,
        });
        hlsInstance = hls;
        hlsRef.current = hls;
        let mediaRecoveryAttempts = 0;
        let networkRecoveryAttempts = 0;

        const provider = playbackSource.provider === "mux" ? "mux" : "hls";
        const syncQualities = () => {
          const selectedQualityId =
            typeof hls.currentLevel === "number" && hls.currentLevel >= 0
              ? String(hls.currentLevel)
              : "auto";
          updateQualityOptions(hls.levels ?? [], provider, selectedQualityId);
        };

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data?.fatal) {
            if (
              data.type === Hls.ErrorTypes.NETWORK_ERROR &&
              networkRecoveryAttempts < HLS_MAX_RECOVERY_ATTEMPTS
            ) {
              networkRecoveryAttempts += 1;
              hls.startLoad();
              return;
            }

            if (
              data.type === Hls.ErrorTypes.MEDIA_ERROR &&
              mediaRecoveryAttempts < HLS_MAX_RECOVERY_ATTEMPTS
            ) {
              mediaRecoveryAttempts += 1;
              hls.recoverMediaError();
              return;
            }

            applyFallback();
          }
        });
        hls.on(Hls.Events.MANIFEST_PARSED, syncQualities);
        hls.on(Hls.Events.LEVELS_UPDATED, syncQualities);
        hls.on(Hls.Events.LEVEL_SWITCHED, syncQualities);
        hls.attachMedia(media);
        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          if (cancelled) {
            return;
          }
          hls.loadSource(playbackSource.manifestUrl);
        });
      })
      .catch(() => {
        applyFallback();
      });

    return () => {
      cancelled = true;
      media.removeEventListener("error", handleMediaError);
      hlsInstance?.destroy();
      hlsRef.current = null;
      if (playbackSource.kind === "hls") {
        resetMediaUrl(media);
      }
    };
  }, [
    applyControllerState,
    mediaRef,
    sourceKey,
    updateQualityOptions,
    playbackSource,
  ]);

  return {
    ...controllerState,
    setSelectedQualityId,
  };
}
