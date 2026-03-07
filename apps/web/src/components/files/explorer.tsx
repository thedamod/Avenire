"use client";

import { type TouchEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpDown,
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  FileArchive,
  FileCode2,
  FileImage,
  FileMusic,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  Grid3X3,
  LayoutList,
  Share2,
  Upload,
  UserRoundSearch,
  XCircle,
} from "lucide-react";
import {
  FileCard,
  PdfThumbnail,
  VideoThumbnail,
} from "@/components/files/file-card-thumbnail";
import { StylizedSearchBar, type WorkspaceSearchItem } from "@/components/files/stylized-search-bar";
import type { Route } from "next";
import dynamic from "next/dynamic";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@avenire/ui/components/badge";
import { Button } from "@avenire/ui/components/button";
import { Checkbox } from "@avenire/ui/components/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@avenire/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@avenire/ui/components/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@avenire/ui/components/dialog";
import { Input } from "@avenire/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@avenire/ui/components/popover";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@avenire/ui/components/progress";
import { Calendar } from "@avenire/ui/components/calendar";
import { Skeleton } from "@avenire/ui/components/skeleton";
import { SidebarTrigger } from "@avenire/ui/components/sidebar";
import { Spinner } from "@avenire/ui/components/spinner";
import { FileMediaPlayer } from "@avenire/ui/media";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@avenire/ui/components/context-menu";
import {
  DASHBOARD_FILES_FOCUS_SEARCH_EVENT,
  DASHBOARD_FILES_NEW_NOTE_EVENT,
  DASHBOARD_FILES_SYNC_EVENT,
} from "@/lib/file-events";
import {
  getWarmState,
  isFileOpenedCached,
  markFileOpened,
  primeFilePreview,
  releasePreviewPrime,
} from "@/lib/file-preview-cache";
import { useFileSelection } from "@/hooks/use-file-selection";
import { useUploadThing } from "@/lib/uploadthing";
import { cn } from "@/lib/utils";

const PDFViewer = dynamic(() => import("@/components/files/pdf-viewer"), {
  loading: () => (
    <div className="flex h-[70vh] items-center justify-center rounded-xl border border-border/70 bg-card text-sm">
      Loading PDF...
    </div>
  ),
  ssr: false,
});

type UploadStatus = "failed" | "queued" | "uploaded" | "uploading";
type CalendarDateRange = { from: Date | undefined; to?: Date };
type FileKind = "archive" | "audio" | "code" | "document" | "image" | "other" | "sheet" | "video";
const FILE_EXPLORER_VIEW_MODE_KEY = "file-explorer-view-mode";

interface FolderRecord {
  id: string;
  name: string;
  parentId: string | null;
  createdBy?: string;
  updatedBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  isShared?: boolean;
  readOnly?: boolean;
}

interface FileRecord {
  id: string;
  folderId: string;
  name: string;
  storageUrl: string;
  mimeType: string | null;
  sizeBytes: number;
  uploadedBy?: string;
  updatedBy?: string | null;
  createdAt: string;
  isShared?: boolean;
  readOnly?: boolean;
  sourceWorkspaceId?: string;
  updatedAt?: string;
}

interface UploadQueueItem {
  error?: string;
  id: string;
  name: string;
  sizeLabel: string;
  status: UploadStatus;
}

interface UploadCandidate {
  file: File;
  relativePath?: string;
}

interface WebkitFileSystemEntry {
  isDirectory: boolean;
  isFile: boolean;
  name: string;
}

interface WebkitFileSystemFileEntry extends WebkitFileSystemEntry {
  file: (callback: (file: File) => void, errorCallback?: (error: DOMException) => void) => void;
}

interface WebkitFileSystemDirectoryReader {
  readEntries: (
    callback: (entries: WebkitFileSystemEntry[]) => void,
    errorCallback?: (error: DOMException) => void,
  ) => void;
}

interface WebkitFileSystemDirectoryEntry extends WebkitFileSystemEntry {
  createReader: () => WebkitFileSystemDirectoryReader;
}

interface ShareSuggestion {
  email: string;
  name: string | null;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toUpdatedLabel(isoDate: string): string {
  const timestamp = new Date(isoDate).getTime();
  const diffMs = Date.now() - timestamp;
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

function detectPreviewKind(file: FileRecord) {
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

function detectFileKind(file: FileRecord): FileKind {
  const mime = file.mimeType?.toLowerCase() ?? "";
  const ext = getExtension(file.name);
  const imageExt = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".bmp", ".ico"]);
  const videoExt = new Set([".mp4", ".webm", ".ogg", ".mov", ".m4v", ".avi", ".mkv"]);
  const audioExt = new Set([".mp3", ".wav", ".ogg", ".aac", ".m4a", ".flac"]);
  const codeExt = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".java",
    ".c",
    ".cpp",
    ".cs",
    ".go",
    ".rs",
    ".php",
    ".rb",
    ".json",
    ".yaml",
    ".yml",
    ".xml",
    ".html",
    ".css",
    ".scss",
    ".md",
    ".sql",
  ]);
  const archiveExt = new Set([".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz"]);
  const sheetExt = new Set([".csv", ".xls", ".xlsx"]);

  if (mime.startsWith("image/") || imageExt.has(ext)) {
    return "image";
  }
  if (mime === "application/pdf" || ext === ".pdf") {
    return "document";
  }
  if (mime.startsWith("video/") || videoExt.has(ext)) {
    return "video";
  }
  if (mime.startsWith("audio/") || audioExt.has(ext)) {
    return "audio";
  }
  if (sheetExt.has(ext)) {
    return "sheet";
  }
  if (codeExt.has(ext)) {
    return "code";
  }
  if (archiveExt.has(ext)) {
    return "archive";
  }
  return "other";
}

function getFileTypeIcon(kind: FileKind, className = "size-3.5") {
  switch (kind) {
    case "image":
      return <FileImage className={cn(className, "text-emerald-600")} />;
    case "video":
      return <FileVideo className={cn(className, "text-violet-600")} />;
    case "audio":
      return <FileMusic className={cn(className, "text-indigo-600")} />;
    case "sheet":
      return <FileSpreadsheet className={cn(className, "text-lime-700")} />;
    case "code":
      return <FileCode2 className={cn(className, "text-sky-600")} />;
    case "archive":
      return <FileArchive className={cn(className, "text-amber-600")} />;
    default:
      return <FileText className={cn(className, "text-muted-foreground")} />;
  }
}

function statusMeta(status: UploadStatus) {
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

export function FileExplorer() {
  const router = useRouter();
  const params = useParams<{ workspaceUuid: string; folderUuid: string }>();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const touchDragIdsRef = useRef<string[] | null>(null);
  const dragPreviewPixelRef = useRef<HTMLImageElement | null>(null);
  const canvasDragDepthRef = useRef(0);
  const queueFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sseRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const workspaceUuid = params.workspaceUuid;
  const currentFolderId = params.folderUuid;

  const [query, setQuery] = useState("");
  const [focusSearchSignal, setFocusSearchSignal] = useState(0);
  const [sortBy, setSortBy] = useState<"name" | "createdAt" | "updatedAt">("name");
  const [createdDateRange, setCreatedDateRange] = useState<CalendarDateRange | undefined>(undefined);
  const [fileTypeFilter, setFileTypeFilter] = useState<Set<string>>(new Set());
  const [actorMode, setActorMode] = useState<"uploadedBy" | "updatedBy">("uploadedBy");
  const [actorFilter, setActorFilter] = useState<Set<string>>(new Set());
  const [vectorFilteredIds, setVectorFilteredIds] = useState<Set<string> | null>(null);
  const [allFolders, setAllFolders] = useState<FolderRecord[]>([]);
  const [allFiles, setAllFiles] = useState<FileRecord[]>([]);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<FolderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [isQueueVisible, setIsQueueVisible] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareSuggestions, setShareSuggestions] = useState<ShareSuggestion[]>([]);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [workspaceShareEmail, setWorkspaceShareEmail] = useState("");
  const [workspaceShareSuggestions, setWorkspaceShareSuggestions] = useState<ShareSuggestion[]>([]);
  const [workspaceShareBusy, setWorkspaceShareBusy] = useState(false);
  const [workspaceShareStatus, setWorkspaceShareStatus] = useState<string | null>(null);
  const [canvasDropActive, setCanvasDropActive] = useState(false);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [draggingIds, setDraggingIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"cards" | "list">(() => {
    if (typeof window === "undefined") {
      return "cards";
    }
    const saved = window.localStorage.getItem(FILE_EXPLORER_VIEW_MODE_KEY);
    return saved === "list" ? "list" : "cards";
  });
  const [videoLoadFailed, setVideoLoadFailed] = useState(false);
  const [audioLoadFailed, setAudioLoadFailed] = useState(false);
  const [mediaStreamFailed, setMediaStreamFailed] = useState(false);
  const [hoveredPreviewFileId, setHoveredPreviewFileId] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [propertiesItem, setPropertiesItem] = useState<{
    kind: "file" | "folder";
    id: string;
    name: string;
    detail?: string;
  } | null>(null);
  const [editDialog, setEditDialog] = useState<{
    mode: "create-folder" | "rename-file" | "rename-folder";
    id?: string;
    parentId?: string;
    value: string;
  } | null>(null);

  const { startUpload } = useUploadThing("fileExplorerUploader");
  const selection = useFileSelection({ gridRef, itemRefs });

  const selectedFileParam = searchParams.get("file");
  const activeFile = useMemo(
    () => files.find((file) => file.id === selectedFileParam) ?? null,
    [files, selectedFileParam],
  );
  const activeMediaStreamUrl = useMemo(() => {
    if (!activeFile || !workspaceUuid) {
      return null;
    }
    return `/api/workspaces/${workspaceUuid}/files/${activeFile.id}/stream`;
  }, [activeFile, workspaceUuid]);
  const activeMediaSrc = useMemo(() => {
    if (!activeFile) {
      return null;
    }
    if (mediaStreamFailed || !activeMediaStreamUrl) {
      return activeFile.storageUrl;
    }
    return activeMediaStreamUrl;
  }, [activeFile, activeMediaStreamUrl, mediaStreamFailed]);
  const currentFolder = useMemo(
    () => breadcrumbs[breadcrumbs.length - 1] ?? null,
    [breadcrumbs],
  );
  const isCurrentFolderReadOnly = Boolean(currentFolder?.readOnly);

  const ensureDragPreviewPixel = useCallback(() => {
    if (dragPreviewPixelRef.current) {
      return dragPreviewPixelRef.current;
    }
    const pixel = new Image();
    pixel.src =
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
    dragPreviewPixelRef.current = pixel;
    return pixel;
  }, []);

  const configureDragPreview = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      const pixel = ensureDragPreviewPixel();
      event.dataTransfer.setDragImage(pixel, 0, 0);
    },
    [ensureDragPreviewPixel],
  );

  const searchableItems = useMemo<WorkspaceSearchItem[]>(
    () => [
      ...folders.map((folder) => ({
        id: folder.id,
        type: "folder" as const,
        title: folder.name,
        description: "Folder",
        snippet: `Folder in ${breadcrumbs[breadcrumbs.length - 1]?.name ?? "workspace"}`,
      })),
      ...files.map((file) => ({
        id: file.id,
        type: "file" as const,
        title: file.name,
        description: file.mimeType ?? "File",
        snippet: `${formatBytes(file.sizeBytes)} • ${file.mimeType ?? "unknown type"}`,
      })),
    ],
    [breadcrumbs, files, folders],
  );

  const availableFileTypes = useMemo(() => {
    const normalized = new Set<string>();
    for (const file of files) {
      const ext = getExtension(file.name).replace(".", "").toUpperCase();
      if (ext) {
        normalized.add(ext);
        continue;
      }
      if (file.mimeType) {
        normalized.add(file.mimeType.split("/")[1]?.toUpperCase() ?? "UNKNOWN");
      }
    }
    return Array.from(normalized).sort((a, b) => a.localeCompare(b));
  }, [files]);

  const availableActors = useMemo(() => {
    const actorIds = new Set<string>();
    if (actorMode === "uploadedBy") {
      for (const file of files) {
        if (file.uploadedBy) {
          actorIds.add(file.uploadedBy);
        }
      }
      for (const folder of folders) {
        if (folder.createdBy) {
          actorIds.add(folder.createdBy);
        }
      }
    } else {
      for (const file of files) {
        if (file.updatedBy) {
          actorIds.add(file.updatedBy);
        }
      }
      for (const folder of folders) {
        if (folder.updatedBy) {
          actorIds.add(folder.updatedBy);
        }
      }
    }
    return Array.from(actorIds).sort((a, b) => a.localeCompare(b));
  }, [actorMode, files, folders]);

  const loadShareSuggestions = useCallback(
    async (query: string, onResult: (suggestions: ShareSuggestion[]) => void) => {
      if (!workspaceUuid) {
        onResult([]);
        return;
      }
      try {
        const url = new URL(`/api/workspaces/${workspaceUuid}/share/suggestions`, window.location.origin);
        if (query.trim()) {
          url.searchParams.set("q", query.trim());
        }
        const response = await fetch(url.toString(), { cache: "no-store" });
        if (!response.ok) {
          onResult([]);
          return;
        }
        const payload = (await response.json()) as { suggestions?: ShareSuggestion[] };
        onResult(payload.suggestions ?? []);
      } catch {
        onResult([]);
      }
    },
    [workspaceUuid],
  );

  useEffect(() => {
    if (!workspaceUuid) {
      setShareSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      void loadShareSuggestions(shareEmail, setShareSuggestions);
    }, 150);
    return () => clearTimeout(timer);
  }, [loadShareSuggestions, shareEmail, workspaceUuid]);

  useEffect(() => {
    if (!workspaceUuid) {
      setWorkspaceShareSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      void loadShareSuggestions(workspaceShareEmail, setWorkspaceShareSuggestions);
    }, 150);
    return () => clearTimeout(timer);
  }, [loadShareSuggestions, workspaceShareEmail, workspaceUuid]);

  const filteredFolders = useMemo(() => {
    const term = query.trim().toLowerCase();
    const textFiltered = term
      ? folders.filter((folder) => folder.name.toLowerCase().includes(term))
      : folders;

    const vectorFiltered = vectorFilteredIds
      ? textFiltered.filter((folder) => vectorFilteredIds.has(folder.id))
      : textFiltered;

    const dateFiltered = vectorFiltered.filter((folder) => {
      if (!createdDateRange?.from && !createdDateRange?.to) {
        return true;
      }
      if (!folder.createdAt) {
        return false;
      }
      const createdAt = new Date(folder.createdAt).getTime();
      if (createdDateRange?.from && createdAt < createdDateRange.from.getTime()) {
        return false;
      }
      const toInclusive = createdDateRange?.to
        ? new Date(createdDateRange.to).setHours(23, 59, 59, 999)
        : null;
      if (toInclusive !== null && createdAt > toInclusive) {
        return false;
      }
      return true;
    });

    if (actorFilter.size === 0) {
      return dateFiltered;
    }

    return dateFiltered.filter((folder) =>
      actorMode === "uploadedBy"
        ? folder.createdBy ? actorFilter.has(folder.createdBy) : false
        : folder.updatedBy ? actorFilter.has(folder.updatedBy) : false,
    );
  }, [actorFilter, actorMode, createdDateRange, folders, query, vectorFilteredIds]);

  const filteredFiles = useMemo(() => {
    const term = query.trim().toLowerCase();
    const textFiltered = term
      ? files.filter((file) => file.name.toLowerCase().includes(term))
      : files;

    const vectorFiltered = vectorFilteredIds
      ? textFiltered.filter((file) => vectorFilteredIds.has(file.id))
      : textFiltered;

    const typeFiltered =
      fileTypeFilter.size === 0
        ? vectorFiltered
        : vectorFiltered.filter((file) => {
          const ext = getExtension(file.name).replace(".", "").toUpperCase();
          if (ext && fileTypeFilter.has(ext)) {
            return true;
          }
          const mimeType = file.mimeType?.split("/")[1]?.toUpperCase();
          return Boolean(mimeType && fileTypeFilter.has(mimeType));
        });

    const dateFiltered = typeFiltered.filter((file) => {
      if (!createdDateRange?.from && !createdDateRange?.to) {
        return true;
      }
      const createdAt = new Date(file.createdAt).getTime();
      if (createdDateRange?.from && createdAt < createdDateRange.from.getTime()) {
        return false;
      }
      const toInclusive = createdDateRange?.to
        ? new Date(createdDateRange.to).setHours(23, 59, 59, 999)
        : null;
      if (toInclusive !== null && createdAt > toInclusive) {
        return false;
      }
      return true;
    });

    if (actorFilter.size === 0) {
      return dateFiltered;
    }

    return dateFiltered.filter((file) =>
      actorMode === "uploadedBy"
        ? file.uploadedBy ? actorFilter.has(file.uploadedBy) : false
        : file.updatedBy ? actorFilter.has(file.updatedBy) : false,
    );
  }, [
    actorFilter,
    actorMode,
    createdDateRange,
    fileTypeFilter,
    files,
    query,
    vectorFilteredIds,
  ]);

  const sortedFolders = useMemo(
    () =>
      [...filteredFolders].sort((a, b) => {
        if (sortBy === "name") {
          return a.name.localeCompare(b.name);
        }
        const aDate = new Date(
          sortBy === "updatedAt" ? (a.updatedAt ?? a.createdAt ?? 0) : (a.createdAt ?? 0),
        ).getTime();
        const bDate = new Date(
          sortBy === "updatedAt" ? (b.updatedAt ?? b.createdAt ?? 0) : (b.createdAt ?? 0),
        ).getTime();
        return bDate - aDate;
      }),
    [filteredFolders, sortBy],
  );

  const sortedFiles = useMemo(
    () =>
      [...filteredFiles].sort((a, b) => {
        if (sortBy === "name") {
          return a.name.localeCompare(b.name);
        }

        const aDate = new Date(
          sortBy === "updatedAt" ? (a.updatedAt ?? a.createdAt) : a.createdAt,
        ).getTime();
        const bDate = new Date(
          sortBy === "updatedAt" ? (b.updatedAt ?? b.createdAt) : b.createdAt,
        ).getTime();

        return bDate - aDate;
      }),
    [filteredFiles, sortBy],
  );

  const visibleItemIds = useMemo(
    () => [...sortedFolders.map((folder) => folder.id), ...sortedFiles.map((file) => file.id)],
    [sortedFiles, sortedFolders],
  );

  const uploadCount = uploadQueue.filter(
    (item) => item.status === "queued" || item.status === "uploading",
  ).length;
  const failedCount = uploadQueue.filter((item) => item.status === "failed").length;

  const folderSubfolderCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const folder of allFolders) {
      if (!folder.parentId) {
        continue;
      }
      map.set(folder.parentId, (map.get(folder.parentId) ?? 0) + 1);
    }
    return map;
  }, [allFolders]);

  const folderFileCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const file of allFiles) {
      map.set(file.folderId, (map.get(file.folderId) ?? 0) + 1);
    }
    return map;
  }, [allFiles]);

  const folderCardPreviewItems = useMemo(() => {
    type FolderCardPreviewItem =
      | { id: string; kind: "folder" }
      | { id: string; kind: "file"; fileKind: ReturnType<typeof detectFileKind> };

    const map = new Map<string, FolderCardPreviewItem[]>();

    for (const folder of folders) {
      const directFolders = allFolders
        .filter((entry) => entry.parentId === folder.id)
        .map((entry) => ({ id: entry.id, kind: "folder" as const }));
      const directFiles = allFiles
        .filter((entry) => entry.folderId === folder.id)
        .map((entry) => ({ id: entry.id, kind: "file" as const, fileKind: detectFileKind(entry) }));

      const topThree: FolderCardPreviewItem[] = [...directFolders, ...directFiles].slice(0, 3);
      map.set(folder.id, topThree);
    }

    return map;
  }, [allFiles, allFolders, folders]);

  const clearAdvancedFilters = useCallback(() => {
    setCreatedDateRange(undefined);
    setFileTypeFilter(new Set());
    setActorFilter(new Set());
    setActorMode("uploadedBy");
  }, []);
  const hasActiveAdvancedFilters =
    Boolean(createdDateRange?.from || createdDateRange?.to) ||
    fileTypeFilter.size > 0 ||
    actorFilter.size > 0;

  const handleOpenOnDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLElement>, open: () => void) => {
      if (event.detail !== 2) {
        return;
      }
      if (draggingIds.length > 0) {
        return;
      }
      open();
    },
    [draggingIds.length],
  );

  const loadFolder = useCallback(async (options?: { silent?: boolean }) => {
    if (!workspaceUuid || !currentFolderId) {
      return;
    }
    const silent = options?.silent ?? false;

    if (!silent) {
      setLoading(true);
    }
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceUuid}/folders/${currentFolderId}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        folders?: FolderRecord[];
        files?: FileRecord[];
        ancestors?: FolderRecord[];
      };

      setFolders(payload.folders ?? []);
      setFiles(payload.files ?? []);
      setBreadcrumbs(payload.ancestors ?? []);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [currentFolderId, workspaceUuid]);

  const loadTree = useCallback(async () => {
    if (!workspaceUuid) {
      return;
    }

    try {
      const response = await fetch(`/api/workspaces/${workspaceUuid}/tree`, {
        cache: "no-store",
      });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as { folders?: FolderRecord[]; files?: FileRecord[] };
      setAllFolders(payload.folders ?? []);
      setAllFiles(payload.files ?? []);
    } catch {
      // ignore
    }
  }, [workspaceUuid]);

  const refreshData = useCallback(() => {
    void loadFolder({ silent: true });
    void loadTree();
  }, [loadFolder, loadTree]);

  const refreshDataDebounced = useCallback(() => {
    if (refreshDebounceRef.current) {
      clearTimeout(refreshDebounceRef.current);
    }

    refreshDebounceRef.current = setTimeout(() => {
      refreshData();
    }, 300);
  }, [refreshData]);

  const emitSync = useCallback(() => {
    if (!workspaceUuid) {
      return;
    }
    window.dispatchEvent(
      new CustomEvent(DASHBOARD_FILES_SYNC_EVENT, {
        detail: { source: "explorer", workspaceUuid, ts: Date.now() },
      }),
    );
  }, [workspaceUuid]);

  useEffect(() => {
    void loadFolder();
  }, [loadFolder]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  useEffect(() => {
    if (!workspaceUuid || !currentFolderId) {
      return;
    }

    const onFocus = () => {
      refreshData();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshData();
      }
    };
    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<{ workspaceUuid?: string }>).detail;
      if (!detail?.workspaceUuid || detail.workspaceUuid === workspaceUuid) {
        refreshDataDebounced();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(DASHBOARD_FILES_SYNC_EVENT, onSync);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(DASHBOARD_FILES_SYNC_EVENT, onSync);
    };
  }, [currentFolderId, refreshData, refreshDataDebounced, workspaceUuid]);

  useEffect(() => {
    if (!workspaceUuid) {
      setSseConnected(false);
      return;
    }

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

      if (sseRetryTimerRef.current) {
        clearTimeout(sseRetryTimerRef.current);
      }

      sseRetryTimerRef.current = setTimeout(() => {
        void connect();
      }, 3000);
    };

    const connect = async () => {
      if (closed) {
        return;
      }

      try {
        const tokenResponse = await fetch("/api/realtime/files-token", {
          body: JSON.stringify({ workspaceUuid }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });

        if (!tokenResponse.ok) {
          setSseConnected(false);
          scheduleReconnect();
          return;
        }

        const payload = (await tokenResponse.json()) as { token?: string };
        if (!payload.token) {
          setSseConnected(false);
          scheduleReconnect();
          return;
        }

        cleanupCurrent();

        const url = new URL("/api/realtime/files", window.location.origin);
        url.searchParams.set("workspaceUuid", workspaceUuid);
        url.searchParams.set("token", payload.token);

        eventSource = new EventSource(url.toString());
        eventSource.onopen = () => {
          setSseConnected(true);
        };
        eventSource.onerror = () => {
          setSseConnected(false);
          cleanupCurrent();
          scheduleReconnect();
        };
        eventSource.addEventListener("files.invalidate", () => {
          refreshDataDebounced();
        });
      } catch {
        setSseConnected(false);
        scheduleReconnect();
      }
    };

    void connect();

    return () => {
      closed = true;
      setSseConnected(false);
      cleanupCurrent();
      if (sseRetryTimerRef.current) {
        clearTimeout(sseRetryTimerRef.current);
        sseRetryTimerRef.current = null;
      }
      if (refreshDebounceRef.current) {
        clearTimeout(refreshDebounceRef.current);
        refreshDebounceRef.current = null;
      }
    };
  }, [refreshDataDebounced, workspaceUuid]);

  useEffect(() => {
    setVideoLoadFailed(false);
    setAudioLoadFailed(false);
    setMediaStreamFailed(false);
  }, [activeFile?.id]);

  useEffect(() => {
    window.localStorage.setItem(FILE_EXPLORER_VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (!activeFile) {
      return;
    }

    markFileOpened(activeFile.id);
    const { isAudio, isVideo } = detectPreviewKind(activeFile);
    if (!isAudio && !isVideo) {
      return;
    }

    const kind = isVideo ? "video" : "audio";
    void primeFilePreview(activeFile.storageUrl, kind);
    return () => {
      releasePreviewPrime(activeFile.storageUrl);
    };
  }, [activeFile]);

  useEffect(() => {
    const onFocusSearch = () => {
      setFocusSearchSignal((previous) => previous + 1);
    };

    const onNewNote = () => {
      // Placeholder until note entity model is introduced.
      fileInputRef.current?.click();
    };

    window.addEventListener(DASHBOARD_FILES_FOCUS_SEARCH_EVENT, onFocusSearch);
    window.addEventListener(DASHBOARD_FILES_NEW_NOTE_EVENT, onNewNote);

    return () => {
      window.removeEventListener(DASHBOARD_FILES_FOCUS_SEARCH_EVENT, onFocusSearch);
      window.removeEventListener(DASHBOARD_FILES_NEW_NOTE_EVENT, onNewNote);
    };
  }, []);

  useEffect(() => {
    const input = folderInputRef.current;
    if (!input) {
      return;
    }
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    if (queueFadeTimerRef.current) {
      clearTimeout(queueFadeTimerRef.current);
      queueFadeTimerRef.current = null;
    }

    if (uploadQueue.length === 0) {
      setIsQueueVisible(false);
      return;
    }

    const hasActiveUploads = uploadQueue.some(
      (item) => item.status === "queued" || item.status === "uploading",
    );

    setIsQueueVisible(true);

    if (hasActiveUploads) {
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
  }, [uploadQueue]);

  const navigateToFolder = useCallback(
    (folderId: string) => {
      if (!workspaceUuid) {
        return;
      }

      router.push(
        `/dashboard/files/${workspaceUuid}/folder/${folderId}` as Route,
      );
    },
    [router, workspaceUuid],
  );

  const selectFile = useCallback(
    (fileId: string | null) => {
      if (!workspaceUuid || !currentFolderId) {
        return;
      }

      const params = new URLSearchParams(searchParams.toString());
      if (fileId) {
        params.set("file", fileId);
      } else {
        params.delete("file");
      }

      const query = params.toString();
      const target = query.length
        ? `/dashboard/files/${workspaceUuid}/folder/${currentFolderId}?${query}`
        : `/dashboard/files/${workspaceUuid}/folder/${currentFolderId}`;

      router.replace(target as Route);
    },
    [currentFolderId, router, searchParams, workspaceUuid],
  );

  const handlePreviewIntentStart = useCallback((file: FileRecord) => {
    const { isAudio, isVideo } = detectPreviewKind(file);
    if (!isAudio && !isVideo) {
      return;
    }

    setHoveredPreviewFileId(file.id);
    const kind = isVideo ? "video" : "audio";
    void primeFilePreview(file.storageUrl, kind);
  }, []);

  const handlePreviewIntentEnd = useCallback((file: FileRecord) => {
    const { isAudio, isVideo } = detectPreviewKind(file);
    if (!isAudio && !isVideo) {
      return;
    }

    setHoveredPreviewFileId((previous) => (previous === file.id ? null : previous));
    releasePreviewPrime(file.storageUrl);
  }, []);

  const getDropUploadCandidates = useCallback(
    async (event: React.DragEvent<HTMLDivElement>): Promise<UploadCandidate[]> => {
      const items = Array.from(event.dataTransfer.items ?? []);
      const candidates: UploadCandidate[] = [];

      const readDirectoryEntries = async (
        reader: WebkitFileSystemDirectoryReader,
      ): Promise<WebkitFileSystemEntry[]> => {
        const entries: WebkitFileSystemEntry[] = [];
        while (true) {
          const chunk = await new Promise<WebkitFileSystemEntry[]>((resolve) =>
            reader.readEntries(resolve, () => resolve([])),
          );
          if (chunk.length === 0) {
            break;
          }
          entries.push(...chunk);
        }
        return entries;
      };

      const walkEntry = async (entry: WebkitFileSystemEntry, parentPath: string) => {
        if (entry.isFile) {
          const fileEntry = entry as WebkitFileSystemFileEntry;
          const file = await new Promise<File | null>((resolve) =>
            fileEntry.file(resolve, () => resolve(null)),
          );
          if (!file) {
            return;
          }
          const relativePath = parentPath ? `${parentPath}/${file.name}` : file.name;
          candidates.push({ file, relativePath });
          return;
        }

        if (entry.isDirectory) {
          const directoryEntry = entry as WebkitFileSystemDirectoryEntry;
          const nextPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
          const children = await readDirectoryEntries(directoryEntry.createReader());
          for (const child of children) {
            await walkEntry(child, nextPath);
          }
        }
      };

      let usedEntryApi = false;
      for (const item of items) {
        const maybeEntry = (
          item as DataTransferItem & {
            webkitGetAsEntry?: () => WebkitFileSystemEntry | null;
          }
        ).webkitGetAsEntry?.();
        if (!maybeEntry) {
          continue;
        }
        usedEntryApi = true;
        await walkEntry(maybeEntry, "");
      }

      if (usedEntryApi && candidates.length > 0) {
        return candidates;
      }

      return Array.from(event.dataTransfer.files ?? []).map((file) => {
        const webkitRelativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
        return {
          file,
          relativePath: webkitRelativePath || file.name,
        };
      });
    },
    [],
  );

  const queueUploads = useCallback(
    (incomingCandidates: UploadCandidate[]) => {
      if (
        !workspaceUuid ||
        !currentFolderId ||
        incomingCandidates.length === 0 ||
        isCurrentFolderReadOnly
      ) {
        return;
      }

      const queueEntries = incomingCandidates.map(({ file, relativePath }) => ({
        id: crypto.randomUUID(),
        name: relativePath && relativePath !== file.name ? relativePath : file.name,
        sizeLabel: formatBytes(file.size),
        status: "queued" as const,
      }));

      setUploadQueue((previous) => [...queueEntries, ...previous]);

      void (async () => {
        const folderLookup = new Map<string, string>();
        for (const folder of allFolders) {
          folderLookup.set(`${folder.parentId ?? "__root__"}::${folder.name.toLowerCase()}`, folder.id);
        }

        const ensureFolderPath = async (relativePath?: string) => {
          if (!relativePath || !workspaceUuid) {
            return currentFolderId;
          }
          const normalized = relativePath.replaceAll("\\", "/");
          const segments = normalized.split("/").filter(Boolean);
          if (segments.length <= 1) {
            return currentFolderId;
          }

          let parentId = currentFolderId;
          for (const segment of segments.slice(0, -1)) {
            const key = `${parentId}::${segment.toLowerCase()}`;
            const existing = folderLookup.get(key);
            if (existing) {
              parentId = existing;
              continue;
            }

            const response = await fetch(`/api/workspaces/${workspaceUuid}/folders`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ parentId, name: segment }),
            });
            if (!response.ok) {
              throw new Error(`Unable to create folder "${segment}"`);
            }
            const payload = (await response.json()) as { folder?: { id?: string } };
            const createdId = payload.folder?.id;
            if (!createdId) {
              throw new Error(`Folder "${segment}" could not be created`);
            }
            folderLookup.set(key, createdId);
            parentId = createdId;
          }

          return parentId;
        };

        let hasSuccessfulUpload = false;
        for (const [index, candidate] of incomingCandidates.entries()) {
          const file = candidate.file;
          const queueItemId = queueEntries[index]?.id;
          if (!queueItemId) {
            continue;
          }

          setUploadQueue((previous) =>
            previous.map((item) =>
              item.id === queueItemId ? { ...item, status: "uploading" } : item,
            ),
          );

          try {
            const uploaded = (await startUpload([file]))?.[0] as
              | { key?: string; ufsUrl?: string; name?: string; size?: number; contentType?: string }
              | undefined;

            if (!uploaded?.key || !uploaded.ufsUrl) {
              throw new Error("Upload returned no file metadata");
            }
            const targetFolderId = await ensureFolderPath(candidate.relativePath);

            const registerResponse = await fetch(
              `/api/workspaces/${workspaceUuid}/files/register`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  folderId: targetFolderId,
                  storageKey: uploaded.key,
                  storageUrl: uploaded.ufsUrl,
                  name: uploaded.name ?? file.name,
                  mimeType: uploaded.contentType ?? file.type,
                  sizeBytes: uploaded.size ?? file.size,
                }),
              },
            );

            if (!registerResponse.ok) {
              throw new Error("File metadata registration failed");
            }

            setUploadQueue((previous) =>
              previous.map((item) =>
                item.id === queueItemId ? { ...item, status: "uploaded" } : item,
              ),
            );
            hasSuccessfulUpload = true;
          } catch (error) {
            setUploadQueue((previous) =>
              previous.map((item) =>
                item.id === queueItemId
                  ? {
                    ...item,
                    status: "failed",
                    error:
                      error instanceof Error ? error.message : "Unable to upload file",
                  }
                  : item,
              ),
            );
          }
        }

        if (hasSuccessfulUpload) {
          await Promise.all([loadFolder(), loadTree()]);
          emitSync();
        }
      })();
    },
    [
      allFolders,
      currentFolderId,
      emitSync,
      isCurrentFolderReadOnly,
      loadFolder,
      loadTree,
      startUpload,
      workspaceUuid,
    ],
  );

  const queueCard = (
    <Card
      className={cn(
        "fixed right-4 bottom-4 z-40 w-[20rem] border border-border/70 bg-background/90 py-3 shadow-lg backdrop-blur transition-all duration-500",
        isQueueVisible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-3 opacity-0",
      )}
    >
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center justify-between text-xs">
          <span>Upload Queue</span>
          <Badge
            variant={
              uploadCount > 0
                ? "secondary"
                : failedCount > 0
                  ? "destructive"
                  : "outline"
            }
          >
            {uploadCount > 0
              ? `${uploadCount} active`
              : failedCount > 0
                ? `${failedCount} failed`
                : "Idle"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="max-h-56 space-y-2 overflow-y-auto">
        {uploadQueue.length === 0 ? (
          <p className="text-muted-foreground text-xs">New uploads will appear here.</p>
        ) : (
          uploadQueue.slice(0, 8).map((item) => {
            const meta = statusMeta(item.status);
            return (
              <div className="rounded-md border p-2" key={item.id}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-medium">{item.name}</p>
                  <span>{meta.icon}</span>
                </div>
                <Progress value={meta.progress}>
                  <ProgressLabel className="text-[11px]">{meta.label}</ProgressLabel>
                  <ProgressValue className="text-[11px]" />
                </Progress>
                <p className="mt-1 text-right text-[11px] text-muted-foreground">
                  {item.sizeLabel}
                </p>
                {item.error ? (
                  <p className="mt-1 text-[11px] text-destructive">{item.error}</p>
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );

  const createFolder = useCallback(
    async (parentId: string, name: string) => {
      if (!workspaceUuid) {
        return;
      }
      const parentFolder = allFolders.find((folder) => folder.id === parentId);
      if (parentFolder?.readOnly) {
        return;
      }
      const trimmedName = name.trim();
      if (!trimmedName) {
        return;
      }
      await fetch(`/api/workspaces/${workspaceUuid}/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId, name: trimmedName }),
      });
      await Promise.all([loadFolder(), loadTree()]);
      emitSync();
    },
    [allFolders, emitSync, loadFolder, loadTree, workspaceUuid],
  );

  const renameFolder = useCallback(
    async (folderId: string, name: string) => {
      if (!workspaceUuid) {
        return;
      }
      const folder = allFolders.find((entry) => entry.id === folderId);
      if (folder?.readOnly) {
        return;
      }
      const trimmedName = name.trim();
      if (!trimmedName) {
        return;
      }
      await fetch(`/api/workspaces/${workspaceUuid}/folders/${folderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      });
      await Promise.all([loadFolder(), loadTree()]);
      emitSync();
    },
    [allFolders, emitSync, loadFolder, loadTree, workspaceUuid],
  );

  const renameFile = useCallback(
    async (fileId: string, name: string) => {
      if (!workspaceUuid) {
        return;
      }
      const file = files.find((entry) => entry.id === fileId);
      if (file?.readOnly) {
        return;
      }
      const trimmedName = name.trim();
      if (!trimmedName) {
        return;
      }
      await fetch(`/api/workspaces/${workspaceUuid}/files/${fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      });
      await loadFolder();
      emitSync();
    },
    [emitSync, files, loadFolder, workspaceUuid],
  );

  const moveFolder = useCallback(
    async (folderId: string, targetFolderId: string) => {
      if (!workspaceUuid) {
        return;
      }
      const folder = allFolders.find((entry) => entry.id === folderId);
      const targetFolder = allFolders.find((entry) => entry.id === targetFolderId);
      if (folder?.readOnly || targetFolder?.readOnly) {
        return;
      }
      if (folderId === targetFolderId) {
        return;
      }
      const byId = new Map(allFolders.map((entry) => [entry.id, entry]));
      let cursor = byId.get(targetFolderId);
      while (cursor?.parentId) {
        if (cursor.parentId === folderId) {
          return;
        }
        cursor = byId.get(cursor.parentId);
      }
      await fetch(`/api/workspaces/${workspaceUuid}/folders/${folderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: targetFolderId }),
      });
      await Promise.all([loadFolder(), loadTree()]);
      emitSync();
    },
    [allFolders, emitSync, loadFolder, loadTree, workspaceUuid],
  );

  const moveFile = useCallback(
    async (fileId: string, targetFolderId: string) => {
      if (!workspaceUuid) {
        return;
      }
      const file = files.find((entry) => entry.id === fileId);
      const targetFolder = allFolders.find((entry) => entry.id === targetFolderId);
      if (file?.readOnly || targetFolder?.readOnly) {
        return;
      }
      await fetch(`/api/workspaces/${workspaceUuid}/files/${fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: targetFolderId }),
      });
      await loadFolder();
      emitSync();
    },
    [allFolders, emitSync, files, loadFolder, workspaceUuid],
  );

  const deleteFolder = useCallback(
    async (folderId: string) => {
      if (!workspaceUuid) {
        return;
      }
      const folder = allFolders.find((entry) => entry.id === folderId);
      if (folder?.readOnly) {
        return;
      }
      await fetch(`/api/workspaces/${workspaceUuid}/folders/${folderId}`, {
        method: "DELETE",
      });
      await Promise.all([loadFolder(), loadTree()]);
      emitSync();
    },
    [allFolders, emitSync, loadFolder, loadTree, workspaceUuid],
  );

  const deleteFile = useCallback(
    async (fileId: string) => {
      if (!workspaceUuid) {
        return;
      }
      const file = files.find((entry) => entry.id === fileId);
      if (file?.readOnly) {
        return;
      }
      await fetch(`/api/workspaces/${workspaceUuid}/files/${fileId}`, {
        method: "DELETE",
      });
      await loadFolder();
      emitSync();
    },
    [emitSync, files, loadFolder, workspaceUuid],
  );

  const moveItemsToFolder = useCallback(
    async (itemIds: string[], targetFolderId: string) => {
      if (itemIds.length === 0) {
        return;
      }

      const targetFolder = allFolders.find((folder) => folder.id === targetFolderId);
      if (targetFolder?.readOnly) {
        return;
      }

      const folderIds = new Set(folders.map((folder) => folder.id));
      const fileIds = new Set(files.map((file) => file.id));

      await Promise.all(
        itemIds.map(async (itemId) => {
          if (folderIds.has(itemId) && itemId !== targetFolderId) {
            const folder = folders.find((entry) => entry.id === itemId);
            if (folder?.readOnly) {
              return;
            }
            await moveFolder(itemId, targetFolderId);
            return;
          }
          if (fileIds.has(itemId)) {
            const file = files.find((entry) => entry.id === itemId);
            if (file?.readOnly) {
              return;
            }
            await moveFile(itemId, targetFolderId);
          }
        }),
      );
      selection.clearSelection();
    },
    [allFolders, files, folders, moveFile, moveFolder, selection],
  );

  const updateTouchDropTarget = useCallback((clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY);
    const target = element?.closest<HTMLElement>("[data-drop-folder-id]");
    const targetId = target?.dataset.dropFolderId ?? null;
    setDropTargetId(targetId);
    return targetId;
  }, []);

  const beginTouchDrag = useCallback(
    (itemId: string) => {
      const sourceIds = selection.prepareDrag(itemId);
      touchDragIdsRef.current = sourceIds;
      setDraggingIds(sourceIds);
    },
    [selection],
  );

  const moveTouchDrag = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (!touchDragIdsRef.current || event.touches.length === 0) {
        return;
      }
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      updateTouchDropTarget(touch.clientX, touch.clientY);
    },
    [updateTouchDropTarget],
  );

  const endTouchDrag = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const sourceIds = touchDragIdsRef.current;
      touchDragIdsRef.current = null;
      setDraggingIds([]);

      if (!sourceIds || sourceIds.length === 0 || event.changedTouches.length === 0) {
        setDropTargetId(null);
        return;
      }

      const touch = event.changedTouches[0];
      if (!touch) {
        setDropTargetId(null);
        return;
      }

      const targetId = updateTouchDropTarget(touch.clientX, touch.clientY);
      if (!targetId) {
        setDropTargetId(null);
        return;
      }

      void moveItemsToFolder(sourceIds, targetId);
      setDropTargetId(null);
    },
    [moveItemsToFolder, updateTouchDropTarget],
  );

  const handleCanvasDragEnter = useCallback(() => {
    if (isCurrentFolderReadOnly) {
      return;
    }
    canvasDragDepthRef.current += 1;
    setCanvasDropActive(true);
    setDropTargetId(currentFolderId);
  }, [currentFolderId, isCurrentFolderReadOnly]);

  const handleCanvasDragLeave = useCallback(() => {
    if (isCurrentFolderReadOnly) {
      return;
    }
    canvasDragDepthRef.current = Math.max(0, canvasDragDepthRef.current - 1);
    if (canvasDragDepthRef.current === 0) {
      setCanvasDropActive(false);
      setDropTargetId(null);
    }
  }, [isCurrentFolderReadOnly]);

  const openCreateFolderDialog = (parentId: string) => {
    setEditDialog({
      mode: "create-folder",
      parentId,
      value: "",
    });
  };

  const openRenameFolderDialog = (folder: FolderRecord) => {
    setEditDialog({
      mode: "rename-folder",
      id: folder.id,
      value: folder.name,
    });
  };

  const openRenameFileDialog = (file: FileRecord) => {
    setEditDialog({
      mode: "rename-file",
      id: file.id,
      value: file.name,
    });
  };

  const applyEditDialog = async () => {
    if (!editDialog) {
      return;
    }

    if (editDialog.mode === "create-folder" && editDialog.parentId) {
      await createFolder(editDialog.parentId, editDialog.value);
    }

    if (editDialog.mode === "rename-folder" && editDialog.id) {
      await renameFolder(editDialog.id, editDialog.value);
    }

    if (editDialog.mode === "rename-file" && editDialog.id) {
      await renameFile(editDialog.id, editDialog.value);
    }

    setEditDialog(null);
  };

  const shareActiveFileWithEmail = async () => {
    if (!activeFile || !workspaceUuid || !shareEmail.trim() || activeFile.readOnly) {
      return;
    }

    setShareBusy(true);
    setShareStatus(null);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceUuid}/files/${activeFile.id}/share/grants`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: shareEmail.trim() }),
        },
      );
      if (!response.ok) {
        setShareStatus("Unable to add access.");
        return;
      }
      setShareEmail("");
      setShareStatus("Access granted.");
    } finally {
      setShareBusy(false);
    }
  };

  const generateActiveFileShareLink = async () => {
    if (!activeFile || !workspaceUuid || activeFile.readOnly) {
      return;
    }
    setShareBusy(true);
    setShareStatus(null);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceUuid}/files/${activeFile.id}/share/link`,
        { method: "POST" },
      );
      if (!response.ok) {
        setShareStatus("Unable to generate link.");
        return;
      }
      const payload = (await response.json()) as { shareUrl?: string };
      if (payload.shareUrl) {
        setShareLink(payload.shareUrl);
        setShareStatus("Share link generated.");
      }
    } finally {
      setShareBusy(false);
    }
  };

  const shareWorkspaceWithEmail = async () => {
    if (!workspaceUuid || !workspaceShareEmail.trim()) {
      return;
    }
    setWorkspaceShareBusy(true);
    setWorkspaceShareStatus(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceUuid}/share/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: workspaceShareEmail.trim() }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setWorkspaceShareStatus(payload.error ?? "Unable to share workspace.");
        return;
      }
      const payload = (await response.json()) as { status?: string };
      setWorkspaceShareEmail("");
      setWorkspaceShareStatus(
        payload.status === "added"
          ? "Workspace shared."
          : payload.status === "invited"
            ? "Invitation sent."
          : "Workspace shared.",
      );
    } finally {
      setWorkspaceShareBusy(false);
    }
  };

  const notifyWorkspaceTeam = async () => {
    if (!workspaceUuid) {
      return;
    }
    setWorkspaceShareBusy(true);
    setWorkspaceShareStatus(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceUuid}/share/team`, {
        method: "POST",
      });
      if (!response.ok) {
        setWorkspaceShareStatus("Unable to notify team.");
        return;
      }
      const payload = (await response.json()) as { emailSentCount?: number };
      setWorkspaceShareStatus(
        `Workspace notification sent to ${payload.emailSentCount ?? 0} teammates.`,
      );
    } finally {
      setWorkspaceShareBusy(false);
    }
  };

  if (activeFile) {
    const { isAudio, isImage, isPdf, isVideo } = detectPreviewKind(activeFile);
    const isOpenedCached = isFileOpenedCached(activeFile.id);

    return (
      <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <div className="flex h-12 items-center justify-between gap-2 border-b border-border/70 bg-card/40 px-3">
          <div className="flex min-w-0 items-center gap-1 text-muted-foreground text-xs">
            <Button
              className="size-5"
              onClick={() => selectFile(null)}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <ArrowLeft className="size-3" />
            </Button>
            <span className="truncate text-foreground">{activeFile.name}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="hidden text-muted-foreground text-xs sm:inline">
              Edited {toUpdatedLabel(activeFile.createdAt)} ago
            </span>
            {!activeFile.readOnly ? (
              <Dialog>
                <DialogTrigger
                  render={<Button className="size-5" size="icon-xs" type="button" variant="ghost" />}
                >
                  <Share2 className="size-3" />
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Share file</DialogTitle>
                    <DialogDescription>
                      Grant read-only access by email or create a signed link.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2">
                    <label className="font-medium text-sm" htmlFor="file-share-email">
                      Add people
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="file-share-email"
                        list="file-share-email-suggestions"
                        onChange={(event) => setShareEmail(event.target.value)}
                        onFocus={() => {
                          void loadShareSuggestions(shareEmail, setShareSuggestions);
                        }}
                        placeholder="name@example.com"
                        type="email"
                        value={shareEmail}
                      />
                      <datalist id="file-share-email-suggestions">
                        {shareSuggestions.map((item) => (
                          <option
                            key={item.email}
                            label={item.name ? `${item.name} (${item.email})` : item.email}
                            value={item.email}
                          />
                        ))}
                      </datalist>
                      <Button
                        disabled={shareBusy}
                        onClick={() => {
                          void shareActiveFileWithEmail();
                        }}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="font-medium text-sm">Share link (7 days)</label>
                    <div className="flex items-center gap-2">
                      <Input readOnly value={shareLink ?? ""} />
                      <Button
                        disabled={shareBusy}
                        onClick={() => {
                          void generateActiveFileShareLink();
                        }}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Generate
                      </Button>
                      <Button
                        disabled={!shareLink}
                        onClick={() => {
                          if (!shareLink) {
                            return;
                          }
                          void navigator.clipboard.writeText(shareLink);
                          setShareStatus("Link copied.");
                        }}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Copy
                      </Button>
                    </div>
                  </div>
                  {shareStatus ? (
                    <p className="text-muted-foreground text-xs">{shareStatus}</p>
                  ) : null}
                </DialogContent>
              </Dialog>
            ) : null}
            <Button
              className="size-5"
              onClick={() => window.open(activeFile.storageUrl, "_blank", "noopener,noreferrer")}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <ArrowUp className="size-3" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-muted/25">
          {isPdf ? (
            <div className="h-full p-3">
              <PDFViewer
                className="h-[calc(100svh-7.5rem)] max-h-none rounded-xl border border-border/70"
                source={activeFile.storageUrl}
              />
            </div>
          ) : isVideo && !videoLoadFailed ? (
            <div className="mx-auto flex h-full max-w-[1200px] items-center justify-center p-4">
              <FileMediaPlayer
                kind="video"
                mimeType={activeFile.mimeType}
                name={activeFile.name}
                openedCached={isOpenedCached || getWarmState(activeFile.storageUrl) === "warm"}
                onError={() => {
                  if (!mediaStreamFailed && activeMediaStreamUrl) {
                    setMediaStreamFailed(true);
                    return;
                  }
                  setVideoLoadFailed(true);
                }}
                src={activeMediaSrc ?? activeFile.storageUrl}
              />
            </div>
          ) : isAudio && !audioLoadFailed ? (
            <div className="mx-auto flex h-full max-w-[900px] items-center justify-center p-4">
              <FileMediaPlayer
                kind="audio"
                mimeType={activeFile.mimeType}
                name={activeFile.name}
                openedCached={isOpenedCached || getWarmState(activeFile.storageUrl) === "warm"}
                onError={() => {
                  if (!mediaStreamFailed && activeMediaStreamUrl) {
                    setMediaStreamFailed(true);
                    return;
                  }
                  setAudioLoadFailed(true);
                }}
                src={activeMediaSrc ?? activeFile.storageUrl}
              />
            </div>
          ) : isImage ? (
            <div className="mx-auto flex h-full max-w-[1200px] flex-col gap-3 p-4">
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-border/70 bg-white p-4">
                <img
                  alt={activeFile.name}
                  className="h-auto max-h-full max-w-full rounded-md object-contain"
                  src={activeFile.storageUrl}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[55vh] flex-col items-center justify-center gap-3 rounded-md border border-border/70 bg-card p-4 text-center">
              <FileText className="size-8 text-muted-foreground" />
              <p className="text-muted-foreground text-xs">In-app preview is unavailable for this file type.</p>
              <Button
                onClick={() => window.open(activeFile.storageUrl, "_blank", "noopener,noreferrer")}
                size="sm"
                type="button"
                variant="outline"
              >
                Open in new tab
              </Button>
            </div>
          )}
        </div>
        {queueCard}
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/70 px-3">
        <SidebarTrigger className="h-8 w-8 rounded-md" />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                className="h-8 rounded-md px-2"
                size="sm"
                type="button"
                variant="outline"
              />
            }
          >
            <span className="text-base leading-none">+</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuItem
              disabled={isCurrentFolderReadOnly}
              onClick={() => fileInputRef.current?.click()}
            >
              Upload file
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isCurrentFolderReadOnly}
              onClick={() => folderInputRef.current?.click()}
            >
              Upload folder
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                window.dispatchEvent(new Event(DASHBOARD_FILES_FOCUS_SEARCH_EVENT))
              }
            >
              Search tools
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-1 flex min-w-0 items-center gap-1 overflow-x-auto">
          {breadcrumbs.map((crumb) => (
            <Button
              className="h-7 rounded-md px-2 text-xs"
              key={crumb.id}
              onClick={() => navigateToFolder(crumb.id)}
              size="xs"
              type="button"
              variant={crumb.id === currentFolderId ? "secondary" : "ghost"}
            >
              {crumb.name}
            </Button>
          ))}
        </div>
      </div>

      <div className="border-b border-border/70 px-3 py-3">
        <StylizedSearchBar
          focusSignal={focusSearchSignal}
          items={searchableItems}
          maxWidth="max-w-none"
          onApplyWorkspaceFilter={(itemIds) => {
            setVectorFilteredIds(itemIds ? new Set(itemIds) : null);
          }}
          onSearch={(searchQuery) => {
            setQuery(searchQuery);
          }}
          placeholder="Search anything..."
        />
      </div>

      <input
        className="sr-only"
        multiple
        onChange={(event) => {
          const incoming = Array.from(event.target.files ?? []);
          queueUploads(incoming.map((file) => ({ file })));
          event.currentTarget.value = "";
        }}
        ref={fileInputRef}
        type="file"
      />
      <input
        className="sr-only"
        multiple
        onChange={(event) => {
          const incoming = Array.from(event.target.files ?? []).map((file) => {
            const webkitRelativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
            return {
              file,
              relativePath: webkitRelativePath || file.name,
            };
          });
          queueUploads(incoming);
          event.currentTarget.value = "";
        }}
        ref={folderInputRef}
        type="file"
      />

      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="font-semibold text-lg tracking-tight">Workspace</h2>
        <div className="flex items-center gap-2">
          <Dialog>
            <DialogTrigger
              render={
                <Button className="rounded-md" size="sm" type="button" variant="outline" />
              }
            >
              <Share2 className="size-3.5" />
              Share
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Share workspace</DialogTitle>
                <DialogDescription>
                  Add a teammate by email, or notify the whole team with a workspace link.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <label className="font-medium text-sm" htmlFor="workspace-share-email">
                  Add teammate
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    id="workspace-share-email"
                    list="workspace-share-email-suggestions"
                    onChange={(event) => setWorkspaceShareEmail(event.target.value)}
                    onFocus={() => {
                      void loadShareSuggestions(workspaceShareEmail, setWorkspaceShareSuggestions);
                    }}
                    placeholder="name@example.com"
                    type="email"
                    value={workspaceShareEmail}
                  />
                  <datalist id="workspace-share-email-suggestions">
                    {workspaceShareSuggestions.map((item) => (
                      <option
                        key={item.email}
                        label={item.name ? `${item.name} (${item.email})` : item.email}
                        value={item.email}
                      />
                    ))}
                  </datalist>
                  <Button
                    disabled={workspaceShareBusy}
                    onClick={() => {
                      void shareWorkspaceWithEmail();
                    }}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    Add
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button
                  disabled={workspaceShareBusy}
                  onClick={() => {
                    void notifyWorkspaceTeam();
                  }}
                  type="button"
                  variant="outline"
                >
                  Notify whole team
                </Button>
              </DialogFooter>
              {workspaceShareStatus ? (
                <p className="text-muted-foreground text-xs">{workspaceShareStatus}</p>
              ) : null}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <div className="flex items-center gap-2">
          <Button
            className="rounded-md"
            disabled={breadcrumbs.length < 2}
            onClick={() => {
              const parent = breadcrumbs[breadcrumbs.length - 2];
              if (parent) {
                navigateToFolder(parent.id);
              }
            }}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <ArrowUp />
          </Button>
          <Button
            className="rounded-md"
            disabled={isCurrentFolderReadOnly}
            onClick={() => fileInputRef.current?.click()}
            size="sm"
            type="button"
            variant="outline"
          >
            <Upload />
            Upload
          </Button>
          <Button
            className="rounded-md"
            disabled={isCurrentFolderReadOnly}
            onClick={() => folderInputRef.current?.click()}
            size="sm"
            type="button"
            variant="outline"
          >
            <Folder />
            Folder
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger
              render={<Button className="rounded-md" size="sm" type="button" variant="outline" />}
            >
              <CalendarDays className="size-3.5" />
              {createdDateRange?.from
                ? createdDateRange.to
                  ? `${createdDateRange.from.toLocaleDateString()} - ${createdDateRange.to.toLocaleDateString()}`
                  : createdDateRange.from.toLocaleDateString()
                : "Date created"}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="range"
                onSelect={setCreatedDateRange}
                selected={createdDateRange}
                numberOfMonths={2}
              />
              <div className="border-t p-2">
                <Button
                  className="w-full"
                  onClick={() => setCreatedDateRange(undefined)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Clear date
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button className="rounded-md" size="sm" type="button" variant="outline" />}
            >
              <FileText className="size-3.5" />
              {fileTypeFilter.size > 0 ? `Type (${fileTypeFilter.size})` : "File type"}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {availableFileTypes.length === 0 ? (
                <DropdownMenuItem disabled>No file types</DropdownMenuItem>
              ) : (
                availableFileTypes.map((type) => (
                  <DropdownMenuCheckboxItem
                    checked={fileTypeFilter.has(type)}
                    key={type}
                    onCheckedChange={(checked) => {
                      setFileTypeFilter((previous) => {
                        const next = new Set(previous);
                        if (checked) {
                          next.add(type);
                        } else {
                          next.delete(type);
                        }
                        return next;
                      });
                    }}
                  >
                    {type}
                  </DropdownMenuCheckboxItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button className="rounded-md" size="sm" type="button" variant="outline" />}
            >
              <UserRoundSearch className="size-3.5" />
              {actorFilter.size > 0 ? `${actorMode === "uploadedBy" ? "Uploaded" : "Edited"} (${actorFilter.size})` : actorMode === "uploadedBy" ? "Uploaded by" : "Edited by"}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() => {
                  setActorMode("uploadedBy");
                  setActorFilter(new Set());
                }}
              >
                Uploaded by
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setActorMode("updatedBy");
                  setActorFilter(new Set());
                }}
              >
                Edited by
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {availableActors.length === 0 ? (
                <DropdownMenuItem disabled>No users</DropdownMenuItem>
              ) : (
                availableActors.map((actorId) => (
                  <DropdownMenuCheckboxItem
                    checked={actorFilter.has(actorId)}
                    key={actorId}
                    onCheckedChange={(checked) => {
                      setActorFilter((previous) => {
                        const next = new Set(previous);
                        if (checked) {
                          next.add(actorId);
                        } else {
                          next.delete(actorId);
                        }
                        return next;
                      });
                    }}
                  >
                    {actorId}
                  </DropdownMenuCheckboxItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button className="rounded-md" size="sm" type="button" variant="outline" />}
            >
              <ArrowUpDown className="size-3.5" />
              {sortBy === "name"
                ? "Name"
                : sortBy === "createdAt"
                  ? "Date created"
                  : "Date updated"}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setSortBy("name")}>
                Name
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("createdAt")}>
                Date created
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("updatedAt")}>
                Date updated
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            className="rounded-md"
            onClick={clearAdvancedFilters}
            size="sm"
            type="button"
            variant="ghost"
          >
            Clear filters
          </Button>
          <Button
            aria-label="Card view"
            className="rounded-md"
            onClick={() => setViewMode("cards")}
            size="icon-sm"
            type="button"
            variant={viewMode === "cards" ? "secondary" : "outline"}
          >
            <Grid3X3 />
          </Button>
          <Button
            aria-label="List view"
            className="rounded-md"
            onClick={() => setViewMode("list")}
            size="icon-sm"
            type="button"
            variant={viewMode === "list" ? "secondary" : "outline"}
          >
            <LayoutList />
          </Button>
        </div>
        <Badge variant={hasActiveAdvancedFilters ? "secondary" : "outline"}>
          {filteredFolders.length + filteredFiles.length} items
        </Badge>
      </div>

      <div className="min-h-0 flex-1">
        <ContextMenu>
          <ContextMenuTrigger>
            <div className="h-full overflow-y-auto [scrollbar-color:color-mix(in_oklab,var(--color-border),transparent_30%)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2">
              <div
                className={cn(
                  "relative min-h-full px-3 pb-3",
                  canvasDropActive && "bg-emerald-500/5",
                )}
                data-drop-folder-id={isCurrentFolderReadOnly ? undefined : currentFolderId}
                onDragEnter={handleCanvasDragEnter}
                onDragLeave={handleCanvasDragLeave}
                onDragOver={(event) => {
                  if (isCurrentFolderReadOnly) {
                    return;
                  }
                  event.preventDefault();
                  const isExternalFileDrop = event.dataTransfer.types.includes("Files");
                  event.dataTransfer.dropEffect = isExternalFileDrop ? "copy" : "move";
                  setCanvasDropActive(true);
                  setDropTargetId(currentFolderId);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  canvasDragDepthRef.current = 0;
                  setCanvasDropActive(false);
                  setDropTargetId(null);
                  if (isCurrentFolderReadOnly) {
                    setDraggingIds([]);
                    return;
                  }
                  void (async () => {
                    const uploadCandidates = await getDropUploadCandidates(event);
                    if (uploadCandidates.length > 0) {
                      queueUploads(uploadCandidates);
                      setDraggingIds([]);
                      return;
                    }
                    const sourceIds = draggingIds.length > 0 ? draggingIds : Array.from(selection.selectedIds);
                    await moveItemsToFolder(sourceIds, currentFolderId);
                    setDraggingIds([]);
                  })();
                }}
              >
                {loading ? (
                  <div className="flex flex-wrap gap-3">
                    {Array.from({ length: 10 }).map((_, index) => (
                      <Card className="rounded-2xl border border-border/70 bg-card py-2" key={index} style={{ width: 160 }}>
                        <CardContent className="space-y-3 pt-0">
                          <Skeleton className="mx-auto h-24 w-24 rounded-2xl" />
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div
                    className="relative min-h-[calc(100vh-14rem)]"
                    onPointerDown={selection.startDragSelection}
                    ref={gridRef}
                  >
                    <div className={cn("flex flex-wrap gap-3", viewMode !== "cards" && "hidden")}>
                      {sortedFolders.map((folder) => {
                        const previewItems = folderCardPreviewItems.get(folder.id) ?? [];
                        return (
                        <ContextMenu key={folder.id}>
                          <ContextMenuTrigger>
                            <Card
                              className={cn(
                                "group relative cursor-pointer overflow-visible rounded-2xl border border-border/70 bg-card py-2 transition hover:border-emerald-500/35",
                                selection.selectedIds.has(folder.id) && "border-emerald-500 bg-emerald-500/5",
                                dropTargetId === folder.id && "bg-emerald-500/10 ring-2 ring-emerald-400/70",
                              )}
                              data-select-item="true"
                              data-drop-folder-id={folder.id}
                              draggable={!folder.readOnly}
                              onClick={(event) => {
                                selection.handleItemClick(event, folder.id, visibleItemIds);
                                handleOpenOnDoubleClick(event, () => navigateToFolder(folder.id));
                              }}
                              onDragEnd={() => {
                                canvasDragDepthRef.current = 0;
                                setCanvasDropActive(false);
                                setDraggingIds([]);
                                setDropTargetId(null);
                              }}
                              onDragEnter={(event) => {
                                if (folder.readOnly) {
                                  return;
                                }
                                event.preventDefault();
                                setDropTargetId(folder.id);
                              }}
                              onDragLeave={() => {
                                setDropTargetId((current) => (current === folder.id ? null : current));
                              }}
                              onDragOver={(event) => {
                                if (folder.readOnly) {
                                  return;
                                }
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                                setDropTargetId(folder.id);
                              }}
                              onDragStart={(event) => {
                                if (folder.readOnly) {
                                  event.preventDefault();
                                  return;
                                }
                                const sourceIds = selection.prepareDrag(folder.id);
                                setDraggingIds(sourceIds);
                                event.dataTransfer.effectAllowed = "move";
                                configureDragPreview(event);
                                event.dataTransfer.setData("text/plain", sourceIds.join(","));
                              }}
                              onDrop={async (event) => {
                                event.preventDefault();
                                if (folder.readOnly) {
                                  canvasDragDepthRef.current = 0;
                                  setCanvasDropActive(false);
                                  setDropTargetId(null);
                                  setDraggingIds([]);
                                  return;
                                }
                                const sourceIds = draggingIds.length > 0 ? draggingIds : Array.from(selection.selectedIds);
                                if (sourceIds.length === 0) {
                                  const uploadCandidates = await getDropUploadCandidates(event);
                                  if (uploadCandidates.length > 0) {
                                    queueUploads(uploadCandidates);
                                  }
                                  canvasDragDepthRef.current = 0;
                                  setCanvasDropActive(false);
                                  setDropTargetId(null);
                                  setDraggingIds([]);
                                  return;
                                }
                                const folderById = new Map(allFolders.map((entry) => [entry.id, entry]));
                                const hasInvalidMove = sourceIds.some((id) => {
                                  if (id === folder.id) {
                                    return true;
                                  }
                                  const sourceFolder = folderById.get(id);
                                  if (!sourceFolder) {
                                    return false;
                                  }
                                  let cursor = folderById.get(folder.id);
                                  while (cursor?.parentId) {
                                    if (cursor.parentId === sourceFolder.id) {
                                      return true;
                                    }
                                    cursor = folderById.get(cursor.parentId);
                                  }
                                  return false;
                                });
                                canvasDragDepthRef.current = 0;
                                setCanvasDropActive(false);
                                setDropTargetId(null);
                                if (!hasInvalidMove) {
                                  event.stopPropagation();
                                  void moveItemsToFolder(sourceIds, folder.id);
                                }
                                setDraggingIds([]);
                              }}
                              onTouchEnd={endTouchDrag}
                              onTouchMove={moveTouchDrag}
                              onTouchStart={() => {
                                if (folder.readOnly) {
                                  return;
                                }
                                beginTouchDrag(folder.id);
                              }}
                              ref={(node: HTMLDivElement | null) => {
                                if (!node) {
                                  itemRefs.current.delete(folder.id);
                                  return;
                                }
                                itemRefs.current.set(folder.id, node);
                              }}
                              style={{ width: 160 }}
                            >
                              <div className="absolute top-2 left-2 z-[90]">
                                <Checkbox
                                  aria-label={`Select folder ${folder.name}`}
                                  checked={selection.selectedIds.has(folder.id)}
                                  onCheckedChange={() => selection.toggleSelection(folder.id)}
                                  onClick={(event) => event.stopPropagation()}
                                />
                              </div>
                              <CardContent className="space-y-3 pt-0">
                                <div className="mx-auto flex h-24 w-24 items-center justify-center">
                                  <div className="relative isolate h-[78px] w-[96px] overflow-visible transition-transform duration-200 ease-in group-hover:-translate-y-1.5">
                                    <div className="absolute bottom-[98%] left-0 z-10 h-[10px] w-[30px] rounded-t-[5px] bg-[#457f74]" />
                                    <div className="relative z-20 h-full w-full rounded-tr-[6px] rounded-br-[6px] rounded-bl-[6px] bg-[#457f74]">
                                      {Array.from({ length: 3 }).map((_, index) => {
                                        const item = previewItems[index];
                                        const layerClass =
                                          index === 0
                                            ? "z-30 h-[64%] w-[70%] bg-[#dbe7e4] group-hover:-translate-y-[20%]"
                                            : index === 1
                                              ? "z-40 h-[58%] w-[80%] bg-[#ecf3f1] group-hover:-translate-y-[24%] delay-75"
                                              : "z-50 h-[50%] w-[90%] bg-white group-hover:-translate-y-[30%] delay-100";

                                        return (
                                          <div
                                            className={cn(
                                              "absolute bottom-[10%] left-1/2 flex -translate-x-1/2 translate-y-[8%] items-center justify-center rounded-[5px] transition-transform duration-300 ease-in-out",
                                              layerClass,
                                            )}
                                            key={`${folder.id}-preview-${index}`}
                                          >
                                            {item ? (
                                              item.kind === "folder" ? (
                                                <Folder className="size-3.5 text-emerald-700" />
                                              ) : (
                                                getFileTypeIcon(item.fileKind ?? "other", "size-3.5")
                                              )
                                            ) : null}
                                          </div>
                                        );
                                      })}
                                      <div className="absolute inset-0 z-[70] origin-bottom rounded-[6px] bg-[#74c2b2] transition-transform duration-300 ease-in-out group-hover:-skew-x-[14deg] group-hover:scale-y-[0.62]" />
                                    </div>
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <p className="truncate font-medium text-sm">{folder.name}</p>
                                  <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
                                    <Folder className="size-3.5" />
                                    <span>Folder</span>
                                  </p>
                                </div>
                              </CardContent>
                            </Card>
                          </ContextMenuTrigger>
                          <ContextMenuContent>
                            <ContextMenuItem onClick={() => navigateToFolder(folder.id)}>
                              Open
                            </ContextMenuItem>
                            {!folder.readOnly ? (
                              <>
                                <ContextMenuItem onClick={() => openRenameFolderDialog(folder)}>
                                  Rename
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => openCreateFolderDialog(folder.id)}>
                                  New folder here
                                </ContextMenuItem>
                                <ContextMenuSub>
                                  <ContextMenuSubTrigger>Move to</ContextMenuSubTrigger>
                                  <ContextMenuSubContent>
                                    {allFolders
                                      .filter((target) => target.id !== folder.id && !target.readOnly)
                                      .slice(0, 20)
                                      .map((target) => (
                                        <ContextMenuItem
                                          key={target.id}
                                          onClick={() => {
                                            void moveFolder(folder.id, target.id);
                                          }}
                                        >
                                          {target.name}
                                        </ContextMenuItem>
                                      ))}
                                  </ContextMenuSubContent>
                                </ContextMenuSub>
                              </>
                            ) : null}
                            <ContextMenuItem
                              onClick={() => {
                                setPropertiesItem({
                                  kind: "folder",
                                  id: folder.id,
                                  name: folder.name,
                                  detail: "Folder",
                                });
                                setPropertiesOpen(true);
                              }}
                            >
                              Properties
                            </ContextMenuItem>
                            {!folder.readOnly ? (
                              <ContextMenuItem
                                onClick={() => {
                                  void deleteFolder(folder.id);
                                }}
                                variant="destructive"
                              >
                                Delete
                              </ContextMenuItem>
                            ) : null}
                          </ContextMenuContent>
                        </ContextMenu>
                        );
                      })}

                      {sortedFiles.map((file) => {
                        const { isImage, isPdf, isVideo, isAudio } = detectPreviewKind(file);
                        const openedCached = isFileOpenedCached(file.id);
                        const isWarmed = getWarmState(file.storageUrl) === "warm";
                        const fileKind = detectFileKind(file);
                        const fileCardType = fileKind === "sheet" ? "document" : fileKind;
                        return (
                          <ContextMenu key={file.id}>
                            <ContextMenuTrigger>
                              <Card
                                className={cn(
                                  "group grid-card-item relative cursor-pointer rounded-2xl border border-border/70 bg-card py-2 transition hover:border-emerald-500/35",
                                  selection.selectedIds.has(file.id) && "border-emerald-500 bg-emerald-500/5",
                                )}
                                data-select-item="true"
                                draggable={!file.readOnly}
                                tabIndex={0}
                                onTouchEnd={endTouchDrag}
                                onTouchMove={moveTouchDrag}
                                onTouchStart={() => {
                                  if (file.readOnly) {
                                    return;
                                  }
                                  beginTouchDrag(file.id);
                                }}
                                onClick={(event) => {
                                  selection.handleItemClick(event, file.id, visibleItemIds);
                                  handleOpenOnDoubleClick(event, () => selectFile(file.id));
                                }}
                                onFocus={() => handlePreviewIntentStart(file)}
                                onBlur={() => handlePreviewIntentEnd(file)}
                                onMouseEnter={() => handlePreviewIntentStart(file)}
                                onMouseLeave={() => handlePreviewIntentEnd(file)}
                                onDragEnd={() => {
                                  canvasDragDepthRef.current = 0;
                                  setCanvasDropActive(false);
                                  setDraggingIds([]);
                                  setDropTargetId(null);
                                }}
                                onDragStart={(event) => {
                                  if (file.readOnly) {
                                    event.preventDefault();
                                    return;
                                  }
                                  const sourceIds = selection.prepareDrag(file.id);
                                  setDraggingIds(sourceIds);
                                  event.dataTransfer.effectAllowed = "move";
                                  configureDragPreview(event);
                                  event.dataTransfer.setData("text/plain", sourceIds.join(","));
                                }}
                                ref={(node: HTMLDivElement | null) => {
                                  if (!node) {
                                    itemRefs.current.delete(file.id);
                                    return;
                                  }
                                  itemRefs.current.set(file.id, node);
                                }}
                                style={{ width: 160 }}
                              >
                                <div className="absolute top-2 left-2 z-10">
                                <Checkbox
                                  aria-label={`Select file ${file.name}`}
                                  checked={selection.selectedIds.has(file.id)}
                                  onCheckedChange={() => selection.toggleSelection(file.id)}
                                  onClick={(event) => event.stopPropagation()}
                                  />
                                </div>
                                <CardContent className="pt-0">
                                  <FileCard
                                    fileType={fileCardType}
                                    lastUpdated={new Date(file.updatedAt ?? file.createdAt)}
                                    name={file.name}
                                    previewContent={
                                      isImage ? (
                                        <img
                                          alt={file.name}
                                          className="block h-full w-full object-cover"
                                          loading="lazy"
                                          src={file.storageUrl}
                                        />
                                      ) : isVideo ? (
                                        <VideoThumbnail
                                          className="h-full w-full"
                                          mimeType={file.mimeType}
                                          openedCached={openedCached || isWarmed}
                                          src={file.storageUrl}
                                          warm={hoveredPreviewFileId === file.id}
                                        />
                                      ) : isPdf ? (
                                        <PdfThumbnail
                                          className="h-full w-full"
                                          src={file.storageUrl}
                                        />
                                      ) : undefined
                                    }
                                  />
                                </CardContent>
                              </Card>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem onClick={() => selectFile(file.id)}>Open</ContextMenuItem>
                              {!file.readOnly ? (
                                <>
                                  <ContextMenuItem onClick={() => openRenameFileDialog(file)}>
                                    Rename
                                  </ContextMenuItem>
                                  <ContextMenuSub>
                                    <ContextMenuSubTrigger>Move to</ContextMenuSubTrigger>
                                    <ContextMenuSubContent>
                                      {allFolders
                                        .filter((target) => !target.readOnly)
                                        .slice(0, 20)
                                        .map((target) => (
                                          <ContextMenuItem
                                            key={target.id}
                                            onClick={() => {
                                              void moveFile(file.id, target.id);
                                            }}
                                          >
                                            {target.name}
                                          </ContextMenuItem>
                                        ))}
                                    </ContextMenuSubContent>
                                  </ContextMenuSub>
                                </>
                              ) : null}
                              <ContextMenuItem
                                onClick={() => {
                                  setPropertiesItem({
                                    kind: "file",
                                    id: file.id,
                                    name: file.name,
                                    detail: `${formatBytes(file.sizeBytes)} • ${file.mimeType ?? "unknown"}`,
                                  });
                                  setPropertiesOpen(true);
                                }}
                              >
                                Properties
                              </ContextMenuItem>
                              {!file.readOnly ? (
                                <ContextMenuItem
                                  onClick={() => {
                                    void deleteFile(file.id);
                                  }}
                                  variant="destructive"
                                >
                                  Delete
                                </ContextMenuItem>
                              ) : null}
                            </ContextMenuContent>
                          </ContextMenu>
                        );
                      })}
                    </div>
                    {viewMode === "list" ? (
                      <div className="divide-y divide-border/70 rounded-md border border-border/70">
                        {sortedFolders.map((folder) => (
                          <ContextMenu key={folder.id}>
                            <ContextMenuTrigger>
                              <div
                            className={cn(
                              "flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/30",
                              selection.selectedIds.has(folder.id) && "bg-emerald-500/10",
                              dropTargetId === folder.id && "bg-emerald-500/15 outline outline-2 outline-emerald-400/70",
                            )}
                            data-drop-folder-id={folder.id}
                            data-select-item="true"
                            draggable={!folder.readOnly}
                            onClick={(event) => {
                              selection.handleItemClick(event, folder.id, visibleItemIds);
                              handleOpenOnDoubleClick(event, () => navigateToFolder(folder.id));
                            }}
                            onDragEnd={() => {
                              canvasDragDepthRef.current = 0;
                              setCanvasDropActive(false);
                              setDraggingIds([]);
                              setDropTargetId(null);
                            }}
                            onDragEnter={(event) => {
                              if (folder.readOnly) {
                                return;
                              }
                              event.preventDefault();
                              setDropTargetId(folder.id);
                            }}
                            onDragLeave={() => {
                              setDropTargetId((current) => (current === folder.id ? null : current));
                            }}
                            onDragOver={(event) => {
                              if (folder.readOnly) {
                                return;
                              }
                              event.preventDefault();
                              event.dataTransfer.dropEffect = "move";
                              setDropTargetId(folder.id);
                            }}
                            onDragStart={(event) => {
                              if (folder.readOnly) {
                                event.preventDefault();
                                return;
                              }
                              const sourceIds = selection.prepareDrag(folder.id);
                              setDraggingIds(sourceIds);
                              event.dataTransfer.effectAllowed = "move";
                              configureDragPreview(event);
                              event.dataTransfer.setData("text/plain", sourceIds.join(","));
                            }}
                            onDrop={async (event) => {
                              event.preventDefault();
                              if (folder.readOnly) {
                                canvasDragDepthRef.current = 0;
                                setCanvasDropActive(false);
                                setDropTargetId(null);
                                setDraggingIds([]);
                                return;
                              }
                              const sourceIds = draggingIds.length > 0 ? draggingIds : Array.from(selection.selectedIds);
                              if (sourceIds.length === 0) {
                                const uploadCandidates = await getDropUploadCandidates(event);
                                if (uploadCandidates.length > 0) {
                                  queueUploads(uploadCandidates);
                                }
                                canvasDragDepthRef.current = 0;
                                setCanvasDropActive(false);
                                setDropTargetId(null);
                                setDraggingIds([]);
                                return;
                              }
                              const folderById = new Map(allFolders.map((entry) => [entry.id, entry]));
                              const hasInvalidMove = sourceIds.some((id) => {
                                if (id === folder.id) {
                                  return true;
                                }
                                const sourceFolder = folderById.get(id);
                                if (!sourceFolder) {
                                  return false;
                                }
                                let cursor = folderById.get(folder.id);
                                while (cursor?.parentId) {
                                  if (cursor.parentId === sourceFolder.id) {
                                    return true;
                                  }
                                  cursor = folderById.get(cursor.parentId);
                                }
                                return false;
                              });
                              canvasDragDepthRef.current = 0;
                              setCanvasDropActive(false);
                              setDropTargetId(null);
                              if (!hasInvalidMove) {
                                event.stopPropagation();
                                void moveItemsToFolder(sourceIds, folder.id);
                              }
                              setDraggingIds([]);
                            }}
                            onTouchEnd={endTouchDrag}
                            onTouchMove={moveTouchDrag}
                            onTouchStart={() => {
                              if (folder.readOnly) {
                                return;
                              }
                              beginTouchDrag(folder.id);
                            }}
                            ref={(node: HTMLDivElement | null) => {
                              if (!node) {
                                itemRefs.current.delete(folder.id);
                                return;
                              }
                              itemRefs.current.set(folder.id, node);
                            }}
                          >
                            <Checkbox
                              aria-label={`Select folder ${folder.name}`}
                              checked={selection.selectedIds.has(folder.id)}
                              onCheckedChange={() => selection.toggleSelection(folder.id)}
                              onClick={(event) => event.stopPropagation()}
                            />
                            <Folder className="size-4 shrink-0 text-emerald-600" />
                            <p className="min-w-0 flex-1 truncate font-medium text-sm">{folder.name}</p>
                            <div className="ml-auto flex items-center gap-6 text-muted-foreground text-xs">
                              <span className="min-w-[110px] text-right tabular-nums">
                                {folderSubfolderCount.get(folder.id) ?? 0} folders • {folderFileCount.get(folder.id) ?? 0} files
                              </span>
                              <span className="min-w-[72px] text-right tabular-nums">
                                {folder.updatedAt ? toUpdatedLabel(folder.updatedAt) : "—"}
                              </span>
                            </div>
                              </div>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem onClick={() => navigateToFolder(folder.id)}>
                                Open
                              </ContextMenuItem>
                              {!folder.readOnly ? (
                                <>
                                  <ContextMenuItem onClick={() => openRenameFolderDialog(folder)}>
                                    Rename
                                  </ContextMenuItem>
                                  <ContextMenuItem onClick={() => openCreateFolderDialog(folder.id)}>
                                    New folder here
                                  </ContextMenuItem>
                                  <ContextMenuSub>
                                    <ContextMenuSubTrigger>Move to</ContextMenuSubTrigger>
                                    <ContextMenuSubContent>
                                      {allFolders
                                        .filter((target) => target.id !== folder.id && !target.readOnly)
                                        .slice(0, 20)
                                        .map((target) => (
                                          <ContextMenuItem
                                            key={target.id}
                                            onClick={() => {
                                              void moveFolder(folder.id, target.id);
                                            }}
                                          >
                                            {target.name}
                                          </ContextMenuItem>
                                        ))}
                                    </ContextMenuSubContent>
                                  </ContextMenuSub>
                                </>
                              ) : null}
                              <ContextMenuItem
                                onClick={() => {
                                  setPropertiesItem({
                                    kind: "folder",
                                    id: folder.id,
                                    name: folder.name,
                                    detail: "Folder",
                                  });
                                  setPropertiesOpen(true);
                                }}
                              >
                                Properties
                              </ContextMenuItem>
                              {!folder.readOnly ? (
                                <ContextMenuItem
                                  onClick={() => {
                                    void deleteFolder(folder.id);
                                  }}
                                  variant="destructive"
                                >
                                  Delete
                                </ContextMenuItem>
                              ) : null}
                            </ContextMenuContent>
                          </ContextMenu>
                        ))}
                        {sortedFiles.map((file) => {
                          const fileKind = detectFileKind(file);
                          return (
                            <ContextMenu key={file.id}>
                              <ContextMenuTrigger>
                                <div
                              className={cn(
                                "flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/30",
                                selection.selectedIds.has(file.id) && "bg-emerald-500/10",
                              )}
                              data-select-item="true"
                              draggable={!file.readOnly}
                              onClick={(event) => {
                                selection.handleItemClick(event, file.id, visibleItemIds);
                                handleOpenOnDoubleClick(event, () => selectFile(file.id));
                              }}
                              onDragEnd={() => {
                                canvasDragDepthRef.current = 0;
                                setCanvasDropActive(false);
                                setDraggingIds([]);
                                setDropTargetId(null);
                              }}
                              onDragStart={(event) => {
                                if (file.readOnly) {
                                  event.preventDefault();
                                  return;
                                }
                                const sourceIds = selection.prepareDrag(file.id);
                                setDraggingIds(sourceIds);
                                event.dataTransfer.effectAllowed = "move";
                                configureDragPreview(event);
                                event.dataTransfer.setData("text/plain", sourceIds.join(","));
                              }}
                              onTouchEnd={endTouchDrag}
                              onTouchMove={moveTouchDrag}
                              onTouchStart={() => {
                                if (file.readOnly) {
                                  return;
                                }
                                beginTouchDrag(file.id);
                              }}
                              ref={(node: HTMLDivElement | null) => {
                                if (!node) {
                                  itemRefs.current.delete(file.id);
                                  return;
                                }
                                itemRefs.current.set(file.id, node);
                              }}
                            >
                              <Checkbox
                                aria-label={`Select file ${file.name}`}
                                checked={selection.selectedIds.has(file.id)}
                                onCheckedChange={() => selection.toggleSelection(file.id)}
                                onClick={(event) => event.stopPropagation()}
                              />
                              <div
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted/60"
                              >
                                {getFileTypeIcon(fileKind)}
                              </div>
                              <p className="min-w-0 flex-1 truncate font-medium text-sm">{file.name}</p>
                              <div className="ml-auto flex items-center gap-6 text-muted-foreground text-xs">
                                <span className="min-w-[110px] text-right tabular-nums">
                                  {formatBytes(file.sizeBytes)}
                                </span>
                                <span className="min-w-[72px] text-right tabular-nums">
                                  {toUpdatedLabel(file.updatedAt ?? file.createdAt)}
                                </span>
                              </div>
                                </div>
                              </ContextMenuTrigger>
                              <ContextMenuContent>
                                <ContextMenuItem onClick={() => selectFile(file.id)}>Open</ContextMenuItem>
                                {!file.readOnly ? (
                                  <>
                                    <ContextMenuItem onClick={() => openRenameFileDialog(file)}>
                                      Rename
                                    </ContextMenuItem>
                                    <ContextMenuSub>
                                      <ContextMenuSubTrigger>Move to</ContextMenuSubTrigger>
                                      <ContextMenuSubContent>
                                        {allFolders
                                          .filter((target) => !target.readOnly)
                                          .slice(0, 20)
                                          .map((target) => (
                                            <ContextMenuItem
                                              key={target.id}
                                              onClick={() => {
                                                void moveFile(file.id, target.id);
                                              }}
                                            >
                                              {target.name}
                                            </ContextMenuItem>
                                          ))}
                                      </ContextMenuSubContent>
                                    </ContextMenuSub>
                                  </>
                                ) : null}
                                <ContextMenuItem
                                  onClick={() => {
                                    setPropertiesItem({
                                      kind: "file",
                                      id: file.id,
                                      name: file.name,
                                      detail: `${formatBytes(file.sizeBytes)} • ${file.mimeType ?? "unknown"}`,
                                    });
                                    setPropertiesOpen(true);
                                  }}
                                >
                                  Properties
                                </ContextMenuItem>
                                {!file.readOnly ? (
                                  <ContextMenuItem
                                    onClick={() => {
                                      void deleteFile(file.id);
                                    }}
                                    variant="destructive"
                                  >
                                    Delete
                                  </ContextMenuItem>
                                ) : null}
                              </ContextMenuContent>
                            </ContextMenu>
                          );
                        })}
                      </div>
                    ) : null}
                    {selection.selectionRect ? (
                      <div
                        className="pointer-events-none absolute z-20 rounded-md border border-emerald-400 bg-emerald-400/15"
                        style={{
                          left: selection.selectionRect.x,
                          top: selection.selectionRect.y,
                          width: selection.selectionRect.width,
                          height: selection.selectionRect.height,
                        }}
                      />
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem
              disabled={isCurrentFolderReadOnly}
              onClick={() => openCreateFolderDialog(currentFolderId)}
            >
              New folder
            </ContextMenuItem>
            <ContextMenuItem disabled={isCurrentFolderReadOnly} onClick={() => fileInputRef.current?.click()}>
              Upload file
            </ContextMenuItem>
            <ContextMenuItem disabled={isCurrentFolderReadOnly} onClick={() => folderInputRef.current?.click()}>
              Upload folder
            </ContextMenuItem>
            <ContextMenuItem onClick={() => void loadFolder()}>
              Refresh
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>

      <Dialog onOpenChange={setPropertiesOpen} open={propertiesOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Properties</DialogTitle>
            <DialogDescription>Item metadata and identifiers.</DialogDescription>
          </DialogHeader>
          {propertiesItem ? (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <p><span className="font-medium">Name:</span> {propertiesItem.name}</p>
              <p><span className="font-medium">Type:</span> {propertiesItem.kind}</p>
              <p><span className="font-medium">ID:</span> {propertiesItem.id}</p>
              {propertiesItem.detail ? (
                <p><span className="font-medium">Detail:</span> {propertiesItem.detail}</p>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setEditDialog(null);
          }
        }}
        open={Boolean(editDialog)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editDialog?.mode === "create-folder"
                ? "Create folder"
                : editDialog?.mode === "rename-folder"
                  ? "Rename folder"
                  : "Rename file"}
            </DialogTitle>
            <DialogDescription>
              {editDialog?.mode === "create-folder"
                ? "Choose a name for the new folder."
                : "Update the item name."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="font-medium text-sm" htmlFor="item-name-input">
              Name
            </label>
            <Input
              autoFocus
              id="item-name-input"
              onChange={(event) => {
                if (!editDialog) {
                  return;
                }
                setEditDialog({ ...editDialog, value: event.target.value });
              }}
              placeholder="Name"
              value={editDialog?.value ?? ""}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => setEditDialog(null)}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              disabled={!editDialog?.value.trim()}
              onClick={() => {
                void applyEditDialog();
              }}
              type="button"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {queueCard}
    </div>
  );
}
