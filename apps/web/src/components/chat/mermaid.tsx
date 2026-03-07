"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { renderMermaidSVG } from "beautiful-mermaid";
import {
  Download,
  Maximize2,
  Move,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { Button } from "@avenire/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@avenire/ui/components/card";

type MermaidDiagramProps = {
  chart: string;
  title?: string;
  className?: string;
  containerHeight?: number;
  containerWidth?: number;
};

type ViewState = {
  scale: number;
  translateX: number;
  translateY: number;
};

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;

/**
 * Convert bracket-style identifiers (e.g., `node[label]`) to quoted keys (`node["label"]`) for Mermaid compatibility.
 *
 * @param code - Mermaid diagram source text
 * @returns The input source with bracketed identifiers converted to quoted keys
 */
function fixMermaidQuotes(code: string): string {
  return code.replace(/(\w+)\[([^"\]]+)\]/g, '$1["$2"]');
}

/**
 * Renders an interactive Mermaid diagram with pan, zoom, fit-to-screen, reset, and PNG download controls.
 *
 * @param chart - Mermaid diagram source code to render; empty or invalid input displays an inline error.
 * @param title - Optional title shown above the diagram.
 * @param className - Optional additional CSS classes applied to the outer card container.
 * @param containerHeight - Viewport height in pixels for the diagram area (default: 500).
 * @param containerWidth - Maximum viewport width in pixels for the diagram area (default: 800).
 * @returns A JSX element containing the rendered SVG diagram and controls for panning, zooming, fitting, resetting, and downloading as PNG.
 */
export function MermaidDiagram({
  chart,
  title,
  className = "",
  containerHeight = 500,
  containerWidth = 800,
}: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const [viewState, setViewState] = useState<ViewState>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isDownloading, setIsDownloading] = useState(false);

  const { svg, error } = useMemo(() => {
    if (!chart.trim()) {
      return { svg: null, error: "Empty Mermaid diagram." };
    }

    try {
      const fixed = fixMermaidQuotes(chart);
      const rendered = renderMermaidSVG(fixed, {
        bg: "var(--background)",
        fg: "var(--foreground)",
        transparent: true,
      });
      return { svg: rendered, error: null };
    } catch (err) {
      return {
        svg: null,
        error:
          err instanceof Error
            ? err.message
            : "Please check your Mermaid syntax.",
      };
    }
  }, [chart]);

  const zoomAtPoint = (nextScale: number, x: number, y: number) => {
    const clamped = Math.min(Math.max(nextScale, MIN_SCALE), MAX_SCALE);
    const pointX = (x - viewState.translateX) / viewState.scale;
    const pointY = (y - viewState.translateY) / viewState.scale;
    const nextTranslateX = x - pointX * clamped;
    const nextTranslateY = y - pointY * clamped;
    setViewState({
      scale: clamped,
      translateX: nextTranslateX,
      translateY: nextTranslateY,
    });
  };

  const fitToScreen = () => {
    if (!containerRef.current || !chartRef.current) return;
    const svgEl = chartRef.current.querySelector("svg");
    if (!svgEl) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const svgRect = svgEl.getBoundingClientRect();
    if (!svgRect.width || !svgRect.height) return;

    const scaleX = (containerRect.width - 40) / svgRect.width;
    const scaleY = (containerRect.height - 40) / svgRect.height;
    const scale = Math.min(scaleX, scaleY, 1);

    setViewState({
      scale,
      translateX: (containerRect.width - svgRect.width * scale) / 2,
      translateY: (containerRect.height - svgRect.height * scale) / 2,
    });
  };

  useEffect(() => {
    if (!svg || error) return;
    const timer = window.setTimeout(() => fitToScreen(), 50);
    return () => window.clearTimeout(timer);
  }, [svg, error]);

  const handleZoomIn = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    zoomAtPoint(viewState.scale * 1.2, rect.width / 2, rect.height / 2);
  };

  const handleZoomOut = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    zoomAtPoint(viewState.scale / 1.2, rect.width / 2, rect.height / 2);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    zoomAtPoint(viewState.scale * factor, cursorX, cursorY);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - viewState.translateX,
      y: e.clientY - viewState.translateY,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    setViewState((prev) => ({
      ...prev,
      translateX: e.clientX - dragStart.x,
      translateY: e.clientY - dragStart.y,
    }));
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleDownload = async () => {
    if (!chartRef.current || isDownloading) return;
    const svgEl = chartRef.current.querySelector("svg");
    if (!svgEl) return;

    setIsDownloading(true);
    try {
      const copy = svgEl.cloneNode(true) as SVGElement;
      const svgRect = svgEl.getBoundingClientRect();
      const width = Math.max(1, svgRect.width);
      const height = Math.max(1, svgRect.height);

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const pixelRatio = 2;
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      ctx.scale(pixelRatio, pixelRatio);

      const serialized = new XMLSerializer().serializeToString(copy);
      const svgBlob = new Blob([serialized], {
        type: "image/svg+xml;charset=utf-8",
      });
      const svgUrl = URL.createObjectURL(svgBlob);

      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          URL.revokeObjectURL(svgUrl);
          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(svgUrl);
          reject(new Error("Failed to load SVG for download."));
        };
        img.src = svgUrl;
      });

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((result) => resolve(result), "image/png");
      });
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mermaid-chart-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Card className={`w-full ${className}`}>
      {title ? (
        <CardHeader className="pb-3">
          <CardTitle className="text-center">{title}</CardTitle>
        </CardHeader>
      ) : null}
      <CardContent className="p-0">
        <div
          ref={containerRef}
          className="relative overflow-hidden bg-background select-none"
          style={{
            height: containerHeight,
            width: "100%",
            maxWidth: containerWidth,
            margin: "0 auto",
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background">
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                {error}
              </div>
            </div>
          ) : null}

          <div
            ref={chartRef}
            className={`mermaid-chart transition-transform ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
            style={{
              transform: `translate(${viewState.translateX}px, ${viewState.translateY}px) scale(${viewState.scale})`,
              transformOrigin: "0 0",
              transition: isDragging ? "none" : "transform 0.2s ease-out",
            }}
            dangerouslySetInnerHTML={{ __html: svg ?? "" }}
          />

          {!error ? (
            <>
              <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-lg border bg-background/90 px-2 py-1 text-xs text-muted-foreground backdrop-blur-sm">
                <Move className="h-3 w-3" />
                <span>Drag to pan • Scroll to zoom</span>
              </div>

              <div className="absolute bottom-4 right-4 z-20 rounded-lg border bg-background/95 p-1 shadow-lg backdrop-blur-sm">
                <div className="grid grid-cols-3 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleZoomIn}
                    className="h-8 w-8"
                  >
                    <ZoomIn className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={fitToScreen}
                    className="h-8 w-8"
                  >
                    <Maximize2 className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleZoomOut}
                    className="h-8 w-8"
                  >
                    <ZoomOut className="h-3 w-3" />
                  </Button>

                  <div className="flex h-8 w-8 items-center justify-center text-[10px] font-medium text-muted-foreground">
                    {Math.round(viewState.scale * 100)}%
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setViewState({ scale: 1, translateX: 0, translateY: 0 })
                    }
                    className="h-8 w-8"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="h-8 w-8"
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
