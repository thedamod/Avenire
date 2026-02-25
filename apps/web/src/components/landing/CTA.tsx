"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { motion, useInView } from "framer-motion";
import Link from "next/link";
import { Button } from "@avenire/ui/components/button";

/* ── Conway's Game of Life ── */
const CELL_SIZE = 12;
const SIGN_UP_HREF = "/register";

function useGameOfLife(width: number, height: number) {
  const cols = Math.floor(width / CELL_SIZE);
  const rows = Math.floor(height / CELL_SIZE);

  const createGrid = useCallback(() => {
    const grid: boolean[][] = [];
    for (let r = 0; r < rows; r++) {
      grid[r] = [];
      for (let c = 0; c < cols; c++) {
        grid[r][c] = Math.random() < 0.15;
      }
    }
    return grid;
  }, [rows, cols]);

  const step = useCallback((grid: boolean[][]) => {
    const next: boolean[][] = [];
    for (let r = 0; r < rows; r++) {
      next[r] = [];
      for (let c = 0; c < cols; c++) {
        let neighbors = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = (r + dr + rows) % rows;
            const nc = (c + dc + cols) % cols;
            if (grid[nr][nc]) neighbors++;
          }
        }
        if (grid[r][c]) {
          next[r][c] = neighbors === 2 || neighbors === 3;
        } else {
          next[r][c] = neighbors === 3;
        }
      }
    }
    return next;
  }, [rows, cols]);

  return { createGrid, step, rows, cols };
}

function ConwayCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<boolean[][] | null>(null);
  const animFrameRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const [dims, setDims] = useState({ w: 800, h: 400 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setDims({ w: Math.floor(width), h: Math.floor(height) });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const { createGrid, step, rows, cols } = useGameOfLife(dims.w, dims.h);

  useEffect(() => {
    gridRef.current = createGrid();
  }, [createGrid]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = dims.w;
    canvas.height = dims.h;

    const tick = (time: number) => {
      if (time - lastTickRef.current > 500) {
        lastTickRef.current = time;
        if (gridRef.current) {
          gridRef.current = step(gridRef.current);
        }
      }

      ctx.clearRect(0, 0, dims.w, dims.h);

      if (gridRef.current) {
        // Read border color from CSS and keep animation intentionally subdued.
        const style = getComputedStyle(canvas);
        ctx.fillStyle = style.getPropertyValue("--border").trim();
        ctx.globalAlpha = 0.55;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (gridRef.current[r][c]) {
              ctx.fillRect(c * CELL_SIZE + 1, r * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
            }
          }
        }
        ctx.globalAlpha = 1;
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [dims, step, rows, cols]);

  return (
    <div ref={containerRef} className="bg-sidebar absolute inset-0 overflow-hidden pointer-events-none">
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className="absolute inset-0 bg-background/35" />
      <div className="absolute inset-0 shadow-[inset_0_0_72px_rgba(0,0,0,0.1)] dark:shadow-[inset_0_0_120px_rgba(0,0,0,0.22)]" />
    </div>
  );
}

/* ── CTA Section ── */
export function CTA() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-24 px-4" ref={ref}>
      <div className="relative max-w-7xl mx-auto rounded-2xl border border-border bg-card overflow-hidden">
        <ConwayCanvas />

        <div className="relative z-10 max-w-2xl mx-auto px-8 py-24 text-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-foreground">
              Stop memorizing.
              <br />
              <span className="text-primary">Start understanding.</span>
            </h2>

            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed mb-8">
              Join a community of thinkers building real understanding, one reasoning step at a time.
            </p>

            <Button size="lg" nativeButton={false} render={<Link href={SIGN_UP_HREF} />}>
              Join Avenire
            </Button>

            <p className="text-xs text-muted-foreground/50 mt-4">
              Free to start · No credit card required
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
