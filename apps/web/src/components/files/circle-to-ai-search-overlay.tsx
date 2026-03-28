"use client";

import { useChat } from "@ai-sdk/react";
import { Button } from "@avenire/ui/components/button";
import { Input } from "@avenire/ui/components/input";
import { ScrollArea } from "@avenire/ui/components/scroll-area";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  DotsSixVertical as GripVertical, SpinnerGap as Loader2, PaperPlaneRight as SendHorizontal, MagicWand as WandSparkles, X } from "@phosphor-icons/react"
import { motion } from "motion/react";
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Markdown } from "@/components/chat/markdown";
import { cn } from "@/lib/utils";

interface Point {
  x: number;
  y: number;
}

interface SelectionRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface SnapshotPayload {
  base64: string;
  height: number;
  mimeType: string;
  width: number;
}

const MIN_SNAPSHOT_EDGE = 48;

const getMessageTextContent = (message: UIMessage | undefined): string => {
  if (!message?.parts?.length) {
    return "";
  }

  return message.parts
    .filter(
      (part): part is { type: "text"; text: string } => part.type === "text"
    )
    .map((part) => part.text)
    .join("")
    .trim();
};

interface CircleToAiSearchOverlayProps {
  children: ReactNode;
  enabled: boolean;
  fileKind: "pdf" | "image" | "video";
  fileName: string;
  onEnabledChange: (enabled: boolean) => void;
  workspaceUuid?: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function expandSelection(
  selection: SelectionRect,
  padding: number
): SelectionRect {
  return {
    x: selection.x - padding,
    y: selection.y - padding,
    width: selection.width + padding * 2,
    height: selection.height + padding * 2,
  };
}

function pointInRect(point: Point, rect: DOMRect | SelectionRect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function clampPointToRect(point: Point, rect: SelectionRect): Point {
  return {
    x: clamp(point.x, rect.x, rect.x + rect.width),
    y: clamp(point.y, rect.y, rect.y + rect.height),
  };
}

function getTargetRectWithinContainer(
  container: HTMLElement,
  target: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement
) {
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  return {
    x: targetRect.left - containerRect.left,
    y: targetRect.top - containerRect.top,
    width: targetRect.width,
    height: targetRect.height,
  };
}

function getSelectionBounds(points: Point[]) {
  if (points.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  return { x: minX, y: minY, width, height };
}

function buildPathData(points: Point[]) {
  if (points.length === 0) {
    return "";
  }

  return `${points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ")} Z`;
}

function intersectRect(
  a: SelectionRect,
  b: DOMRect | SelectionRect
): SelectionRect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return { x, y, width, height };
}

function getLocalPoint(event: ReactPointerEvent<HTMLElement>, rect: DOMRect) {
  return {
    x: clamp(event.clientX - rect.left, 0, rect.width),
    y: clamp(event.clientY - rect.top, 0, rect.height),
  };
}

function pickMediaTarget(container: HTMLElement, center: Point) {
  const candidates = Array.from(
    container.querySelectorAll<
      HTMLCanvasElement | HTMLImageElement | HTMLVideoElement
    >("canvas, img, video")
  ).map((element) => ({
    element,
    rect: element.getBoundingClientRect(),
  }));

  const containing = candidates.filter(({ rect }) => pointInRect(center, rect));
  if (containing.length > 0) {
    return containing[0]?.element ?? null;
  }

  const intersecting = candidates
    .map((candidate) => ({
      ...candidate,
      overlap: intersectRect(
        {
          x: center.x - 1,
          y: center.y - 1,
          width: 2,
          height: 2,
        },
        candidate.rect
      ),
    }))
    .filter((candidate) => candidate.overlap)
    .sort(
      (left, right) =>
        (right.overlap?.width ?? 0) * (right.overlap?.height ?? 0) -
        (left.overlap?.width ?? 0) * (left.overlap?.height ?? 0)
    );

  return intersecting[0]?.element ?? candidates[0]?.element ?? null;
}

function renderSnapshotFromSelection(input: {
  container: HTMLElement;
  fileKind: CircleToAiSearchOverlayProps["fileKind"];
  targetElement: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement;
  path: Point[];
  selection: SelectionRect;
}) {
  const { container, fileKind, path, selection, targetElement } = input;
  const target = targetElement;

  if (fileKind === "video" && target instanceof HTMLVideoElement) {
    target.pause();
  }

  const targetRect = getTargetRectWithinContainer(container, target);
  const intersected = intersectRect(selection, targetRect);
  if (!intersected) {
    return null;
  }

  let pixelWidth = target.width;
  let pixelHeight = target.height;
  if (target instanceof HTMLImageElement) {
    pixelWidth = target.naturalWidth;
    pixelHeight = target.naturalHeight;
  } else if (target instanceof HTMLVideoElement) {
    pixelWidth = target.videoWidth;
    pixelHeight = target.videoHeight;
  }

  if (
    !(
      pixelWidth > 0 &&
      pixelHeight > 0 &&
      targetRect.width > 0 &&
      targetRect.height > 0
    )
  ) {
    return null;
  }

  const scaleX = pixelWidth / targetRect.width;
  const scaleY = pixelHeight / targetRect.height;
  const sourceX = Math.max(0, (intersected.x - targetRect.x) * scaleX);
  const sourceY = Math.max(0, (intersected.y - targetRect.y) * scaleY);
  const sourceWidth = Math.min(
    pixelWidth - sourceX,
    intersected.width * scaleX
  );
  const sourceHeight = Math.min(
    pixelHeight - sourceY,
    intersected.height * scaleY
  );

  if (!(sourceWidth > 1 && sourceHeight > 1)) {
    return null;
  }

  const maxEdge = 1024;
  const resizeRatio = Math.min(
    1,
    maxEdge / Math.max(sourceWidth, sourceHeight)
  );
  const outputWidth = Math.max(1, Math.round(sourceWidth * resizeRatio));
  const outputHeight = Math.max(1, Math.round(sourceHeight * resizeRatio));

  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.imageSmoothingQuality = "high";
  context.save();
  context.beginPath();
  for (let index = 0; index < path.length; index += 1) {
    const point = path[index];
    if (!point) {
      continue;
    }

    const localX = (point.x - targetRect.x) * scaleX - sourceX;
    const localY = (point.y - targetRect.y) * scaleY - sourceY;

    if (index === 0) {
      context.moveTo(localX * resizeRatio, localY * resizeRatio);
    } else {
      context.lineTo(localX * resizeRatio, localY * resizeRatio);
    }
  }
  context.closePath();
  context.clip();
  context.drawImage(
    target,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    outputWidth,
    outputHeight
  );
  context.restore();

  try {
    return {
      base64: canvas.toDataURL("image/png").split(",")[1] ?? "",
      mimeType: "image/png",
      width: outputWidth,
      height: outputHeight,
    } satisfies SnapshotPayload;
  } catch {
    return null;
  }
}

function SearchPopover({
  clearSelection,
  draft,
  error,
  fileName,
  inputRef,
  isExpanded,
  isLoading,
  loadingText,
  messages,
  expandedHeight,
  onDraftChange,
  onDraftSubmit,
  onDragEnd,
  onDragMove,
  onDragStart,
  viewportPosition,
  position,
  showTranscript,
  workspaceUuid,
}: {
  clearSelection: () => void;
  draft: string;
  error: string | null;
  fileName: string;
  inputRef: RefObject<HTMLInputElement | null>;
  isExpanded: boolean;
  isLoading: boolean;
  loadingText: string;
  messages: UIMessage[];
  expandedHeight: number;
  onDraftChange: (value: string) => void;
  onDraftSubmit: () => void;
  onDragEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onDragMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onDragStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  viewportPosition: { x: number; y: number };
  position: { x: number; y: number };
  showTranscript: boolean;
  workspaceUuid?: string;
}) {
  const latestAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  const latestAssistantText = getMessageTextContent(latestAssistantMessage);
  const hasStartedConversation = messages.length > 0;
  const canSend = draft.trim().length > 0 && !isLoading;

  return (
    <motion.div
      animate={{ height: isExpanded ? expandedHeight : 136, opacity: 1 }}
      className="fixed z-40 w-[min(24rem,calc(100%-1rem))] overflow-hidden rounded-xl border border-border bg-card shadow-lg"
      initial={{ opacity: 0, height: 0 }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      style={{
        left: viewportPosition.x,
        top: viewportPosition.y,
      }}
      transition={{ type: "spring", damping: 28, stiffness: 320 }}
    >
      <div className="flex items-center gap-2 border-border/70 border-b bg-card px-3 py-2">
        <div
          className="flex cursor-move items-center gap-2 text-muted-foreground"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
        >
          <GripVertical className="size-4" />
          <div className="flex size-7 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <WandSparkles className="size-4" />
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] text-muted-foreground uppercase tracking-[0.22em]">
            Halo
          </div>
          <div className="truncate text-foreground text-xs">{fileName}</div>
        </div>
        <Button
          className="size-7 rounded-lg"
          onClick={clearSelection}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="flex h-full min-h-0 flex-col">
        {showTranscript ? (
          <ScrollArea className="min-h-0 flex-1 bg-card px-3 py-3">
            <div className="space-y-2 pr-2">
              {messages.length === 0 && !error ? (
                <div className="rounded-lg border border-border/70 border-dashed bg-background px-3 py-4 text-muted-foreground text-sm">
                  Ask Halo a question about the selection.
                </div>
              ) : null}

              {messages.map((message) => {
                const text = getMessageTextContent(message);
                if (!text) {
                  return null;
                }

                const isUser = message.role === "user";
                return (
                  <div
                    className={cn(
                      "max-w-[92%] rounded-lg px-3 py-2 text-sm leading-6",
                      isUser
                        ? "ml-auto bg-secondary text-secondary-foreground"
                        : "border border-border/70 bg-background text-foreground shadow-sm"
                    )}
                    key={message.id}
                  >
                    <Markdown
                      className={cn(
                        "max-w-full break-words",
                        isUser ? "text-secondary-foreground" : "text-foreground"
                      )}
                      content={text}
                      id={`${message.id}-${message.role}`}
                      textSize="small"
                      workspaceUuid={workspaceUuid}
                    />
                  </div>
                );
              })}

              {isLoading ? (
                <div className="space-y-2 rounded-lg border border-border/70 bg-background px-3 py-2 shadow-sm">
                  <div className="shimmer-bar h-3 w-5/6 rounded-full bg-muted" />
                  <div className="shimmer-bar h-3 w-4/5 rounded-full bg-muted" />
                </div>
              ) : null}

              {error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
                  {error}
                </div>
              ) : null}

              {latestAssistantText && !isLoading ? (
                <div className="text-muted-foreground text-xs">
                  Latest answer ready. Ask Halo a follow-up below.
                </div>
              ) : null}

              {!latestAssistantText && isLoading ? (
                <div className="text-muted-foreground text-xs">
                  {loadingText}
                </div>
              ) : null}
            </div>
          </ScrollArea>
        ) : null}

        <div className="border-border/70 border-t bg-card p-3">
          <div className="flex items-end gap-2">
            <Input
              autoComplete="off"
              className="h-9 flex-1 rounded-lg bg-background"
              onChange={(event) => onDraftChange(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey) {
                  return;
                }
                event.preventDefault();
                onDraftSubmit();
              }}
              placeholder={
                hasStartedConversation
                  ? "Ask a follow-up..."
                  : "Ask about the selection..."
              }
              ref={inputRef}
              value={draft}
            />
            <Button
              className="shrink-0 rounded-lg"
              disabled={!canSend}
              onClick={onDraftSubmit}
              size="sm"
              type="button"
            >
              <SendHorizontal className="mr-1 size-3.5" />
              Send
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function CircleToAiSearchOverlay({
  children,
  fileKind,
  fileName,
  enabled,
  workspaceUuid,
  onEnabledChange,
}: CircleToAiSearchOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    targetElement: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement;
    pointerId: number;
  } | null>(null);
  const panelDragStateRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const chatIdRef = useRef("");
  if (!chatIdRef.current) {
    chatIdRef.current = `halo-search-${crypto.randomUUID()}`;
  }
  const selectionSnapshotRef = useRef<{
    base64: string;
    mimeType: string;
  } | null>(null);
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [selectionPath, setSelectionPath] = useState<Point[]>([]);
  const selectionPathRef = useRef<Point[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [panelPosition, setPanelPosition] = useState({ x: 12, y: 12 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [containerOffset, setContainerOffset] = useState({ left: 0, top: 0 });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: {
          ephemeral: true,
        },
        prepareSendMessagesRequest: (options) => {
          const snapshot = selectionSnapshotRef.current;
          return {
            body: {
              ...options.body,
              id: options.id,
              messages: options.messages,
              trigger: options.trigger,
              messageId: options.messageId,
              selectionBase64: snapshot?.base64 ?? null,
              selectionMediaType: snapshot?.mimeType ?? null,
            },
          };
        },
      }),
    []
  );

  const { messages, setMessages, sendMessage, stop, status, clearError } =
    useChat<UIMessage>({
      id: chatIdRef.current,
      transport,
      onFinish: ({ message }) => {
        if (!getMessageTextContent(message)) {
          setError("No clear answer was returned.");
        }
      },
      onError: (chatError) => {
        setError(chatError.message || "Halo failed.");
      },
    });
  const loading = status === "submitted" || status === "streaming";
  const hasConversation = messages.length > 0;
  const showTranscript = hasConversation || loading || error !== null;
  const clampPanelPosition = useCallback(
    (nextPosition: { x: number; y: number }, expanded = showTranscript) => {
      const panelWidth = Math.min(384, Math.max(0, containerSize.width - 16));
      const collapsedHeight = 136;
      const expandedHeight = Math.min(
        512,
        Math.max(collapsedHeight, containerSize.height - 16)
      );
      const panelHeight = expanded ? expandedHeight : collapsedHeight;
      const maxX = Math.max(8, containerSize.width - panelWidth - 8);
      const maxY = Math.max(8, containerSize.height - panelHeight - 8);
      return {
        x: clamp(nextPosition.x, 8, maxX),
        y: clamp(nextPosition.y, 8, maxY),
      };
    },
    [containerSize.height, containerSize.width, showTranscript]
  );
  const expandedPanelHeight = Math.min(
    512,
    Math.max(136, containerSize.height - 16)
  );

  const activeSelection = useMemo(() => {
    if (selectionPath.length === 0) {
      return null;
    }

    const bounds = getSelectionBounds(selectionPath);
    if (!bounds) {
      return null;
    }

    const padding = Math.max(
      12,
      Math.round(Math.min(bounds.width, bounds.height) * 0.18)
    );
    return expandSelection(bounds, padding);
  }, [selectionPath]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setContainerSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
      setContainerOffset({
        left: rect.left,
        top: rect.top,
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    const handleViewportChange = () => updateSize();
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, []);

  useEffect(() => {
    selectionPathRef.current = selectionPath;
  }, [selectionPath]);

  useEffect(() => {
    if (!enabled) {
      stop();
      clearError();
      setMessages([]);
      selectionSnapshotRef.current = null;
      setSelection(null);
      setSelectionPath([]);
      setDraft("");
      setPanelPosition({ x: 12, y: 12 });
      panelDragStateRef.current = null;
      setError(null);
    }
  }, [clearError, enabled, setMessages, stop]);

  const clearSelection = useCallback(() => {
    stop();
    clearError();
    setMessages([]);
    selectionSnapshotRef.current = null;
    setSelection(null);
    setSelectionPath([]);
    setDraft("");
    setPanelPosition({ x: 12, y: 12 });
    panelDragStateRef.current = null;
    setError(null);
  }, [clearError, setMessages, stop]);

  const closeOverlay = useCallback(() => {
    clearSelection();
    onEnabledChange(false);
  }, [clearSelection, onEnabledChange]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeOverlay();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeOverlay]);

  const finalizeSelection = async (input: {
    points: Point[];
    targetElement: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement;
  }) => {
    const { points, targetElement } = input;
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const bounds = getSelectionBounds(points);
    if (!bounds) {
      return;
    }

    const paddedSelection = expandSelection(
      bounds,
      Math.max(12, Math.round(Math.min(bounds.width, bounds.height) * 0.18))
    );
    setSelection(paddedSelection);
    setSelectionPath(points);
    setError(null);
    clearError();
    stop();
    setMessages([]);

    try {
      const snapshot = await renderSnapshotFromSelection({
        container,
        fileKind,
        path: points,
        selection: paddedSelection,
        targetElement,
      });
      if (!snapshot) {
        throw new Error("Unable to capture the selected area.");
      }
      if (
        snapshot.width < MIN_SNAPSHOT_EDGE ||
        snapshot.height < MIN_SNAPSHOT_EDGE
      ) {
        throw new Error("Selection is too small to inspect.");
      }

      if (!snapshot.base64) {
        throw new Error("Unable to encode the selected area.");
      }

      selectionSnapshotRef.current = {
        base64: snapshot.base64,
        mimeType: snapshot.mimeType,
      };
      setDraft("");
      setPanelPosition(
        clampPanelPosition(
          {
            x: paddedSelection.x + paddedSelection.width + 14,
            y: paddedSelection.y + (paddedSelection.height > 120 ? 12 : -8),
          },
          false
        )
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to inspect the selection."
      );
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled) {
      return;
    }

    const element = containerRef.current;
    if (!element) {
      return;
    }

    const bounds = element.getBoundingClientRect();
    const start = getLocalPoint(event, bounds);
    const target = pickMediaTarget(element, start);
    if (!target) {
      return;
    }

    const targetBounds = getTargetRectWithinContainer(element, target);
    if (!pointInRect(start, targetBounds)) {
      return;
    }

    if (
      fileKind === "video" &&
      target instanceof HTMLVideoElement &&
      !target.paused
    ) {
      target.pause();
    }

    const clampedStart = clampPointToRect(start, targetBounds);

    dragStateRef.current = {
      targetElement: target,
      pointerId: event.pointerId,
    };
    stop();
    clearError();
    setMessages([]);
    setDraft("");
    setPanelPosition({ x: 12, y: 12 });
    selectionSnapshotRef.current = null;
    setSelectionPath([clampedStart]);
    setSelection({
      x: clampedStart.x,
      y: clampedStart.y,
      width: 1,
      height: 1,
    });
    setError(null);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const element = containerRef.current;
    if (!element) {
      return;
    }

    const bounds = element.getBoundingClientRect();
    const targetBounds = getTargetRectWithinContainer(
      element,
      dragState.targetElement
    );
    const nextPoint = clampPointToRect(
      getLocalPoint(event, bounds),
      targetBounds
    );
    setSelectionPath((current) => {
      const last = current.at(-1);
      if (last) {
        const distance = Math.hypot(nextPoint.x - last.x, nextPoint.y - last.y);
        if (distance < 3) {
          return current;
        }
      }

      const next = [...current, nextPoint];
      const nextBounds = getSelectionBounds(next);
      if (nextBounds) {
        setSelection(nextBounds);
      }
      return next;
    });
  };

  const handlePointerUp = async (event: ReactPointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    dragStateRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore browsers that do not expose pointer capture on the synthetic event.
    }

    const element = containerRef.current;
    if (!element) {
      return;
    }

    const bounds = element.getBoundingClientRect();
    const targetBounds = getTargetRectWithinContainer(
      element,
      dragState.targetElement
    );
    const end = clampPointToRect(getLocalPoint(event, bounds), targetBounds);
    const points = [...selectionPathRef.current, end];
    const selectionBounds = getSelectionBounds(points);
    if (
      !selectionBounds ||
      selectionBounds.width < 10 ||
      selectionBounds.height < 10 ||
      points.length < 3
    ) {
      setSelection(null);
      setSelectionPath([]);
      return;
    }

    await finalizeSelection({
      points,
      targetElement: dragState.targetElement,
    });
  };

  const handleDraftSubmit = useCallback(() => {
    const prompt = draft.trim();
    if (!(prompt && selectionSnapshotRef.current)) {
      return;
    }

    clearError();
    setError(null);
    sendMessage({ text: prompt });
    setDraft("");
  }, [clearError, draft, sendMessage]);

  const handlePanelDragStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      panelDragStateRef.current = {
        pointerId: event.pointerId,
        offsetX: event.clientX - panelPosition.x,
        offsetY: event.clientY - panelPosition.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [panelPosition.x, panelPosition.y]
  );

  const handlePanelDragMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const dragState = panelDragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      setPanelPosition(
        clampPanelPosition(
          {
            x: event.clientX - dragState.offsetX,
            y: event.clientY - dragState.offsetY,
          },
          showTranscript
        )
      );
    },
    [clampPanelPosition, showTranscript]
  );

  const handlePanelDragEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore pointer capture mismatches on some browsers.
      }
      panelDragStateRef.current = null;
    },
    []
  );

  const selectionPathData = useMemo(
    () => buildPathData(selectionPath),
    [selectionPath]
  );

  useEffect(() => {
    if (!(selectionSnapshotRef.current && selection)) {
      return;
    }

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selection]);

  useEffect(() => {
    if (!selection) {
      return;
    }

    setPanelPosition((current) => clampPanelPosition(current, showTranscript));
  }, [clampPanelPosition, selection, showTranscript]);

  return (
    <div className="relative h-full min-h-0 w-full" ref={containerRef}>
      {children}

      <div className="pointer-events-none absolute inset-0 z-20">
        {enabled ? (
          <section
            aria-label="Halo search surface"
            className="pointer-events-auto absolute inset-0 cursor-crosshair"
            onPointerDownCapture={(event) => {
              if (
                selectionSnapshotRef.current &&
                event.target === event.currentTarget
              ) {
                event.preventDefault();
                event.stopPropagation();
                closeOverlay();
              }
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {activeSelection ? (
              <svg
                className="absolute inset-0 h-full w-full"
                viewBox={`0 0 ${containerSize.width} ${containerSize.height}`}
              >
                <title>Halo selection overlay</title>
                <defs>
                  <linearGradient
                    id="circle-to-ai-fill-gradient"
                    x1="0%"
                    x2="100%"
                    y1="0%"
                    y2="0%"
                  >
                    <stop offset="0%" stopColor="rgba(99,102,241,0)" />
                    <stop offset="25%" stopColor="rgba(99,102,241,0.08)" />
                    <stop offset="50%" stopColor="rgba(99,102,241,0.18)" />
                    <stop offset="75%" stopColor="rgba(99,102,241,0.08)" />
                    <stop offset="100%" stopColor="rgba(99,102,241,0)" />
                    <animateTransform
                      attributeName="gradientTransform"
                      dur="2s"
                      repeatCount="indefinite"
                      type="translate"
                      values="-1 0; 1 0"
                    />
                  </linearGradient>
                  <filter
                    height="200%"
                    id="circle-to-ai-glow"
                    width="200%"
                    x="-50%"
                    y="-50%"
                  >
                    <feGaussianBlur result="blur" stdDeviation="3" />
                    <feComposite
                      in="SourceGraphic"
                      in2="blur"
                      operator="over"
                    />
                  </filter>
                </defs>
                <path
                  d={selectionPathData}
                  fill="url(#circle-to-ai-fill-gradient)"
                  fillRule="evenodd"
                  stroke="rgba(99,102,241,0.9)"
                  strokeDasharray="6 4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  style={{
                    filter: "url(#circle-to-ai-glow)",
                    animation: "circle-to-ai-dash 1s linear infinite",
                  }}
                />
              </svg>
            ) : null}

            {selection ? (
              <SearchPopover
                clearSelection={closeOverlay}
                draft={draft}
                error={error}
                fileName={fileName}
                inputRef={inputRef}
                isExpanded={showTranscript}
                isLoading={loading}
                loadingText="Halo is thinking through the selection..."
                expandedHeight={expandedPanelHeight}
                messages={messages}
                onDraftChange={setDraft}
                onDraftSubmit={handleDraftSubmit}
                onDragEnd={handlePanelDragEnd}
                onDragMove={handlePanelDragMove}
                onDragStart={handlePanelDragStart}
                viewportPosition={{
                  x: containerOffset.left + panelPosition.x,
                  y: containerOffset.top + panelPosition.y,
                }}
                position={panelPosition}
                showTranscript={showTranscript}
                workspaceUuid={workspaceUuid}
              />
            ) : null}
          </section>
        ) : null}
      </div>

      <style global jsx>{`
        @keyframes circle-to-ai-shimmer {
          0% {
            transform: translateX(-115%);
          }
          100% {
            transform: translateX(115%);
          }
        }

        @keyframes circle-to-ai-dash {
          0% {
            stroke-dashoffset: 0;
          }
          100% {
            stroke-dashoffset: -20;
          }
        }

        .shimmer-bar {
          position: relative;
          overflow: hidden;
        }

        .shimmer-bar::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            110deg,
            transparent 0%,
            rgba(255, 255, 255, 0.45) 35%,
            transparent 70%
          );
          animation: circle-to-ai-shimmer 1.2s linear infinite;
        }
      `}</style>
    </div>
  );
}
