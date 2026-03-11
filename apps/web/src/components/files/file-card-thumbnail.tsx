"use client";

import { useMediaPlaybackSource, type MediaPlaybackSource } from "@avenire/ui/media";
import { FileCode2, FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  primeMediaPlayback,
  releaseMediaPlaybackPrime,
  resolveCachedPlaybackSource,
} from "@/lib/file-preview-cache";
import { cn } from "@/lib/utils";

type FileCardType = "archive" | "audio" | "code" | "document" | "image" | "other" | "video";

interface FileCardProps {
  className?: string;
  fileType: FileCardType;
  lastUpdated: Date;
  name: string;
  previewContent?: React.ReactNode;
  previewUrl?: string;
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSecs < 60) {
    return "now";
  }
  if (diffMins < 60) {
    return `${diffMins}m`;
  }
  if (diffHours < 24) {
    return `${diffHours}h`;
  }
  if (diffDays < 7) {
    return `${diffDays}d`;
  }
  if (diffWeeks < 4) {
    return `${diffWeeks}w`;
  }
  if (diffMonths < 12) {
    return `${diffMonths}mo`;
  }
  return `${diffYears}y`;
}

function getFileIcon(fileType: FileCardType): React.ReactNode {
  if (fileType === "code") {
    return <FileCode2 aria-hidden="true" className="h-4 w-4" />;
  }

  const iconByType: Record<FileCardType, string> = {
    archive: "/icons/zip.svg",
    audio: "/icons/audio.svg",
    code: "/icons/_file.svg",
    document: "/icons/text.svg",
    image: "/icons/image.svg",
    other: "/icons/_file.svg",
    video: "/icons/video.svg",
  };

  return (
    <img
      alt=""
      aria-hidden="true"
      className="h-4 w-4"
      loading="lazy"
      src={iconByType[fileType]}
    />
  );
}

export function FileCard({
  className = "",
  fileType,
  lastUpdated,
  name,
  previewContent,
  previewUrl,
}: FileCardProps) {
  const [timeAgo, setTimeAgo] = useState(() => formatTimeAgo(lastUpdated));
  useEffect(() => {
    setTimeAgo(formatTimeAgo(lastUpdated));
    const interval = setInterval(() => {
      setTimeAgo(formatTimeAgo(lastUpdated));
    }, 60_000);
    return () => {
      clearInterval(interval);
    };
  }, [lastUpdated]);
  const hasPreview = Boolean(previewContent || previewUrl);

  return (
    <div className={cn("inline-flex w-full max-w-full flex-col items-center gap-2 overflow-hidden", className)}>
      <div
        className={cn(
          "group relative flex w-full min-w-0 items-center justify-center overflow-hidden rounded-xl border border-border/45 bg-muted/70 p-1.5",
          hasPreview ? "h-28" : "h-28 aspect-[4/3]"
        )}
      >
        {previewContent ? (
          <div className="h-full w-auto max-w-full overflow-hidden rounded-lg border border-border/50 bg-card/60 p-1 [&_canvas]:h-full [&_canvas]:w-auto [&_canvas]:rounded-md [&_img]:h-full [&_img]:w-auto [&_img]:rounded-md [&_img]:object-contain [&_video]:h-full [&_video]:w-auto [&_video]:rounded-md [&_video]:object-contain">
            {previewContent}
          </div>
        ) : previewUrl ? (
          <div className="h-full w-auto max-w-full overflow-hidden rounded-lg border border-border/50 bg-card/60 p-1">
            <img
              alt={name}
              className="h-full w-auto max-w-full rounded-md object-contain transition-transform duration-300 group-hover:scale-[1.02]"
              src={previewUrl}
            />
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center text-neutral-400 transition-colors group-hover:text-neutral-300">
            <div className="h-8 w-8 opacity-60">{getFileIcon(fileType)}</div>
          </div>
        )}
        {hasPreview ? (
          <div className="pointer-events-none absolute inset-0 bg-black opacity-0 transition-opacity duration-300 group-hover:opacity-10" />
        ) : null}
      </div>
      <div className="flex w-full min-w-0 max-w-full items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-muted-foreground">{getFileIcon(fileType)}</span>
          <span className="min-w-0 flex-1 truncate font-medium text-sm" title={name}>
            {name}
          </span>
        </div>
        <span className="shrink-0 tabular-nums text-muted-foreground text-xs">
          {timeAgo}
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   VideoThumbnail
   Renders the first frame of a video file.
───────────────────────────────────────────── */
export function VideoThumbnail({
  playbackSource,
  posterUrl,
  className,
  warm = false,
  openedCached = false,
  playOnHover = false,
  sizeBytes,
}: {
  playbackSource: MediaPlaybackSource;
  posterUrl?: string | null;
  className?: string;
  warm?: boolean;
  openedCached?: boolean;
  playOnHover?: boolean;
  sizeBytes?: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [resolvedPlaybackSource, setResolvedPlaybackSource] = useState(() =>
    resolveCachedPlaybackSource(playbackSource)
  );
  const [failed, setFailed] = useState(false);

  useMediaPlaybackSource({
    mediaRef: videoRef,
    onError: () => setFailed(true),
    playbackSource: resolvedPlaybackSource,
  });

  useEffect(() => {
    setFailed(false);
    setResolvedPlaybackSource(resolveCachedPlaybackSource(playbackSource));
  }, [playbackSource]);

  useEffect(() => {
    if (!(warm || openedCached || playOnHover)) {
      return;
    }

    void primeMediaPlayback(playbackSource, {
      mediaType: "video",
      posterUrl,
      sizeBytes,
      surface: "thumbnail",
    }).then(() => {
      setResolvedPlaybackSource(resolveCachedPlaybackSource(playbackSource));
    });

    return () => {
      releaseMediaPlaybackPrime(playbackSource);
    };
  }, [openedCached, playOnHover, playbackSource, posterUrl, sizeBytes, warm]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!warm && !openedCached) return;
    // Seek to first frame once metadata is ready.
    const onMeta = () => {
      video.currentTime = 0;
    };
    video.addEventListener("loadedmetadata", onMeta, { once: true });
    video.load();
    return () => video.removeEventListener("loadedmetadata", onMeta);
  }, [openedCached, warm]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (!playOnHover) {
      video.pause();
      video.currentTime = 0;
      return;
    }

    const startPlayback = async () => {
      try {
        video.loop = true;
        await video.play();
      } catch {
        // Ignore autoplay failures for previews.
      }
    };

    void startPlayback();

    return () => {
      video.pause();
      video.currentTime = 0;
    };
  }, [playOnHover, resolvedPlaybackSource]);

  if (failed) {
    return (
      <div className={cn("flex h-full w-auto items-center justify-center bg-muted/70", className)}>
        <FileText className="size-8 text-violet-500" />
      </div>
    );
  }

  return (
    <video
      className={cn("h-full w-auto object-contain", className)}
      muted
      onError={() => setFailed(true)}
      poster={posterUrl ?? undefined}
      playsInline
      preload={warm || openedCached || playOnHover ? "auto" : "none"}
      ref={videoRef}
    />
  );
}

/* ─────────────────────────────────────────────
   PdfThumbnail
   Renders the first page of a PDF onto a canvas.
───────────────────────────────────────────── */
export function PdfThumbnail({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        // Set worker (same as the full viewer)
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.mjs",
          import.meta.url,
        ).toString();

        const pdf = await pdfjsLib.getDocument({ url: src, verbosity: 0 }).promise;
        if (cancelled) return;

        const page = await pdf.getPage(1);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Render at 1.5× for a crisper thumbnail
        const scale = 1.5;
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (failed) {
    return (
      <div className={cn("flex h-full w-auto items-center justify-center bg-muted/70", className)}>
        <FileText className="size-8 text-rose-500" />
      </div>
    );
  }

  return (
    <div className={cn("relative h-full w-auto overflow-hidden", className)}>
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/70">
          <FileText className="size-8 text-rose-400" />
        </div>
      )}
      <canvas
        className="h-full w-auto object-contain"
        ref={canvasRef}
        style={{ opacity: ready ? 1 : 0, transition: "opacity 0.2s" }}
      />
    </div>
  );
}
