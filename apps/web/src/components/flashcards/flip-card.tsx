"use client";

import { cn } from "@avenire/ui/lib/utils";
import type { ReactNode } from "react";

interface FlashcardFlipCardProps {
  back: ReactNode;
  backBodyClassName?: string;
  backMeta?: ReactNode;
  className?: string;
  flipped: boolean;
  front: ReactNode;
  frontBodyClassName?: string;
  frontMeta?: ReactNode;
  onFlippedChange: (next: boolean) => void;
  surfaceClassName?: string;
}

export function FlashcardFlipCard({
  back,
  backBodyClassName,
  backMeta,
  className,
  flipped,
  front,
  frontBodyClassName,
  frontMeta,
  onFlippedChange,
  surfaceClassName,
}: FlashcardFlipCardProps) {
  return (
    <div className={cn("[perspective:1600px]", className)}>
      <button
        aria-label={flipped ? "Show prompt side" : "Show answer side"}
        aria-pressed={flipped}
        className="group block h-full min-h-[22rem] w-full text-left"
        onClick={() => onFlippedChange(!flipped)}
        type="button"
      >
        <div
          className={cn(
            "relative h-full min-h-[22rem] rounded-xl border border-border/80 bg-card shadow-[0_18px_50px_rgba(0,0,0,0.22)] transition-transform duration-500 [transform-style:preserve-3d]",
            surfaceClassName,
            flipped && "[transform:rotateY(180deg)]"
          )}
        >
          <CardFace bodyClassName={frontBodyClassName} meta={frontMeta}>
            {front}
          </CardFace>
          <CardFace
            bodyClassName={backBodyClassName}
            className="[transform:rotateY(180deg)]"
            meta={backMeta}
            reverse
          >
            {back}
          </CardFace>
        </div>
      </button>
    </div>
  );
}

function CardFace({
  children,
  bodyClassName,
  className,
  meta,
  reverse = false,
}: {
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
  meta?: ReactNode;
  reverse?: boolean;
}) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex h-full flex-col justify-between gap-6 rounded-xl bg-card px-5 py-5 [backface-visibility:hidden]",
        reverse && "[backface-visibility:hidden]",
        className
      )}
    >
      <div
        className={cn(
          "flex min-h-0 flex-1 items-center justify-center overflow-auto",
          bodyClassName
        )}
      >
        {children}
      </div>
      {meta ? (
        <div className="border-border/70 border-t pt-3 text-muted-foreground text-xs">
          {meta}
        </div>
      ) : null}
    </div>
  );
}
