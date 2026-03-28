"use client";

import { create } from "zustand";

interface DashboardOverlayStore {
  setSettingsOpen: (open: boolean) => void;
  setSettingsTab: (
    tab:
      | "account"
      | "preferences"
      | "workspace"
      | "data"
      | "billing"
      | "security"
      | "shortcuts"
      | null
  ) => void;
  setTrashOpen: (open: boolean) => void;
  settingsOpen: boolean;
  settingsTab:
    | "account"
    | "preferences"
    | "workspace"
    | "data"
    | "billing"
    | "security"
    | "shortcuts"
    | null;
  trashOpen: boolean;
}

export const useDashboardOverlayStore = create<DashboardOverlayStore>()(
  (set) => ({
    settingsOpen: false,
    settingsTab: null,
    trashOpen: false,
    setSettingsOpen: (open) => set({ settingsOpen: open }),
    setSettingsTab: (settingsTab) => set({ settingsTab }),
    setTrashOpen: (open) => set({ trashOpen: open }),
  })
);
