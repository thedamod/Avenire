"use client";

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

/**
 * Render an interactive preview UI for a chat attachment.
 *
 * Provides a thumbnail, hover preview tooltip, and click-to-open modal viewer
 * with special handling for images, videos, PDFs, and code-like files.
 *
 * @param attachment - Partial attachment object whose fields (id, name, url, contentType, status, file, errorMessage) are used to determine display and preview behavior
 * @param onRemove - Optional callback invoked with the attachment `id` when the remove action is triggered
 * @returns A React element that displays the attachment row with thumbnail, status/error text, hover preview, and a modal full preview when available
 */
export function PreviewAttachment({
  attachment,
  onRemove,
}: {
  attachment: Partial<Attachment>;
  onRemove?: (attachmentId: string) => void;
}) {
  const { id, name, url, contentType, status, file, errorMessage } = attachment;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [isLoadingText, setIsLoadingText] = useState(false);

  const fileSize = useMemo(() => {
    if (!file?.size) {
      return "";
    }
    const sizeInKB = file.size / 1024;
    if (sizeInKB < 1024) {
      return `${sizeInKB.toFixed(1)}KB`;
    }
    return `${(sizeInKB / 1024).toFixed(1)}MB`;
  }, [file?.size]);

  const canPreview = useMemo(
    () =>
      status === "completed" &&
      Boolean(
        (contentType?.startsWith("image") ||
          contentType?.startsWith("video") ||
          contentType === "application/pdf" ||
          isCodeLike(contentType, name)) &&
        url,
      ),
    [contentType, name, status, url],
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
            src={url}
            height={48}
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
            src={url}
            height={192}
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
            src={url}
            height={720}
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

  return (
    <TooltipProvider>
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
              <button
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
                type="button"
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
