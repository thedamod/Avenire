"use client";

import type { SearchResult } from "@anaralabs/lector";
import {
  AnnotationLayer,
  CanvasLayer,
  calculateHighlightRects,
  HighlightLayer,
  Page,
  Pages,
  Root,
  TextLayer,
  usePdf,
  usePdfJump,
  useSearch,
} from "@anaralabs/lector";
import type { PDFPageProxy } from "pdfjs-dist";
import { GlobalWorkerOptions } from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import { Button } from "@avenire/ui/components/button";
import { Input } from "@avenire/ui/components/input";
import { Separator } from "@avenire/ui/components/separator";
import { cn } from "@avenire/ui/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Minus,
  PanelLeft,
  Plus,
  Printer,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url,
).toString();

const THUMBNAIL_GAP = 12;
const THUMBNAIL_OVERSCAN_PX = 480;

function PdfSidebarThumbnail({
  isActive,
  pageNumber,
  pageProxy,
  width,
  height,
  onClick,
}: {
  isActive: boolean;
  pageNumber: number;
  pageProxy: PDFPageProxy;
  width: number;
  height: number;
  onClick: (pageNumber: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void | Promise<void> } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let cancelled = false;

    const render = async () => {
      try {
        renderTaskRef.current?.cancel();

        const viewport = pageProxy.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const scale = Math.min(width / viewport.width, height / viewport.height) * dpr;
        const scaledViewport = pageProxy.getViewport({ scale });

        canvas.width = Math.max(1, Math.floor(scaledViewport.width));
        canvas.height = Math.max(1, Math.floor(scaledViewport.height));

        const context = canvas.getContext("2d");
        if (!context) {
          return;
        }

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);

        const renderTask = pageProxy.render({
          canvas,
          canvasContext: context,
          viewport: scaledViewport,
        }) as { cancel: () => void | Promise<void>; promise: Promise<void> };
        renderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (error) {
        if (!(cancelled || (error instanceof Error && error.name === "RenderingCancelledException"))) {
          console.error("Failed to render PDF thumbnail:", error);
        }
      }
    };

    render().catch(() => undefined);

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [height, pageProxy, width]);

  return (
    <button
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex w-full flex-col gap-2 rounded-lg border bg-card p-2 text-left shadow-sm transition",
        isActive
          ? "border-ring ring-1 ring-ring/30"
          : "border-border/60 hover:border-ring/60",
      )}
      onClick={() => onClick(pageNumber)}
      type="button"
    >
      <div
        className="relative flex w-full items-center justify-center overflow-hidden rounded-md bg-muted/40"
        style={{ height }}
      >
        <canvas className="h-full w-auto max-w-full object-contain" ref={canvasRef} />
        <div className="pointer-events-none absolute top-2 left-2 rounded-full border border-border/60 bg-background/90 px-2 py-0.5 font-medium text-[11px] text-muted-foreground shadow-sm">
          {pageNumber}
        </div>
      </div>
    </button>
  );
}

function PdfThumbnailSidebar({
  currentPage,
  pageProxies,
}: {
  currentPage: number;
  pageProxies: PDFPageProxy[];
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const { jumpToPage } = usePdfJump();

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    const updateSize = () => {
      setViewportHeight(el.clientHeight);
      setViewportWidth(el.clientWidth);
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const thumbnails = useMemo(() => {
    const contentWidth = Math.max(viewportWidth - 16, 120);
    let top = 0;

    return pageProxies
      .map((pageProxy, index) => {
        const viewport = pageProxy.getViewport({ scale: 1 });
        const height = Math.max(
          132,
          Math.round((contentWidth * viewport.height) / Math.max(viewport.width, 1)),
        );
        const item = {
          height,
          index,
          pageNumber: index + 1,
          pageProxy,
          top,
          width: contentWidth,
        };
        top += height + THUMBNAIL_GAP;
        return item;
      })
      .filter((item) => item.pageProxy);
  }, [pageProxies, viewportWidth]);

  const lastThumbnail = thumbnails.at(-1);
  const totalHeight = lastThumbnail ? lastThumbnail.top + lastThumbnail.height : 0;

  const visibleThumbnails = useMemo(() => {
    const start = Math.max(0, scrollTop - THUMBNAIL_OVERSCAN_PX);
    const end = scrollTop + viewportHeight + THUMBNAIL_OVERSCAN_PX;
    return thumbnails.filter((item) => item.top <= end && item.top + item.height >= start);
  }, [scrollTop, thumbnails, viewportHeight]);

  return (
    <aside className="flex h-full min-h-0 w-[min(18rem,85vw)] overflow-hidden border-border border-r bg-muted/20">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-border/70 border-b px-3 py-2 font-medium text-muted-foreground text-xs">
          Thumbnails
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          ref={scrollRef}
        >
          <div className="relative" style={{ height: totalHeight + 24 }}>
            {visibleThumbnails.map((item) => (
              <div className="absolute right-2 left-2" key={item.pageNumber} style={{ top: item.top + 12 }}>
                <PdfSidebarThumbnail
                  height={item.height}
                  isActive={currentPage === item.pageNumber}
                  onClick={(pageNumber) => jumpToPage(pageNumber, { behavior: "auto" })}
                  pageNumber={item.pageNumber}
                  pageProxy={item.pageProxy}
                  width={item.width}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

function PDFViewerContent({
  source,
  fallbackHighlightText,
  highlightPage,
  highlightText,
}: {
  source: string;
  fallbackHighlightText?: string | null;
  highlightPage?: number | null;
  highlightText?: string | null;
}) {
  const currentPage = usePdf((state) => state.currentPage);
  const totalPages = usePdf((state) => state.pdfDocumentProxy?.numPages ?? 0);
  const pdfProxy = usePdf((state) => state.pdfDocumentProxy);
  const pageProxies = usePdf((state) => state.pageProxies ?? []);
  const updateZoom = usePdf((state) => state.updateZoom);
  const zoomLevel = usePdf((state) => state.zoom);
  const { jumpToPage } = usePdfJump();
  const { jumpToHighlightRects } = usePdfJump();
  const { search, textContent } = useSearch();
  const setHighlight = usePdf((state) => state.setHighlight);
  const getPdfPageProxy = usePdf((state) => state.getPdfPageProxy);

  const [showThumbnails, setShowThumbnails] = useState(false);
  const [pageInput, setPageInput] = useState("");
  const [isPageInputDirty, setIsPageInputDirty] = useState(false);
  const [zoomInput, setZoomInput] = useState("");
  const [isZoomInputDirty, setIsZoomInputDirty] = useState(false);

  const pageInputRef = useRef<HTMLInputElement | null>(null);
  const zoomInputRef = useRef<HTMLInputElement | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);

  const didNudgeZoom = useRef(false);
  const fileName = useMemo(() => {
    try {
      const url = new URL(source);
      const lastSegment = url.pathname.split("/").filter(Boolean).pop();
      return lastSegment ?? "document.pdf";
    } catch {
      return "document.pdf";
    }
  }, [source]);

  const resolvedPageInput =
    isPageInputDirty ? pageInput : String(currentPage && currentPage > 0 ? currentPage : 1);
  const resolvedZoomInput =
    isZoomInputDirty ? zoomInput : String(Math.round((zoomLevel || 1) * 100));

  // Workaround: nudge zoom by +0.01 then -0.01 after pdfProxy is ready to force
  // an initial renderer reflow; didNudgeZoom prevents repeating this fixup.
  useEffect(() => {
    if (!pdfProxy || didNudgeZoom.current) {
      return;
    }
    didNudgeZoom.current = true;
    updateZoom((zoom) => Number((zoom + 0.01).toFixed(2)));
    requestAnimationFrame(() => {
      updateZoom((zoom) => Number((zoom - 0.01).toFixed(2)));
    });
  }, [pdfProxy, updateZoom]);

  useEffect(() => {
    const blurPageInput = () => pageInputRef.current?.blur();
    const blurZoomInput = () => zoomInputRef.current?.blur();
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        blurPageInput();
        blurZoomInput();
      }
    };
    window.addEventListener("blur", blurPageInput);
    window.addEventListener("blur", blurZoomInput);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("blur", blurPageInput);
      window.removeEventListener("blur", blurZoomInput);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const commitPageInput = useCallback(() => {
    const value = (isPageInputDirty ? pageInput : resolvedPageInput).trim();
    if (value === "") {
      setPageInput("");
      setIsPageInputDirty(false);
      return;
    }

    let nextPage = Number(value);
    if (!Number.isFinite(nextPage) || nextPage < 1) {
      setPageInput("");
      setIsPageInputDirty(false);
      return;
    }

    if (totalPages && nextPage > totalPages) {
      nextPage = totalPages;
    }

    jumpToPage(nextPage);
    setPageInput("");
    setIsPageInputDirty(false);
  }, [isPageInputDirty, jumpToPage, pageInput, resolvedPageInput, totalPages]);

  const commitZoomInput = useCallback(() => {
    const value = (isZoomInputDirty ? zoomInput : resolvedZoomInput).trim();
    if (value === "") {
      setZoomInput("");
      setIsZoomInputDirty(false);
      return;
    }

    const nextZoom = Number(value);
    if (!Number.isFinite(nextZoom) || nextZoom <= 0) {
      setZoomInput("");
      setIsZoomInputDirty(false);
      return;
    }

    updateZoom(Number((nextZoom / 100).toFixed(2)));
    setZoomInput("");
    setIsZoomInputDirty(false);
  }, [isZoomInputDirty, resolvedZoomInput, updateZoom, zoomInput]);

  const handleDownload = useCallback(async () => {
    try {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error("Download failed");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(source, "_blank", "noopener,noreferrer");
    }
  }, [fileName, source]);

  const handlePrint = useCallback(() => {
    const printWindow = window.open(source, "_blank", "noopener,noreferrer");
    if (!printWindow) {
      return;
    }
    const onLoad = () => printWindow.print();
    printWindow.addEventListener("load", onLoad, { once: true });
  }, [source]);

  const goToPreviousPage = useCallback(() => {
    if (!currentPage) {
      return;
    }
    jumpToPage(Math.max(1, currentPage - 1));
  }, [currentPage, jumpToPage]);

  const goToNextPage = useCallback(() => {
    if (!(currentPage && totalPages)) {
      return;
    }
    jumpToPage(Math.min(totalPages, currentPage + 1));
  }, [currentPage, jumpToPage, totalPages]);

  const zoomOut = useCallback(() => {
    updateZoom((zoom) => Math.max(0.1, Number((zoom - 0.1).toFixed(2))));
  }, [updateZoom]);

  const zoomIn = useCallback(() => {
    updateZoom((zoom) => Math.min(5, Number((zoom + 0.1).toFixed(2))));
  }, [updateZoom]);

  useEffect(() => {
    if (!(highlightPage || highlightText?.trim() || fallbackHighlightText?.trim())) {
      setHighlight([]);
      return;
    }

    let cancelled = false;

    const normalizeSearchText = (value: string): string =>
      value
        .replace(/\s+/g, " ")
        .replace(/[^\x20-\x7E]/g, " ")
        .trim();

    const buildSearchQueries = (): string[] => {
      const candidates: string[] = [];
      const primary = normalizeSearchText(highlightText ?? "");
      const fallback = normalizeSearchText(fallbackHighlightText ?? "");

      if (primary.length > 0) {
        candidates.push(primary);
        if (primary.length > 180) {
          candidates.push(primary.slice(0, 180).trim());
        }
      }

      if (fallback.length > 0) {
        candidates.push(fallback);
      }

      return Array.from(new Set(candidates.filter((value) => value.length > 0)));
    };

    const applyHighlight = async () => {
      if (typeof highlightPage === "number" && highlightPage > 0) {
        jumpToPage(highlightPage, { align: "center", behavior: "smooth" });
      }
      if ((textContent?.length ?? 0) === 0) {
        return;
      }
      const queries = buildSearchQueries();
      if (queries.length === 0) {
        return;
      }

      for (const query of queries) {
        const resultSet = search(query, { limit: 20, threshold: 0.35 });
        const candidates: SearchResult[] = [
          ...(resultSet.exactMatches ?? []),
          ...(resultSet.fuzzyMatches ?? []),
        ];

        const selected =
          (typeof highlightPage === "number" && highlightPage > 0
            ? candidates.find((item) => item.pageNumber === highlightPage)
            : undefined) ?? candidates[0];

        if (!(selected && !cancelled)) {
          continue;
        }

        const pageProxy = getPdfPageProxy(selected.pageNumber);
        const rects = await calculateHighlightRects(pageProxy, {
          pageNumber: selected.pageNumber,
          text: selected.text,
          matchIndex: selected.matchIndex,
          searchText: query,
        });

        if (!(rects.length > 0) || cancelled) {
          continue;
        }

        setHighlight(rects);
        jumpToHighlightRects(rects, "pixels", "center", -50);
        return;
      }
    };

    applyHighlight().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [
    fallbackHighlightText,
    getPdfPageProxy,
    highlightPage,
    highlightText,
    jumpToHighlightRects,
    jumpToPage,
    search,
    setHighlight,
    textContent,
  ]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) {
      return;
    }
    const links = viewer.querySelectorAll<HTMLAnchorElement>(".annotationLayer a[href]");
    for (const link of links) {
      if (!link.getAttribute("href")?.startsWith("#")) {
        link.target = "_blank";
        link.rel = "noreferrer noopener";
      }
      link.classList.add("pdf-viewer-link");
    }
  }, [currentPage, pdfProxy, textContent]);

  return (
    <div className="flex h-full flex-col" ref={viewerRef}>
      <div className="flex items-center justify-between gap-3 border-border border-b bg-muted/40 px-3 py-2 text-xs sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            aria-label={showThumbnails ? "Hide thumbnails" : "Show thumbnails"}
            onClick={() => setShowThumbnails((show) => !show)}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <PanelLeft className="size-4" />
          </Button>
          <span className="max-w-[15rem] truncate font-medium text-foreground">
            {fileName}
          </span>
        </div>

        <div className="flex flex-1 items-center justify-center gap-2">
          <Button aria-label="Previous page" onClick={goToPreviousPage} size="icon-sm" type="button" variant="outline">
            <ChevronLeft className="size-4" />
          </Button>

          <Input
            aria-label="Page number"
            className="h-7 w-14 text-center text-xs"
            inputMode="numeric"
            onBlur={commitPageInput}
            onChange={(event) => {
              const digitsOnly = event.target.value.replace(/\D+/g, "");
              setIsPageInputDirty(true);
              setPageInput(digitsOnly);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitPageInput();
                pageInputRef.current?.blur();
              }
            }}
            pattern="[0-9]*"
            ref={pageInputRef}
            value={resolvedPageInput}
          />
          <span className="text-muted-foreground">/</span>
          <span className="min-w-4 text-center text-muted-foreground">{totalPages || "-"}</span>

          <Button aria-label="Next page" onClick={goToNextPage} size="icon-sm" type="button" variant="outline">
            <ChevronRight className="size-4" />
          </Button>

          <Separator className="mx-1 h-5" orientation="vertical" />

          <Button aria-label="Zoom out" onClick={zoomOut} size="icon-xs" type="button" variant="outline">
            <Minus className="size-3.5" />
          </Button>
          <Input
            aria-label="Zoom percentage"
            className="h-6 w-12 text-center text-[0.7rem]"
            inputMode="numeric"
            onBlur={commitZoomInput}
            onChange={(event) => {
              const digitsOnly = event.target.value.replace(/\D+/g, "");
              setIsZoomInputDirty(true);
              setZoomInput(digitsOnly);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitZoomInput();
                zoomInputRef.current?.blur();
              }
            }}
            pattern="[0-9]*"
            ref={zoomInputRef}
            value={resolvedZoomInput}
          />
          <Button aria-label="Zoom in" onClick={zoomIn} size="icon-xs" type="button" variant="outline">
            <Plus className="size-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button aria-label="Print" onClick={handlePrint} size="icon-sm" type="button" variant="outline">
            <Printer className="size-4" />
          </Button>
          <Button aria-label="Download" onClick={handleDownload} size="icon-sm" type="button" variant="outline">
            <Download className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 bg-background">
        {showThumbnails ? (
          <PdfThumbnailSidebar currentPage={currentPage || 1} pageProxies={pageProxies} />
        ) : null}

        <div className="min-h-0 flex-1 bg-muted/30">
          <Pages className={cn("h-full w-full overflow-x-hidden overflow-y-scroll p-4 text-foreground sm:p-6")}>
            <Page className="mx-auto w-fit rounded-md border border-border/40 bg-white shadow-sm">
              <CanvasLayer />
              <TextLayer />
              <HighlightLayer />
              <AnnotationLayer />
            </Page>
          </Pages>
        </div>
      </div>
      <style jsx global>{`
        .annotationLayer a.pdf-viewer-link {
          color: var(--color-primary);
          text-decoration: underline;
          text-underline-offset: 0.18em;
          border-radius: 0.375rem;
        }

        .annotationLayer a.pdf-viewer-link:hover {
          background: color-mix(in oklab, var(--color-primary) 10%, transparent);
        }
      `}</style>
    </div>
  );
}

function PDFViewer({
  source,
  fallbackHighlightText,
  highlightPage,
  highlightText,
  className,
}: {
  source: string;
  fallbackHighlightText?: string | null;
  highlightPage?: number | null;
  highlightText?: string | null;
  className?: string;
}) {
  return (
    <Root
      className={cn(
        "relative flex h-[700px] w-full flex-col overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-sm",
        className,
      )}
      loader={<div className="p-4 text-muted-foreground text-sm">Loading PDF...</div>}
      source={source}
    >
      <PDFViewerContent
        fallbackHighlightText={fallbackHighlightText}
        highlightPage={highlightPage}
        highlightText={highlightText}
        source={source}
      />
    </Root>
  );
}

export default PDFViewer;
