"use client";

import { useCallback } from "react";

export type HapticFeedbackType = "error" | "selection" | "success";

const patternByType: Record<HapticFeedbackType, number | number[]> = {
  selection: 12,
  success: [12, 30, 18],
  error: [24, 40, 24],
};

export function useHaptics() {
  return useCallback(async (type: HapticFeedbackType = "selection") => {
    if (typeof window === "undefined") {
      return;
    }
    if (!window.matchMedia("(pointer: coarse)").matches) {
      return;
    }

    try {
      const dynamicImport = new Function(
        "m",
        "return import(m)"
      ) as (moduleName: string) => Promise<Record<string, unknown>>;
      const hapticsModule = await dynamicImport("web-haptics");
      const impact = hapticsModule?.impact as
        | ((style: "heavy" | "light" | "medium") => void)
        | undefined;
      if (impact) {
        if (type === "error") {
          impact("heavy");
        } else if (type === "success") {
          impact("medium");
        } else {
          impact("light");
        }
        return;
      }

      const vibrate = hapticsModule?.vibrate as
        | ((pattern?: number | number[]) => void)
        | undefined;
      if (vibrate) {
        vibrate(patternByType[type]);
        return;
      }
    } catch {
      // Fall through to native vibration.
    }

    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(patternByType[type]);
    }
  }, []);
}
