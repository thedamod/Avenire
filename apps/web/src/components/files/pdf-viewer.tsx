"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AnnotationLayer,
  CanvasLayer,
  calculateHighlightRects,
  Page,
  Pages,
  Root,
  useSearch,
  TextLayer,
  Thumbnail,
  Thumbnails,
  HighlightLayer,
  usePdf,
  usePdfJump,
} from "@anaralabs/lector";
import type { SearchResult } from "@anaralabs/lector";
import { GlobalWorkerOptions } from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import { Badge } from "@avenire/ui/components/badge";
import { Button } from "@avenire/ui/components/button";
import { Input } from "@avenire/ui/components/input";
import { ScrollArea } from "@avenire/ui/components/scroll-area";
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

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url,
).toString();

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

  const handleDownload = useCallback(() => {
    const link = document.createElement("a");
    link.href = source;
    link.download = fileName;
    link.rel = "noopener noreferrer";
    link.target = "_blank";
    link.click();
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
    if (!currentPage || !totalPages) {
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

    void applyHighlight();
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

  return (
    <>
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
          <Badge className="max-w-[15rem] truncate" variant="secondary">
            {fileName}
          </Badge>
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
        <aside
          className={cn(
            "overflow-hidden border-border transition-[width] duration-300",
            showThumbnails ? "w-56 border-r bg-muted/20" : "w-0",
          )}
        >
          <ScrollArea className="h-full px-2 py-3">
            <Thumbnails className="flex flex-col gap-3 px-1">
              <Thumbnail className="w-full rounded-md border border-border bg-card shadow-sm transition hover:border-ring" />
            </Thumbnails>
          </ScrollArea>
        </aside>

        <div className="min-h-0 flex-1 bg-muted/30">
          <Pages
            className={cn(
              "h-full w-full overflow-y-scroll overflow-x-hidden p-4 text-foreground sm:p-6"
            )}
          >
            <Page className="mx-auto w-fit rounded-md border border-border/40 bg-white shadow-sm">
              <CanvasLayer />
              <TextLayer />
              <HighlightLayer />
              <AnnotationLayer />
            </Page>
          </Pages>
        </div>
      </div>
    </>
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
