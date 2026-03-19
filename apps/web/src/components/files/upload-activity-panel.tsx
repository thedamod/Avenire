"use client";

import { Button } from "@avenire/ui/components/button";
import { Spinner } from "@avenire/ui/components/spinner";
import { AlertCircle, CheckCircle2, Waves, X, XCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  type FilesActivityItem,
  useFilesActivityStore,
} from "@/stores/filesActivityStore";
import { filesUiActions, useFilesUiStore } from "@/stores/filesUiStore";

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

export function UploadActivityPanel() {
  const pathname = usePathname();
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
    const match = pathname.match(/^\/workspace\/files\/([^/]+)/);
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

  useEffect(() => {
    if (!activeWorkspaceUuid || isFilesRoute) {
      return;
    }

    let cancelled = false;
    const hydrateRecentJobs = async () => {
      try {
        const response = await fetch(
          `/api/ai/ingestion/jobs?workspaceUuid=${activeWorkspaceUuid}&limit=60&windowMinutes=10`,
          { cache: "no-store" }
        );
        if (!(response.ok && !cancelled)) {
          return;
        }

        const payload = (await response.json()) as {
          jobs?: Array<{
            id: string;
            status: "failed" | "queued" | "running" | "succeeded";
            fileName?: string | null;
            fileId: string;
          }>;
        };
        const jobs = payload.jobs ?? [];
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
            const status: FilesActivityItem["status"] =
              job.status === "running"
                ? "ingesting"
                : job.status === "succeeded"
                  ? "uploaded"
                  : job.status;
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
      } catch {
        // ignore hydration failures
      }
    };

    void hydrateRecentJobs();
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceUuid, isFilesRoute, updateWorkspaceQueue]);

  useEffect(() => {
    if (!activeWorkspaceUuid) {
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
        void connect();
      }, 3000);
    };

    const connect = async () => {
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
          const payload = JSON.parse(messageEvent.data) as {
            jobId: string;
            eventType: string;
            payload?: Record<string, unknown>;
          };
          const cursor =
            typeof messageEvent.lastEventId === "string" &&
            messageEvent.lastEventId.length > 0
              ? messageEvent.lastEventId
              : null;
          if (cursor) {
            ingestionSseCursorRef.current = cursor;
          }
          const status: FilesActivityItem["status"] =
            payload.eventType === "job.failed"
              ? "failed"
              : payload.eventType === "job.succeeded"
                ? "uploaded"
                : "ingesting";

          updateWorkspaceQueue(activeWorkspaceUuid, (previous) => {
            const existingIndex = previous.findIndex(
              (item) => item.ingestionJobId === payload.jobId
            );
            if (existingIndex === -1) {
              return [
                ...previous,
                {
                  id: `job:${payload.jobId}`,
                  ingestionJobId: payload.jobId,
                  name:
                    typeof payload.payload?.fileName === "string"
                      ? payload.payload.fileName
                      : "Ingestion job",
                  sizeLabel: "—",
                  status,
                  error:
                    status === "failed" &&
                    typeof payload.payload?.error === "string"
                      ? `Ingestion failed for this file: ${payload.payload.error}`
                      : undefined,
                },
              ];
            }

            return previous.map((item, index) => {
              if (index !== existingIndex) {
                return item;
              }
              return {
                ...item,
                status,
                error:
                  status === "failed"
                    ? typeof payload.payload?.error === "string"
                      ? `Ingestion failed for this file: ${payload.payload.error}`
                      : "Ingestion failed"
                    : undefined,
                failureCount:
                  status === "failed" ? (item.failureCount ?? 0) + 1 : 0,
              };
            });
          });
        });
      } catch {
        scheduleReconnect();
      }
    };

    void connect();
    return () => {
      closed = true;
      cleanupCurrent();
      if (ingestionSseRetryTimerRef.current) {
        clearTimeout(ingestionSseRetryTimerRef.current);
        ingestionSseRetryTimerRef.current = null;
      }
    };
  }, [activeWorkspaceUuid, updateWorkspaceQueue]);

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

  return (
    <div
      className={cn(
        "fixed right-4 bottom-4 z-40 w-[22rem] overflow-hidden rounded-lg border border-border/70 bg-background transition-all duration-300",
        isQueueVisible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-3 opacity-0"
      )}
    >
      <div className="flex items-center justify-between border-border/70 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="font-medium text-sm">Upload activity</p>
          <p className="text-muted-foreground text-xs">
            {queue.length === 0
              ? "No recent uploads"
              : `${queue.length} item${queue.length === 1 ? "" : "s"} in this session`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 text-[11px]">
            <Waves className="size-3" />
            {uploadCount} active
          </span>
          {failedCount > 0 ? (
            <span className="rounded-full border border-destructive/50 bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">
              {failedCount} failed
            </span>
          ) : null}
          <Button
            className="h-7 w-7"
            onClick={() => {
              setIsQueueDismissed(true);
              filesUiActions.setUploadActivityOpen(false);
            }}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <X className="size-3.5" />
            <span className="sr-only">Close upload activity</span>
          </Button>
        </div>
      </div>
      <div className="max-h-[min(24rem,70vh)] overflow-y-auto px-4 py-3">
        {queue.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            No upload activity yet.
          </p>
        ) : (
          <div className="space-y-3">
            {queue.map((item) => {
              const meta = statusMeta(item.status);
              return (
                <div
                  className="space-y-2 rounded-md border border-border/50 p-2.5"
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
                        item.status === "failed"
                          ? "bg-destructive"
                          : item.status === "uploaded"
                            ? "bg-emerald-500"
                            : "bg-primary"
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
    </div>
  );
}
