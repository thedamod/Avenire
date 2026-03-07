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

/**
 * Renders a styled media player for either video or audio sources.
 *
 * The component selects video or audio UI based on `kind`, applies a preload
 * strategy derived from `openedCached`, and forwards `onError` to the
 * underlying media element when playback errors occur.
 *
 * @param className - Optional additional CSS classes for the outer container
 * @param kind - "audio" or "video" to choose which media element and controls to render
 * @param mimeType - Optional MIME type for the media source
 * @param name - Display name shown for audio items
 * @param openedCached - When true, use `"auto"` preload; otherwise use `"metadata"`
 * @param onError - Callback invoked when the underlying media element emits an error
 * @param src - URL of the media source
 * @returns A React element that renders the configured media player
 */
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
  const preloadStrategy = openedCached ? "auto" : "metadata";

  return (
    <div className={cn("w-full rounded-2xl border border-border/70 bg-card p-3 shadow-sm", className)}>
      <MediaPlayer autoHide={isVideo} className="rounded-xl border border-border/70 bg-black">
        {isVideo ? (
          <MediaPlayerVideo
            className="h-auto max-h-[70vh] w-full"
            onError={() => onError?.()}
            preload={preloadStrategy}
          >
            <source src={src} type={mimeType ?? undefined} />
          </MediaPlayerVideo>
        ) : (
          <div className="space-y-3 bg-muted/20 p-4">
            <p className="line-clamp-1 font-medium text-foreground text-sm">{name}</p>
            <MediaPlayerAudio onError={() => onError?.()} preload={preloadStrategy}>
              <source src={src} type={mimeType ?? undefined} />
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
