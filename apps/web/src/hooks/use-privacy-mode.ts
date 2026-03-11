"use client";

import { useEffect, useState } from "react";
import {
  PRIVACY_MODE_STORAGE_KEY,
  readPrivacyModeFromStorage,
} from "@/lib/privacy-mode";

export function usePrivacyMode() {
  const [privacyMode, setPrivacyMode] = useState(false);

  useEffect(() => {
    setPrivacyMode(readPrivacyModeFromStorage());

    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== PRIVACY_MODE_STORAGE_KEY) {
        return;
      }
      setPrivacyMode(readPrivacyModeFromStorage());
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return privacyMode;
}
