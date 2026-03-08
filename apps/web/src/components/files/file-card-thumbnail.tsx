"use client";

import { FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const iconClass = "h-4 w-4";
  const iconProps = {
    "aria-hidden": true,
    className: iconClass,
    fill: "currentColor",
    viewBox: "0 0 24 24",
  } as const;

  switch (fileType) {
    case "image":
      return (
        <svg {...iconProps}>
          <path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14h18zm-2 0H5l4.5-6 3.2 4.1 2.3-3.1L19 19zM8.5 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
        </svg>
      );
    case "video":
      return (
        <svg {...iconProps}>
          <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
        </svg>
      );
    case "document":
      return (
        <svg {...iconProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-8-6z" />
        </svg>
      );
    case "audio":
      return (
        <svg {...iconProps}>
          <path d="M12 3v9.28c-.47-.46-1.12-.75-1.84-.75-1.66 0-3 1.34-3 3s1.34 3 3 3c1.66 0 3-1.34 3-3V7h4V3h-4z" />
        </svg>
      );
    case "code":
      return (
        <svg {...iconProps}>
          <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z" />
        </svg>
      );
    case "archive":
      return (
        <svg {...iconProps}>
          <path d="M20.12 2.04H3.88c-1.04 0-1.88.84-1.88 1.88v15.16c0 1.04.84 1.88 1.88 1.88h16.24c1.04 0 1.88-.84 1.88-1.88V3.92c0-1.04-.84-1.88-1.88-1.88zm-8.06 13.52l-3.38-3.38h2.52V9.52h2.92v2.66h2.52l-3.38 3.38z" />
        </svg>
      );
    default:
      return (
        <svg {...iconProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-8-6z" />
        </svg>
      );
  }
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
    const timer = setInterval(() => {
      setTimeAgo(formatTimeAgo(lastUpdated));
    }, 30_000);
    return () => clearInterval(timer);
  }, [lastUpdated]);

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="mx-auto flex h-24 w-24 items-center justify-center">
        <div className="group relative h-[78px] w-[96px] overflow-hidden rounded-[10px] border border-border/60 bg-neutral-900 shadow-sm">
          {previewContent ? (
            <div className="h-full w-full">{previewContent}</div>
          ) : previewUrl ? (
            <img
              alt={name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              height={78}
              src={previewUrl}
              width={96}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center text-neutral-400 transition-colors group-hover:text-neutral-300">
              <div className="mb-1.5 h-7 w-7 opacity-60">{getFileIcon(fileType)}</div>
              <span className="px-2 text-center text-[10px] capitalize leading-none">{fileType}</span>
            </div>
          )}
          {previewContent || previewUrl ? (
            <div className="absolute inset-0 bg-black opacity-0 transition-opacity duration-300 group-hover:opacity-10" />
          ) : null}
        </div>
      </div>
      <div className="space-y-1">
        <p className="truncate font-medium text-sm" title={name}>
          {name}
        </p>
        <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <span className="shrink-0">{getFileIcon(fileType)}</span>
          <span className="capitalize">{fileType}</span>
          <span className="ml-auto tabular-nums">{timeAgo}</span>
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   VideoThumbnail
   Renders the first frame of a video file.
───────────────────────────────────────────── */
export function VideoThumbnail({
  src,
  mimeType,
  className,
  warm = false,
  openedCached = false,
}: {
  src: string;
  mimeType?: string | null;
  className?: string;
  warm?: boolean;
  openedCached?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

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

  if (failed) {
    return (
      <div className={cn("flex h-full w-full items-center justify-center bg-muted/70", className)}>
        <FileText className="size-8 text-violet-500" />
      </div>
    );
  }

  return (
    <video
      className={cn("h-full w-full object-cover", className)}
      muted
      onError={() => setFailed(true)}
      playsInline
      preload={warm || openedCached ? "metadata" : "none"}
      ref={videoRef}
    >
      <source src={src} type={mimeType ?? undefined} />
    </video>
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
      <div className={cn("flex h-full w-full items-center justify-center bg-muted/70", className)}>
        <FileText className="size-8 text-rose-500" />
      </div>
    );
  }

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/70">
          <FileText className="size-8 animate-pulse text-rose-400" />
        </div>
      )}
      <canvas
        className="h-full w-full object-contain"
        ref={canvasRef}
        style={{ opacity: ready ? 1 : 0, transition: "opacity 0.2s" }}
      />
    </div>
  );
}
