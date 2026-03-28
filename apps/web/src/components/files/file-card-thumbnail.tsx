"use client";

import {
  type MediaPlaybackSource,
  useMediaPlaybackSource,
} from "@avenire/ui/media";
import { FileCode as FileCode2, FileText } from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  primeMediaPlayback,
  releaseMediaPlaybackPrime,
  resolveCachedPlaybackSource,
} from "@/lib/file-preview-cache";
import { cn } from "@/lib/utils";

type FileCardType =
  | "archive"
  | "audio"
  | "code"
  | "document"
  | "image"
  | "other"
  | "video";

interface FileCardProps {
  className?: string;
  details?: Array<{
    label: string;
    value: string;
  }>;
  fileType: FileCardType;
  lastUpdated: Date;
  name: string;
  previewContent?: React.ReactNode;
  previewUrl?: string;
}

interface MarkdownThumbnailProps {
  className?: string;
  content?: string | null;
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

const MARKDOWN_FRONTMATTER_REGEX = /^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/;
const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;
const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;
const MARKDOWN_WIKILINK_REGEX = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g;
const MARKDOWN_INLINE_CODE_REGEX = /`([^`]+)`/g;
const MARKDOWN_HEADING_REGEX = /^\s{0,3}#{1,6}\s+/;
const MARKDOWN_BLOCKQUOTE_REGEX = /^\s{0,3}>\s?/;
const MARKDOWN_LIST_REGEX = /^\s{0,3}(?:[-*+]|(?:\d+\.))\s+/;
const MARKDOWN_HORIZONTAL_RULE_REGEX = /^\s{0,3}(?:[-*_]\s?){3,}$/;
const WHITESPACE_REGEX = /\s+/g;
const WORD_SPLIT_REGEX = /\s+/;
const THUMBNAIL_SURFACE_CLASS =
  "relative flex h-full w-full items-center justify-center overflow-hidden rounded-md";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function stripMarkdownFrontmatter(content: string) {
  return content.replace(MARKDOWN_FRONTMATTER_REGEX, "");
}

function normalizeMarkdownLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return "";
  }

  if (MARKDOWN_HORIZONTAL_RULE_REGEX.test(trimmed)) {
    return "";
  }

  const normalized = trimmed
    .replace(MARKDOWN_BLOCKQUOTE_REGEX, "")
    .replace(MARKDOWN_LIST_REGEX, "")
    .replace(MARKDOWN_HEADING_REGEX, "")
    .replace(MARKDOWN_IMAGE_REGEX, (_match, altText: string) => altText || "")
    .replace(MARKDOWN_LINK_REGEX, (_match, label: string) => label || "")
    .replace(
      MARKDOWN_WIKILINK_REGEX,
      (_match, target: string, label?: string) => (label ?? target).trim()
    )
    .replace(MARKDOWN_INLINE_CODE_REGEX, (_match, code: string) => code)
    .replace(/[*_~]/g, "")
    .replace(WHITESPACE_REGEX, " ")
    .trim();

  return normalized;
}

function wrapTextLine(text: string, maxChars: number) {
  const words = text.split(WORD_SPLIT_REGEX).filter(Boolean);
  if (words.length === 0) {
    return [];
  }

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
    }

    if (word.length > maxChars) {
      let remaining = word;
      while (remaining.length > maxChars) {
        lines.push(`${remaining.slice(0, maxChars - 1)}…`);
        remaining = remaining.slice(maxChars - 1);
      }
      current = remaining;
    } else {
      current = word;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function markdownToPreviewLines(markdown: string) {
  const normalized = stripMarkdownFrontmatter(markdown).replaceAll(
    "\r\n",
    "\n"
  );
  const rawLines = normalized.split("\n");
  const cleanedLines: string[] = [];
  let previousWasBlank = false;

  for (const rawLine of rawLines) {
    const line = normalizeMarkdownLine(rawLine);
    if (!line) {
      if (!previousWasBlank && cleanedLines.length > 0) {
        cleanedLines.push("");
      }
      previousWasBlank = true;
      continue;
    }

    cleanedLines.push(line);
    previousWasBlank = false;
  }

  while (cleanedLines.at(-1) === "") {
    cleanedLines.pop();
  }

  return cleanedLines;
}

function buildMarkdownThumbnailSvg(markdown: string, isDark: boolean) {
  const width = 400;
  const height = 250;
  const lines = markdownToPreviewLines(markdown);
  const headlineSource =
    lines.find((line) => line.length > 0) ?? "Untitled note";
  const headlineLines = wrapTextLine(headlineSource, 28).slice(0, 2);
  const bodySource = lines.slice(
    lines.findIndex((line) => line.length > 0) + 1
  );
  const bodyLines = bodySource
    .flatMap((line) => (line ? wrapTextLine(line, 40) : [""]))
    .slice(0, 7);
  const palette = isDark
    ? {
        bodyText: "#3a3a3a",
        innerFill: "#f7f4ee",
        innerStroke: "rgba(17, 24, 39, 0.08)",
        line: "rgba(17, 24, 39, 0.08)",
        outerStart: "#1b1b1b",
        outerEnd: "#232323",
        titleText: "#111827",
      }
    : {
        bodyText: "#4b5563",
        innerFill: "#fffdf8",
        innerStroke: "rgba(17, 24, 39, 0.08)",
        line: "rgba(17, 24, 39, 0.08)",
        outerStart: "#f7f3ea",
        outerEnd: "#efe9dc",
        titleText: "#111827",
      };
  const titleY = 46;
  const bodyY = 88;
  const titleLineHeight = 20;
  const bodyLineHeight = 15;

  const titleSvg = headlineLines
    .map(
      (line, index) =>
        `<text x="32" y="${titleY + index * titleLineHeight}" fill="${palette.titleText}" font-family="Inter, system-ui, sans-serif" font-size="15.5" font-weight="700" letter-spacing="-0.01em">${escapeXml(line)}</text>`
    )
    .join("");

  const bodySvg = bodyLines
    .map((line, index) => {
      if (!line) {
        return "";
      }
      return `<text x="32" y="${bodyY + index * bodyLineHeight}" fill="${palette.bodyText}" font-family="Inter, system-ui, sans-serif" font-size="11.25" font-weight="400">${escapeXml(line)}</text>`;
    })
    .join("");

  const lineDecorations = Array.from({ length: 6 }, (_unused, index) => {
    const y = 106 + index * 18;
    const widthMultiplier = [0.78, 0.94, 0.88, 0.72, 0.91, 0.64][index];
    const x2 = 32 + 304 * widthMultiplier;
    return `<line x1="32" y1="${y}" x2="${x2}" y2="${y}" stroke="${palette.line}" stroke-width="1" />`;
  }).join("");

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Markdown preview">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${palette.outerStart}" />
          <stop offset="100%" stop-color="${palette.outerEnd}" />
        </linearGradient>
        <filter id="pageShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#000000" flood-opacity="0.16" />
        </filter>
      </defs>
      <rect width="400" height="250" rx="18" fill="url(#bg)" />
      <rect x="20" y="14" width="360" height="222" rx="14" fill="${palette.innerFill}" filter="url(#pageShadow)" />
      <rect x="20" y="14" width="360" height="222" rx="14" fill="none" stroke="${palette.innerStroke}" />
      <rect x="32" y="28" width="46" height="6" rx="3" fill="${palette.line}" />
      <rect x="32" y="37" width="98" height="2" rx="1" fill="${palette.line}" opacity="0.65" />
      ${titleSvg}
      ${lineDecorations}
      ${bodySvg}
    </svg>`
  )}`;
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
      height={16}
      loading="lazy"
      src={iconByType[fileType]}
      width={16}
    />
  );
}

export function FileCard({
  className = "",
  details = [],
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
  let previewBody: React.ReactNode = null;

  if (previewContent) {
    previewBody = (
      <div className="h-full w-full overflow-hidden rounded-md [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:rounded-md [&_img]:h-full [&_img]:w-full [&_img]:rounded-md [&_img]:object-contain [&_video]:h-full [&_video]:w-full [&_video]:rounded-md [&_video]:object-contain">
        {previewContent}
      </div>
    );
  } else if (previewUrl) {
    previewBody = (
      <div className="h-full w-full overflow-hidden rounded-md">
        <img
          alt={name}
          className="h-full w-full rounded-md object-contain transition-transform duration-300 group-hover:scale-[1.02]"
          height={168}
          src={previewUrl}
          width={224}
        />
      </div>
    );
  } else {
    previewBody = (
      <div className="flex h-full w-full flex-col items-center justify-center text-neutral-400 transition-colors group-hover:text-neutral-300">
        <div className="h-8 w-8 opacity-60">{getFileIcon(fileType)}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex w-full max-w-full flex-col items-center gap-2 overflow-hidden",
        className
      )}
    >
      <div
        className={cn(
          "group relative flex w-full min-w-0 items-center justify-center overflow-hidden rounded-xl bg-muted/70",
          hasPreview ? "h-28" : "aspect-[4/3] h-28"
        )}
      >
        {previewBody}
        {hasPreview ? (
          <div className="pointer-events-none absolute inset-0 bg-black opacity-0 transition-opacity duration-300 group-hover:opacity-10" />
        ) : null}
      </div>
      <div className="flex w-full min-w-0 max-w-full items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-muted-foreground">
            {getFileIcon(fileType)}
          </span>
          <span
            className="min-w-0 flex-1 truncate font-medium text-sm"
            title={name}
          >
            {name}
          </span>
        </div>
        <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
          {timeAgo}
        </span>
      </div>
      {details.length > 0 ? (
        <div className="flex w-full min-w-0 flex-wrap gap-1.5">
          {details.map((detail) => (
            <span
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-background/75 px-2 py-0.5 text-[10px] text-muted-foreground leading-none"
              key={`${detail.label}:${detail.value}`}
              title={`${detail.label}: ${detail.value}`}
            >
              <span className="shrink-0 font-medium text-foreground/75">
                {detail.label}
              </span>
              <span className="min-w-0 truncate">{detail.value}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MarkdownThumbnail({
  className,
  content,
}: MarkdownThumbnailProps) {
  const { resolvedTheme } = useTheme();
  const markdownContent = typeof content === "string" ? content.trim() : "";
  const isDark = resolvedTheme === "dark";
  const previewSrc = useMemo(
    () =>
      markdownContent ? buildMarkdownThumbnailSvg(markdownContent, isDark) : "",
    [isDark, markdownContent]
  );

  return (
    <div className={cn(THUMBNAIL_SURFACE_CLASS, className)}>
      {previewSrc ? (
        <img
          alt=""
          aria-hidden="true"
          className="h-full w-full object-contain"
          height={250}
          src={previewSrc}
          width={400}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-md bg-muted/30 text-muted-foreground">
          <FileCode2 aria-hidden="true" className="size-4" />
        </div>
      )}
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

    primeMediaPlayback(playbackSource, {
      mediaType: "video",
      posterUrl,
      sizeBytes,
      surface: "thumbnail",
    })
      .then(() => {
        setResolvedPlaybackSource(resolveCachedPlaybackSource(playbackSource));
      })
      .catch(() => {
        // Ignore warmup failures for thumbnails.
      });

    return () => {
      releaseMediaPlaybackPrime(playbackSource);
    };
  }, [openedCached, playOnHover, playbackSource, posterUrl, sizeBytes, warm]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (!(warm || openedCached)) {
      return;
    }
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

    startPlayback().catch(() => {
      // Ignore playback bootstrap failures for thumbnails.
    });

    return () => {
      video.pause();
      video.currentTime = 0;
    };
  }, [playOnHover, resolvedPlaybackSource]);

  if (failed) {
    return (
      <div className={cn(THUMBNAIL_SURFACE_CLASS, className)}>
        <FileText className="size-8 text-violet-500" />
      </div>
    );
  }

  return (
    <div className={cn(THUMBNAIL_SURFACE_CLASS, className)}>
      <video
        className="h-full w-full object-contain"
        muted
        onError={() => setFailed(true)}
        playsInline
        poster={posterUrl ?? undefined}
        preload={warm || openedCached || playOnHover ? "auto" : "none"}
        ref={videoRef}
      />
    </div>
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

    async function loadPdfPage() {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.mjs",
        import.meta.url
      ).toString();

      const pdf = await pdfjsLib.getDocument({ url: src, verbosity: 0 })
        .promise;
      if (cancelled) {
        return null;
      }

      const page = await pdf.getPage(1);
      if (cancelled) {
        return null;
      }

      return page;
    }

    async function render() {
      try {
        const page = await loadPdfPage();
        if (!page) {
          return;
        }

        const canvas = canvasRef.current;
        if (!canvas) {
          return;
        }

        // Render at 1.5× for a crisper thumbnail
        const scale = 1.5;
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return;
        }

        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        if (!cancelled) {
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
        }
      }
    }

    render().catch(() => {
      if (!cancelled) {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (failed) {
    return (
      <div className={cn(THUMBNAIL_SURFACE_CLASS, className)}>
        <FileText className="size-8 text-rose-500" />
      </div>
    );
  }

  return (
    <div className={cn(THUMBNAIL_SURFACE_CLASS, className)}>
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/70">
          <FileText className="size-8 text-rose-400" />
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
