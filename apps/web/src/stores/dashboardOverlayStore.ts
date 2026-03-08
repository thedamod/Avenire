"use client";

import { create } from "zustand";

interface DashboardOverlayStore {
  settingsOpen: boolean;
  trashOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  setTrashOpen: (open: boolean) => void;
}

export const useDashboardOverlayStore = create<DashboardOverlayStore>()((set) => ({
  settingsOpen: false,
  trashOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setTrashOpen: (open) => set({ trashOpen: open }),
}));
