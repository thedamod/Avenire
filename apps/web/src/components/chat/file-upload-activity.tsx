"use client";

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
import { useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

export type UploadStage = "preparing" | "uploading" | "ingesting";

export interface FileUploadItem {
  completed: boolean;
  error?: string;
  id: string;
  name: string;
  progress: number;
  size: number;
  stage: UploadStage;
}

interface FileUploadActivityProps {
  files?: FileUploadItem[];
  isOpen?: boolean;
  onClearCompleted?: () => void;
  onOpenChange?: (open: boolean) => void;
  onRemoveFile?: (file: FileUploadItem) => void;
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
      extension || ""
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
      <svg className="-rotate-90 transform" height="40" width="40">
        <circle
          cx="20"
          cy="20"
          fill="none"
          r={radius}
          stroke="#e2e8f0"
          strokeWidth="2"
        />
        <circle
          className="transition-all duration-300"
          cx="20"
          cy="20"
          fill="none"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
      <div className="absolute flex items-center justify-center">
        {getFileIcon(fileName)}
      </div>
    </div>
  );
}

function FileItem({
  file,
  onRemove,
}: {
  file: FileUploadItem;
  onRemove?: (file: FileUploadItem) => void;
}) {
  const stageText = {
    preparing: "Preparing file",
    uploading: "Uploading file",
    ingesting: "Analyzing file",
  };

  const fileSizeInKB = (file.size / 1024).toFixed(2);
  const fileSizeDisplay =
    file.size < 1024 ? `${file.size}B` : `${fileSizeInKB}KB`;

  return (
    <div className="flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-white dark:hover:bg-slate-800">
      <CircularLoader
        fileName={file.name}
        progress={file.progress}
        stage={file.stage}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h4 className="truncate font-medium text-slate-900 text-sm dark:text-slate-50">
            {file.name}
          </h4>
          {onRemove && (
            <Button
              className="h-7 w-7 flex-shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              onClick={() => onRemove(file)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <X size={16} />
            </Button>
          )}
        </div>

        <div className="mt-1 flex items-center gap-2">
          <span className="text-slate-500 text-xs dark:text-slate-400">
            {fileSizeDisplay}
          </span>
          <span className="text-slate-500 text-xs dark:text-slate-400">•</span>
          <span className="truncate text-slate-500 text-xs dark:text-slate-400">
            {stageText[file.stage]}
          </span>
        </div>

        <Progress className="mt-2 h-1" value={file.progress} />
      </div>
    </div>
  );
}

function ActivityContent({
  files = [],
  completedCount,
  onClearCompleted,
  onRemoveFile,
}: {
  files: FileUploadItem[];
  completedCount: number;
  onClearCompleted?: () => void;
  onRemoveFile?: (file: FileUploadItem) => void;
}) {
  const totalCount = files.length;
  const overallProgress =
    totalCount > 0
      ? files.reduce((sum, f) => sum + f.progress, 0) / totalCount
      : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="border-slate-200 border-b p-4 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-50">
              {totalCount === 0
                ? "No uploads"
                : `Processing ${totalCount} item${totalCount !== 1 ? "s" : ""}`}
            </h3>
            <p className="mt-1 text-slate-500 text-xs dark:text-slate-400">
              {completedCount} of {totalCount} files •{" "}
              {Math.round(overallProgress)}%
            </p>
          </div>
        </div>
        <Progress className="mt-3 h-1" value={overallProgress} />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {files.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
            <Upload className="h-8 w-8 text-slate-300 dark:text-slate-700" />
            <p className="text-slate-500 text-sm dark:text-slate-400">
              No files uploaded yet
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {files.map((file) => (
              <FileItem file={file} key={file.id} onRemove={onRemoveFile} />
            ))}
          </div>
        )}
      </div>

      {completedCount > 0 && (
        <div className="border-slate-200 border-t bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
          <Button
            className="px-0 text-slate-600 text-xs hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-50"
            onClick={onClearCompleted}
            size="sm"
            type="button"
            variant="ghost"
          >
            Clear completed
          </Button>
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

  const handleRemoveFile = (file: FileUploadItem) => {
    setLocalFiles((prev) => prev.filter((f) => f.id !== file.id));
    onRemoveFile?.(file);
  };

  const handleClearCompleted = () => {
    setLocalFiles((prev) => prev.filter((f) => !f.completed));
    onClearCompleted?.();
  };

  const displayFiles = localFiles;
  const completedCount = displayFiles.filter((f) => f.completed).length;

  if (!isOpen) {
    return null;
  }

  if (isMobile) {
    return (
      <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center px-4 pb-4">
        <div
          className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
          onClick={() => {}}
        >
          <div className="flex justify-end border-slate-200 border-b p-3 dark:border-slate-800">
            <Button
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              onClick={() => onOpenChange?.(false)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <X size={20} />
            </Button>
          </div>

          <div className="max-h-96 overflow-y-auto p-2">
            {displayFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                <Upload className="h-8 w-8 text-slate-300 dark:text-slate-700" />
                <p className="text-slate-500 text-sm dark:text-slate-400">
                  No files uploaded yet
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {displayFiles.map((file) => (
                  <FileItem
                    file={file}
                    key={file.id}
                    onRemove={handleRemoveFile}
                  />
                ))}
              </div>
            )}
          </div>

          {completedCount > 0 && (
            <div className="border-slate-200 border-t bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
              <Button
                className="px-0 text-slate-600 text-xs hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-50"
                onClick={handleClearCompleted}
                size="sm"
                type="button"
                variant="ghost"
              >
                Clear completed
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto fixed right-6 bottom-6 z-50">
      <div className="w-96 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex justify-end border-slate-200 border-b p-3 dark:border-slate-800">
          <Button
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            onClick={() => onOpenChange?.(false)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X size={20} />
          </Button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {displayFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <Upload className="h-8 w-8 text-slate-300 dark:text-slate-700" />
              <p className="text-slate-500 text-sm dark:text-slate-400">
                No files uploaded yet
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {displayFiles.map((file) => (
                <FileItem
                  file={file}
                  key={file.id}
                  onRemove={handleRemoveFile}
                />
              ))}
            </div>
          )}
        </div>

        {completedCount > 0 && (
          <div className="border-slate-200 border-t bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
            <Button
              className="px-0 text-slate-600 text-xs hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-50"
              onClick={handleClearCompleted}
              size="sm"
              type="button"
              variant="ghost"
            >
              Clear completed
            </Button>
          </div>
        )}
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
    <Button className="gap-2" onClick={triggerOpen} type="button">
      <Upload size={16} />
      Upload Files
    </Button>
  );
}
