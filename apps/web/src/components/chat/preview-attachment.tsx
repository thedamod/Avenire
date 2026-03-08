"use client";

import { Badge } from "@avenire/ui/components/badge";
import { Button } from "@avenire/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@avenire/ui/components/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@avenire/ui/components/tooltip";
import { File, FileCode2, LoaderIcon, X } from "lucide-react";
import { motion } from "motion/react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Attachment } from "@/components/chat/attachment";
import { cn } from "@/lib/utils";

const PDFViewer = dynamic(() => import("@/components/files/pdf-viewer"), {
  ssr: false,
  loading: () => (
    <div className="p-4 text-muted-foreground text-sm">Loading PDF...</div>
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

export function PreviewAttachment({
  attachment,
  onRemove,
  variant = "default",
}: {
  attachment: Partial<Attachment>;
  onRemove?: (attachmentId: string) => void;
  variant?: "composer" | "default";
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
  } = attachment;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [isLoadingText, setIsLoadingText] = useState(false);

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
          url
      ),
    [contentType, name, status, url]
  );

  const loadTextPreview = async () => {
    if (
      !url ||
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
      } else {
        const response = await fetch(url);
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
          <video className="h-full w-full object-cover" muted src={url} />
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
          <video className="max-h-48 max-w-full rounded-md" controls src={url}>
            <track kind="captions" />
          </video>
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
    if (contentType?.startsWith("image") && url && status === "completed") {
      return (
        <div className="flex justify-center">
          <img
            alt={name ?? "Full preview"}
            className="max-h-[70vh] max-w-full rounded-md object-contain"
            height={720}
            src={url}
            width={1024}
          />
        </div>
      );
    }

    if (contentType?.startsWith("video") && url && status === "completed") {
      return (
        <div className="flex justify-center">
          <video
            className="max-h-[70vh] max-w-full rounded-md object-contain"
            controls
            src={url}
          >
            <track kind="captions" />
          </video>
        </div>
      );
    }

    if (contentType === "application/pdf" && url && status === "completed") {
      if (url.startsWith("blob:")) {
        return (
          <iframe
            className="h-[75vh] w-full rounded-md border"
            src={url}
            title={name ?? "PDF preview"}
          />
        );
      }

      return (
        <div className="h-[75vh]">
          <PDFViewer className="h-full w-full" source={url} />
        </div>
      );
    }

    if (isCodeLike(contentType, name) && status === "completed") {
      return (
        <div className="max-h-[70vh] overflow-auto">
          {isLoadingText ? (
            <p className="p-4 text-muted-foreground text-sm">
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

  const statusBadgeLabel =
    status === "uploading"
      ? "Uploading"
      : status === "pending"
        ? "Queued"
        : status === "failed"
          ? "Failed"
          : source === "workspace"
            ? "Workspace"
            : null;

  if (variant === "composer") {
    const isVisualPreview =
      status === "completed" &&
      Boolean(
        url &&
          (contentType?.startsWith("image") || contentType?.startsWith("video"))
      );

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
                    "relative h-auto overflow-hidden border border-border/80 bg-background text-left transition-colors hover:border-border",
                    isVisualPreview
                      ? "h-16 w-16 rounded-lg"
                      : "flex h-16 min-w-0 max-w-[240px] items-center gap-3 rounded-xl px-3 pr-10"
                  )}
                  onClick={() => {
                    if (!canPreview) {
                      return;
                    }
                    setIsModalOpen(true);
                    loadTextPreview().catch(() => undefined);
                  }}
                  onMouseEnter={() => {
                    loadTextPreview().catch(() => undefined);
                  }}
                  type="button"
                  variant="ghost"
                />
              }
            >
              <>
                {statusBadgeLabel ? (
                  <Badge
                    className={cn(
                      "pointer-events-none absolute left-1.5 top-1.5 z-10 h-5 rounded-md border px-1.5 text-[10px] shadow-sm backdrop-blur-xs",
                      status === "failed"
                        ? "border-destructive/20 bg-destructive/10 text-destructive"
                        : "border-border/70 bg-background/88 text-foreground/75"
                    )}
                    variant="outline"
                  >
                    {statusBadgeLabel}
                  </Badge>
                ) : null}

                {isVisualPreview ? (
                  <>
                    {contentType?.startsWith("video") ? (
                      <video
                        className="h-full w-full object-cover"
                        muted
                        src={url}
                      />
                    ) : (
                      <img
                        alt={name ?? "Attachment preview"}
                        className="h-full w-full object-cover"
                        height={64}
                        src={url}
                        width={64}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/40">
                      {isCodeLike(contentType, name) ? (
                        <FileCode2 className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                      ) : (
                        <File className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[13px] leading-5 text-foreground">
                        {name ?? "Unnamed file"}
                      </p>
                      <p className="truncate text-[11px] leading-4 text-muted-foreground">
                        {errorMessage || fileSize || source === "workspace"
                          ? errorMessage || fileSize || "Workspace file"
                          : "Attachment"}
                      </p>
                    </div>
                    {(status === "uploading" || status === "pending") && (
                      <LoaderIcon className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    )}
                  </>
                )}

                {onRemove && id ? (
                  <Button
                    className="absolute right-1.5 top-1.5 z-10 h-6 w-6 rounded-full border border-border/70 bg-background/88 opacity-100 shadow-sm hover:bg-background"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove(id);
                    }}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </>
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

          <Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
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
              <div className="mt-4">{renderModalContent()}</div>
            </DialogContent>
          </Dialog>
        </motion.div>
      </TooltipProvider>
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
                className={`rounded-lg border border-border bg-card p-3 py-1 transition-colors hover:bg-accent/50 ${
                  canPreview ? "cursor-pointer" : ""
                }`}
                onClick={() => {
                  if (!canPreview) {
                    return;
                  }
                  setIsModalOpen(true);
                  loadTextPreview().catch(() => undefined);
                }}
                onMouseEnter={() => {
                  loadTextPreview().catch(() => undefined);
                }}
                size="default"
                type="button"
                variant="ghost"
              />
            }
          >
            <div className="flex items-center gap-3">
              <div className="shrink-0">{renderThumbnail()}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground text-sm">
                  {name ?? "Unnamed file"}
                </p>
                {fileSize && (
                  <p className="text-muted-foreground text-xs">{fileSize}</p>
                )}
                {status && status !== "completed" && (
                  <p className="text-muted-foreground text-xs capitalize">
                    {status}
                  </p>
                )}
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

        <Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
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
            <div className="mt-4">{renderModalContent()}</div>
          </DialogContent>
        </Dialog>
      </motion.div>
    </TooltipProvider>
  );
}
