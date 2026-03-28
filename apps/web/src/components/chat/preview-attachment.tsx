"use client";

import { Button } from "@avenire/ui/components/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, } from "@avenire/ui/components/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, } from "@avenire/ui/components/tooltip";
import {
  FileMediaPlayer, type MediaPlaybackSource, useMediaPlaybackSource, } from "@avenire/ui/media";
import { Spinner } from "@avenire/ui/components/spinner";
import { File, FileCode as FileCode2, SpinnerGap as LoaderIcon, X } from "@phosphor-icons/react"
import { motion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Attachment } from "@/components/chat/attachment";
import {
  primeMediaPlayback,
  releaseMediaPlaybackPrime,
  resolveCachedPlaybackSource,
} from "@/lib/file-preview-cache";
import {
  buildProgressivePlaybackSource,
  type MediaPlaybackDescriptor,
} from "@/lib/media-playback";
import { cn } from "@/lib/utils";

const PDFViewer = dynamic(() => import("@/components/files/pdf-viewer"), {
  ssr: false,
  loading: () => (
    <div className="inline-flex items-center gap-2 p-4 text-muted-foreground text-sm">
      <Spinner className="size-4" />
      Loading PDF...
    </div>
  ),
});

const CODE_MIME_MATCHERS = [
  "application/json",
  "application/javascript",
  "application/typescript",
  "text/javascript",
  "text/typescript",
  "text/x-python",
  "text/x-c",
  "text/x-c++",
  "text/x-java",
  "text/x-rust",
  "text/html",
  "text/css",
];

const CODE_EXTENSIONS = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "json",
  "py",
  "md",
  "go",
  "rs",
  "java",
  "cpp",
  "c",
  "sql",
  "yaml",
  "yml",
  "sh",
];

const isCodeLike = (contentType?: string, name?: string) => {
  if (!(contentType || name)) {
    return false;
  }
  if (
    contentType &&
    (CODE_MIME_MATCHERS.includes(contentType) ||
      contentType.startsWith("text/"))
  ) {
    return true;
  }

  const extension = name?.split(".").pop()?.toLowerCase();
  return Boolean(extension && CODE_EXTENSIONS.includes(extension));
};

const playbackDescriptorCache = new Map<
  string,
  MediaPlaybackDescriptor | Promise<MediaPlaybackDescriptor | null> | null
>();

const attachmentPreviewDialogClassName =
  "h-[100dvh] w-screen max-w-none rounded-none border-0 p-0 sm:h-[92vh] sm:w-[96vw] sm:max-w-[1200px] sm:rounded-xl sm:border lg:max-w-[1280px]";

async function fetchWorkspacePlaybackDescriptor(
  workspaceUuid: string,
  workspaceFileId: string
) {
  const cacheKey = `${workspaceUuid}:${workspaceFileId}`;
  const cached = playbackDescriptorCache.get(cacheKey);
  if (cached && !(cached instanceof Promise)) {
    return cached;
  }
  if (cached instanceof Promise) {
    return await cached;
  }

  const request = fetch(
    `/api/workspaces/${workspaceUuid}/files/${workspaceFileId}/playback`,
    {
      cache: "force-cache",
      credentials: "include",
    }
  )
    .then(async (response) => {
      if (!response.ok) {
        return null;
      }
      return (await response.json()) as MediaPlaybackDescriptor;
    })
    .catch(() => null)
    .finally(() => {
      const current = playbackDescriptorCache.get(cacheKey);
      if (current === request) {
        playbackDescriptorCache.delete(cacheKey);
      }
    });

  playbackDescriptorCache.set(cacheKey, request);
  const resolved = await request;
  if (resolved?.status === "ready") {
    playbackDescriptorCache.set(cacheKey, resolved);
  } else {
    playbackDescriptorCache.delete(cacheKey);
  }
  return resolved;
}

function InlineVideoPreview({
  autoPlay = false,
  className,
  muted = true,
  playbackSource,
  posterUrl,
}: {
  autoPlay?: boolean;
  className?: string;
  muted?: boolean;
  playbackSource: MediaPlaybackSource;
  posterUrl?: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [resolvedSource, setResolvedSource] = useState(() =>
    resolveCachedPlaybackSource(playbackSource)
  );

  useMediaPlaybackSource({
    mediaRef: videoRef,
    playbackSource: resolvedSource,
  });

  useEffect(() => {
    setResolvedSource(resolveCachedPlaybackSource(playbackSource));
  }, [playbackSource]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (!autoPlay) {
      video.pause();
      video.currentTime = 0;
      return;
    }

    const startPlayback = async () => {
      try {
        video.loop = true;
        await video.play();
      } catch {
        // Browser may require a gesture.
      }
    };
    startPlayback().catch(() => undefined);

    return () => {
      video.pause();
      video.currentTime = 0;
    };
  }, [autoPlay, resolvedSource]);

  return (
    <video
      className={className}
      muted={muted}
      playsInline
      poster={posterUrl ?? undefined}
      preload={autoPlay ? "auto" : "metadata"}
      ref={videoRef}
    />
  );
}

export function PreviewAttachment({
  attachment,
  onRemove,
  variant = "default",
  workspaceUuid,
}: {
  attachment: Partial<Attachment>;
  onRemove?: (attachmentId: string) => void;
  variant?: "composer" | "default" | "tag";
  workspaceUuid?: string;
}) {
  const {
    id,
    name,
    url,
    contentType,
    status,
    file,
    errorMessage,
    source,
    sizeBytes,
    workspaceFileId,
  } = attachment;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [playbackDescriptor, setPlaybackDescriptor] =
    useState<MediaPlaybackDescriptor | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [isLoadingText, setIsLoadingText] = useState(false);
  const workspaceStreamUrl =
    source === "workspace" && workspaceUuid && workspaceFileId
      ? `/api/workspaces/${workspaceUuid}/files/${workspaceFileId}/stream`
      : null;
  const previewUrl = workspaceStreamUrl ?? url;

  const fileSize = useMemo(() => {
    const resolvedSize = file?.size ?? sizeBytes;
    if (!resolvedSize) {
      return "";
    }
    const sizeInKB = resolvedSize / 1024;
    if (sizeInKB < 1024) {
      return `${sizeInKB.toFixed(1)}KB`;
    }
    return `${(sizeInKB / 1024).toFixed(1)}MB`;
  }, [file?.size, sizeBytes]);

  const canPreview = useMemo(
    () =>
      status === "completed" &&
      Boolean(
        (contentType?.startsWith("image") ||
          contentType?.startsWith("video") ||
          contentType === "application/pdf" ||
          isCodeLike(contentType, name)) &&
          previewUrl
      ),
    [contentType, name, previewUrl, status]
  );

  useEffect(() => {
    if (
      contentType?.startsWith("video") &&
      status === "completed" &&
      url &&
      source === "workspace" &&
      workspaceUuid &&
      workspaceFileId
    ) {
      fetchWorkspacePlaybackDescriptor(workspaceUuid, workspaceFileId).then(
        (descriptor) => {
          setPlaybackDescriptor(
            descriptor ??
              ({
                fallbackSource: buildProgressivePlaybackSource(
                  url,
                  contentType
                ),
                posterUrl: null,
                preferredSource: buildProgressivePlaybackSource(
                  url,
                  contentType
                ),
                status: "ready",
              } satisfies MediaPlaybackDescriptor)
          );
        }
      );
      return;
    }

    if (contentType?.startsWith("video") && status === "completed" && url) {
      const progressive = buildProgressivePlaybackSource(url, contentType);
      setPlaybackDescriptor({
        fallbackSource: progressive,
        posterUrl: null,
        preferredSource: progressive,
        status: "ready",
      });
      return;
    }

    setPlaybackDescriptor(null);
  }, [contentType, source, status, url, workspaceFileId, workspaceUuid]);

  useEffect(() => {
    if (
      !(
        contentType?.startsWith("video") &&
        playbackDescriptor &&
        (isHovered || isModalOpen)
      )
    ) {
      return;
    }

    primeMediaPlayback(playbackDescriptor.preferredSource, {
      mediaType: "video",
      posterUrl: playbackDescriptor.posterUrl,
      sizeBytes,
      surface: "attachment",
    }).catch(() => undefined);
    return () => {
      releaseMediaPlaybackPrime(playbackDescriptor.preferredSource);
    };
  }, [contentType, isHovered, isModalOpen, playbackDescriptor, sizeBytes]);

  const loadTextPreview = async () => {
    if (
      !previewUrl ||
      status !== "completed" ||
      !isCodeLike(contentType, name) ||
      textPreview ||
      isLoadingText
    ) {
      return;
    }

    setIsLoadingText(true);
    try {
      if (file) {
        setTextPreview(await file.text());
      } else if (source === "workspace" && workspaceUuid && workspaceFileId) {
        const response = await fetch(
          `/api/workspaces/${workspaceUuid}/files/${workspaceFileId}/stream`,
          {
            headers: {
              Accept: "text/plain,text/markdown,text/*,*/*",
            },
          }
        );
        if (!response.ok) {
          throw new Error(`Failed to load preview: ${response.status}`);
        }
        setTextPreview(await response.text());
      } else {
        const response = await fetch(previewUrl);
        if (!response.ok) {
          throw new Error(`Failed to load preview: ${response.status}`);
        }
        setTextPreview(await response.text());
      }
    } catch {
      toast.error("Failed to load code preview");
    } finally {
      setIsLoadingText(false);
    }
  };

  const renderThumbnail = () => {
    if (contentType?.startsWith("image") && url) {
      return (
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
          <img
            alt={name ?? "An image attachment"}
            className="h-full w-full object-cover"
            height={48}
            src={url}
            width={48}
          />
          {(status === "uploading" || status === "pending") && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <LoaderIcon className="h-4 w-4 animate-spin text-white" />
            </div>
          )}
        </div>
      );
    }

    if (contentType?.startsWith("video") && url) {
      return (
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
          {playbackDescriptor?.posterUrl ? (
            <img
              alt={name ?? "A video attachment"}
              className="h-full w-full object-cover"
              height={48}
              src={playbackDescriptor.posterUrl}
              width={48}
            />
          ) : (
            <video className="h-full w-full object-cover" muted src={url} />
          )}
          {(status === "uploading" || status === "pending") && (
            <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/20">
              <LoaderIcon className="h-4 w-4 animate-spin text-foreground" />
            </div>
          )}
        </div>
      );
    }

    if (contentType === "application/pdf") {
      return (
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-red-200 bg-red-50 font-semibold text-[10px] text-red-600">
          PDF
          {(status === "uploading" || status === "pending") && (
            <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/20">
              <LoaderIcon className="h-4 w-4 animate-spin text-foreground" />
            </div>
          )}
        </div>
      );
    }

    if (isCodeLike(contentType, name)) {
      return (
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-green-200 bg-green-50">
          <FileCode2 className="h-5 w-5 text-green-700" />
          {(status === "uploading" || status === "pending") && (
            <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/20">
              <LoaderIcon className="h-4 w-4 animate-spin text-foreground" />
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-md border bg-muted">
        <File className="h-6 w-6 text-muted-foreground" />
        {(status === "uploading" || status === "pending") && (
          <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/20">
            <LoaderIcon className="h-4 w-4 animate-spin text-foreground" />
          </div>
        )}
      </div>
    );
  };

  const renderPillIcon = () => {
    const isBusy = status === "uploading" || status === "pending";

    return (
      <div className="relative flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
        <File className="h-4 w-4" />
        {isBusy ? (
          <span className="absolute -right-0.5 -bottom-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background">
            <LoaderIcon className="h-2.5 w-2.5 animate-spin text-muted-foreground" />
          </span>
        ) : null}
      </div>
    );
  };

  const renderHoverPreview = () => {
    if (contentType?.startsWith("image") && url && status === "completed") {
      return (
        <div className="max-w-xs">
          <img
            alt={name ?? "Preview"}
            className="max-h-48 max-w-full rounded-md object-cover"
            height={192}
            src={url}
            width={320}
          />
        </div>
      );
    }

    if (contentType?.startsWith("video") && url && status === "completed") {
      return (
        <div className="max-w-xs">
          {playbackDescriptor ? (
            <InlineVideoPreview
              autoPlay
              className="max-h-48 max-w-full rounded-md"
              playbackSource={playbackDescriptor.preferredSource}
              posterUrl={playbackDescriptor.posterUrl}
            />
          ) : (
            <video
              className="max-h-48 max-w-full rounded-md"
              controls
              src={url}
            >
              <track kind="captions" />
            </video>
          )}
        </div>
      );
    }

    if (isCodeLike(contentType, name) && textPreview) {
      return (
        <div className="max-w-xs rounded-md bg-muted p-3">
          <pre className="whitespace-pre-wrap font-mono text-xs">
            {textPreview.substring(0, 300) +
              (textPreview.length > 300 ? "..." : "")}
          </pre>
        </div>
      );
    }

    return null;
  };

  const renderModalContent = () => {
    if (
      contentType?.startsWith("image") &&
      previewUrl &&
      status === "completed"
    ) {
      return (
        <div className="flex justify-center">
          <img
            alt={name ?? "Full preview"}
            className="max-h-[70vh] max-w-full rounded-md object-contain"
            height={720}
            src={previewUrl}
            width={1024}
          />
        </div>
      );
    }

    if (
      contentType?.startsWith("video") &&
      previewUrl &&
      status === "completed"
    ) {
      return (
        <div className="flex justify-center">
          {playbackDescriptor ? (
            <FileMediaPlayer
              className="w-full max-w-4xl"
              kind="video"
              name={name ?? "Video attachment"}
              openedCached
              playbackSource={playbackDescriptor.preferredSource}
              posterUrl={playbackDescriptor.posterUrl}
            />
          ) : (
            <video
              className="max-h-[70vh] max-w-full rounded-md object-contain"
              controls
              src={previewUrl}
            >
              <track kind="captions" />
            </video>
          )}
        </div>
      );
    }

    if (
      contentType === "application/pdf" &&
      previewUrl &&
      status === "completed"
    ) {
      if (previewUrl.startsWith("blob:")) {
        return (
          <iframe
            className="h-[75vh] w-full rounded-md border"
            src={previewUrl}
            title={name ?? "PDF preview"}
          />
        );
      }

      return (
        <div className="h-[75vh]">
          <PDFViewer className="h-full w-full" source={previewUrl} />
        </div>
      );
    }

    if (isCodeLike(contentType, name) && status === "completed") {
      return (
        <div className="max-h-[70vh] overflow-auto">
          {isLoadingText ? (
            <p className="inline-flex items-center gap-2 p-4 text-muted-foreground text-sm">
              <Spinner className="size-4" />
              Loading preview...
            </p>
          ) : (
            <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 font-mono text-sm">
              {textPreview ?? "No preview available."}
            </pre>
          )}
        </div>
      );
    }

    return (
      <div className="py-8 text-center">
        <File className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
        <p className="text-muted-foreground">
          Preview not available for this file type
        </p>
      </div>
    );
  };

  if (variant === "composer") {
    return (
      <TooltipProvider delay={280}>
        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          className="group relative"
          exit={{ opacity: 0, scale: 0.92 }}
          initial={{ opacity: 0, scale: 0.92 }}
          transition={{ duration: 0.18 }}
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={name ?? "Attachment"}
                  className={cn(
                    "relative flex h-7 min-w-0 max-w-[240px] items-center gap-1.5 overflow-hidden rounded-md border border-border/80 bg-background px-2.5 pr-7 text-left transition-colors hover:bg-muted"
                  )}
                  onBlur={() => setIsHovered(false)}
                  onClick={() => {
                    setIsModalOpen(true);
                    if (canPreview) {
                      loadTextPreview().catch(() => undefined);
                    }
                  }}
                  onFocus={() => setIsHovered(true)}
                  onMouseEnter={() => {
                    setIsHovered(true);
                    loadTextPreview().catch(() => undefined);
                  }}
                  onMouseLeave={() => setIsHovered(false)}
                  type="button"
                  variant="ghost"
                />
              }
            >
              {renderPillIcon()}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-[12px] text-foreground leading-none">
                  {name ?? "Unnamed file"}
                </p>
              </div>

              {onRemove && id ? (
                <Button
                  className="absolute top-1/2 right-1 z-10 h-4.5 w-4.5 -translate-y-1/2 rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(id);
                  }}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <X className="h-2.5 w-2.5" />
                </Button>
              ) : null}
            </TooltipTrigger>

            <TooltipContent className="p-2" side="top">
              {renderHoverPreview() || (
                <div className="max-w-xs">
                  <p className="font-medium text-sm">{name ?? "Attachment"}</p>
                  {(fileSize || source === "workspace") && (
                    <p className="text-muted-foreground text-xs">
                      {[
                        fileSize,
                        source === "workspace" ? "Workspace file" : null,
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </p>
                  )}
                </div>
              )}
            </TooltipContent>
          </Tooltip>

          <Dialog
            onOpenChange={(nextOpen) => {
              setIsModalOpen(nextOpen);
              if (!nextOpen) {
                setIsHovered(false);
              }
            }}
            open={isModalOpen}
          >
            <DialogContent className={attachmentPreviewDialogClassName}>
              <div className="flex h-full flex-col overflow-hidden bg-background sm:rounded-xl">
                <DialogHeader className="border-border/60 border-b px-4 py-4 sm:px-6">
                  <DialogTitle className="flex items-center gap-2">
                    {renderThumbnail()}
                    <span className="max-w-75 truncate">
                      {name ?? "Attachment"}
                    </span>
                    {fileSize && (
                      <span className="text-muted-foreground text-sm">
                        ({fileSize})
                      </span>
                    )}
                  </DialogTitle>
                </DialogHeader>
                <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
                  {renderModalContent()}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </motion.div>
      </TooltipProvider>
    );
  }

  if (variant === "tag") {
    return (
      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        className="group relative inline-flex max-w-full"
        exit={{ opacity: 0, scale: 0.92 }}
        initial={{ opacity: 0, scale: 0.92 }}
        transition={{ duration: 0.18 }}
      >
        <Button
          aria-label={name ?? "Attachment"}
          className="flex h-6 min-w-0 max-w-[240px] items-center gap-1.5 rounded-md border border-border/80 bg-muted px-2 text-xs text-foreground hover:bg-muted/90"
          onClick={() => {
            setIsModalOpen(true);
            if (canPreview) {
              loadTextPreview().catch(() => undefined);
            }
          }}
          type="button"
          variant="ghost"
        >
          <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{name ?? "Unnamed file"}</span>
        </Button>

        {onRemove && id ? (
          <Button
            className="-top-1 -right-1 absolute z-10 h-4 w-4 rounded-full border border-border bg-background text-muted-foreground hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(id);
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="h-2.5 w-2.5" />
          </Button>
        ) : null}

        <Dialog
          onOpenChange={(nextOpen) => {
            setIsModalOpen(nextOpen);
            if (!nextOpen) {
              setIsHovered(false);
            }
          }}
          open={isModalOpen}
        >
          <DialogContent className={attachmentPreviewDialogClassName}>
            <div className="flex h-full flex-col overflow-hidden bg-background sm:rounded-xl">
              <DialogHeader className="border-border/60 border-b px-4 py-4 sm:px-6">
                <DialogTitle className="flex items-center gap-2">
                  {renderThumbnail()}
                  <span className="max-w-75 truncate">
                    {name ?? "Attachment"}
                  </span>
                  {fileSize && (
                    <span className="text-muted-foreground text-sm">
                      ({fileSize})
                    </span>
                  )}
                </DialogTitle>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
                {renderModalContent()}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </motion.div>
    );
  }

  return (
    <TooltipProvider delay={280}>
      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        className="group relative max-w-sm"
        exit={{ opacity: 0, scale: 0.8 }}
        initial={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.2 }}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={name ?? "Open attachment preview"}
                className={`rounded-full border border-border bg-secondary px-3 py-2 transition-colors hover:bg-muted ${
                  canPreview ? "cursor-pointer" : ""
                }`}
                onBlur={() => setIsHovered(false)}
                onClick={() => {
                  setIsModalOpen(true);
                  if (canPreview) {
                    loadTextPreview().catch(() => undefined);
                  }
                }}
                onFocus={() => setIsHovered(true)}
                onMouseEnter={() => {
                  setIsHovered(true);
                  loadTextPreview().catch(() => undefined);
                }}
                onMouseLeave={() => setIsHovered(false)}
                size="default"
                type="button"
                variant="ghost"
              />
            }
          >
            <div className="flex items-center gap-2.5">
              <div className="shrink-0">{renderPillIcon()}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground text-sm leading-none">
                  {name ?? "Unnamed file"}
                </p>
                {errorMessage && (
                  <p className="truncate text-destructive text-xs">
                    {errorMessage}
                  </p>
                )}
              </div>

              {onRemove && id && (
                <Button
                  className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(id);
                  }}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </TooltipTrigger>

          <TooltipContent className="p-2" side="top">
            {renderHoverPreview() || <p>Click to preview file</p>}
          </TooltipContent>
        </Tooltip>

        <Dialog
          onOpenChange={(nextOpen) => {
            setIsModalOpen(nextOpen);
            if (!nextOpen) {
              setIsHovered(false);
            }
          }}
          open={isModalOpen}
        >
          <DialogContent className={attachmentPreviewDialogClassName}>
            <div className="flex h-full flex-col overflow-hidden bg-background sm:rounded-xl">
              <DialogHeader className="border-border/60 border-b px-4 py-4 sm:px-6">
                <DialogTitle className="flex items-center gap-2">
                  {renderThumbnail()}
                  <span className="max-w-75 truncate">
                    {name ?? "Attachment"}
                  </span>
                  {fileSize && (
                    <span className="text-muted-foreground text-sm">
                      ({fileSize})
                    </span>
                  )}
                </DialogTitle>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
                {renderModalContent()}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </motion.div>
    </TooltipProvider>
  );
}
