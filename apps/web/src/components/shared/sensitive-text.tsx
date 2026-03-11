"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export function SensitiveText({
  value,
  privacyMode,
  className,
  fallback = "—",
}: {
  value?: string | null;
  privacyMode: boolean;
  className?: string;
  fallback?: string;
}) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!privacyMode) {
      setRevealed(false);
    }
  }, [privacyMode, value]);

  if (!value) {
    return <span className={className}>{fallback}</span>;
  }

  if (!privacyMode || revealed) {
    return <span className={className}>{value}</span>;
  }

  return (
    <button
      className={cn(
        "max-w-full cursor-pointer appearance-none border-0 bg-transparent p-0 text-left",
        className
      )}
      onClick={() => setRevealed(true)}
      title="Click to reveal"
      type="button"
    >
      <span className="inline-block max-w-full truncate blur-[6px] select-none">
        {value}
      </span>
    </button>
  );
}
