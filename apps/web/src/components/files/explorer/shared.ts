export type UploadStatus = "failed" | "queued" | "uploaded" | "uploading";

export interface FolderRecord {
  id: string;
  name: string;
  parentId: string | null;
  isShared?: boolean;
  readOnly?: boolean;
}

export interface FileRecord {
  id: string;
  name: string;
  storageUrl: string;
  mimeType: string | null;
  sizeBytes: number;
  createdAt: string;
  isShared?: boolean;
  readOnly?: boolean;
  sourceWorkspaceId?: string;
}

export interface UploadQueueItem {
  error?: string;
  id: string;
  name: string;
  sizeLabel: string;
  status: UploadStatus;
}

export interface ShareSuggestion {
  email: string;
  name: string | null;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function toUpdatedLabel(isoDate: string): string {
  if (!isoDate) {
    return "";
  }

  const timestamp = new Date(isoDate).getTime();
  if (Number.isNaN(timestamp) || !Number.isFinite(timestamp)) {
    return "";
  }

  const diffMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d`;
  }

  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}

function getExtension(name: string) {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
}

export function detectPreviewKind(file: FileRecord) {
  const mime = file.mimeType?.toLowerCase() ?? "";
  const ext = getExtension(file.name);
  const imageExt = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"]);
  const videoExt = new Set([".mp4", ".webm", ".ogg", ".mov", ".m4v"]);
  const audioExt = new Set([".mp3", ".wav", ".ogg", ".aac", ".m4a", ".flac"]);

  return {
    isImage: mime.startsWith("image/") || imageExt.has(ext),
    isPdf: mime === "application/pdf" || ext === ".pdf",
    isVideo: mime.startsWith("video/") || videoExt.has(ext),
    isAudio: mime.startsWith("audio/") || audioExt.has(ext),
  };
}
