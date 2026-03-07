"use client";

import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Render a thumbnail showing the first frame of a video or a fallback icon on failure.
 *
 * When `warm` or `openedCached` is true the component will preload metadata and seek to the first frame
 * once metadata is available so the poster/frame is visible. On load error it renders a muted placeholder
 * with a file icon.
 *
 * @param mimeType - Optional MIME type for the video source; if omitted the source is used without a type.
 * @param warm - If true, preload metadata and attempt to seek to the first frame on mount.
 * @param openedCached - Treated like `warm`; used to trigger metadata preload and seeking when the item is known cached/opened.
 * @returns A JSX element: a `video` element showing the first frame, or a placeholder `div` with an icon if loading fails.
 */
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

/**
 * Renders the first page of a PDF into a canvas and shows a placeholder while loading or on error.
 *
 * Renders the PDF page at 1.5× scale for a higher-quality thumbnail. Dynamically loads and uses pdfjs to fetch and render the document; if rendering fails a centered icon placeholder is shown.
 *
 * @param src - URL of the PDF to render as a thumbnail
 * @param className - Optional additional CSS classes applied to the root container
 * @returns A React element containing the rendered canvas or a fallback placeholder when not ready or on failure
 */
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

    /**
     * Load the PDF at `src` and render its first page into the canvas referenced by `canvasRef` for use as a thumbnail.
     *
     * On success, marks the thumbnail as ready; on failure, marks it as failed. The function configures pdf.js's worker, renders the page at 1.5× scale for higher-quality output, and respects the `cancelled` flag to avoid updating state after unmount.
     */
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
