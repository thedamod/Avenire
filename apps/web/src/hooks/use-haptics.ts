"use client";

import { useCallback } from "react";

export type HapticFeedbackType = "error" | "selection" | "success";

const patternByType: Record<HapticFeedbackType, number | number[]> = {
  selection: 12,
  success: [12, 30, 18],
  error: [24, 40, 24],
};

export function useHaptics() {
  return useCallback((type: HapticFeedbackType = "selection") => {
    if (typeof window === "undefined") {
      return;
    }

    const hasTouchInput =
      navigator.maxTouchPoints > 0 ||
      window.matchMedia("(pointer: coarse)").matches;
    if (!hasTouchInput) {
      return;
    }

    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(patternByType[type]);
    }
  }, []);
}
