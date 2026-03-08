"use client";

import { create } from "zustand";

export type FilesUiIntent =
  | "focusSearch"
  | "newNote"
  | "uploadFile"
  | "uploadFolder"
  | "createFolder"
  | "openSelection"
  | "deleteSelection"
  | "moveSelectionUp"
  | "goParent";

type FilesUiIntentVersion = Record<FilesUiIntent, number>;

const INITIAL_INTENT_VERSION: FilesUiIntentVersion = {
  focusSearch: 0,
  newNote: 0,
  uploadFile: 0,
  uploadFolder: 0,
  createFolder: 0,
  openSelection: 0,
  deleteSelection: 0,
  moveSelectionUp: 0,
  goParent: 0,
};

interface FilesUiStore {
  emitIntent: (intent: FilesUiIntent) => void;
  emitSync: (workspaceUuid?: string | null) => void;
  setUploadActivityOpen: (open: boolean) => void;
  toggleUploadActivityOpen: () => void;
  intentVersion: FilesUiIntentVersion;
  uploadActivityOpen: boolean;
  sync: {
    version: number;
    workspaceUuid: string | null;
  };
}

export const useFilesUiStore = create<FilesUiStore>()((set) => ({
  intentVersion: INITIAL_INTENT_VERSION,
  sync: {
    version: 0,
    workspaceUuid: null,
  },
  uploadActivityOpen: false,
  emitIntent: (intent) =>
    set((state) => ({
      intentVersion: {
        ...state.intentVersion,
        [intent]: state.intentVersion[intent] + 1,
      },
    })),
  emitSync: (workspaceUuid) =>
    set((state) => ({
      sync: {
        version: state.sync.version + 1,
        workspaceUuid: workspaceUuid ?? null,
      },
    })),
  setUploadActivityOpen: (open) => set({ uploadActivityOpen: open }),
  toggleUploadActivityOpen: () =>
    set((state) => ({ uploadActivityOpen: !state.uploadActivityOpen })),
}));
