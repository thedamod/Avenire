"use client";

import { cn } from "@/lib/utils";

interface FolderGlyphProps {
  className?: string;
  compact?: boolean;
  previewKinds?: string[];
}

const PREVIEW_LABEL_BY_KIND: Record<string, string> = {
  archive: "ZIP",
  audio: "AUDIO",
  code: "CODE",
  document: "DOC",
  image: "IMG",
  other: "FILE",
  sheet: "CSV",
  video: "VID",
};

export function FolderGlyph({
  className,
  compact = false,
  previewKinds = [],
}: FolderGlyphProps) {
  const visibleKinds = previewKinds.slice(0, 3);

  if (compact) {
    return (
      <div
        aria-hidden
        className={cn(
          "relative h-3.5 w-4.5 shrink-0",
          "[--folder-front:#2f2f2f] [--folder-back:#1f1f1f]",
          className
        )}
      >
        <div className="absolute inset-0 rounded-[3px] [clip-path:polygon(0%_22%,40%_22%,50%_0%,100%_0%,100%_100%,0%_100%)] bg-[var(--folder-back)]" />
        {visibleKinds.length > 0 ? (
          <span className="absolute right-[8%] bottom-[14%] text-[6px] font-semibold tracking-[0.03em] text-white/70">
            {visibleKinds[0] ? PREVIEW_LABEL_BY_KIND[visibleKinds[0]] : "FILE"}
          </span>
        ) : null}
        <div className="absolute right-0 bottom-0 h-[78%] w-full rounded-b-[3px] rounded-t-[2px] bg-gradient-to-b from-[#3a3a3a] to-[var(--folder-front)]" />
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className={cn(
        "group/folder relative h-[72px] w-[90px] shrink-0 [perspective:700px]",
        "[--folder-front:#2c2c2c] [--folder-back:#202020]",
        className
      )}
    >
      <div className="absolute inset-0 rounded-[10px] bg-[var(--folder-back)] [clip-path:polygon(0%_18%,40%_18%,46%_0%,100%_0%,100%_100%,0%_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-transform duration-200 ease-out group-hover/folder:scale-[0.99]" />

      {visibleKinds.length > 0 ? (
        <div className="pointer-events-none absolute right-[7px] bottom-[10px] z-[1] h-[58px] w-[84px]">
          {visibleKinds.map((kind, index) => (
            <div
              className="absolute inset-0 flex justify-end rounded-[4px] bg-white p-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.18)] transition-transform duration-300 [transition-timing-function:cubic-bezier(0.2,0.9,0.4,1)] group-hover/folder:-translate-y-4 group-hover/folder:-rotate-1"
              key={`${kind}-${index}`}
              style={{
                transform: `translateY(${index * 3}px) rotate(${index % 2 === 0 ? -1 : 1}deg)`,
              }}
            >
              <span className="h-2 rounded-[2px] bg-neutral-700 px-1 font-black text-[6px] leading-[8px] tracking-[0.02em] text-white">
                {PREVIEW_LABEL_BY_KIND[kind] ?? "FILE"}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="absolute right-0 bottom-0 z-10 flex h-[60px] w-full origin-bottom items-end rounded-b-[10px] rounded-t-[4px] bg-gradient-to-b from-[#383838] to-[var(--folder-front)] px-2.5 pb-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(0,0,0,0.22),0_6px_16px_rgba(0,0,0,0.45)] transition-all duration-250 ease-out group-hover/folder:translate-y-0.5 group-hover/folder:rotate-x-[7deg] group-hover/folder:shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_10px_22px_rgba(0,0,0,0.55)]" />
    </div>
  );
}
