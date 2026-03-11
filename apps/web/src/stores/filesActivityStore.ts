"use client";

import { create } from "zustand";

export type FilesActivityStatus =
  | "failed"
  | "ingesting"
  | "queued"
  | "uploaded"
  | "uploading";

export interface FilesActivityItem {
  contentHashSha256?: string;
  error?: string;
  failureCount?: number;
  fileId?: string;
  id: string;
  ingestionJobId?: string;
  name: string;
  sizeLabel: string;
  status: FilesActivityStatus;
}

type QueueUpdater =
  | FilesActivityItem[]
  | ((previous: FilesActivityItem[]) => FilesActivityItem[]);

interface FilesActivityStore {
  queuesByWorkspace: Record<string, FilesActivityItem[]>;
  replaceWorkspaceQueue: (workspaceUuid: string, items: FilesActivityItem[]) => void;
  updateWorkspaceQueue: (workspaceUuid: string, updater: QueueUpdater) => void;
}

export const useFilesActivityStore = create<FilesActivityStore>()((set) => ({
  queuesByWorkspace: {},
  replaceWorkspaceQueue: (workspaceUuid, items) =>
    set((state) => ({
      queuesByWorkspace: {
        ...state.queuesByWorkspace,
        [workspaceUuid]: items,
      },
    })),
  updateWorkspaceQueue: (workspaceUuid, updater) =>
    set((state) => {
      const previous = state.queuesByWorkspace[workspaceUuid] ?? [];
      const next =
        typeof updater === "function" ? updater(previous) : updater;
      return {
        queuesByWorkspace: {
          ...state.queuesByWorkspace,
          [workspaceUuid]: next,
        },
      };
    }),
}));
