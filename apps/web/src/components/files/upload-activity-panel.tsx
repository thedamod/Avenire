"use client";

import { Button } from "@avenire/ui/components/button";
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, } from "@avenire/ui/components/drawer";
import {
  Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle, } from "@avenire/ui/components/empty";
import { Spinner } from "@avenire/ui/components/spinner";
import { useQuery } from "@tanstack/react-query";
import { Warning as AlertCircle, CheckCircle as CheckCircle2, Waves, X, XCircle } from "@phosphor-icons/react"
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  type FilesActivityItem,
  useFilesActivityStore,
} from "@/stores/filesActivityStore";
import { filesUiActions, useFilesUiStore } from "@/stores/filesUiStore";

const WORKSPACE_FILES_ROUTE_REGEX = /^\/workspace\/files\/([^/]+)/;

interface IngestionJobEvent {
  eventType: string;
  jobId: string;
  payload?: {
    error?: unknown;
    fileName?: unknown;
  };
}

async function loadRecentIngestionJobs(input: {
  activeWorkspaceUuid: string;
  signal?: AbortSignal;
}) {
  const response = await fetch(
    `/api/ai/ingestion/jobs?workspaceUuid=${input.activeWorkspaceUuid}&limit=60&windowMinutes=10`,
    { cache: "no-store", signal: input.signal }
  );

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as {
    jobs?: Array<{
      fileId: string;
      fileName?: string | null;
      id: string;
      status: "failed" | "queued" | "running" | "succeeded";
    }>;
  };
  return payload.jobs ?? [];
}

function getQueueStatusClass(status: FilesActivityItem["status"]) {
  if (status === "failed") {
    return "bg-destructive";
  }

  if (status === "uploaded") {
    return "bg-emerald-500";
  }

  return "bg-primary";
}

function mapIngestionEventStatus(
  eventType: string
): FilesActivityItem["status"] {
  if (eventType === "job.failed") {
    return "failed";
  }

  if (eventType === "job.succeeded") {
    return "uploaded";
  }

  return "ingesting";
}

function mapRecentJobStatus(
  status: "failed" | "queued" | "running" | "succeeded"
): FilesActivityItem["status"] {
  if (status === "running") {
    return "ingesting";
  }

  if (status === "succeeded") {
    return "uploaded";
  }

  return status;
}

function getIngestionErrorMessage(
  payload: IngestionJobEvent["payload"],
  status: FilesActivityItem["status"]
) {
  if (status !== "failed") {
    return undefined;
  }

  if (!payload) {
    return "Ingestion failed";
  }

  if (typeof payload.error === "string") {
    return `Ingestion failed for this file: ${payload.error}`;
  }

  return "Ingestion failed";
}

function createIngestionQueueItem(input: {
  jobId: string;
  status: FilesActivityItem["status"];
}): FilesActivityItem {
  return {
    error: undefined,
    id: `job:${input.jobId}`,
    ingestionJobId: input.jobId,
    name: "Ingestion job",
    sizeLabel: "—",
    status: input.status,
  };
}

function updateIngestionQueueItem(
  item: FilesActivityItem,
  event: IngestionJobEvent,
  status: FilesActivityItem["status"]
) {
  const nextError = getIngestionErrorMessage(event.payload, status);
  return {
    ...item,
    error: nextError,
    failureCount: status === "failed" ? (item.failureCount ?? 0) + 1 : 0,
    status,
  };
}

function statusMeta(status: FilesActivityItem["status"]) {
  switch (status) {
    case "queued":
      return {
        icon: <AlertCircle className="size-3.5 text-muted-foreground" />,
        label: "Queued",
        progress: 10,
      };
    case "uploading":
      return {
        icon: <Spinner className="size-3.5" />,
        label: "Uploading",
        progress: 55,
      };
    case "uploaded":
      return {
        icon: <CheckCircle2 className="size-3.5 text-emerald-500" />,
        label: "Uploaded",
        progress: 100,
      };
    case "ingesting":
      return {
        icon: <Spinner className="size-3.5" />,
        label: "Ingesting",
        progress: 80,
      };
    case "failed":
      return {
        icon: <XCircle className="size-3.5 text-destructive" />,
        label: "Failed",
        progress: 100,
      };
    default:
      return {
        icon: <AlertCircle className="size-3.5 text-muted-foreground" />,
        label: "Queued",
        progress: 10,
      };
  }
}

function UploadActivityBody({
  completedCount,
  failedCount,
  onClearCompleted,
  onClose,
  queue,
  uploadCount,
  useDrawerClose = false,
}: {
  completedCount: number;
  failedCount: number;
  onClearCompleted?: () => void;
  onClose?: () => void;
  queue: FilesActivityItem[];
  uploadCount: number;
  useDrawerClose?: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border/70 border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-sm">Upload activity</p>
            <p className="text-muted-foreground text-xs">
              {queue.length === 0
                ? "No recent uploads"
                : `${queue.length} item${queue.length === 1 ? "" : "s"} in this session`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-2 py-0.5 text-[11px]">
              <Waves className="size-3" />
              {uploadCount} active
            </span>
            {failedCount > 0 ? (
              <span className="rounded-full border border-destructive/50 bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">
                {failedCount} failed
              </span>
            ) : null}
            {onClose && useDrawerClose ? (
              <DrawerClose asChild>
                <Button
                  className="h-7 w-7"
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <X className="size-3.5" />
                  <span className="sr-only">Close upload activity</span>
                </Button>
              </DrawerClose>
            ) : null}
            {onClose && !useDrawerClose ? (
              <Button
                className="h-7 w-7"
                onClick={onClose}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <X className="size-3.5" />
                <span className="sr-only">Close upload activity</span>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {queue.length === 0 ? (
          <Empty className="min-h-[12rem] px-4 py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Waves className="size-4" />
              </EmptyMedia>
              <EmptyTitle>No activity yet</EmptyTitle>
              <EmptyDescription>
                Upload something to keep track of progress, ingestion, and any
                failures in one place.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-3">
            {queue.map((item) => {
              const meta = statusMeta(item.status);
              return (
                <div
                  className="space-y-2 rounded-2xl border border-border/70 bg-background/70 p-3 shadow-sm"
                  key={item.id}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0">{meta.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-xs">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {meta.label} • {item.sizeLabel}
                      </p>
                    </div>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full transition-all duration-300",
                        getQueueStatusClass(item.status)
                      )}
                      style={{ width: `${meta.progress}%` }}
                    />
                  </div>
                  {item.error ? (
                    <p className="text-[11px] text-destructive">{item.error}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {completedCount > 0 ? (
        <div className="border-border/70 border-t bg-muted/20 px-4 py-3">
          <Button
            className="px-0 text-muted-foreground text-xs hover:text-foreground"
            onClick={onClearCompleted}
            size="sm"
            type="button"
            variant="ghost"
          >
            Clear completed
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function UploadActivityPanel() {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const uploadActivityOpen = useFilesUiStore(
    (state) => state.uploadActivityOpen
  );
  const queuesByWorkspace = useFilesActivityStore(
    (state) => state.queuesByWorkspace
  );
  const updateWorkspaceQueue = useFilesActivityStore(
    (state) => state.updateWorkspaceQueue
  );
  const [isQueueVisible, setIsQueueVisible] = useState(false);
  const [isQueueDismissed, setIsQueueDismissed] = useState(false);
  const [preferredWorkspaceId, setPreferredWorkspaceId] = useState<
    string | null
  >(null);
  const previousUploadQueueLengthRef = useRef(0);
  const queueFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ingestionSseRetryTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const ingestionSseCursorRef = useRef<string | null>(null);

  const workspaceFromPath = useMemo(() => {
    const match = pathname.match(WORKSPACE_FILES_ROUTE_REGEX);
    return match?.[1] ?? null;
  }, [pathname]);
  const isFilesRoute = pathname.startsWith("/workspace/files");
  useEffect(() => {
    try {
      setPreferredWorkspaceId(
        window.localStorage.getItem("preferredWorkspaceId")
      );
    } catch {
      setPreferredWorkspaceId(null);
    }
  }, [workspaceFromPath]);
  const activeWorkspaceUuid = useMemo(
    () => workspaceFromPath ?? preferredWorkspaceId,
    [preferredWorkspaceId, workspaceFromPath]
  );
  const queue = activeWorkspaceUuid
    ? (queuesByWorkspace[activeWorkspaceUuid] ?? [])
    : [];

  const recentJobsQuery = useQuery({
    enabled: Boolean(activeWorkspaceUuid && isFilesRoute),
    queryFn: ({ signal }) =>
      activeWorkspaceUuid
        ? loadRecentIngestionJobs({ activeWorkspaceUuid, signal })
        : Promise.resolve([]),
    queryKey: ["upload-activity", activeWorkspaceUuid],
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!(activeWorkspaceUuid && isFilesRoute)) {
      return;
    }
    const jobs = recentJobsQuery.data ?? [];
    if (jobs.length === 0) {
      return;
    }

    updateWorkspaceQueue(activeWorkspaceUuid, (previous) => [
      ...previous.filter(
        (item) =>
          !(
            item.ingestionJobId &&
            jobs.some((job) => job.id === item.ingestionJobId)
          )
      ),
      ...jobs.map((job) => {
        const status = mapRecentJobStatus(job.status);
        return {
          id: `job:${job.id}`,
          ingestionJobId: job.id,
          fileId: job.fileId,
          name: job.fileName ?? "Ingestion job",
          sizeLabel: "—",
          status,
        };
      }),
    ]);
  }, [
    activeWorkspaceUuid,
    isFilesRoute,
    recentJobsQuery.data,
    updateWorkspaceQueue,
  ]);

  useEffect(() => {
    if (!(activeWorkspaceUuid && isFilesRoute)) {
      return;
    }

    ingestionSseCursorRef.current = null;
    let closed = false;
    let eventSource: EventSource | null = null;

    const cleanupCurrent = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };

    const scheduleReconnect = () => {
      if (closed) {
        return;
      }
      if (ingestionSseRetryTimerRef.current) {
        clearTimeout(ingestionSseRetryTimerRef.current);
      }
      ingestionSseRetryTimerRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    const connect = () => {
      if (closed) {
        return;
      }

      try {
        cleanupCurrent();
        const url = new URL(
          "/api/ai/ingestion/jobs/events",
          window.location.origin
        );
        url.searchParams.set("workspaceUuid", activeWorkspaceUuid);
        if (ingestionSseCursorRef.current) {
          url.searchParams.set("cursor", ingestionSseCursorRef.current);
        }

        eventSource = new EventSource(url.toString());
        eventSource.onerror = () => {
          cleanupCurrent();
          scheduleReconnect();
        };
        eventSource.addEventListener("ingestion.job", (event) => {
          const messageEvent = event as MessageEvent;
          const payload = JSON.parse(messageEvent.data) as IngestionJobEvent;
          const cursor =
            typeof messageEvent.lastEventId === "string" &&
            messageEvent.lastEventId.length > 0
              ? messageEvent.lastEventId
              : null;
          if (cursor) {
            ingestionSseCursorRef.current = cursor;
          }
          const status: FilesActivityItem["status"] = mapIngestionEventStatus(
            payload.eventType
          );

          updateWorkspaceQueue(activeWorkspaceUuid, (previous) => {
            const existingIndex = previous.findIndex(
              (item) => item.ingestionJobId === payload.jobId
            );
            if (existingIndex === -1) {
              return [
                ...previous,
                createIngestionQueueItem({ jobId: payload.jobId, status }),
              ];
            }

            return previous.map((item, index) => {
              if (index !== existingIndex) {
                return item;
              }
              return updateIngestionQueueItem(item, payload, status);
            });
          });
        });
      } catch {
        scheduleReconnect();
      }
    };

    connect();
    return () => {
      closed = true;
      cleanupCurrent();
      if (ingestionSseRetryTimerRef.current) {
        clearTimeout(ingestionSseRetryTimerRef.current);
        ingestionSseRetryTimerRef.current = null;
      }
    };
  }, [activeWorkspaceUuid, isFilesRoute, updateWorkspaceQueue]);

  useEffect(() => {
    if (queue.length === 0) {
      previousUploadQueueLengthRef.current = 0;
      setIsQueueDismissed(false);
      return;
    }

    if (queue.length > previousUploadQueueLengthRef.current) {
      setIsQueueDismissed(false);
    }

    previousUploadQueueLengthRef.current = queue.length;
  }, [queue.length]);

  useEffect(() => {
    if (uploadActivityOpen) {
      setIsQueueDismissed(false);
    }
  }, [uploadActivityOpen]);

  useEffect(() => {
    if (queueFadeTimerRef.current) {
      clearTimeout(queueFadeTimerRef.current);
      queueFadeTimerRef.current = null;
    }

    if (queue.length === 0 && !uploadActivityOpen) {
      setIsQueueVisible(false);
      return;
    }

    if (isQueueDismissed && !uploadActivityOpen) {
      setIsQueueVisible(false);
      return;
    }

    const hasActiveUploads = queue.some(
      (item) =>
        !item.id.startsWith("job:") &&
        (item.status === "queued" ||
          item.status === "uploading" ||
          item.status === "ingesting")
    );

    setIsQueueVisible(uploadActivityOpen || hasActiveUploads);

    if (hasActiveUploads || uploadActivityOpen) {
      return;
    }

    queueFadeTimerRef.current = setTimeout(() => {
      setIsQueueVisible(false);
    }, 4500);

    return () => {
      if (queueFadeTimerRef.current) {
        clearTimeout(queueFadeTimerRef.current);
      }
    };
  }, [isQueueDismissed, queue, uploadActivityOpen]);

  const uploadCount = queue.filter(
    (item) =>
      item.status === "queued" ||
      item.status === "uploading" ||
      item.status === "ingesting"
  ).length;
  const failedCount = queue.filter((item) => item.status === "failed").length;
  const completedCount = queue.filter(
    (item) => item.status === "uploaded"
  ).length;

  const handleClose = () => {
    setIsQueueDismissed(true);
    filesUiActions.setUploadActivityOpen(false);
  };

  const handleClearCompleted = () => {
    if (!activeWorkspaceUuid) {
      return;
    }

    updateWorkspaceQueue(activeWorkspaceUuid, (previous) =>
      previous.filter((item) => item.status !== "uploaded")
    );
  };

  if (isMobile) {
    return (
      <Drawer
        onOpenChange={(open) => {
          if (!open) {
            handleClose();
          }
        }}
        open={isQueueVisible}
      >
        <DrawerContent className="p-0">
          <DrawerHeader className="border-border/70 border-b pb-4 text-left">
            <DrawerTitle>Upload activity</DrawerTitle>
            <DrawerDescription>
              Track uploads, ingestion, and failures without leaving the
              workspace.
            </DrawerDescription>
          </DrawerHeader>
          <UploadActivityBody
            completedCount={completedCount}
            failedCount={failedCount}
            onClearCompleted={handleClearCompleted}
            onClose={handleClose}
            queue={queue}
            uploadCount={uploadCount}
            useDrawerClose
          />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <div
      className={cn(
        "fixed right-4 bottom-4 z-40 w-[22rem] overflow-hidden rounded-lg border border-border/70 bg-background transition-all duration-300",
        isQueueVisible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-3 opacity-0"
      )}
    >
      <UploadActivityBody
        completedCount={completedCount}
        failedCount={failedCount}
        onClearCompleted={handleClearCompleted}
        onClose={handleClose}
        queue={queue}
        uploadCount={uploadCount}
      />
    </div>
  );
}
