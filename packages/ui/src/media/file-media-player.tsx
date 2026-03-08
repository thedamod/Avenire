"use client";

import * as React from "react";
import { cn } from "../lib/utils";
import {
  MediaPlayer,
  MediaPlayerAudio,
  MediaPlayerCaptions,
  MediaPlayerControls,
  MediaPlayerControlsOverlay,
  MediaPlayerDownload,
  MediaPlayerError,
  MediaPlayerFullscreen,
  MediaPlayerLoading,
  MediaPlayerLoop,
  MediaPlayerPiP,
  MediaPlayerPlay,
  MediaPlayerSeek,
  MediaPlayerSeekBackward,
  MediaPlayerSeekForward,
  MediaPlayerSettings,
  MediaPlayerTime,
  MediaPlayerVideo,
  MediaPlayerVolume,
} from "./media";

interface FileMediaPlayerProps {
  className?: string;
  kind: "audio" | "video";
  mimeType?: string | null;
  name: string;
  openedCached?: boolean;
  onError?: () => void;
  src: string;
}

export function FileMediaPlayer({
  className,
  kind,
  mimeType,
  name,
  openedCached = false,
  onError,
  src,
}: FileMediaPlayerProps) {
  const isVideo = kind === "video";
  const mediaRef = React.useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const [autoplayMuted, setAutoplayMuted] = React.useState(false);
  // Keep startup fast for large media while still allowing warmed sessions to
  // begin quickly.
  const preloadStrategy = isVideo ? "metadata" : openedCached ? "auto" : "metadata";

  React.useEffect(() => {
    setAutoplayMuted(false);
  }, [src]);

  React.useEffect(() => {
    const media = mediaRef.current;
    if (!media || !isVideo) {
      return;
    }

    let cancelled = false;

    const attempt = async () => {
      if (cancelled) return;
      try {
        media.muted = false;
        await media.play();
      } catch {
        if (cancelled) return;
        try {
          media.muted = true;
          setAutoplayMuted(true);
          await media.play();
        } catch {
          // Browser requires explicit user gesture.
        }
      }
    };

    if (media.readyState >= 1) {
      void attempt();
      return () => {
        cancelled = true;
      };
    }

    const onLoadedMetadata = () => {
      void attempt();
    };
    media.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });

    return () => {
      cancelled = true;
      media.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [isVideo, src]);

  return (
    <div className={cn("w-full rounded-2xl border border-border/70 bg-card p-3 shadow-sm", className)}>
      <MediaPlayer autoHide={isVideo} className="rounded-xl border border-border/70 bg-black">
        {isVideo ? (
          <MediaPlayerVideo
            autoPlay
            className="h-auto max-h-[70vh] w-full"
            key={src}
            muted={autoplayMuted}
            onError={() => onError?.()}
            preload={preloadStrategy}
            ref={mediaRef as React.Ref<HTMLVideoElement>}
            src={src}
          >
            {mimeType ? <source key={src} src={src} type={mimeType} /> : null}
          </MediaPlayerVideo>
        ) : (
          <div className="space-y-3 bg-muted/20 p-4">
            <p className="line-clamp-1 font-medium text-foreground text-sm">{name}</p>
            <MediaPlayerAudio
              key={src}
              onError={() => onError?.()}
              preload={preloadStrategy}
              ref={mediaRef as React.Ref<HTMLAudioElement>}
              src={src}
            >
              {mimeType ? <source key={src} src={src} type={mimeType} /> : null}
            </MediaPlayerAudio>
          </div>
        )}

        <MediaPlayerLoading />
        <MediaPlayerError />
        {isVideo ? <MediaPlayerControlsOverlay /> : null}

        <MediaPlayerControls className={cn("gap-2", isVideo ? "" : "relative opacity-100")}>
          <MediaPlayerPlay />
          <MediaPlayerSeekBackward />
          <div className="min-w-0 flex-1">
            <MediaPlayerSeek />
          </div>
          <MediaPlayerSeekForward />
          <MediaPlayerTime />
          <MediaPlayerVolume expandable={isVideo} />
          <MediaPlayerLoop />
          <MediaPlayerDownload />
          {isVideo ? (
            <>
              <MediaPlayerCaptions />
              <MediaPlayerPiP />
              <MediaPlayerSettings />
              <MediaPlayerFullscreen />
            </>
          ) : null}
        </MediaPlayerControls>
      </MediaPlayer>
    </div>
  );
}
