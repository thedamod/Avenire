"use client"

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

export type PinnedExplorerItem = {
  folderId: string | null
  id: string
  kind: "file" | "folder"
  name: string
  workspaceId: string
}

type FilesPinsStore = {
  pinnedByWorkspace: Record<string, PinnedExplorerItem[]>
  isPinned: (
    workspaceId: string,
    kind: PinnedExplorerItem["kind"],
    id: string
  ) => boolean
  togglePinnedItem: (workspaceId: string, item: PinnedExplorerItem) => void
}

function nextPinnedItems(
  currentItems: PinnedExplorerItem[],
  nextItem: PinnedExplorerItem
) {
  const exists = currentItems.some(
    (item) => item.kind === nextItem.kind && item.id === nextItem.id
  )

  if (exists) {
    return currentItems.filter(
      (item) => !(item.kind === nextItem.kind && item.id === nextItem.id)
    )
  }

  return [nextItem, ...currentItems]
}

export const useFilesPinsStore = create<FilesPinsStore>()(
  persist(
    (set, get) => ({
      pinnedByWorkspace: {},
      isPinned: (workspaceId, kind, id) =>
        (get().pinnedByWorkspace[workspaceId] ?? []).some(
          (item) => item.kind === kind && item.id === id
        ),
      togglePinnedItem: (workspaceId, item) =>
        set((state) => ({
          pinnedByWorkspace: {
            ...state.pinnedByWorkspace,
            [workspaceId]: nextPinnedItems(
              state.pinnedByWorkspace[workspaceId] ?? [],
              item
            ),
          },
        })),
    }),
    {
      name: "files-pins",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ pinnedByWorkspace: state.pinnedByWorkspace }),
    }
  )
)
