"use client";

import { useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@avenire/ui/components/button";
import { Progress } from "@avenire/ui/components/progress";
import {
  File,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  Upload,
  X,
} from "lucide-react";

export type UploadStage = "preparing" | "uploading" | "ingesting";

export interface FileUploadItem {
  id: string;
  name: string;
  size: number;
  stage: UploadStage;
  progress: number;
  completed: boolean;
  error?: string;
}

interface FileUploadActivityProps {
  files?: FileUploadItem[];
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClearCompleted?: () => void;
  onRemoveFile?: (id: string) => void;
}

function getFileIcon(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  const baseSize = 20;
  const iconProps = { size: baseSize };

  if (["pdf"].includes(extension || "")) {
    return <FileText {...iconProps} />;
  }

  if (["doc", "docx", "txt"].includes(extension || "")) {
    return <FileText {...iconProps} />;
  }

  if (
    ["js", "ts", "jsx", "tsx", "json", "py", "java", "cpp"].includes(
      extension || "",
    )
  ) {
    return <FileCode {...iconProps} />;
  }

  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(extension || "")) {
    return <FileImage {...iconProps} />;
  }

  if (["mp3", "wav", "aac", "flac"].includes(extension || "")) {
    return <FileAudio {...iconProps} />;
  }
  if (["mp4", "webm", "mov", "avi", "mkv", "m4v"].includes(extension || "")) {
    return <FileVideo {...iconProps} />;
  }

  return <File {...iconProps} />;
}

function CircularLoader({
  stage,
  progress,
  fileName,
}: {
  stage: UploadStage;
  progress: number;
  fileName: string;
}) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center">
      <svg width="40" height="40" className="-rotate-90 transform">
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          strokeWidth="2"
          className="stroke-slate-200 dark:stroke-slate-700"
        />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          strokeWidth="2"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="stroke-emerald-500 transition-all duration-300 dark:stroke-emerald-400"
        />
      </svg>
      <div className="absolute flex items-center justify-center">{getFileIcon(fileName)}</div>
    </div>
  );
}

function FileItem({
  file,
  onRemove,
}: {
  file: FileUploadItem;
  onRemove?: (id: string) => void;
}) {
  const stageText = {
    preparing: "Preparing file",
    uploading: "Uploading file",
    ingesting: "Analyzing file",
  };

  const fileSizeDisplay =
    file.size < 1024
      ? `${file.size}B`
      : file.size < 1024 * 1024
        ? `${(file.size / 1024).toFixed(2)}KB`
        : file.size < 1024 * 1024 * 1024
          ? `${(file.size / (1024 * 1024)).toFixed(2)}MB`
          : `${(file.size / (1024 * 1024 * 1024)).toFixed(2)}GB`;

  return (
    <div className="flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-white dark:hover:bg-slate-800">
      <CircularLoader stage={file.stage} progress={file.progress} fileName={file.name} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h4 className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">
            {file.name}
          </h4>
          {onRemove && (
            <button
              aria-label={`Remove ${file.name}`}
              onClick={() => onRemove(file.id)}
              className="flex-shrink-0 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
              type="button"
            >
              <X aria-hidden size={16} />
            </button>
          )}
        </div>

        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">{fileSizeDisplay}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">•</span>
          <span className="truncate text-xs text-slate-500 dark:text-slate-400">
            {stageText[file.stage]}
          </span>
        </div>

        <Progress value={file.progress} className="mt-2 h-1" />
      </div>
    </div>
  );
}

function ActivityContent({
  files = [],
  onClearCompleted,
  onRemoveFile,
}: {
  files: FileUploadItem[];
  onClearCompleted?: () => void;
  onRemoveFile?: (id: string) => void;
}) {
  const completedCount = files.filter((f) => f.completed).length;
  const totalCount = files.length;
  const overallProgress =
    totalCount > 0
      ? files.reduce((sum, f) => sum + f.progress, 0) / totalCount
      : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 p-4 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-50">
              {totalCount === 0
                ? "No uploads"
                : `Processing ${totalCount} item${totalCount !== 1 ? "s" : ""}`}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {completedCount} of {totalCount} files • {Math.round(overallProgress)}%
            </p>
          </div>
        </div>
        <Progress value={overallProgress} className="mt-3 h-1" />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {files.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
            <Upload className="h-8 w-8 text-slate-300 dark:text-slate-700" />
            <p className="text-sm text-slate-500 dark:text-slate-400">No files uploaded yet</p>
          </div>
        ) : (
          <div className="space-y-1">
            {files.map((file) => (
              <FileItem key={file.id} file={file} onRemove={onRemoveFile} />
            ))}
          </div>
        )}
      </div>

      {completedCount > 0 && (
        <div className="border-t border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
          <button
            onClick={onClearCompleted}
            className="text-xs text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-50"
            type="button"
          >
            Clear completed
          </button>
        </div>
      )}
    </div>
  );
}

export function FileUploadActivity({
  files = [],
  isOpen = false,
  onOpenChange,
  onClearCompleted,
  onRemoveFile,
}: FileUploadActivityProps) {
  const isMobile = useIsMobile();
  const [localFiles, setLocalFiles] = useState<FileUploadItem[]>(files);

  useEffect(() => {
    setLocalFiles(files);
  }, [files]);

  const handleRemoveFile = (id: string) => {
    setLocalFiles((prev) => prev.filter((f) => f.id !== id));
    onRemoveFile?.(id);
  };

  const handleClearCompleted = () => {
    setLocalFiles((prev) => prev.filter((f) => !f.completed));
    onClearCompleted?.();
  };

  const displayFiles = localFiles;

  if (!isOpen) {
    return null;
  }

  if (isMobile) {
    return (
      <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center px-4 pb-4">
        <div className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
          <div className="flex justify-end border-b border-slate-200 p-3 dark:border-slate-800">
            <button
              aria-label="Close uploads panel"
              onClick={() => onOpenChange?.(false)}
              className="text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
              type="button"
            >
              <X aria-hidden size={20} />
            </button>
          </div>
          <ActivityContent
            files={displayFiles}
            onClearCompleted={handleClearCompleted}
            onRemoveFile={handleRemoveFile}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto fixed bottom-6 right-6 z-50">
      <div className="w-96 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex justify-end border-b border-slate-200 p-3 dark:border-slate-800">
          <button
            aria-label="Close uploads panel"
            onClick={() => onOpenChange?.(false)}
            className="text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
            type="button"
          >
            <X aria-hidden size={20} />
          </button>
        </div>

        <ActivityContent
          files={displayFiles}
          onClearCompleted={handleClearCompleted}
          onRemoveFile={handleRemoveFile}
        />
      </div>
    </div>
  );
}

export function FileUploadButton({
  triggerOpen,
}: {
  triggerOpen?: () => void;
}) {
  return (
    <Button onClick={triggerOpen} className="gap-2" type="button">
      <Upload size={16} />
      Upload Files
    </Button>
  );
}
