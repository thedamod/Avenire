"use client";

import { type Ref, useEffect, useRef, useState } from "react";
import { Button } from "../components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/dropdown-menu";
import { cn } from "../lib/utils";
import {
  MediaPlayer,
  MediaPlayerCaptions,
  MediaPlayerControls,
  MediaPlayerControlsOverlay,
  MediaPlayerDownload,
  MediaPlayerError,
  MediaPlayerFullscreen,
  MediaPlayerLoading,
  MediaPlayerPlay,
  MediaPlayerSeek,
  MediaPlayerSeekBackward,
  MediaPlayerSeekForward,
  MediaPlayerSettings,
  MediaPlayerTime,
  MediaPlayerVideo,
  MediaPlayerVolume,
} from "./media";
import {
  type MediaPlaybackController,
  type MediaPlaybackSource,
  useMediaPlaybackSource,
} from "./playback-source";

interface FileMediaPlayerProps {
  activeRangeIndex?: number | null;
  captionsSrc?: string;
  className?: string;
  kind: "audio" | "video";
  name: string;
  onError?: () => void;
  openedCached?: boolean;
  playbackSource: MediaPlaybackSource;
  posterUrl?: string | null;
  retrievalRanges?: Array<{ endMs?: number | null; startMs: number }>;
  seekToMs?: number | null;
}

function PlaybackQualityMenu(input: {
  playbackController: MediaPlaybackController;
}) {
  const { playbackController } = input;
  if (playbackController.qualities.length <= 1) {
    return null;
  }

  const selectedLabel =
    playbackController.qualities.find(
      (quality) => quality.id === playbackController.selectedQualityId
    )?.label ?? "Auto";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className="h-8 min-w-[72px] px-2 text-white hover:bg-white/10 hover:text-white"
            size="sm"
            type="button"
            variant="ghost"
          />
        }
      >
        {selectedLabel}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {playbackController.qualities.map((quality) => (
          <DropdownMenuItem
            key={quality.id}
            onSelect={() => playbackController.setSelectedQualityId(quality.id)}
          >
            {quality.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FileMediaPlayer({
  activeRangeIndex,
  captionsSrc,
  className,
  kind,
  name,
  openedCached = false,
  onError,
  playbackSource,
  posterUrl,
  retrievalRanges,
  seekToMs,
}: FileMediaPlayerProps) {
  const isVideo = kind === "video";
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const [autoplayMuted, setAutoplayMuted] = useState(false);
  const preloadStrategy = openedCached ? "auto" : "metadata";

  const playbackController = useMediaPlaybackSource({
    mediaRef,
    onError,
    playbackSource,
  });

  useEffect(() => {
    setAutoplayMuted(false);
  }, [playbackSource]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!(media && typeof seekToMs === "number" && Number.isFinite(seekToMs))) {
      return;
    }

    const seekSeconds = Math.max(0, seekToMs / 1000);
    const applySeek = () => {
      media.currentTime = seekSeconds;
    };

    if (media.readyState >= 1) {
      applySeek();
      return;
    }

    media.addEventListener("loadedmetadata", applySeek, { once: true });
    return () => {
      media.removeEventListener("loadedmetadata", applySeek);
    };
  }, [seekToMs, playbackSource]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) {
      return;
    }

    let cancelled = false;

    const attempt = async () => {
      if (cancelled) {
        return;
      }
      try {
        media.muted = true;
        if (media instanceof HTMLVideoElement) {
          media.playsInline = true;
        }
        setAutoplayMuted(true);
        await media.play();
      } catch {
        if (cancelled) {
          return;
        }
        try {
          media.muted = false;
          setAutoplayMuted(false);
          await media.play();
        } catch {
          // Browser requires explicit user gesture.
        }
      }
    };

    if (media.readyState >= 1) {
      attempt().catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }

    const onLoadedMetadata = () => {
      attempt().catch(() => undefined);
    };
    media.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });

    return () => {
      cancelled = true;
      media.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [playbackSource]);

  if (!isVideo) {
    return (
      <div
        className={cn(
          "w-full rounded-2xl border border-border/70 bg-card p-3 shadow-sm",
          className
        )}
      >
        <div className="space-y-3 bg-muted/20 p-4">
          <p className="line-clamp-1 font-medium text-foreground text-sm">
            {name}
          </p>
          <audio
            autoPlay
            controls
            key={
              playbackSource.kind === "hls"
                ? playbackSource.manifestUrl
                : playbackSource.url
            }
            onError={() => onError?.()}
            preload={preloadStrategy}
            ref={mediaRef as Ref<HTMLAudioElement>}
          >
            <track
              default
              kind="captions"
              label="Empty captions"
              src="data:text/vtt;charset=utf-8,WEBVTT%0A%0A"
              srcLang="en"
            />
          </audio>
        </div>
      </div>
    );
  }

  const highlightRanges = retrievalRanges?.map((range) => ({
    endTime:
      typeof range.endMs === "number" && Number.isFinite(range.endMs)
        ? Math.max(0, range.endMs / 1000)
        : undefined,
    startTime: Math.max(0, range.startMs / 1000),
  }));

  return (
    <MediaPlayer
      autoHide
      className={cn(
        "w-full rounded-2xl border border-border/70 bg-card shadow-sm",
        className
      )}
      label={name}
    >
      <div className="relative w-full bg-black">
        <MediaPlayerVideo
          autoPlay
          className="h-auto max-h-[70vh] w-full bg-black object-contain"
          key={
            playbackSource.kind === "hls"
              ? playbackSource.manifestUrl
              : playbackSource.url
          }
          muted={autoplayMuted}
          onError={() => onError?.()}
          playsInline
          poster={posterUrl ?? undefined}
          preload={preloadStrategy}
          ref={mediaRef as Ref<HTMLVideoElement>}
        >
          {captionsSrc ? (
            <track
              default
              key={`${name}:captions`}
              kind="captions"
              label="English"
              src={captionsSrc}
              srcLang="en"
            />
          ) : null}
        </MediaPlayerVideo>
        <MediaPlayerControlsOverlay />
        <MediaPlayerLoading />
        <MediaPlayerError />
        <MediaPlayerControls className="flex-col items-stretch gap-3 p-3">
          <MediaPlayerSeek
            activeRangeIndex={activeRangeIndex ?? undefined}
            className="w-full"
            highlightRanges={highlightRanges}
            withTime={false}
          />
          <div className="flex items-center gap-1 rounded-xl bg-black/60 px-2 py-2 text-white backdrop-blur-sm">
            <MediaPlayerPlay className="text-white hover:bg-white/10 hover:text-white" />
            <MediaPlayerSeekBackward className="text-white hover:bg-white/10 hover:text-white" />
            <MediaPlayerSeekForward className="text-white hover:bg-white/10 hover:text-white" />
            <MediaPlayerTime className="min-w-[96px] text-white/80" />
            <div className="ml-auto flex items-center gap-1">
              <PlaybackQualityMenu playbackController={playbackController} />
              <MediaPlayerVolume className="text-white" />
              {captionsSrc ? (
                <MediaPlayerCaptions className="text-white hover:bg-white/10 hover:text-white" />
              ) : null}
              <MediaPlayerSettings className="text-white hover:bg-white/10 hover:text-white" />
              <MediaPlayerDownload className="text-white hover:bg-white/10 hover:text-white" />
              <MediaPlayerFullscreen className="text-white hover:bg-white/10 hover:text-white" />
            </div>
          </div>
        </MediaPlayerControls>
      </div>
    </MediaPlayer>
  );
}
