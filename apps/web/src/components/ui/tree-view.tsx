"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@avenire/ui/components/collapsible";
import { cn } from "@/lib/utils";

export interface TreeDataItem {
  id: string;
  name: string;
  icon?: React.ComponentType<{ className?: string }>;
  selectedIcon?: React.ComponentType<{ className?: string }>;
  openIcon?: React.ComponentType<{ className?: string }>;
  children?: TreeDataItem[];
  actions?: ReactNode;
  onClick?: () => void;
  draggable?: boolean;
  droppable?: boolean;
  disabled?: boolean;
  className?: string;
}

export interface TreeRenderItemParams {
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  item: TreeDataItem;
}

type TreeProps = HTMLAttributes<HTMLDivElement> & {
  data: TreeDataItem[] | TreeDataItem;
  initialSelectedItemId?: string;
  initialExpandedItemIds?: string[];
  onExpandedChange?: (itemIds: string[]) => void;
  onMoveItem?: (draggedItemId: string, targetItemId: string) => void;
  onSelectChange?: (item: TreeDataItem | undefined) => void;
  renderItem?: (params: TreeRenderItemParams) => ReactNode;
  expandAll?: boolean;
  defaultNodeIcon?: React.ComponentType<{ className?: string }>;
  defaultLeafIcon?: React.ComponentType<{ className?: string }>;
};

const DEFAULT_NODE_ICON = Folder;
const DEFAULT_OPEN_ICON = FolderOpen;
const DEFAULT_LEAF_ICON = File;

function flattenTree(items: TreeDataItem[], map: Map<string, TreeDataItem>) {
  for (const item of items) {
    map.set(item.id, item);
    if (item.children?.length) {
      flattenTree(item.children, map);
    }
  }
}

function areSetsEqual(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
}

export function TreeView({
  className,
  data,
  initialSelectedItemId,
  initialExpandedItemIds,
  onExpandedChange,
  onMoveItem,
  onSelectChange,
  renderItem,
  expandAll = false,
  defaultLeafIcon: DefaultLeafIcon = DEFAULT_LEAF_ICON,
  defaultNodeIcon: DefaultNodeIcon = DEFAULT_NODE_ICON,
  ...props
}: TreeProps) {
  const items = useMemo(() => (Array.isArray(data) ? data : [data]), [data]);
  const itemMap = useMemo(() => {
    const map = new Map<string, TreeDataItem>();
    flattenTree(items, map);
    return map;
  }, [items]);

  const [selectedItemId, setSelectedItemId] = useState(initialSelectedItemId);
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(() => {
    if (expandAll) {
      return new Set(Array.from(itemMap.keys()));
    }
    return new Set(initialExpandedItemIds ?? []);
  });
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dropTargetItemId, setDropTargetItemId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedItemId((current) =>
      current === initialSelectedItemId ? current : initialSelectedItemId
    );
  }, [initialSelectedItemId]);

  useEffect(() => {
    if (expandAll) {
      return;
    }
    const next = new Set(initialExpandedItemIds ?? []);
    setExpandedItemIds((current) => (areSetsEqual(current, next) ? current : next));
  }, [expandAll, initialExpandedItemIds]);

  useEffect(() => {
    if (!expandAll) {
      return;
    }
    setExpandedItemIds(new Set(Array.from(itemMap.keys())));
  }, [expandAll, itemMap]);

  const updateExpanded = useCallback(
    (next: Set<string>) => {
      setExpandedItemIds(next);
      onExpandedChange?.(Array.from(next));
    },
    [onExpandedChange]
  );

  const toggleExpanded = useCallback(
    (itemId: string) => {
      updateExpanded(
        new Set(
          expandedItemIds.has(itemId)
            ? Array.from(expandedItemIds).filter((id) => id !== itemId)
            : [...expandedItemIds, itemId]
        )
      );
    },
    [expandedItemIds, updateExpanded]
  );

  const handleSelect = useCallback(
    (item: TreeDataItem) => {
      if (item.disabled) {
        return;
      }
      setSelectedItemId(item.id);
      item.onClick?.();
      onSelectChange?.(item);
    },
    [onSelectChange]
  );

  const renderNode = useCallback(
    (item: TreeDataItem, depth: number) => {
      const hasChildren = Boolean(item.children?.length);
      const isExpanded = expandedItemIds.has(item.id);
      const isSelected = selectedItemId === item.id;
      const isDropTarget = dropTargetItemId === item.id;

      const Icon =
        (isSelected && item.selectedIcon) ||
        (isExpanded && item.openIcon) ||
        item.icon ||
        (hasChildren ? (isExpanded ? DEFAULT_OPEN_ICON : DefaultNodeIcon) : DefaultLeafIcon);

      const content = renderItem?.({
        depth,
        isExpanded,
        isSelected,
        item,
      });

      return (
        <Collapsible key={item.id} onOpenChange={() => toggleExpanded(item.id)} open={isExpanded}>
          <div className={cn(item.className)} data-tree-id={item.id}>
            <div
              className={cn(
                "group/tree-row flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors",
                "hover:bg-primary/6",
                isSelected && "bg-primary/10 text-primary ring-1 ring-primary/20",
                isDropTarget && "bg-primary/12 ring-1 ring-primary/30",
                item.disabled && "pointer-events-none opacity-50"
              )}
              draggable={item.draggable}
              onClick={() => handleSelect(item)}
              onDragEnd={() => {
                setDraggedItemId(null);
                setDropTargetItemId(null);
              }}
              onDragLeave={() => {
                setDropTargetItemId((current) =>
                  current === item.id ? null : current
                );
              }}
              onDragOver={(event) => {
                if (!(item.droppable && draggedItemId && draggedItemId !== item.id)) {
                  return;
                }
                event.preventDefault();
                setDropTargetItemId(item.id);
              }}
              onDragStart={() => {
                if (!item.draggable) {
                  return;
                }
                setDraggedItemId(item.id);
              }}
              onDrop={(event) => {
                if (!(item.droppable && draggedItemId && draggedItemId !== item.id)) {
                  return;
                }
                event.preventDefault();
                onMoveItem?.(draggedItemId, item.id);
                setDraggedItemId(null);
                setDropTargetItemId(null);
              }}
              role="treeitem"
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
              tabIndex={0}
            >
              {hasChildren ? (
                <CollapsibleTrigger
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-md hover:bg-primary/8"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <ChevronRight
                    className={cn("size-3.5 transition-transform", isExpanded && "rotate-90")}
                  />
                </CollapsibleTrigger>
              ) : (
                <span className="size-5 shrink-0" />
              )}
              <Icon className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
              {content}
              {item.actions ? (
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-focus-within/tree-row:opacity-100 group-hover/tree-row:opacity-100">
                  {item.actions}
                </div>
              ) : null}
            </div>
            {hasChildren ? (
              <CollapsibleContent className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 overflow-hidden">
                <div className="space-y-1 pt-1">{item.children?.map((child) => renderNode(child, depth + 1))}</div>
              </CollapsibleContent>
            ) : null}
          </div>
        </Collapsible>
      );
    },
    [
      DefaultLeafIcon,
      DefaultNodeIcon,
      draggedItemId,
      dropTargetItemId,
      expandedItemIds,
      handleSelect,
      onMoveItem,
      renderItem,
      selectedItemId,
      toggleExpanded,
    ]
  );

  return (
    <div className={cn("space-y-1", className)} role="tree" {...props}>
      {items.map((item) => renderNode(item, 0))}
    </div>
  );
}
