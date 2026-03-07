import { useCallback, useMemo, useState } from "react";

export type ExplorerItemType = "file" | "folder";

export interface ExplorerItem {
  id: string;
  name: string;
  type: ExplorerItemType;
  parentId: string | null;
  updatedLabel: string;
  sizeLabel?: string;
  url?: string;
  contentType?: string;
}

/**
 * Convert an array of ExplorerItem into a map keyed by each item's `id`.
 *
 * @param items - Array of ExplorerItem objects to convert
 * @returns A record mapping item `id` to the corresponding ExplorerItem. If duplicate ids appear, the last item with that id overwrites earlier ones.
 */
function listToMap(items: ExplorerItem[]): Record<string, ExplorerItem> {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

/**
 * Determines whether a given item is a descendant of a specified folder by following parentId links.
 *
 * @param folderId - The id of the folder to test as ancestor
 * @param possibleDescendantId - The id of the item to check for being a descendant of `folderId`
 * @returns `true` if the item with `possibleDescendantId` has `folderId` as an ancestor, `false` otherwise
 */
function isDescendant(
  itemsById: Record<string, ExplorerItem>,
  folderId: string,
  possibleDescendantId: string,
): boolean {
  let cursor = itemsById[possibleDescendantId];
  while (cursor && cursor.parentId) {
    if (cursor.parentId === folderId) {
      return true;
    }
    cursor = itemsById[cursor.parentId];
  }
  return false;
}

/**
 * Filter a list of dragged item ids to exclude any id whose ancestor is also being dragged.
 *
 * @param itemsById - Map of explorer items keyed by id, used to traverse parent links.
 * @param draggedIds - Array of item ids intended to be moved together.
 * @returns An array of ids from `draggedIds` whose ancestors are not present in `draggedIds` (keeps only top-level dragged items).
 */
function pruneDraggedSet(itemsById: Record<string, ExplorerItem>, draggedIds: string[]): string[] {
  const draggedSet = new Set(draggedIds);
  return draggedIds.filter((id) => {
    let cursor = itemsById[id];
    while (cursor && cursor.parentId) {
      if (draggedSet.has(cursor.parentId)) {
        return false;
      }
      cursor = itemsById[cursor.parentId];
    }
    return true;
  });
}

/**
 * Build a set containing the given root item id and all of its descendant item ids.
 *
 * @param itemsById - Map of item id to ExplorerItem used to discover parent/child relationships
 * @param rootId - The id of the root item whose descendants should be collected
 * @returns A set of ids including `rootId` and every item id that is a direct or indirect descendant of `rootId`
 */
function collectDescendants(itemsById: Record<string, ExplorerItem>, rootId: string): Set<string> {
  const descendants = new Set<string>([rootId]);
  let found = true;

  while (found) {
    found = false;
    Object.values(itemsById).forEach((item) => {
      if (!descendants.has(item.id) && item.parentId && descendants.has(item.parentId)) {
        descendants.add(item.id);
        found = true;
      }
    });
  }

  return descendants;
}

/**
 * Manages a mutable collection of ExplorerItem objects and exposes CRUD and navigation utilities for a hierarchical file explorer.
 *
 * @param initialItems - Initial list of explorer items used to populate the store
 * @returns An object containing:
 *  - itemsById: map of ExplorerItem keyed by id
 *  - items: array of all ExplorerItem values
 *  - getVisibleItems: (parentId) => children of the given parent (folders first, then by name)
 *  - getAncestors: (folderId) => ancestor chain from root to the specified folder
 *  - moveItemsToFolder: (sourceIds, targetFolderId) => list of moved item ids after validation; updates parentId and updatedLabel to "now"
 *  - createItem: (item) => adds a new item with updatedLabel set to "now"
 *  - upsertItems: (incomingItems) => merges incoming items into the store, preserving existing fields and applying updatedLabel (falls back to "now")
 *  - renameItem: (itemId, name) => updates an item's name and sets updatedLabel to "now"
 *  - deleteItems: (itemIds) => deletes the specified items and all their descendants
 */
export function useFileCrud(initialItems: ExplorerItem[]) {
  const [itemsById, setItemsById] = useState<Record<string, ExplorerItem>>(() => listToMap(initialItems));

  const getVisibleItems = useCallback(
    (parentId: string) => {
      return Object.values(itemsById)
        .filter((item) => item.parentId === parentId)
        .sort((a, b) => {
          if (a.type === b.type) {
            return a.name.localeCompare(b.name);
          }
          return a.type === "folder" ? -1 : 1;
        });
    },
    [itemsById],
  );

  const getAncestors = useCallback(
    (folderId: string) => {
      const chain: ExplorerItem[] = [];
      let current = itemsById[folderId];

      while (current) {
        chain.unshift(current);
        if (!current.parentId) {
          break;
        }
        current = itemsById[current.parentId];
      }

      return chain;
    },
    [itemsById],
  );

  const moveItemsToFolder = useCallback(
    (sourceIds: string[], targetFolderId: string) => {
      if (!itemsById[targetFolderId] || itemsById[targetFolderId].type !== "folder") {
        return [] as string[];
      }

      const prunedIds = pruneDraggedSet(itemsById, sourceIds);
      const movableIds = prunedIds.filter((itemId) => {
        const item = itemsById[itemId];
        if (!item || item.parentId === targetFolderId || itemId === targetFolderId) {
          return false;
        }

        if (item.type === "folder" && isDescendant(itemsById, itemId, targetFolderId)) {
          return false;
        }

        return true;
      });

      if (movableIds.length === 0) {
        return [] as string[];
      }

      setItemsById((previous) => {
        const next = { ...previous };

        movableIds.forEach((itemId) => {
          const item = next[itemId];
          if (item) {
            next[itemId] = { ...item, parentId: targetFolderId, updatedLabel: "now" };
          }
        });

        return next;
      });

      return movableIds;
    },
    [itemsById],
  );

  const createItem = useCallback((item: Omit<ExplorerItem, "updatedLabel">) => {
    setItemsById((previous) => ({
      ...previous,
      [item.id]: { ...item, updatedLabel: "now" },
    }));
  }, []);

  const upsertItems = useCallback(
    (incomingItems: Array<Omit<ExplorerItem, "updatedLabel"> & { updatedLabel?: string }>) => {
      if (incomingItems.length === 0) {
        return;
      }

      setItemsById((previous) => {
        const next = { ...previous };

        for (const incoming of incomingItems) {
          const existing = next[incoming.id];
          next[incoming.id] = {
            ...existing,
            ...incoming,
            updatedLabel: incoming.updatedLabel ?? existing?.updatedLabel ?? "now",
          };
        }

        return next;
      });
    },
    [],
  );

  const renameItem = useCallback((itemId: string, name: string) => {
    setItemsById((previous) => {
      const item = previous[itemId];
      if (!item) {
        return previous;
      }

      return {
        ...previous,
        [itemId]: { ...item, name, updatedLabel: "now" },
      };
    });
  }, []);

  const deleteItems = useCallback((itemIds: string[]) => {
    setItemsById((previous) => {
      const next = { ...previous };
      const toDelete = new Set<string>();

      itemIds.forEach((itemId) => {
        if (!next[itemId]) {
          return;
        }

        collectDescendants(next, itemId).forEach((descendantId) => {
          toDelete.add(descendantId);
        });
      });

      toDelete.forEach((itemId) => {
        delete next[itemId];
      });

      return next;
    });
  }, []);

  const items = useMemo(() => Object.values(itemsById), [itemsById]);

  return {
    itemsById,
    items,
    getVisibleItems,
    getAncestors,
    moveItemsToFolder,
    createItem,
    upsertItems,
    renameItem,
    deleteItems,
  };
}
