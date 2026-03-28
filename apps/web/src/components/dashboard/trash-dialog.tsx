"use client";

import { Badge } from "@avenire/ui/components/badge";
import { Button } from "@avenire/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@avenire/ui/components/dialog";
import { ScrollArea } from "@avenire/ui/components/scroll-area";
import { Spinner } from "@avenire/ui/components/spinner";
import { type ReactNode, useEffect, useMemo, useState } from "react";

interface TrashItem {
  id: string;
  kind: "file" | "folder";
  name: string;
  deletedAt: string;
  sizeBytes: number | null;
}

function formatRelativeDate(date: string) {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) {
    return "just now";
  }
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function TrashDialog({
  workspaceUuid,
  open,
  onOpenChange,
}: {
  workspaceUuid: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const hasItems = items.length > 0;

  const refresh = async () => {
    if (!workspaceUuid) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceUuid}/trash`, {
        cache: "no-store",
      });
      if (!response.ok) {
        setStatus("Unable to load trash.");
        setItems([]);
        return;
      }
      const payload = (await response.json()) as { items?: TrashItem[] };
      setItems(payload.items ?? []);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      refresh().catch(() => {
        setStatus("Unable to load trash.");
      });
    }
  }, [open, workspaceUuid]);

  const totalSize = useMemo(
    () => items.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0),
    [items],
  );

  const runMutation = async (
    operation: "restore" | "delete",
    item: { id: string; kind: "file" | "folder" }
  ) => {
    if (!workspaceUuid) {
      return;
    }

    setStatus(operation === "restore" ? "Restoring..." : "Deleting permanently...");
    const response = await fetch(`/api/workspaces/${workspaceUuid}/trash`, {
      method: operation === "restore" ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation, items: [item] }),
    });

    if (!response.ok) {
      setStatus(operation === "restore" ? "Restore failed." : "Permanent delete failed.");
      return;
    }

    setStatus(operation === "restore" ? "Item restored." : "Item permanently deleted.");
    await refresh();
  };

  let content: ReactNode;
  if (loading) {
    content = (
      <p className="inline-flex items-center gap-2 p-4 text-muted-foreground text-sm">
        <Spinner className="size-4" />
        Loading trash...
      </p>
    );
  } else if (!hasItems) {
    content = (
      <p className="p-4 text-muted-foreground text-sm">
        Trash is empty.
      </p>
    );
  } else {
    content = items.map((item) => (
      <div
        className="flex flex-col gap-4 p-3 sm:flex-row sm:items-center sm:justify-between"
        key={`${item.kind}:${item.id}`}
      >
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium">{item.name}</p>
            <Badge variant="outline">{item.kind}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
            <span>Deleted {formatRelativeDate(item.deletedAt)}</span>
            <span>
              {item.sizeBytes && item.sizeBytes > 0
                ? `${(item.sizeBytes / (1024 * 1024)).toFixed(2)} MB`
                : "Size unavailable"}
            </span>
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:items-center">
          <Button
            className="w-full sm:w-auto"
            onClick={() => {
              runMutation("restore", item).catch(() => {
                setStatus("Restore failed.");
              });
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Restore
          </Button>
          <Button
            className="w-full sm:w-auto"
            onClick={() => {
              runMutation("delete", item).catch(() => {
                setStatus("Permanent delete failed.");
              });
            }}
            size="sm"
            type="button"
            variant="destructive"
          >
            Delete now
          </Button>
        </div>
      </div>
    ));
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="h-[100dvh] w-screen max-w-none rounded-none border-0 p-0 sm:h-[92vh] sm:w-[96vw] sm:max-w-[1200px] sm:rounded-xl sm:border lg:max-w-[1280px]">
        <div className="flex h-full flex-col overflow-hidden bg-background sm:rounded-xl">
          <DialogHeader className="border-b border-border/60 px-4 py-4 sm:px-6">
            <DialogTitle>Trash</DialogTitle>
            <DialogDescription>
              Deleted items stay for 30 days before permanent cleanup.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between px-4 py-3 text-muted-foreground text-xs sm:px-6">
            <span>
              {hasItems
                ? `${items.length} item${items.length === 1 ? "" : "s"}`
                : "No deleted items"}
            </span>
            <span>
              {totalSize > 0
                ? `${(totalSize / (1024 * 1024)).toFixed(2)} MB`
                : "0 MB"}
            </span>
          </div>

          <div className="min-h-0 flex-1 px-4 pb-4 sm:px-6 sm:pb-6">
            <ScrollArea className="h-full rounded-xl border border-border/70 bg-card/40">
              <div className="divide-y divide-border/60">{content}</div>
            </ScrollArea>
          </div>

          {status ? (
            <p className="border-t border-border/60 px-4 py-3 text-muted-foreground text-xs sm:px-6">
              {status}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
