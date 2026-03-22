"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@avenire/ui/components/breadcrumb";
import { Button } from "@avenire/ui/components/button";
import { Card, CardContent } from "@avenire/ui/components/card";
import { Checkbox } from "@avenire/ui/components/checkbox";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@avenire/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@avenire/ui/components/dropdown-menu";
import { Input } from "@avenire/ui/components/input";
import { Label } from "@avenire/ui/components/label";
import { Skeleton } from "@avenire/ui/components/skeleton";
import { Spinner } from "@avenire/ui/components/spinner";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  Copy,
  FileArchive,
  FileAudio2,
  FileCode2,
  FileImage,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  FolderInput,
  Grid3X3,
  House,
  Info,
  LayoutList,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Share2,
  SlidersHorizontal,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import type { Route } from "next";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileCard,
  PdfThumbnail,
  VideoThumbnail,
} from "@/components/files/file-card-thumbnail";
import { FolderGlyph } from "@/components/files/folder-glyph";
import {
  StylizedSearchBar,
  type WorkspaceSearchItem,
  type WorkspaceSearchResult,
} from "@/components/files/stylized-search-bar";
import { useFileSelection } from "@/hooks/use-file-selection";
import { useFileDragDrop } from "@/hooks/use-file-drag-drop";
import { getWarmState, isFileOpenedCached } from "@/lib/file-preview-cache";
import {
  type FrontmatterProperties,
  parseFrontmatter,
  STATUS_OPTIONS,
  splitFrontmatterDocument,
  stripFrontmatter,
  TYPE_OPTIONS,
  updateContentWithFrontmatter,
} from "@/lib/frontmatter";
import {
  buildProgressivePlaybackSource,
  buildVideoPlaybackDescriptor,
} from "@/lib/media-playback";
import { getUploadErrorMessage } from "@/lib/upload";
import { useUploadThing } from "@/lib/uploadthing";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useHaptics } from "@/hooks/use-haptics";
import { useFilesActivityStore } from "@/stores/filesActivityStore";
import { filesPinsActions, useFilesPinsStore } from "@/stores/filesPinsStore";
import { filesUiActions, useFilesUiStore } from "@/stores/filesUiStore";
import {
  readWorkspaceTreeCache,
  writeWorkspaceTreeCache,
} from "@/lib/workspace-tree-cache";
import {
  invalidateWorkspaceFolderCache,
  readWorkspaceFolderCache,
  writeWorkspaceFolderCache,
} from "@/lib/workspace-folder-cache";
import { invalidateWorkspaceMarkdownCache } from "@/lib/workspace-markdown-cache";
import { readCachedWorkspaces } from "@/lib/dashboard-browser-cache";
import { useWorkspaceHistoryStore } from "@/stores/workspaceHistoryStore";
import {
  detectPreviewKind,
  formatBytes,
  type FileRecord,
  type FolderRecord,
  type ShareSuggestion,
  type WorkspaceMemberRecord,
  toUpdatedLabel,
} from "@/components/files/explorer/shared";
import { FilePreviewPanel } from "@/components/files/explorer/file-preview-panel";
import { ShareDialog } from "@/components/files/explorer/share-dialog";
import { SidebarTrigger } from "@avenire/ui/components/sidebar";

const WORKSPACE_FILE_OPEN_EVENT = "workspace.file.open";
const MOBILE_LONG_PRESS_DELAY_MS = 450;

type UploadStatus =
  | "failed"
  | "ingesting"
  | "queued"
  | "uploaded"
  | "uploading";
type FileKind =
  | "archive"
  | "audio"
  | "code"
  | "document"
  | "image"
  | "other"
  | "sheet"
  | "video";
const FILE_EXPLORER_VIEW_MODE_KEY = "file-explorer-view-mode";
const FILE_RETRIEVAL_CONTEXT_KEY = "file-explorer-retrieval-context-v1";

interface UploadQueueItem {
  contentHashSha256?: string;
  error?: string;
  failureCount?: number;
  fileId?: string;
  id: string;
  ingestionJobId?: string;
  name: string;
  sizeLabel: string;
  status: UploadStatus;
  storageKey?: string;
}

interface UploadCandidate {
  file: File;
  relativePath?: string;
}

type BulkItemKind = "file" | "folder";

interface BulkMutationResult {
  error?: string;
  id: string;
  kind: BulkItemKind;
  status: "failed" | "ok";
}

interface BulkMutationResponse {
  results?: BulkMutationResult[];
  summary?: {
    failed?: number;
    succeeded?: number;
    total?: number;
  };
}

interface UploadResultLike {
  contentType?: string;
  key?: string;
  name?: string;
  size?: number;
  ufsUrl?: string;
}

interface BulkRegisterResponse {
  results?: Array<{
    clientUploadId: string;
    error?: string;
    file?: { id?: string };
    ingestionJob?: { id?: string } | null;
    status: "failed" | "ok";
  }>;
  summary?: {
    failed?: number;
    succeeded?: number;
    total?: number;
  };
}

interface DedupeLookupResponse {
  results?: Array<{
    clientUploadId: string;
    deduped: boolean;
    file?: { id?: string };
  }>;
}

interface FilesInvalidationEventPayload {
  folderId?: string | null;
  reason?: string;
  workspaceUuid?: string;
}

interface WebkitFileSystemEntry {
  isDirectory: boolean;
  isFile: boolean;
  name: string;
}

interface WebkitFileSystemFileEntry extends WebkitFileSystemEntry {
  file: (
    callback: (file: File) => void,
    errorCallback?: (error: DOMException) => void
  ) => void;
}

interface WebkitFileSystemDirectoryReader {
  readEntries: (
    callback: (entries: WebkitFileSystemEntry[]) => void,
    errorCallback?: (error: DOMException) => void
  ) => void;
}

interface WebkitFileSystemDirectoryEntry extends WebkitFileSystemEntry {
  createReader: () => WebkitFileSystemDirectoryReader;
}

const DEFAULT_FOLDER_BANNER_URL = "/images/folder-banner-default.svg";

function rgbToHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0");
}

async function extractImageAccentColor(file: File): Promise<string | null> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () =>
        reject(new Error("Unable to read banner image."));
      nextImage.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }

    const sampleWidth = 48;
    const sampleHeight = 48;
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    ctx.drawImage(image, 0, 0, sampleWidth, sampleHeight);

    const { data } = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
    let totalRed = 0;
    let totalGreen = 0;
    let totalBlue = 0;
    let totalWeight = 0;

    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3] / 255;
      if (alpha < 0.02) {
        continue;
      }

      totalRed += data[index] * alpha;
      totalGreen += data[index + 1] * alpha;
      totalBlue += data[index + 2] * alpha;
      totalWeight += alpha;
    }

    if (totalWeight === 0) {
      return null;
    }

    return `#${rgbToHex(totalRed / totalWeight)}${rgbToHex(totalGreen / totalWeight)}${rgbToHex(totalBlue / totalWeight)}`;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getExtension(name: string) {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
}

function chunkArray<T>(values: T[], chunkSize: number): T[][] {
  const out: T[][] = [];
  const safeChunkSize = Math.max(1, Math.floor(chunkSize));

  for (let index = 0; index < values.length; index += safeChunkSize) {
    out.push(values.slice(index, index + safeChunkSize));
  }

  return out;
}

function normalizeRelativePath(
  relativePath: string | undefined,
  file: File
): string {
  const raw = (
    relativePath && relativePath.trim().length > 0 ? relativePath : file.name
  ).trim();
  return raw
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+/g, "/");
}

function isSkippableUploadArtifact(pathLike: string): boolean {
  const normalized = pathLike.trim().replaceAll("\\", "/");
  const baseName = normalized.split("/").pop()?.toLowerCase() ?? "";
  if (!baseName) {
    return true;
  }

  if (baseName === ".ds_store" || baseName === "thumbs.db") {
    return true;
  }
  if (baseName === "zone.identifier" || baseName.endsWith(":zone.identifier")) {
    return true;
  }

  return false;
}

function sanitizeUploadCandidates(
  candidates: UploadCandidate[]
): UploadCandidate[] {
  const seen = new Set<string>();
  const out: UploadCandidate[] = [];

  for (const candidate of candidates) {
    const normalizedPath = normalizeRelativePath(
      candidate.relativePath,
      candidate.file
    );
    if (isSkippableUploadArtifact(normalizedPath)) {
      continue;
    }

    const dedupeKey = `${normalizedPath.toLowerCase()}::${candidate.file.size}::${candidate.file.lastModified}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    out.push({
      file: candidate.file,
      relativePath: normalizedPath,
    });
  }

  return out;
}

async function computeSha256Hex(file: File): Promise<string | null> {
  if (!(globalThis.crypto?.subtle && typeof file.arrayBuffer === "function")) {
    return null;
  }

  try {
    const buffer = await file.arrayBuffer();
    const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

const DEFAULT_CLIENT_HASH_MAX_BYTES = 12 * 1024 * 1024;

function resolveClientHashMaxBytes() {
  const parsed = Number.parseInt(
    process.env.NEXT_PUBLIC_UPLOAD_DEDUPE_HASH_MAX_BYTES ?? "",
    10
  );
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_CLIENT_HASH_MAX_BYTES;
  }
  return parsed;
}

const CLIENT_HASH_MAX_BYTES = resolveClientHashMaxBytes();
const ENABLE_PREUPLOAD_DEDUPE =
  (process.env.NEXT_PUBLIC_UPLOAD_PREUPLOAD_DEDUPE ?? "false").toLowerCase() ===
  "true";

function shouldHashForClientDedupe(file: File) {
  return file.size > 0 && file.size <= CLIENT_HASH_MAX_BYTES;
}

function detectFileKind(file: FileRecord): FileKind {
  const mime = file.mimeType?.toLowerCase() ?? "";
  const ext = getExtension(file.name);
  const imageExt = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".avif",
    ".bmp",
    ".ico",
  ]);
  const videoExt = new Set([
    ".mp4",
    ".webm",
    ".ogg",
    ".mov",
    ".m4v",
    ".avi",
    ".mkv",
  ]);
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
    ".sql",
  ]);
  const markdownExt = new Set([".md", ".mdx"]);
  const archiveExt = new Set([
    ".zip",
    ".rar",
    ".7z",
    ".tar",
    ".gz",
    ".bz2",
    ".xz",
  ]);
  const sheetExt = new Set([".csv", ".xls", ".xlsx"]);

  if (mime.startsWith("image/") || imageExt.has(ext)) {
    return "image";
  }
  if (mime === "application/pdf" || ext === ".pdf") {
    return "document";
  }
  if (mime.includes("markdown") || markdownExt.has(ext)) {
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
      return (
        <FileImage
          aria-hidden="true"
          className={cn(className, "shrink-0 text-primary")}
        />
      );
    case "video":
      return (
        <FileVideo
          aria-hidden="true"
          className={cn(className, "shrink-0 text-primary")}
        />
      );
    case "audio":
      return (
        <FileAudio2
          aria-hidden="true"
          className={cn(className, "shrink-0 text-primary")}
        />
      );
    case "sheet":
      return (
        <FileSpreadsheet
          aria-hidden="true"
          className={cn(className, "shrink-0 text-primary")}
        />
      );
    case "code":
      return (
        <FileCode2
          aria-hidden="true"
          className={cn(className, "shrink-0 text-primary")}
        />
      );
    case "archive":
      return (
        <FileArchive
          aria-hidden="true"
          className={cn(className, "shrink-0 text-primary")}
        />
      );
    default:
      return (
        <FileText
          aria-hidden="true"
          className={cn(className, "shrink-0 text-muted-foreground")}
        />
      );
  }
}

interface FileExplorerProps {
  folderUuid?: string;
  workspaceUuid?: string;
}

export function FileExplorer({
  folderUuid: folderUuidFromPage,
  workspaceUuid: workspaceUuidFromPage,
}: FileExplorerProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{
    folderUuid?: string | string[];
    workspaceUuid?: string | string[];
  }>();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const mobileLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const mobileSuppressClickRef = useRef<string | null>(null);
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sseRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ingestionSseRetryTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const workspaceUuidParam = params?.workspaceUuid;
  const folderUuidParam = params?.folderUuid;
  const workspaceUuid = useMemo(() => {
    if (workspaceUuidFromPage) {
      return workspaceUuidFromPage;
    }
    if (Array.isArray(workspaceUuidParam)) {
      return workspaceUuidParam[0] ?? "";
    }
    return workspaceUuidParam ?? "";
  }, [workspaceUuidFromPage, workspaceUuidParam]);
  const currentFolderId = useMemo(() => {
    if (folderUuidFromPage) {
      return folderUuidFromPage;
    }
    if (Array.isArray(folderUuidParam)) {
      return folderUuidParam[0] ?? "";
    }
    return folderUuidParam ?? "";
  }, [folderUuidFromPage, folderUuidParam]);

  const [query, setQuery] = useState("");
  const [focusSearchSignal, setFocusSearchSignal] = useState(0);
  const [sortBy, setSortBy] = useState<"name" | "createdAt" | "updatedAt">(
    "name"
  );
  const [vectorFilteredIds, setVectorFilteredIds] =
    useState<Set<string> | null>(null);
  const [retrievalResults, setRetrievalResults] = useState<
    WorkspaceSearchResult[]
  >([]);
  const [activeRetrievalChunkId, setActiveRetrievalChunkId] = useState<
    string | null
  >(null);
  const [allFolders, setAllFolders] = useState<FolderRecord[]>([]);
  const [allFiles, setAllFiles] = useState<FileRecord[]>([]);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<FolderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [workspaceMembers, setWorkspaceMembers] = useState<
    WorkspaceMemberRecord[]
  >([]);
  const [workspaceName, setWorkspaceName] = useState("Workspace");
  const [frontmatterByFileId, setFrontmatterByFileId] = useState<
    Record<string, FrontmatterProperties>
  >({});
  const [frontmatterStatusFilter, setFrontmatterStatusFilter] = useState("");
  const [frontmatterTypeFilter, setFrontmatterTypeFilter] = useState("");
  const [frontmatterTagFilter, setFrontmatterTagFilter] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [hoveredPreviewFileId, setHoveredPreviewFileId] = useState<
    string | null
  >(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [bannerUploadBusy, setBannerUploadBusy] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [propertiesItem, setPropertiesItem] = useState<{
    kind: "file" | "folder";
    id: string;
    name: string;
    detail?: string;
  } | null>(null);
  const [editDialog, setEditDialog] = useState<{
    mode: "create-folder" | "create-note" | "rename-file" | "rename-folder";
    id?: string;
    parentId?: string;
    value: string;
  } | null>(null);
  const [noteCreateBusy, setNoteCreateBusy] = useState(false);
  const [mobileCreateMenuOpen, setMobileCreateMenuOpen] = useState(false);
  const [mobileConfirmAction, setMobileConfirmAction] = useState<
    "delete" | "move" | null
  >(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(FILE_EXPLORER_VIEW_MODE_KEY);
      if (saved === "list") {
        setViewMode("list");
      }
    } catch {
      // ignore localStorage errors in restricted contexts
    }
  }, []);
  const isMobile = useIsMobile();

  const { startUpload } = useUploadThing("fileExplorerUploader");
  const { startUpload: startBannerUpload } = useUploadThing("imageUploader");
  const selection = useFileSelection({ gridRef, itemRefs });
  const triggerHaptic = useHaptics();
  const recordRoute = useWorkspaceHistoryStore((state) => state.recordRoute);
  const historyEntries = useWorkspaceHistoryStore((state) => state.entries);
  const historyIndex = useWorkspaceHistoryStore((state) => state.index);
  const backRoute =
    historyIndex > 0 ? (historyEntries[historyIndex - 1] ?? null) : null;
  const forwardRoute =
    historyIndex >= 0 && historyIndex < historyEntries.length - 1
      ? (historyEntries[historyIndex + 1] ?? null)
      : null;
  const pinnedByWorkspace = useFilesPinsStore(
    (state) => state.pinnedByWorkspace
  );
  const pinnedItems = useMemo(
    () => pinnedByWorkspace[workspaceUuid] ?? [],
    [pinnedByWorkspace, workspaceUuid]
  );
  const filesSyncVersion = useFilesUiStore((state) => state.sync.version);
  const filesSyncWorkspaceUuid = useFilesUiStore(
    (state) => state.sync.workspaceUuid
  );
  const updateWorkspaceQueue = useFilesActivityStore(
    (state) => state.updateWorkspaceQueue
  );
  const setUploadQueue = useCallback(
    (
      updater:
        | UploadQueueItem[]
        | ((previous: UploadQueueItem[]) => UploadQueueItem[])
    ) => {
      if (!workspaceUuid) {
        return;
      }
      updateWorkspaceQueue(workspaceUuid, updater);
    },
    [updateWorkspaceQueue, workspaceUuid]
  );
  const focusSearchIntentVersion = useFilesUiStore(
    (state) => state.intentVersion.focusSearch
  );
  const newNoteIntentVersion = useFilesUiStore(
    (state) => state.intentVersion.newNote
  );
  const uploadFileIntentVersion = useFilesUiStore(
    (state) => state.intentVersion.uploadFile
  );
  const uploadFolderIntentVersion = useFilesUiStore(
    (state) => state.intentVersion.uploadFolder
  );
  const createFolderIntentVersion = useFilesUiStore(
    (state) => state.intentVersion.createFolder
  );
  const openSelectionIntentVersion = useFilesUiStore(
    (state) => state.intentVersion.openSelection
  );
  const deleteSelectionIntentVersion = useFilesUiStore(
    (state) => state.intentVersion.deleteSelection
  );
  const moveSelectionUpIntentVersion = useFilesUiStore(
    (state) => state.intentVersion.moveSelectionUp
  );
  const goParentIntentVersion = useFilesUiStore(
    (state) => state.intentVersion.goParent
  );
  const processedFilesIntentVersionsRef = useRef({
    createFolder: 0,
    deleteSelection: 0,
    focusSearch: 0,
    goParent: 0,
    moveSelectionUp: 0,
    newNote: 0,
    openSelection: 0,
    uploadFile: 0,
    uploadFolder: 0,
  });
  const processedSyncVersionRef = useRef(0);
  const lastRecordedRouteRef = useRef<string | null>(null);

  const selectedFileParam = searchParams.get("file");
  const selectedRetrievalChunkParam = searchParams.get("retrievalChunk");
  const currentRoute = useMemo(() => {
    const queryString = searchParams.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  }, [pathname, searchParams]);
  const activeFile = useMemo(
    () => files.find((file) => file.id === selectedFileParam) ?? null,
    [files, selectedFileParam]
  );

  const currentFolder = useMemo(
    () => breadcrumbs[breadcrumbs.length - 1] ?? null,
    [breadcrumbs]
  );
  const isCurrentFolderReadOnly = Boolean(currentFolder?.readOnly);

  const createNote = useCallback(
    async (parentId: string, name: string) => {
      if (!workspaceUuid) {
        return;
      }
      if (!parentId) {
        return;
      }
      if (noteCreateBusy) {
        return;
      }
      const trimmedName = name.trim();
      if (!trimmedName) {
        return;
      }

      const fileName = /\.mdx?$/i.test(trimmedName)
        ? trimmedName
        : `${trimmedName}.md`;
      const noteTitle = fileName.replace(/\.mdx?$/i, "") || "Untitled";

      setNoteCreateBusy(true);
      try {
        const initialContent = `# ${noteTitle}\n`;
        const response = await fetch(
          `/api/workspaces/${workspaceUuid}/files/register`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              folderId: parentId,
              name: fileName,
              content: initialContent,
              metadata: { type: "note" },
            }),
          }
        );

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(payload.error ?? "Unable to create note.");
        }

        const payload = (await response.json()) as { file?: FileRecord };
        const created = payload.file;
        if (created?.id) {
          const params = new URLSearchParams();
          params.set("file", created.id);
          router.push(
            `/workspace/files/${workspaceUuid}/folder/${parentId}?${params.toString()}` as Route
          );
        }
      } catch (error) {
        console.error(
          error instanceof Error ? error.message : "Unable to create note."
        );
      } finally {
        setNoteCreateBusy(false);
      }
    },
    [noteCreateBusy, router, workspaceUuid]
  );

  const openCreateNoteDialog = useCallback(
    (parentId: string) => {
      if (!parentId) {
        return;
      }
      if (isCurrentFolderReadOnly) {
        return;
      }
      setEditDialog({
        mode: "create-note",
        parentId,
        value: "",
      });
    },
    [isCurrentFolderReadOnly]
  );
  const parentFolder = useMemo(
    () => breadcrumbs[breadcrumbs.length - 2] ?? null,
    [breadcrumbs]
  );
  const isAtWorkspaceRoot = breadcrumbs.length <= 1;
  const currentLocationTitle = isAtWorkspaceRoot
    ? workspaceName
    : (currentFolder?.name ?? workspaceName);
  const currentFolderBannerUrl =
    currentFolder?.bannerUrl && currentFolder.bannerUrl.trim().length > 0
      ? currentFolder.bannerUrl
      : DEFAULT_FOLDER_BANNER_URL;
  const currentPinnedItem = useMemo(() => {
    if (activeFile) {
      return {
        folderId: activeFile.folderId,
        id: activeFile.id,
        kind: "file" as const,
        name: activeFile.name,
        workspaceId: workspaceUuid,
      };
    }

    if (currentFolder) {
      return {
        folderId: currentFolder.parentId,
        id: currentFolder.id,
        kind: "folder" as const,
        name: currentFolder.name,
        workspaceId: workspaceUuid,
      };
    }

    return null;
  }, [activeFile, currentFolder, workspaceUuid]);
  const isCurrentPinned = currentPinnedItem
    ? pinnedItems.some(
        (item) =>
          item.kind === currentPinnedItem.kind &&
          item.id === currentPinnedItem.id
      )
    : false;
  const searchableItems = useMemo<WorkspaceSearchItem[]>(
    () => [
      ...allFolders.map((folder) => ({
        id: folder.id,
        type: "folder" as const,
        title: folder.name,
        description: "Folder",
        snippet: "Folder in workspace",
      })),
      ...allFiles.map((file) => ({
        id: file.id,
        type: "file" as const,
        title: file.name,
        description: file.mimeType ?? "File",
        snippet: `${formatBytes(file.sizeBytes)} • ${file.mimeType ?? "unknown type"}`,
      })),
    ],
    [allFiles, allFolders]
  );

  const loadShareSuggestions = useCallback(
    async (
      query: string,
      onResult: (suggestions: ShareSuggestion[]) => void
    ) => {
      if (!workspaceUuid) {
        onResult([]);
        return;
      }
      try {
        const url = new URL(
          `/api/workspaces/${workspaceUuid}/share/suggestions`,
          window.location.origin
        );
        if (query.trim()) {
          url.searchParams.set("q", query.trim());
        }
        const response = await fetch(url.toString(), { cache: "no-store" });
        if (!response.ok) {
          onResult([]);
          return;
        }
        const payload = (await response.json()) as {
          suggestions?: ShareSuggestion[];
        };
        onResult(payload.suggestions ?? []);
      } catch {
        onResult([]);
      }
    },
    [workspaceUuid]
  );

  const filteredFolders = useMemo(() => {
    const term = query.trim().toLowerCase();
    const activeVectorIds =
      vectorFilteredIds && vectorFilteredIds.size > 0
        ? vectorFilteredIds
        : null;
    return activeVectorIds
      ? folders.filter((folder) => activeVectorIds.has(folder.id))
      : term
        ? folders.filter((folder) => folder.name.toLowerCase().includes(term))
        : folders;
  }, [folders, query, vectorFilteredIds]);

  const filteredFiles = useMemo(() => {
    const term = query.trim().toLowerCase();
    const statusNeedle = frontmatterStatusFilter.trim().toLowerCase();
    const typeNeedle = frontmatterTypeFilter.trim().toLowerCase();
    const tagNeedle = frontmatterTagFilter.trim().toLowerCase();
    const activeVectorIds =
      vectorFilteredIds && vectorFilteredIds.size > 0
        ? vectorFilteredIds
        : null;
    const base = activeVectorIds
      ? files.filter((file) => activeVectorIds.has(file.id))
      : term
        ? files.filter((file) => file.name.toLowerCase().includes(term))
        : files;
    if (!(statusNeedle || typeNeedle || tagNeedle)) {
      return base;
    }

    return base.filter((file) => {
      const frontmatter = file.page?.properties ?? frontmatterByFileId[file.id];
      if (!frontmatter) {
        return false;
      }

      if (statusNeedle) {
        const statusValue =
          typeof frontmatter.status === "string"
            ? frontmatter.status.toLowerCase()
            : "";
        if (statusValue !== statusNeedle) {
          return false;
        }
      }

      if (typeNeedle) {
        const typeValue =
          typeof frontmatter.type === "string"
            ? frontmatter.type.toLowerCase()
            : "";
        if (typeValue !== typeNeedle) {
          return false;
        }
      }

      if (tagNeedle) {
        const tags = Array.isArray(frontmatter.tags)
          ? frontmatter.tags
          : typeof frontmatter.tags === "string"
            ? frontmatter.tags
                .split(",")
                .map((entry) => entry.trim())
                .filter(Boolean)
            : [];
        const hasTag = tags.some((tag) =>
          tag.toLowerCase().includes(tagNeedle)
        );
        if (!hasTag) {
          return false;
        }
      }

      return true;
    });
  }, [
    files,
    frontmatterByFileId,
    frontmatterStatusFilter,
    frontmatterTagFilter,
    frontmatterTypeFilter,
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
          sortBy === "updatedAt"
            ? (a.updatedAt ?? a.createdAt ?? 0)
            : (a.createdAt ?? 0)
        ).getTime();
        const bDate = new Date(
          sortBy === "updatedAt"
            ? (b.updatedAt ?? b.createdAt ?? 0)
            : (b.createdAt ?? 0)
        ).getTime();
        return bDate - aDate;
      }),
    [filteredFolders, sortBy]
  );

  const sortedFiles = useMemo(
    () =>
      [...filteredFiles].sort((a, b) => {
        if (sortBy === "name") {
          return a.name.localeCompare(b.name);
        }

        const aDate = new Date(
          sortBy === "updatedAt" ? (a.updatedAt ?? a.createdAt) : a.createdAt
        ).getTime();
        const bDate = new Date(
          sortBy === "updatedAt" ? (b.updatedAt ?? b.createdAt) : b.createdAt
        ).getTime();

        return bDate - aDate;
      }),
    [filteredFiles, sortBy]
  );

  const visibleItemIds = useMemo(
    () => [
      ...sortedFolders.map((folder) => folder.id),
      ...sortedFiles.map((file) => file.id),
    ],
    [sortedFiles, sortedFolders]
  );

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
  const folderPreviewKinds = useMemo(() => {
    const countsByFolder = new Map<string, Map<string, number>>();
    for (const file of allFiles) {
      const kind = detectFileKind(file);
      const byKind =
        countsByFolder.get(file.folderId) ?? new Map<string, number>();
      byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
      countsByFolder.set(file.folderId, byKind);
    }

    const out = new Map<string, string[]>();
    for (const [folderId, counts] of countsByFolder.entries()) {
      const orderedKinds = [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([kind]) => kind)
        .slice(0, 3);
      out.set(folderId, orderedKinds);
    }
    return out;
  }, [allFiles]);

  const filePathById = useMemo(() => {
    const folderById = new Map(allFolders.map((folder) => [folder.id, folder]));
    const folderPathCache = new Map<string, string>();

    const resolveFolderPath = (folderId: string | null): string => {
      if (!folderId) {
        return "";
      }
      const cached = folderPathCache.get(folderId);
      if (cached !== undefined) {
        return cached;
      }

      const segments: string[] = [];
      const seen = new Set<string>();
      let cursor = folderId;
      while (cursor) {
        if (seen.has(cursor)) {
          break;
        }
        seen.add(cursor);
        const folder = folderById.get(cursor);
        if (!folder) {
          break;
        }
        if (folder.parentId === null) {
          break;
        }
        segments.push(folder.name);
        cursor = folder.parentId;
      }

      const resolved = segments.reverse().join("/");
      folderPathCache.set(folderId, resolved);
      return resolved;
    };

    const map = new Map<string, string>();
    for (const file of allFiles) {
      const folderPath = resolveFolderPath(file.folderId);
      const fullPath = folderPath ? `${folderPath}/${file.name}` : file.name;
      map.set(file.id, fullPath);
    }

    return map;
  }, [allFiles, allFolders]);

  const wikiMarkdownFiles = useMemo(() => {
    const markdownExt = new Set([".md", ".mdx"]);
    return allFiles
      .filter((file) => {
        const ext = getExtension(file.name);
        const mime = file.mimeType?.toLowerCase() ?? "";
        return mime.includes("markdown") || markdownExt.has(ext);
      })
      .map((file) => {
        const title = file.name.replace(/\.(md|mdx)$/i, "");
        const path = filePathById.get(file.id);
        return {
          id: file.id,
          title,
          excerpt: path ?? file.name,
          content: "",
        };
      });
  }, [allFiles, filePathById]);
  const workspaceMemberNameById = useMemo(
    () =>
      new Map(
        workspaceMembers.map((member) => [
          member.userId ?? member.id ?? member.email ?? "",
          member.name ?? member.email ?? "Unknown",
        ])
      ),
    [workspaceMembers]
  );
  const currentInfoEntries = useMemo(() => {
    if (activeFile) {
      return [
        { label: "Name", value: activeFile.name },
        {
          label: "Owner",
          value:
            (activeFile.uploadedBy
              ? workspaceMemberNameById.get(activeFile.uploadedBy)
              : null) ?? "Unknown",
        },
        { label: "File size", value: formatBytes(activeFile.sizeBytes) },
        {
          label: "Ingestion",
          value: activeFile.isIngested ? "Ingested" : "Pending",
        },
        {
          label: "Visible to",
          value:
            workspaceMembers.length > 0
              ? `${workspaceMembers.length} workspace member${workspaceMembers.length === 1 ? "" : "s"}`
              : "Workspace members",
        },
        {
          label: "Location",
          value: filePathById.get(activeFile.id) ?? activeFile.name,
        },
        {
          label: "Created at",
          value: new Date(activeFile.createdAt).toLocaleString(),
        },
        {
          label: "Updated at",
          value: new Date(
            activeFile.updatedAt ?? activeFile.createdAt
          ).toLocaleString(),
        },
      ];
    }

    if (currentFolder) {
      return [
        {
          label: isAtWorkspaceRoot ? "Workspace" : "Folder name",
          value: currentLocationTitle,
        },
        {
          label: "Visible to",
          value:
            workspaceMembers.length > 0
              ? `${workspaceMembers.length} workspace member${workspaceMembers.length === 1 ? "" : "s"}`
              : "Workspace members",
        },
        {
          label: "Created at",
          value: currentFolder.createdAt
            ? new Date(currentFolder.createdAt).toLocaleString()
            : "Unknown",
        },
        {
          label: "Updated at",
          value: currentFolder.updatedAt
            ? new Date(currentFolder.updatedAt).toLocaleString()
            : "Unknown",
        },
      ];
    }

    return [];
  }, [
    activeFile,
    currentFolder,
    currentLocationTitle,
    filePathById,
    isAtWorkspaceRoot,
    workspaceMemberNameById,
    workspaceMembers.length,
  ]);

  const handleOpenOnDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLElement>, open: () => void) => {
      if (event.detail !== 2) {
        return;
      }
      open();
    },
    []
  );

  const clearMobileLongPressTimer = useCallback(() => {
    if (mobileLongPressTimerRef.current) {
      clearTimeout(mobileLongPressTimerRef.current);
      mobileLongPressTimerRef.current = null;
    }
  }, []);

  const beginMobileItemLongPress = useCallback(
    (itemId: string) => {
      if (!isMobile) {
        return;
      }

      clearMobileLongPressTimer();
      const cancel = () => {
        clearMobileLongPressTimer();
        window.removeEventListener("pointerup", cancel);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("scroll", cancel, true);
      };
      mobileLongPressTimerRef.current = setTimeout(() => {
        mobileSuppressClickRef.current = itemId;
        selection.setItemSelected(itemId, true);
        triggerHaptic("selection");
        cancel();
      }, MOBILE_LONG_PRESS_DELAY_MS);
      window.addEventListener("pointerup", cancel);
      window.addEventListener("pointercancel", cancel);
      window.addEventListener("scroll", cancel, true);
    },
    [clearMobileLongPressTimer, isMobile, selection, triggerHaptic]
  );

  const handleMobileItemPointerUp = useCallback(() => {
    clearMobileLongPressTimer();
  }, [clearMobileLongPressTimer]);

  const handleMobileItemClick = useCallback(
    (
      itemId: string,
      openItem: () => void,
      options?: { toggleOnly?: boolean }
    ) => {
      if (mobileSuppressClickRef.current === itemId) {
        mobileSuppressClickRef.current = null;
        return;
      }

      if (selection.selectedCount > 0 || options?.toggleOnly) {
        selection.toggleSelection(itemId);
        triggerHaptic("selection");
        return;
      }

      triggerHaptic("success");
      openItem();
    },
    [selection, triggerHaptic]
  );

  const handleMobileCanvasPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isMobile || event.pointerType !== "touch" || event.button !== 0) {
        selection.startDragSelection(event);
        return;
      }

      const target = event.target as HTMLElement;
      if (target.closest("[data-select-item='true']")) {
        return;
      }

      if (target.closest("button, input, a, textarea, select, label")) {
        return;
      }

      clearMobileLongPressTimer();
      mobileLongPressTimerRef.current = setTimeout(() => {
        triggerHaptic("selection");
        setMobileCreateMenuOpen(true);
      }, MOBILE_LONG_PRESS_DELAY_MS);

      const cancel = () => {
        clearMobileLongPressTimer();
        window.removeEventListener("pointerup", cancel);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("scroll", cancel, true);
      };

      window.addEventListener("pointerup", cancel);
      window.addEventListener("pointercancel", cancel);
      window.addEventListener("scroll", cancel, true);
    },
    [clearMobileLongPressTimer, isMobile, selection, triggerHaptic]
  );

  const loadFolder = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!(workspaceUuid && currentFolderId)) {
        return;
      }
      const silent = options?.silent ?? false;
      const cached = readWorkspaceFolderCache<FolderRecord, FileRecord>(
        workspaceUuid,
        currentFolderId
      );

      if (cached) {
        setLoading(false);
        setFolders(cached.folders);
        setFiles(cached.files);
        setBreadcrumbs(cached.ancestors);
      }

      if (!silent && !cached) {
        setLoading(true);
      }
      try {
        const response = await fetch(
          `/api/workspaces/${workspaceUuid}/folders/${currentFolderId}`,
          { cache: "no-store" }
        );

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          folders?: FolderRecord[];
          files?: FileRecord[];
          ancestors?: FolderRecord[];
        };

        const nextFolders = payload.folders ?? [];
        const nextFiles = payload.files ?? [];
        const nextAncestors = payload.ancestors ?? [];

        setFolders(nextFolders);
        setFiles(nextFiles);
        setBreadcrumbs(nextAncestors);
        writeWorkspaceFolderCache<FolderRecord, FileRecord>(
          workspaceUuid,
          currentFolderId,
          {
            ancestors: nextAncestors,
            files: nextFiles,
            folders: nextFolders,
          }
        );
      } finally {
        if (!silent && !cached) {
          setLoading(false);
        }
      }
    },
    [currentFolderId, workspaceUuid]
  );

  const loadTree = useCallback(async () => {
    if (!workspaceUuid) {
      return;
    }

    const cached = readWorkspaceTreeCache<FolderRecord, FileRecord>(
      workspaceUuid
    );
    if (cached) {
      setAllFolders(cached.folders);
      setAllFiles(cached.files);
    }

    try {
      const response = await fetch(`/api/workspaces/${workspaceUuid}/tree`, {
        cache: "no-store",
      });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as {
        folders?: FolderRecord[];
        files?: FileRecord[];
      };
      setAllFolders(payload.folders ?? []);
      setAllFiles(payload.files ?? []);
      writeWorkspaceTreeCache<FolderRecord, FileRecord>(workspaceUuid, {
        files: payload.files ?? [],
        folders: payload.folders ?? [],
      });
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
    filesUiActions.emitSync(workspaceUuid);
  }, [workspaceUuid]);

  useEffect(() => {
    if (!(workspaceUuid && currentFolderId)) {
      setFolders([]);
      setFiles([]);
      setBreadcrumbs([]);
      return;
    }

    const cached = readWorkspaceFolderCache<FolderRecord, FileRecord>(
      workspaceUuid,
      currentFolderId
    );
    if (!cached) {
      return;
    }

    setFolders(cached.folders);
    setFiles(cached.files);
    setBreadcrumbs(cached.ancestors);
  }, [currentFolderId, workspaceUuid]);

  useEffect(() => {
    void loadFolder();
  }, [loadFolder]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  useEffect(() => {
    return () => {
      if (mobileLongPressTimerRef.current) {
        clearTimeout(mobileLongPressTimerRef.current);
      }
    };
  }, []);

  const loadedFrontmatterFileIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!workspaceUuid) {
      setFrontmatterByFileId({});
      loadedFrontmatterFileIdsRef.current = new Set();
      return;
    }

    const markdownFiles = allFiles.filter((file) => {
      if (file.isNote) {
        return true;
      }
      const preview = detectPreviewKind(file);
      return preview.isMarkdown;
    });

    if (markdownFiles.length === 0) {
      setFrontmatterByFileId({});
      return;
    }

    const missing = markdownFiles.filter(
      (file) => !loadedFrontmatterFileIdsRef.current.has(file.id)
    );
    if (missing.length === 0) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      const loadedEntries: Array<[string, FrontmatterProperties]> = [];

      for (const file of missing.slice(0, 60)) {
        loadedFrontmatterFileIdsRef.current.add(file.id);
        const pageProperties =
          file.page?.properties && Object.keys(file.page.properties).length > 0
            ? file.page.properties
            : null;
        if (pageProperties) {
          loadedEntries.push([file.id, pageProperties]);
          continue;
        }
        try {
          const response = await fetch(
            `/api/workspaces/${workspaceUuid}/files/${file.id}/stream`,
            {
              headers: { Accept: "text/markdown,text/plain,*/*" },
              signal: controller.signal,
            }
          );
          if (!response.ok) {
            continue;
          }
          const text = await response.text();
          const parsed = parseFrontmatter(text);
          loadedEntries.push([file.id, parsed.properties]);
        } catch {
          // ignore partial frontmatter probe failures
        }
      }

      if (cancelled || loadedEntries.length === 0) {
        return;
      }

      setFrontmatterByFileId((previous) => {
        const next = { ...previous };
        for (const [fileId, properties] of loadedEntries) {
          next[fileId] = properties;
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [allFiles, workspaceUuid]);

  useEffect(() => {
    if (!workspaceUuid) {
      return;
    }

    const cachedWorkspace = readCachedWorkspaces()?.find(
      (workspace) => workspace.workspaceId === workspaceUuid
    );
    if (cachedWorkspace?.name) {
      setWorkspaceName(cachedWorkspace.name);
    }

    (async () => {
      try {
        if (cachedWorkspace?.name) {
          return;
        }

        const response = await fetch("/api/workspaces/list", {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as {
          workspaces?: Array<{
            workspaceId: string;
            name: string;
          }>;
        };
        const activeWorkspace = (payload.workspaces ?? []).find(
          (workspace) => workspace.workspaceId === workspaceUuid
        );
        if (activeWorkspace?.name) {
          setWorkspaceName(activeWorkspace.name);
        }
      } catch {
        // ignore
      }
    })().catch(() => undefined);
  }, [workspaceUuid]);

  useEffect(() => {
    if (!workspaceUuid) {
      return;
    }

    void (async () => {
      try {
        const response = await fetch(
          `/api/workspaces/${workspaceUuid}/share/members`,
          {
            cache: "no-store",
          }
        );
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as {
          members?: WorkspaceMemberRecord[];
        };
        setWorkspaceMembers(payload.members ?? []);
      } catch {
        // ignore
      }
    })();
  }, [workspaceUuid]);

  useEffect(() => {
    if (lastRecordedRouteRef.current === currentRoute) {
      return;
    }
    lastRecordedRouteRef.current = currentRoute;
    recordRoute(currentRoute);
  }, [currentRoute, recordRoute]);

  useEffect(() => {
    if (!(workspaceUuid && currentFolderId)) {
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
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [currentFolderId, refreshData, workspaceUuid]);

  useEffect(() => {
    if (!(workspaceUuid && currentFolderId) || filesSyncVersion === 0) {
      return;
    }
    if (filesSyncWorkspaceUuid && filesSyncWorkspaceUuid !== workspaceUuid) {
      return;
    }
    if (filesSyncVersion <= processedSyncVersionRef.current) {
      return;
    }
    processedSyncVersionRef.current = filesSyncVersion;
    refreshDataDebounced();
  }, [
    currentFolderId,
    filesSyncVersion,
    filesSyncWorkspaceUuid,
    refreshDataDebounced,
    workspaceUuid,
  ]);

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
        eventSource.addEventListener("files.invalidate", (event) => {
          const detail = (() => {
            try {
              return JSON.parse(
                (event as MessageEvent<string>).data
              ) as FilesInvalidationEventPayload | null;
            } catch {
              return null;
            }
          })();

          invalidateWorkspaceFolderCache(workspaceUuid, detail?.folderId);
          invalidateWorkspaceMarkdownCache(workspaceUuid);
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
    if (!workspaceUuid) {
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
        url.searchParams.set("workspaceUuid", workspaceUuid);

        eventSource = new EventSource(url.toString());
        eventSource.onerror = () => {
          cleanupCurrent();
          scheduleReconnect();
        };

        eventSource.addEventListener("ingestion.job", (event) => {
          const payload = JSON.parse((event as MessageEvent).data) as {
            jobId: string;
            eventType: string;
            payload?: Record<string, unknown>;
          };

          setUploadQueue((previous) =>
            previous.map((item) => {
              if (
                !item.ingestionJobId ||
                item.ingestionJobId !== payload.jobId
              ) {
                return item;
              }

              if (payload.eventType === "job.failed") {
                const nextFailureCount = (item.failureCount ?? 0) + 1;
                return {
                  ...item,
                  status: "failed",
                  failureCount: nextFailureCount,
                  error:
                    typeof payload.payload?.error === "string"
                      ? `Ingestion failed for this file: ${payload.payload.error}`
                      : "Ingestion failed",
                };
              }

              if (payload.eventType === "job.succeeded") {
                return {
                  ...item,
                  status: "uploaded",
                  error: undefined,
                  failureCount: 0,
                };
              }

              return {
                ...item,
                status: "ingesting",
                error: undefined,
              };
            })
          );

          if (
            payload.eventType === "job.succeeded" ||
            payload.eventType === "job.failed"
          ) {
            refreshDataDebounced();
          }
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
  }, [workspaceUuid]);

  useEffect(() => {
    window.localStorage.setItem(FILE_EXPLORER_VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (!workspaceUuid) {
      return;
    }
    try {
      const raw = window.sessionStorage.getItem(
        `${FILE_RETRIEVAL_CONTEXT_KEY}:${workspaceUuid}`
      );
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as {
        activeChunkId?: string | null;
        query?: string;
        results?: WorkspaceSearchResult[];
      };
      const parsedResults = Array.isArray(parsed.results) ? parsed.results : [];
      if (typeof parsed.query === "string") {
        setQuery((current) => (current ? "" : current));
      }
      if (parsedResults.length > 0) {
        setRetrievalResults((current) => {
          if (current.length === parsedResults.length) {
            return current;
          }
          return parsedResults;
        });
        setVectorFilteredIds((current) => (current ? null : current));
        setQuery((current) => (current ? "" : current));
      }
      if (
        typeof parsed.activeChunkId === "string" ||
        parsed.activeChunkId === null
      ) {
        setActiveRetrievalChunkId((current) =>
          current === (parsed.activeChunkId ?? null)
            ? current
            : (parsed.activeChunkId ?? null)
        );
      }
    } catch {
      // Ignore malformed client cache.
    }
  }, [workspaceUuid]);

  useEffect(() => {
    if (!workspaceUuid) {
      return;
    }
    window.sessionStorage.setItem(
      `${FILE_RETRIEVAL_CONTEXT_KEY}:${workspaceUuid}`,
      JSON.stringify({
        activeChunkId: activeRetrievalChunkId,
        query: retrievalResults.length > 0 ? query : "",
        results: retrievalResults,
      })
    );
  }, [activeRetrievalChunkId, query, retrievalResults, workspaceUuid]);

  useEffect(() => {
    if (
      selectedRetrievalChunkParam &&
      selectedRetrievalChunkParam !== activeRetrievalChunkId
    ) {
      setActiveRetrievalChunkId(selectedRetrievalChunkParam);
    }
  }, [activeRetrievalChunkId, selectedRetrievalChunkParam]);

  useEffect(() => {
    const processed = processedFilesIntentVersionsRef.current;

    if (focusSearchIntentVersion > processed.focusSearch) {
      processed.focusSearch = focusSearchIntentVersion;
      setFocusSearchSignal((previous) => previous + 1);
    }

    if (newNoteIntentVersion > processed.newNote) {
      processed.newNote = newNoteIntentVersion;
      openCreateNoteDialog(currentFolderId);
    }

    if (uploadFileIntentVersion > processed.uploadFile) {
      processed.uploadFile = uploadFileIntentVersion;
      fileInputRef.current?.click();
    }

    if (uploadFolderIntentVersion > processed.uploadFolder) {
      processed.uploadFolder = uploadFolderIntentVersion;
      folderInputRef.current?.click();
    }

    if (createFolderIntentVersion > processed.createFolder) {
      processed.createFolder = createFolderIntentVersion;
      if (isCurrentFolderReadOnly) {
        return;
      }
      setEditDialog({
        mode: "create-folder",
        parentId: currentFolderId,
        value: "",
      });
    }
  }, [
    createFolderIntentVersion,
    currentFolderId,
    focusSearchIntentVersion,
    isCurrentFolderReadOnly,
    newNoteIntentVersion,
    openCreateNoteDialog,
    uploadFileIntentVersion,
    uploadFolderIntentVersion,
  ]);

  useEffect(() => {
    const input = folderInputRef.current;
    if (!input) {
      return;
    }
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
  }, []);

  const navigateToFolder = useCallback(
    (folderId: string) => {
      if (!workspaceUuid) {
        return;
      }

      router.prefetch(
        `/workspace/files/${workspaceUuid}/folder/${folderId}` as Route
      );
      router.push(
        `/workspace/files/${workspaceUuid}/folder/${folderId}` as Route
      );
    },
    [router, workspaceUuid]
  );

  const toggleCurrentPinnedItem = useCallback(() => {
    if (!(workspaceUuid && currentPinnedItem)) {
      return;
    }
    filesPinsActions.togglePinnedItem(workspaceUuid, currentPinnedItem);
  }, [currentPinnedItem, workspaceUuid]);

  const selectFile = useCallback(
    (fileId: string | null, options?: { retrievalChunkId?: string | null }) => {
      if (!(workspaceUuid && currentFolderId)) {
        return;
      }

      const params = new URLSearchParams(searchParams.toString());
      if (fileId) {
        params.set("file", fileId);
      } else {
        params.delete("file");
      }
      if (options?.retrievalChunkId) {
        params.set("retrievalChunk", options.retrievalChunkId);
      } else if (options?.retrievalChunkId === null) {
        params.delete("retrievalChunk");
      }

      const query = params.toString();
      const target = query.length
        ? `/workspace/files/${workspaceUuid}/folder/${currentFolderId}?${query}`
        : `/workspace/files/${workspaceUuid}/folder/${currentFolderId}`;

      router.prefetch(target as Route);
      router.replace(target as Route);
    },
    [currentFolderId, router, searchParams, workspaceUuid]
  );

  const openSearchResult = useCallback(
    (result: WorkspaceSearchResult) => {
      if (!(workspaceUuid && currentFolderId)) {
        return;
      }

      const targetFileId = result.fileId ?? result.id;
      const targetFile = allFiles.find((file) => file.id === targetFileId);
      const targetFolderId = targetFile?.folderId ?? currentFolderId;

      const params = new URLSearchParams();
      params.set("file", targetFileId);
      if (result.chunkId) {
        params.set("retrievalChunk", result.chunkId);
      }

      const targetRoute =
        `/workspace/files/${workspaceUuid}/folder/${targetFolderId}?${params.toString()}` as Route;
      router.prefetch(targetRoute);
      router.push(targetRoute);
    },
    [allFiles, currentFolderId, router, workspaceUuid]
  );

  const openFileById = useCallback(
    (fileId: string) => {
      if (!workspaceUuid) {
        return;
      }
      const targetFile = allFiles.find((file) => file.id === fileId);
      if (!targetFile) {
        return;
      }
      const params = new URLSearchParams();
      params.set("file", fileId);
      const targetRoute =
        `/workspace/files/${workspaceUuid}/folder/${targetFile.folderId}?${params.toString()}` as Route;
      router.prefetch(targetRoute);
      router.push(targetRoute);
    },
    [allFiles, router, workspaceUuid]
  );

  const openFolderById = useCallback(
    (folderId: string) => {
      navigateToFolder(folderId);
    },
    [navigateToFolder]
  );

  useEffect(() => {
    const onOpenWorkspaceFile = (event: Event) => {
      const detail = (event as CustomEvent<{ fileId?: string }>).detail;
      const fileId = typeof detail?.fileId === "string" ? detail.fileId : "";
      if (!fileId) {
        return;
      }
      openFileById(fileId);
    };

    window.addEventListener(WORKSPACE_FILE_OPEN_EVENT, onOpenWorkspaceFile);
    return () => {
      window.removeEventListener(
        WORKSPACE_FILE_OPEN_EVENT,
        onOpenWorkspaceFile
      );
    };
  }, [openFileById]);

  const handlePreviewIntentStart = useCallback((file: FileRecord) => {
    const { isAudio, isVideo } = detectPreviewKind(file);
    if (!(isAudio || isVideo)) {
      return;
    }

    setHoveredPreviewFileId(file.id);
  }, []);

  const handlePreviewIntentEnd = useCallback((file: FileRecord) => {
    const { isAudio, isVideo } = detectPreviewKind(file);
    if (!(isAudio || isVideo)) {
      return;
    }

    setHoveredPreviewFileId((previous) =>
      previous === file.id ? null : previous
    );
  }, []);

  const getDropUploadCandidates = useCallback(
    async (
      event: React.DragEvent<HTMLDivElement>
    ): Promise<UploadCandidate[]> => {
      const items = Array.from(event.dataTransfer.items ?? []);
      const candidates: UploadCandidate[] = [];

      const readDirectoryEntries = async (
        reader: WebkitFileSystemDirectoryReader
      ): Promise<WebkitFileSystemEntry[]> => {
        const entries: WebkitFileSystemEntry[] = [];
        let iterations = 0;
        const MAX_READ_ITERATIONS = 10_000;
        while (true) {
          iterations += 1;
          if (iterations > MAX_READ_ITERATIONS) {
            console.warn(
              "Stopped reading directory entries after max iterations"
            );
            break;
          }
          const chunk = await new Promise<WebkitFileSystemEntry[]>((resolve) =>
            reader.readEntries(resolve, () => resolve([]))
          );
          if (chunk.length === 0) {
            break;
          }
          entries.push(...chunk);
        }
        return entries;
      };

      const walkEntry = async (
        entry: WebkitFileSystemEntry,
        parentPath: string
      ) => {
        if (entry.isFile) {
          const fileEntry = entry as WebkitFileSystemFileEntry;
          const file = await new Promise<File | null>((resolve) =>
            fileEntry.file(resolve, () => resolve(null))
          );
          if (!file) {
            return;
          }
          const relativePath = parentPath
            ? `${parentPath}/${file.name}`
            : file.name;
          candidates.push({ file, relativePath });
          return;
        }

        if (entry.isDirectory) {
          const directoryEntry = entry as WebkitFileSystemDirectoryEntry;
          const nextPath = parentPath
            ? `${parentPath}/${entry.name}`
            : entry.name;
          const children = await readDirectoryEntries(
            directoryEntry.createReader()
          );
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

      const fallbackCandidates = Array.from(event.dataTransfer.files ?? []).map(
        (file) => {
          const webkitRelativePath = (
            file as File & { webkitRelativePath?: string }
          ).webkitRelativePath;
          return {
            file,
            relativePath: webkitRelativePath || file.name,
          };
        }
      );

      if (usedEntryApi && candidates.length > 0) {
        return sanitizeUploadCandidates([...candidates, ...fallbackCandidates]);
      }

      return sanitizeUploadCandidates(fallbackCandidates);
    },
    []
  );

  const queueUploads = useCallback(
    (incomingCandidates: UploadCandidate[]) => {
      const normalizedCandidates = sanitizeUploadCandidates(incomingCandidates);
      if (
        !(workspaceUuid && currentFolderId) ||
        normalizedCandidates.length === 0 ||
        isCurrentFolderReadOnly
      ) {
        return;
      }

      const queueEntries = normalizedCandidates.map(
        ({ file, relativePath }) => ({
          id: crypto.randomUUID(),
          name:
            relativePath && relativePath !== file.name
              ? relativePath
              : file.name,
          sizeLabel: formatBytes(file.size),
          status: "queued" as const,
        })
      );
      const isFolderUploadBatch = normalizedCandidates.some((entry) =>
        (entry.relativePath ?? entry.file.name).includes("/")
      );

      setUploadQueue((previous) => [...queueEntries, ...previous]);

      void (async () => {
        const folderLookup = new Map<string, string>();
        for (const folder of allFolders) {
          folderLookup.set(
            `${folder.parentId ?? "__root__"}::${folder.name.toLowerCase()}`,
            folder.id
          );
        }

        type CreatedFolder = { id: string; key: string };
        const rollbackCreatedFolders = async (
          createdFolders: CreatedFolder[]
        ) => {
          for (const createdFolder of createdFolders.slice().reverse()) {
            folderLookup.delete(createdFolder.key);
            await fetch(
              `/api/workspaces/${workspaceUuid}/folders/${createdFolder.id}`,
              {
                method: "DELETE",
              }
            ).catch(() => {
              // best effort cleanup
            });
          }
        };

        const ensureFolderPath = async (relativePath?: string) => {
          if (!(relativePath && workspaceUuid)) {
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

            const response = await fetch(
              `/api/workspaces/${workspaceUuid}/folders`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ parentId, name: segment }),
              }
            );
            if (!response.ok) {
              throw new Error(`Unable to create folder "${segment}"`);
            }
            const payload = (await response.json()) as {
              folder?: { id?: string };
            };
            const createdId = payload.folder?.id;
            if (!createdId) {
              throw new Error(`Folder "${segment}" could not be created`);
            }
            folderLookup.set(key, createdId);
            parentId = createdId;
          }
          return parentId;
        };

        const maxParallelHashing = 3;
        const maxParallelUploads = 4;
        const dedupeLookupChunkSize = 100;
        const registerChunkSize = 40;
        type UploadPrepared = {
          candidate: UploadCandidate;
          contentHashSha256?: string;
          file: File;
          queueItemId: string;
          targetFolderId: string;
          uploaded: UploadResultLike;
        };
        const preparedForRegister: UploadPrepared[] = [];
        let successCount = 0;
        let uploadCursor = 0;
        const folderPathInflight = new Map<string, Promise<string>>();

        const indexedCandidates = normalizedCandidates.map(
          (candidate, index) => ({
            candidate,
            index,
            queueItemId: queueEntries[index]?.id ?? "",
          })
        );
        const hashByQueueId = new Map<string, string>();
        const dedupeHitByQueueId = new Map<string, { fileId?: string }>();
        if (!isFolderUploadBatch && ENABLE_PREUPLOAD_DEDUPE) {
          let hashCursor = 0;
          const runHashWorker = async () => {
            while (true) {
              const index = hashCursor;
              hashCursor += 1;
              if (index >= indexedCandidates.length) {
                return;
              }
              const entry = indexedCandidates[index];
              if (!(entry && entry.queueItemId)) {
                continue;
              }

              if (!shouldHashForClientDedupe(entry.candidate.file)) {
                continue;
              }

              const hash = await computeSha256Hex(entry.candidate.file);
              if (!hash) {
                continue;
              }

              hashByQueueId.set(entry.queueItemId, hash);
              setUploadQueue((previous) =>
                previous.map((item) =>
                  item.id === entry.queueItemId
                    ? { ...item, contentHashSha256: hash }
                    : item
                )
              );
            }
          };

          await Promise.all(
            Array.from(
              {
                length: Math.min(
                  Math.max(1, indexedCandidates.length),
                  maxParallelHashing
                ),
              },
              () => runHashWorker()
            )
          );

          const dedupeLookupInput: Array<{
            clientUploadId: string;
            hashSha256: string;
            mimeType: string | null;
            name: string;
            sizeBytes: number;
          }> = [];
          for (const entry of indexedCandidates) {
            const hashSha256 = hashByQueueId.get(entry.queueItemId);
            if (!(entry.queueItemId && hashSha256)) {
              continue;
            }
            dedupeLookupInput.push({
              clientUploadId: entry.queueItemId,
              hashSha256,
              mimeType: entry.candidate.file.type || null,
              name: entry.candidate.file.name,
              sizeBytes: entry.candidate.file.size,
            });
          }

          const dedupeChunks = chunkArray(
            dedupeLookupInput,
            dedupeLookupChunkSize
          );
          for (const dedupeChunk of dedupeChunks) {
            if (dedupeChunk.length === 0) {
              continue;
            }

            try {
              const response = await fetch(
                `/api/workspaces/${workspaceUuid}/files/dedupe/lookup`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    files: dedupeChunk.map((entry) => ({
                      clientUploadId: entry.clientUploadId,
                      folderId: currentFolderId,
                      hashSha256: entry.hashSha256,
                      mimeType: entry.mimeType,
                      name: entry.name,
                      sizeBytes: entry.sizeBytes,
                    })),
                  }),
                }
              );

              if (!response.ok) {
                continue;
              }

              const payload = (await response.json()) as DedupeLookupResponse;
              for (const result of payload.results ?? []) {
                if (!result.deduped) {
                  continue;
                }
                dedupeHitByQueueId.set(result.clientUploadId, {
                  fileId: result.file?.id,
                });
              }
            } catch {
              // Best effort. Fallback is normal upload path.
            }
          }
        }

        if (dedupeHitByQueueId.size > 0) {
          successCount += dedupeHitByQueueId.size;
          setUploadQueue((previous) =>
            previous.map((item) => {
              const hit = dedupeHitByQueueId.get(item.id);
              if (!hit) {
                return item;
              }
              return {
                ...item,
                fileId: hit.fileId,
                status: "uploaded",
                failureCount: 0,
                error: undefined,
              };
            })
          );
        }

        const uploadTargets = indexedCandidates.filter(
          (entry) => !dedupeHitByQueueId.has(entry.queueItemId)
        );

        const processOneUpload = async (
          entry: (typeof uploadTargets)[number]
        ) => {
          if (!entry.queueItemId) {
            return;
          }

          setUploadQueue((previous) =>
            previous.map((item) =>
              item.id === entry.queueItemId
                ? { ...item, status: "uploading", error: undefined }
                : item
            )
          );

          const createdFoldersForCandidate: CreatedFolder[] = [];
          try {
            const uploaded = ((await startUpload([entry.candidate.file])) ??
              [])[0] as UploadResultLike | undefined;
            if (!(uploaded?.key && uploaded.ufsUrl)) {
              throw new Error("Upload returned no file metadata");
            }

            const normalizedPath = normalizeRelativePath(
              entry.candidate.relativePath,
              entry.candidate.file
            );
            const lastSeparator = normalizedPath.lastIndexOf("/");
            const folderPathKey =
              lastSeparator >= 0
                ? normalizedPath.slice(0, lastSeparator)
                : "__root__";
            const targetFolderId = await (folderPathInflight.get(
              folderPathKey
            ) ??
              (() => {
                const task = ensureFolderPath(entry.candidate.relativePath);
                folderPathInflight.set(folderPathKey, task);
                return task;
              })());

            preparedForRegister.push({
              candidate: entry.candidate,
              contentHashSha256: hashByQueueId.get(entry.queueItemId),
              file: entry.candidate.file,
              queueItemId: entry.queueItemId,
              targetFolderId,
              uploaded,
            });

            setUploadQueue((previous) =>
              previous.map((item) =>
                item.id === entry.queueItemId
                  ? { ...item, status: "uploaded", error: undefined }
                  : item
              )
            );
          } catch (error) {
            const message = getUploadErrorMessage(error);
            setUploadQueue((previous) =>
              previous.map((item) =>
                item.id === entry.queueItemId
                  ? {
                      ...item,
                      status: "failed",
                      failureCount: (item.failureCount ?? 0) + 1,
                      error: message,
                    }
                  : item
              )
            );
          }
        };

        const runUploadWorker = async () => {
          while (true) {
            const index = uploadCursor;
            uploadCursor += 1;
            if (index >= uploadTargets.length) {
              return;
            }

            const entry = uploadTargets[index];
            if (!entry) {
              return;
            }
            await processOneUpload(entry);
          }
        };

        await Promise.all(
          Array.from(
            {
              length: Math.min(
                Math.max(1, uploadTargets.length),
                maxParallelUploads
              ),
            },
            () => runUploadWorker()
          )
        );

        const registerChunks = chunkArray(
          preparedForRegister,
          registerChunkSize
        );
        for (const registerChunk of registerChunks) {
          if (registerChunk.length === 0) {
            continue;
          }

          try {
            const registerResponse = await fetch(
              `/api/workspaces/${workspaceUuid}/files/register/bulk`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  dedupeMode:
                    isFolderUploadBatch || !ENABLE_PREUPLOAD_DEDUPE
                      ? "skip"
                      : "allow",
                  files: registerChunk.map((entry) => ({
                    clientUploadId: entry.queueItemId,
                    contentHashSha256: entry.contentHashSha256,
                    folderId: entry.targetFolderId,
                    hashComputedBy: entry.contentHashSha256
                      ? "client"
                      : undefined,
                    storageKey: entry.uploaded.key,
                    storageUrl: entry.uploaded.ufsUrl,
                    name: entry.uploaded.name ?? entry.file.name,
                    mimeType: entry.uploaded.contentType ?? entry.file.type,
                    sizeBytes: entry.uploaded.size ?? entry.file.size,
                  })),
                }),
              }
            );

            if (!registerResponse.ok) {
              throw new Error("File metadata registration failed");
            }

            const payload =
              (await registerResponse.json()) as BulkRegisterResponse;
            const resultMap = new Map(
              (payload.results ?? []).map((result) => [
                result.clientUploadId,
                result,
              ])
            );
            const chunkSucceeded = (payload.results ?? []).filter(
              (result) => result.status === "ok"
            ).length;
            successCount += chunkSucceeded;

            setUploadQueue((previous) =>
              previous.map((item) => {
                const result = resultMap.get(item.id);
                if (!result) {
                  return item;
                }

                if (result.status === "ok") {
                  return {
                    ...item,
                    fileId: result.file?.id,
                    ingestionJobId: result.ingestionJob?.id,
                    status: result.ingestionJob?.id ? "ingesting" : "uploaded",
                    failureCount: 0,
                    error: undefined,
                  };
                }

                return {
                  ...item,
                  status: "failed",
                  failureCount: (item.failureCount ?? 0) + 1,
                  error: result.error ?? "File metadata registration failed",
                };
              })
            );

            if (chunkSucceeded > 0) {
              void loadFolder({ silent: true });
              void loadTree();
              emitSync();
            }
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : "File metadata registration failed";
            const queueItemIds = registerChunk.map(
              (entry) => entry.queueItemId
            );
            setUploadQueue((previous) =>
              previous.map((item) =>
                queueItemIds.includes(item.id)
                  ? {
                      ...item,
                      status: "failed",
                      failureCount: (item.failureCount ?? 0) + 1,
                      error: message,
                    }
                  : item
              )
            );
          }
        }

        if (successCount > 0) {
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
    ]
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
    [allFolders, emitSync, loadFolder, loadTree, workspaceUuid]
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
    [allFolders, emitSync, loadFolder, loadTree, workspaceUuid]
  );

  const updateFolderAppearance = useCallback(
    async (
      folderId: string,
      updates: { bannerUrl?: string | null; iconColor?: string | null }
    ) => {
      if (!workspaceUuid) {
        return;
      }

      const folder = allFolders.find((entry) => entry.id === folderId);
      if (folder?.readOnly) {
        return;
      }

      await fetch(`/api/workspaces/${workspaceUuid}/folders/${folderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      await Promise.all([loadFolder({ silent: true }), loadTree()]);
      emitSync();
    },
    [allFolders, emitSync, loadFolder, loadTree, workspaceUuid]
  );

  const triggerBannerPicker = useCallback(
    (folderId: string) => {
      if (!folderId) {
        return;
      }
      if (bannerUploadBusy) {
        return;
      }
      const folder = allFolders.find((entry) => entry.id === folderId);
      if (folder?.readOnly) {
        return;
      }
      if (!bannerInputRef.current) {
        return;
      }
      bannerInputRef.current.dataset.folderId = folderId;
      bannerInputRef.current.click();
    },
    [allFolders, bannerUploadBusy]
  );

  const handleBannerInputChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      const targetFolderId =
        event.currentTarget.dataset.folderId ?? currentFolder?.id ?? "";

      event.currentTarget.value = "";

      if (!(file && targetFolderId)) {
        return;
      }

      const folder = allFolders.find((entry) => entry.id === targetFolderId);
      if (folder?.readOnly) {
        return;
      }

      setBannerUploadBusy(true);
      try {
        const [accentColor, uploadedFiles] = await Promise.all([
          extractImageAccentColor(file),
          startBannerUpload([file]),
        ]);
        const uploaded = uploadedFiles?.[0];
        const uploadedUrl =
          ("ufsUrl" in (uploaded ?? {}) &&
            typeof uploaded?.ufsUrl === "string" &&
            uploaded.ufsUrl) ||
          ("url" in (uploaded ?? {}) &&
            typeof uploaded?.url === "string" &&
            uploaded.url) ||
          null;

        if (!uploadedUrl) {
          return;
        }

        await updateFolderAppearance(targetFolderId, {
          bannerUrl: uploadedUrl,
          iconColor: accentColor ?? null,
        });
      } finally {
        setBannerUploadBusy(false);
      }
    },
    [allFolders, currentFolder?.id, startBannerUpload, updateFolderAppearance]
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
    [emitSync, files, loadFolder, workspaceUuid]
  );

  const moveFolder = useCallback(
    async (folderId: string, targetFolderId: string) => {
      if (!workspaceUuid) {
        return;
      }
      const folder = allFolders.find((entry) => entry.id === folderId);
      const targetFolder = allFolders.find(
        (entry) => entry.id === targetFolderId
      );
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
    [allFolders, emitSync, loadFolder, loadTree, workspaceUuid]
  );

  const moveFile = useCallback(
    async (fileId: string, targetFolderId: string) => {
      if (!workspaceUuid) {
        return;
      }
      const file = files.find((entry) => entry.id === fileId);
      const targetFolder = allFolders.find(
        (entry) => entry.id === targetFolderId
      );
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
    [allFolders, emitSync, files, loadFolder, workspaceUuid]
  );

  const resolveItemKind = useCallback(
    (itemId: string): BulkItemKind | null => {
      if (allFolders.some((folder) => folder.id === itemId)) {
        return "folder";
      }
      if (allFiles.some((file) => file.id === itemId)) {
        return "file";
      }
      return null;
    },
    [allFiles, allFolders]
  );

  const resolveContextActionItems = useCallback(
    (itemId: string, fallbackKind: BulkItemKind) => {
      const actionIds = selection.selectedIds.has(itemId)
        ? Array.from(selection.selectedIds)
        : [itemId];

      return actionIds
        .map((id) => ({
          id,
          kind: resolveItemKind(id) ?? (id === itemId ? fallbackKind : null),
        }))
        .filter(
          (
            item
          ): item is {
            id: string;
            kind: BulkItemKind;
          } => Boolean(item.kind)
        );
    },
    [resolveItemKind, selection.selectedIds]
  );

  const resolveSelectedActionItems = useCallback(() => {
    return Array.from(selection.selectedIds)
      .map((id) => {
        const kind = resolveItemKind(id);
        return kind ? { id, kind } : null;
      })
      .filter(
        (
          item
        ): item is {
          id: string;
          kind: BulkItemKind;
        } => Boolean(item)
      );
  }, [resolveItemKind, selection.selectedIds]);

  const runBulkMutation = useCallback(
    async (payload: {
      items: Array<{ id: string; kind: BulkItemKind }>;
      operation: "delete" | "move";
      targetFolderId?: string;
    }) => {
      if (!(workspaceUuid && payload.items.length > 0)) {
        return null;
      }

      const response = await fetch(
        `/api/workspaces/${workspaceUuid}/items/bulk`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        throw new Error("Bulk operation failed");
      }

      return (await response.json()) as BulkMutationResponse;
    },
    [workspaceUuid]
  );

  const deleteSelectionItems = useCallback(
    async (items: Array<{ id: string; kind: BulkItemKind }>) => {
      const writableItems = items.filter((item) => {
        if (item.kind === "folder") {
          const folder = allFolders.find((entry) => entry.id === item.id);
          return !folder?.readOnly;
        }
        const file = allFiles.find((entry) => entry.id === item.id);
        return !file?.readOnly;
      });

      if (writableItems.length === 0) {
        return;
      }

      const result = await runBulkMutation({
        operation: "delete",
        items: writableItems,
      });

      if (result?.summary?.failed) {
        const failedCount = result.summary.failed;
        const total = result.summary.total ?? writableItems.length;
        window.alert(`Deleted ${total - failedCount} of ${total} item(s).`);
      }

      await Promise.all([loadFolder(), loadTree()]);
      emitSync();
      selection.clearSelection();
    },
    [
      allFiles,
      allFolders,
      emitSync,
      loadFolder,
      loadTree,
      runBulkMutation,
      selection,
    ]
  );

  const moveItemsToFolder = useCallback(
    async (itemIds: string[], targetFolderId: string) => {
      if (itemIds.length === 0) {
        return;
      }

      const targetFolder = allFolders.find(
        (folder) => folder.id === targetFolderId
      );
      if (targetFolder?.readOnly) {
        return;
      }

      const items = itemIds
        .filter((itemId) => itemId !== targetFolderId)
        .map((itemId) => {
          const kind = resolveItemKind(itemId);
          if (!kind) {
            return null;
          }

          if (kind === "folder") {
            const folder = allFolders.find((entry) => entry.id === itemId);
            if (folder?.readOnly) {
              return null;
            }
          } else {
            const file = allFiles.find((entry) => entry.id === itemId);
            if (file?.readOnly) {
              return null;
            }
          }

          return { id: itemId, kind };
        })
        .filter(
          (
            item
          ): item is {
            id: string;
            kind: BulkItemKind;
          } => Boolean(item)
        );

      if (items.length === 0) {
        return;
      }

      await runBulkMutation({
        operation: "move",
        targetFolderId,
        items,
      });
      await Promise.all([loadFolder(), loadTree()]);
      emitSync();
      selection.clearSelection();
    },
    [
      allFiles,
      allFolders,
      emitSync,
      loadFolder,
      loadTree,
      resolveItemKind,
      runBulkMutation,
      selection,
    ]
  );

  const {
    canvasDropActive,
    dropTargetId,
    getCanvasDropProps,
    getFolderDragProps,
    getFileDragProps,
  } = useFileDragDrop({
    enableTouchDrag: !isMobile,
    selection,
    currentFolderId,
    isCurrentFolderReadOnly,
    moveItemsToFolder,
    queueUploads,
    getDropUploadCandidates,
  });

  useEffect(() => {
    const processed = processedFilesIntentVersionsRef.current;

    const openSelectedItem = () => {
      const orderedSelection = visibleItemIds.filter((id) =>
        selection.selectedIds.has(id)
      );
      const firstSelectedId = orderedSelection[0];
      if (!firstSelectedId) {
        return;
      }
      const folder = allFolders.find((entry) => entry.id === firstSelectedId);
      if (folder) {
        navigateToFolder(folder.id);
        return;
      }
      const file = allFiles.find((entry) => entry.id === firstSelectedId);
      if (file) {
        selectFile(file.id);
      }
    };

    const deleteSelectedItems = () => {
      const items = resolveSelectedActionItems();
      if (items.length === 0) {
        return;
      }
      void deleteSelectionItems(items);
    };

    const moveSelectedItemsUp = () => {
      const parentFolderId = breadcrumbs[breadcrumbs.length - 2]?.id;
      if (!parentFolderId) {
        return;
      }
      const selectedIds = Array.from(selection.selectedIds);
      if (selectedIds.length === 0) {
        return;
      }
      void moveItemsToFolder(selectedIds, parentFolderId);
    };

    const goParentFolder = () => {
      const parentFolderId = breadcrumbs[breadcrumbs.length - 2]?.id;
      if (!parentFolderId) {
        return;
      }
      navigateToFolder(parentFolderId);
    };

    if (openSelectionIntentVersion > processed.openSelection) {
      processed.openSelection = openSelectionIntentVersion;
      openSelectedItem();
    }

    if (deleteSelectionIntentVersion > processed.deleteSelection) {
      processed.deleteSelection = deleteSelectionIntentVersion;
      deleteSelectedItems();
    }

    if (moveSelectionUpIntentVersion > processed.moveSelectionUp) {
      processed.moveSelectionUp = moveSelectionUpIntentVersion;
      moveSelectedItemsUp();
    }

    if (goParentIntentVersion > processed.goParent) {
      processed.goParent = goParentIntentVersion;
      goParentFolder();
    }
  }, [
    allFiles,
    allFolders,
    breadcrumbs,
    deleteSelectionIntentVersion,
    deleteSelectionItems,
    goParentIntentVersion,
    moveItemsToFolder,
    moveSelectionUpIntentVersion,
    navigateToFolder,
    openSelectionIntentVersion,
    resolveSelectedActionItems,
    selectFile,
    selection.selectedIds,
    visibleItemIds,
  ]);

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

    if (editDialog.mode === "create-note" && editDialog.parentId) {
      await createNote(editDialog.parentId, editDialog.value);
    }

    if (editDialog.mode === "rename-folder" && editDialog.id) {
      await renameFolder(editDialog.id, editDialog.value);
    }

    if (editDialog.mode === "rename-file" && editDialog.id) {
      await renameFile(editDialog.id, editDialog.value);
    }

    setEditDialog(null);
  };

  const copyFileShareLink = useCallback(
    async (file: FileRecord) => {
      if (!workspaceUuid || file.readOnly) {
        return;
      }

      const response = await fetch(
        `/api/workspaces/${workspaceUuid}/files/${file.id}/share/link`,
        { method: "POST" }
      );
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as { shareUrl?: string };
      if (!payload.shareUrl) {
        return;
      }

      await navigator.clipboard.writeText(payload.shareUrl);
    },
    [workspaceUuid]
  );

  const copyFolderShareLink = useCallback(
    async (folder: FolderRecord) => {
      if (!workspaceUuid || folder.readOnly) {
        return;
      }

      const response = await fetch(
        `/api/workspaces/${workspaceUuid}/folders/${folder.id}/share/link`,
        { method: "POST" }
      );
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as { shareUrl?: string };
      if (!payload.shareUrl) {
        return;
      }

      await navigator.clipboard.writeText(payload.shareUrl);
    },
    [workspaceUuid]
  );

  const duplicateItem = useCallback(
    async (
      item:
        | { id: string; kind: "file"; parentId?: string | null }
        | { id: string; kind: "folder"; parentId?: string | null }
    ) => {
      if (!workspaceUuid) {
        return;
      }

      const response = await fetch(
        `/api/workspaces/${workspaceUuid}/items/duplicate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: item.id,
            kind: item.kind,
            parentId: item.parentId,
          }),
        }
      );

      if (!response.ok) {
        return;
      }

      await Promise.all([loadFolder(), loadTree()]);
      emitSync();
    },
    [emitSync, loadFolder, loadTree, workspaceUuid]
  );

  const downloadItemArchive = useCallback(
    async (item: { id: string; kind: "file" | "folder"; name: string }) => {
      if (!workspaceUuid) {
        return;
      }

      const response = await fetch(
        `/api/workspaces/${workspaceUuid}/items/archive`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: item.id,
            kind: item.kind,
          }),
        }
      );
      if (!response.ok) {
        return;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${item.name}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    },
    [workspaceUuid]
  );

  const downloadFileDirect = useCallback(
    async (file: FileRecord) => {
      try {
        const sourceUrl = file.isNote
          ? `/api/workspaces/${workspaceUuid}/files/${file.id}/stream`
          : file.storageUrl;
        const response = await fetch(sourceUrl);
        if (!response.ok) {
          throw new Error("Download failed");
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
      } catch {
        const fallbackUrl = file.isNote
          ? `/api/workspaces/${workspaceUuid}/files/${file.id}/stream`
          : file.storageUrl;
        window.open(fallbackUrl, "_blank", "noopener,noreferrer");
      }
    },
    [workspaceUuid]
  );

  const handleApplyWorkspaceFilter = useCallback((itemIds: string[] | null) => {
    setVectorFilteredIds(
      itemIds && itemIds.length > 0 ? new Set(itemIds) : null
    );
  }, []);

  const handleSearch = useCallback(
    (_searchQuery: string, results: WorkspaceSearchResult[]) => {
      setQuery("");
      setRetrievalResults(results);
      if (results.length === 0) {
        setActiveRetrievalChunkId(null);
      }
    },
    []
  );

  const handleSelectResult = useCallback(
    (result: WorkspaceSearchResult) => {
      if (result.type === "folder") {
        setActiveRetrievalChunkId(null);
        openFolderById(result.id);
        return;
      }
      setActiveRetrievalChunkId(result.chunkId ?? null);
      openSearchResult(result);
    },
    [openFolderById, openSearchResult]
  );

  if (activeFile) {
    return (
      <FilePreviewPanel
        activeFile={activeFile}
        workspaceUuid={workspaceUuid}
        currentFolderId={currentFolderId}
        allFiles={allFiles}
        allFolders={allFolders}
        query={query}
        retrievalResults={retrievalResults}
        activeRetrievalChunkId={activeRetrievalChunkId}
        selectFile={selectFile}
        openFileById={openFileById}
        openRenameFileDialog={openRenameFileDialog}
        deleteSelectionItems={deleteSelectionItems}
        moveFile={moveFile}
        duplicateItem={duplicateItem}
        downloadFileDirect={downloadFileDirect}
        copyFileShareLink={copyFileShareLink}
        downloadItemArchive={downloadItemArchive}
        toggleCurrentPinnedItem={toggleCurrentPinnedItem}
        isCurrentPinned={isCurrentPinned}
        currentInfoEntries={currentInfoEntries}
        wikiMarkdownFiles={wikiMarkdownFiles}
        filePathById={filePathById}
        workspaceMembers={workspaceMembers}
        startBannerUpload={startBannerUpload}
        startUpload={startUpload}
        loadShareSuggestions={loadShareSuggestions}
      />
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      <div className="sticky top-0 z-30 shrink-0 border-border/70 border-b bg-background/95 backdrop-blur-sm">
        <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 px-4 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <SidebarTrigger className="rounded-md md:hidden" />
            <Button
              aria-label="Go back"
              className="rounded-md"
              disabled={!backRoute}
              onClick={() => {
                if (backRoute) {
                  router.push(backRoute as Route);
                }
              }}
              size="icon-xs"
              type="button"
              variant="outline"
            >
              <ArrowLeft className="size-3.5" />
            </Button>
            <Button
              aria-label="Go forward"
              className="hidden rounded-md sm:inline-flex"
              disabled={!forwardRoute}
              onClick={() => {
                if (forwardRoute) {
                  router.push(forwardRoute as Route);
                }
              }}
              size="icon-xs"
              type="button"
              variant="outline"
            >
              <ArrowRight className="size-3.5" />
            </Button>
            <Button
              aria-label="Go home"
              className="hidden rounded-md sm:inline-flex"
              disabled={pathname === "/workspace"}
              onClick={() => {
                if (pathname !== "/workspace") {
                  router.push("/workspace" as Route);
                }
              }}
              size="icon-xs"
              type="button"
              variant="outline"
            >
              <House className="size-3.5" />
            </Button>
            <Breadcrumb className="min-w-0 flex-1">
              <BreadcrumbList className="flex-nowrap overflow-x-auto whitespace-nowrap pr-2">
                {breadcrumbs.map((crumb, index) => {
                  const isLast = index === breadcrumbs.length - 1;
                  const Icon = index === 0 ? House : Folder;
                  return (
                    <BreadcrumbItem key={crumb.id}>
                      {isLast ? (
                        <BreadcrumbPage className="inline-flex items-center gap-2">
                          <Icon className="hidden size-3.5 text-muted-foreground sm:inline-flex" />
                          <span>{crumb.name}</span>
                        </BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink
                          className="inline-flex items-center gap-2"
                          href="#"
                          onClick={(event) => {
                            event.preventDefault();
                            navigateToFolder(crumb.id);
                          }}
                        >
                          <Icon className="hidden size-3.5 text-muted-foreground sm:inline-flex" />
                          <span>{crumb.name}</span>
                        </BreadcrumbLink>
                      )}
                      {isLast ? null : <BreadcrumbSeparator />}
                    </BreadcrumbItem>
                  );
                })}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ShareDialog
              variant="folder"
              workspaceUuid={workspaceUuid}
              currentFolder={currentFolder}
              isAtWorkspaceRoot={isAtWorkspaceRoot}
              loadShareSuggestions={loadShareSuggestions}
            />
            <Button
              className="rounded-md"
              onClick={toggleCurrentPinnedItem}
              size="sm"
              type="button"
              variant={isCurrentPinned ? "secondary" : "outline"}
            >
              {isCurrentPinned ? (
                <PinOff className="size-3.5" />
              ) : (
                <Pin className="size-3.5" />
              )}
              {isCurrentPinned ? "Unpin" : "Pin"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-label="More actions"
                    className="rounded-md"
                    size="icon-sm"
                    type="button"
                    variant="outline"
                  />
                }
              >
                <MoreHorizontal className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={toggleCurrentPinnedItem}>
                  {isCurrentPinned ? (
                    <PinOff className="size-3.5" />
                  ) : (
                    <Pin className="size-3.5" />
                  )}
                  {isCurrentPinned ? "Unpin" : "Pin"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={isAtWorkspaceRoot || !currentFolder}
                  onClick={() => {
                    if (currentFolder) {
                      openRenameFolderDialog(currentFolder);
                    }
                  }}
                >
                  <Pencil className="size-3.5" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={isAtWorkspaceRoot || !currentFolder}
                  onClick={() => {
                    if (currentFolder) {
                      void duplicateItem({
                        id: currentFolder.id,
                        kind: "folder",
                        parentId: currentFolder.parentId,
                      });
                    }
                  }}
                >
                  <Copy className="size-3.5" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={isAtWorkspaceRoot || !currentFolder}
                  onClick={() => {
                    if (currentFolder) {
                      void copyFolderShareLink(currentFolder);
                    }
                  }}
                >
                  <Share2 className="size-3.5" />
                  Share
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger
                    disabled={isAtWorkspaceRoot || !currentFolder}
                  >
                    <FolderInput className="size-3.5" />
                    Move To
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {allFolders
                      .filter(
                        (folder) =>
                          currentFolder &&
                          folder.id !== currentFolder.id &&
                          !folder.readOnly
                      )
                      .slice(0, 20)
                      .map((folder) => (
                        <DropdownMenuItem
                          key={folder.id}
                          onClick={() => {
                            if (currentFolder) {
                              void moveFolder(currentFolder.id, folder.id);
                            }
                          }}
                        >
                          {folder.name}
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem
                  disabled={isAtWorkspaceRoot || !currentFolder}
                  onClick={() => {
                    if (currentFolder) {
                      void downloadItemArchive({
                        id: currentFolder.id,
                        kind: "folder",
                        name: currentFolder.name,
                      });
                    }
                  }}
                >
                  <ArrowDownToLine className="size-3.5" />
                  Download (as Zip)
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Info className="size-3.5" />
                    Information
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-72">
                    {currentInfoEntries.map((entry) => (
                      <div
                        className="flex items-start justify-between gap-3 px-2 py-1.5 text-xs"
                        key={entry.label}
                      >
                        <span className="text-muted-foreground">
                          {entry.label}
                        </span>
                        <span className="max-w-[12rem] text-right text-foreground">
                          {entry.value}
                        </span>
                      </div>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={isAtWorkspaceRoot || !currentFolder}
                  onClick={() => {
                    if (currentFolder) {
                      void deleteSelectionItems([
                        { id: currentFolder.id, kind: "folder" },
                      ]);
                    }
                  }}
                  variant="destructive"
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="px-4 pt-0 pb-4">
        {currentFolder ? (
          <ContextMenu>
            <ContextMenuTrigger {...({ disabled: isMobile } as any)}>
              <div className="relative -mx-4 mb-3 h-44 w-[calc(100%+2rem)] overflow-hidden">
                <img
                  alt={`${currentFolder.name} banner`}
                  className="h-full w-full object-cover"
                  fetchPriority="high"
                  loading="eager"
                  src={currentFolderBannerUrl}
                />
                {bannerUploadBusy ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/30 backdrop-blur-[1px]">
                    <Spinner className="size-5" />
                  </div>
                ) : null}
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                disabled={Boolean(currentFolder.readOnly) || bannerUploadBusy}
                onClick={() => triggerBannerPicker(currentFolder.id)}
              >
                <FileImage className="size-3.5" />
                Change banner
              </ContextMenuItem>
              <ContextMenuItem
                disabled={Boolean(currentFolder.readOnly) || bannerUploadBusy}
                onClick={() => {
                  void updateFolderAppearance(currentFolder.id, {
                    bannerUrl: null,
                    iconColor: null,
                  });
                }}
              >
                <XCircle className="size-3.5" />
                Reset banner
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ) : null}
        <StylizedSearchBar
          filePathById={filePathById}
          focusSignal={focusSearchSignal}
          initialQuery={query}
          initialResults={retrievalResults}
          items={searchableItems}
          maxWidth="max-w-none"
          onApplyWorkspaceFilter={handleApplyWorkspaceFilter}
          onOpenFileById={openFileById}
          onOpenFolderById={openFolderById}
          onSearch={handleSearch}
          onSelectResult={handleSelectResult}
          placeholder="Search anything..."
          selectedResultChunkId={activeRetrievalChunkId}
          workspaceUuid={workspaceUuid}
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
        {...({ directory: "", webkitdirectory: "" } as Record<string, string>)}
        multiple
        onChange={(event) => {
          const incoming = Array.from(event.target.files ?? []).map((file) => {
            const webkitRelativePath = (
              file as File & { webkitRelativePath?: string }
            ).webkitRelativePath;
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
      <input
        accept="image/*"
        className="sr-only"
        onChange={handleBannerInputChange}
        ref={bannerInputRef}
        type="file"
      />

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-24 md:pb-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-4">
          <div className="flex min-w-0 items-center gap-2">
            {!isAtWorkspaceRoot && parentFolder ? (
              <Button
                aria-label="Go to parent folder"
                className="rounded-md"
                onClick={() => navigateToFolder(parentFolder.id)}
                size="icon-sm"
                type="button"
                variant="outline"
              >
                <ArrowLeft className="size-3.5" />
              </Button>
            ) : null}
            <div className="min-w-0">
              <h2 className="truncate font-semibold text-[1.9rem] tracking-tight">
                {currentLocationTitle}
              </h2>
            </div>
            {isMobile ? (
              <Button
                className="rounded-md"
                onClick={() => setMobileCreateMenuOpen(true)}
                size="icon-sm"
                type="button"
                variant="outline"
              >
                <Plus className="size-3.5" />
              </Button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      className="rounded-md"
                      size="icon-sm"
                      type="button"
                      variant="outline"
                    />
                  }
                >
                  <Plus className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuItem
                    disabled={isCurrentFolderReadOnly}
                    onClick={() => openCreateNoteDialog(currentFolderId)}
                  >
                    <FileText className="size-3.5" />
                    New note
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isCurrentFolderReadOnly}
                    onClick={() => openCreateFolderDialog(currentFolderId)}
                  >
                    <Folder className="size-3.5" />
                    New folder
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isCurrentFolderReadOnly}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="size-3.5" />
                    Upload file
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isCurrentFolderReadOnly}
                    onClick={() => folderInputRef.current?.click()}
                  >
                    <FilePlus2 className="size-3.5" />
                    Upload folder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    className="rounded-md"
                    size="sm"
                    type="button"
                    variant="outline"
                  />
                }
              >
                <SlidersHorizontal className="size-3.5" />
                Filters
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 rounded-2xl p-3">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Status
                    </Label>
                    <select
                      className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
                      onChange={(event) =>
                        setFrontmatterStatusFilter(event.target.value)
                      }
                      value={frontmatterStatusFilter}
                    >
                      <option value="">Any status</option>
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Type
                    </Label>
                    <select
                      className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
                      onChange={(event) =>
                        setFrontmatterTypeFilter(event.target.value)
                      }
                      value={frontmatterTypeFilter}
                    >
                      <option value="">Any type</option>
                      {TYPE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Tag contains
                    </Label>
                    <Input
                      className="h-9 text-xs"
                      onChange={(event) =>
                        setFrontmatterTagFilter(event.target.value)
                      }
                      placeholder="exam, math, ..."
                      value={frontmatterTagFilter}
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => {
                      setFrontmatterStatusFilter("");
                      setFrontmatterTypeFilter("");
                      setFrontmatterTagFilter("");
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Clear filters
                  </Button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    className="rounded-md"
                    size="sm"
                    type="button"
                    variant="outline"
                  />
                }
              >
                <ArrowUpDown className="size-3.5" />
                Sorting
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 rounded-2xl p-1.5"
              >
                <DropdownMenuItem
                  className={
                    sortBy === "name" ? "bg-primary/10 text-primary" : ""
                  }
                  onClick={() => setSortBy("name")}
                >
                  <FileText className="size-3.5" />
                  Sort by name
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={
                    sortBy === "createdAt" ? "bg-primary/10 text-primary" : ""
                  }
                  onClick={() => setSortBy("createdAt")}
                >
                  <ArrowUpDown className="size-3.5" />
                  Sort by date created
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={
                    sortBy === "updatedAt" ? "bg-primary/10 text-primary" : ""
                  }
                  onClick={() => setSortBy("updatedAt")}
                >
                  <ArrowUpDown className="size-3.5" />
                  Sort by date updated
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              aria-label="Card view"
              className="rounded-md"
              onClick={() => setViewMode("cards")}
              size="icon-sm"
              type="button"
              variant={viewMode === "cards" ? "secondary" : "outline"}
            >
              <Grid3X3 className="size-3.5" />
            </Button>
            <Button
              aria-label="List view"
              className="rounded-md"
              onClick={() => setViewMode("list")}
              size="icon-sm"
              type="button"
              variant={viewMode === "list" ? "secondary" : "outline"}
            >
              <LayoutList className="size-3.5" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          <ContextMenu>
            <ContextMenuTrigger {...({ disabled: isMobile } as any)}>
              <div
                className="h-full overflow-auto [scrollbar-color:color-mix(in_oklab,var(--color-border),transparent_30%)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2"
                onContextMenu={(event) => {
                  if (isMobile) {
                    event.preventDefault();
                  }
                }}
              >
                <div
                  className={cn(
                    "relative min-h-full px-3 pb-3",
                    canvasDropActive && "bg-primary/5"
                  )}
                  onContextMenu={(event) => {
                    if (isMobile) {
                      event.preventDefault();
                    }
                  }}
                  data-drop-folder-id={
                    isCurrentFolderReadOnly ? undefined : currentFolderId
                  }
                  {...getCanvasDropProps()}
                >
                  {loading ? (
                    <div className="flex flex-wrap gap-3">
                      {Array.from({ length: 10 }).map((_, index) => (
                        <Card
                          className="rounded-2xl bg-transparent p-2 ring-0"
                          key={index}
                          style={{ width: 160 }}
                        >
                          <CardContent className="space-y-2 px-0 pt-0">
                            <Skeleton className="aspect-[4/3] h-28 rounded-md" />
                            <Skeleton className="h-4 w-40" />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <motion.div
                      animate={{ opacity: 1, y: 0 }}
                      className="relative min-h-[calc(100vh-14rem)]"
                      initial={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                      onPointerDown={handleMobileCanvasPointerDown}
                      ref={gridRef}
                    >
                      <div
                        className={cn(
                          "flex flex-wrap gap-3",
                          viewMode !== "cards" && "hidden"
                        )}
                      >
                        {sortedFolders.map((folder) => {
                          const folderUpdatedLabel =
                            folder.updatedAt && folder.updatedAt.length > 0
                              ? toUpdatedLabel(folder.updatedAt)
                              : "";
                          return (
                            <ContextMenu key={folder.id}>
                              <ContextMenuTrigger
                                {...({ disabled: isMobile } as any)}
                              >
                                <Card
                                  className={cn(
                                    "group relative cursor-pointer overflow-hidden rounded-2xl border border-transparent bg-transparent p-2 ring-0 transition",
                                    selection.selectedIds.has(folder.id) &&
                                      "border border-primary bg-primary/5",
                                    dropTargetId === folder.id &&
                                      "bg-primary/10 ring-2 ring-primary/30"
                                  )}
                                  data-drop-folder-id={folder.id}
                                  data-select-item="true"
                                  {...getFolderDragProps(
                                    folder.id,
                                    folder.readOnly
                                  )}
                                  onContextMenu={(event) => {
                                    if (isMobile) {
                                      event.preventDefault();
                                    }
                                  }}
                                  onClick={(event) => {
                                    if (isMobile) {
                                      handleMobileItemClick(folder.id, () =>
                                        navigateToFolder(folder.id)
                                      );
                                      return;
                                    }
                                    selection.handleItemClick(
                                      event,
                                      folder.id,
                                      visibleItemIds
                                    );
                                    handleOpenOnDoubleClick(event, () =>
                                      navigateToFolder(folder.id)
                                    );
                                  }}
                                  onPointerDown={(event) => {
                                    if (
                                      isMobile &&
                                      event.pointerType === "touch"
                                    ) {
                                      beginMobileItemLongPress(folder.id);
                                    }
                                  }}
                                  onPointerUp={handleMobileItemPointerUp}
                                  onPointerCancel={handleMobileItemPointerUp}
                                  ref={(node: HTMLDivElement | null) => {
                                    if (!node) {
                                      itemRefs.current.delete(folder.id);
                                      return;
                                    }
                                    itemRefs.current.set(folder.id, node);
                                  }}
                                  style={{ width: 160 }}
                                >
                                  <div className="absolute top-2 left-2 z-10">
                                    <Checkbox
                                      checked={selection.selectedIds.has(
                                        folder.id
                                      )}
                                      onCheckedChange={(checked) =>
                                        selection.setItemSelected(
                                          folder.id,
                                          checked === true
                                        )
                                      }
                                      onClick={(event) =>
                                        event.stopPropagation()
                                      }
                                    />
                                  </div>
                                  <CardContent className="space-y-2 px-0 pt-0">
                                    <div className="group relative flex h-28 w-full min-w-0 items-center justify-center overflow-hidden rounded-lg border border-border/45 bg-muted/70 p-1.5">
                                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_60%)]" />
                                      <FolderGlyph
                                        className="transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                                        previewKinds={
                                          folderPreviewKinds.get(folder.id) ??
                                          []
                                        }
                                      />
                                    </div>
                                    <div className="flex w-full min-w-0 max-w-full items-center justify-between gap-2">
                                      <div className="flex min-w-0 flex-1 items-center gap-2">
                                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground">
                                          folder
                                        </span>
                                        <span
                                          className="min-w-0 flex-1 truncate font-medium text-sm"
                                          title={folder.name}
                                        >
                                          {folder.name}
                                        </span>
                                      </div>
                                      <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                                        {folderUpdatedLabel}
                                      </span>
                                    </div>
                                  </CardContent>
                                </Card>
                              </ContextMenuTrigger>
                              <ContextMenuContent>
                                <ContextMenuItem
                                  onClick={() => navigateToFolder(folder.id)}
                                >
                                  <ArrowRight className="size-3.5" />
                                  Open
                                </ContextMenuItem>
                                {folder.readOnly ? null : (
                                  <>
                                    <ContextMenuItem
                                      onClick={() =>
                                        openRenameFolderDialog(folder)
                                      }
                                    >
                                      <Pencil className="size-3.5" />
                                      Rename
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                      onClick={() => {
                                        void duplicateItem({
                                          id: folder.id,
                                          kind: "folder",
                                          parentId: folder.parentId,
                                        });
                                      }}
                                    >
                                      <Copy className="size-3.5" />
                                      Duplicate
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                      onClick={() => {
                                        void copyFolderShareLink(folder);
                                      }}
                                    >
                                      <Share2 className="size-3.5" />
                                      Share
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                      onClick={() =>
                                        triggerBannerPicker(folder.id)
                                      }
                                    >
                                      <FileImage className="size-3.5" />
                                      Change banner
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                      onClick={() => {
                                        void updateFolderAppearance(folder.id, {
                                          bannerUrl: null,
                                          iconColor: null,
                                        });
                                      }}
                                    >
                                      <XCircle className="size-3.5" />
                                      Reset banner
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                      onClick={() =>
                                        openCreateFolderDialog(folder.id)
                                      }
                                    >
                                      <Plus className="size-3.5" />
                                      New folder here
                                    </ContextMenuItem>
                                    <ContextMenuSub>
                                      <ContextMenuSubTrigger>
                                        <FolderInput className="size-3.5" />
                                        Move to
                                      </ContextMenuSubTrigger>
                                      <ContextMenuSubContent>
                                        {allFolders
                                          .filter(
                                            (target) =>
                                              target.id !== folder.id &&
                                              !target.readOnly
                                          )
                                          .slice(0, 20)
                                          .map((target) => (
                                            <ContextMenuItem
                                              key={target.id}
                                              onClick={() => {
                                                const items =
                                                  resolveContextActionItems(
                                                    folder.id,
                                                    "folder"
                                                  );
                                                void moveItemsToFolder(
                                                  items.map((item) => item.id),
                                                  target.id
                                                );
                                              }}
                                            >
                                              {target.name}
                                            </ContextMenuItem>
                                          ))}
                                      </ContextMenuSubContent>
                                    </ContextMenuSub>
                                    <ContextMenuItem
                                      onClick={() => {
                                        void downloadItemArchive({
                                          id: folder.id,
                                          kind: "folder",
                                          name: folder.name,
                                        });
                                      }}
                                    >
                                      <ArrowDownToLine className="size-3.5" />
                                      Download (as Zip)
                                    </ContextMenuItem>
                                  </>
                                )}
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
                                  <Info className="size-3.5" />
                                  Properties
                                </ContextMenuItem>
                                {folder.readOnly ? null : (
                                  <ContextMenuItem
                                    onClick={() => {
                                      const items = resolveContextActionItems(
                                        folder.id,
                                        "folder"
                                      );
                                      void deleteSelectionItems(items);
                                    }}
                                    variant="destructive"
                                  >
                                    <Trash2 className="size-3.5" />
                                    Delete
                                  </ContextMenuItem>
                                )}
                              </ContextMenuContent>
                            </ContextMenu>
                          );
                        })}

                        {sortedFiles.map((file) => {
                          const { isImage, isPdf, isVideo, isAudio } =
                            detectPreviewKind(file);
                          const videoPlaybackDescriptor = isVideo
                            ? buildVideoPlaybackDescriptor({
                                fallbackUrl: file.storageUrl,
                                mimeType: file.mimeType,
                                videoDelivery: file.videoDelivery,
                              })
                            : null;
                          const openedCached = isFileOpenedCached(file.id);
                          const isWarmed = videoPlaybackDescriptor
                            ? getWarmState(
                                videoPlaybackDescriptor.preferredSource
                              ) === "warm"
                            : getWarmState(file.storageUrl) === "warm";
                          const fileKind = detectFileKind(file);
                          const fileCardType =
                            fileKind === "sheet" ? "document" : fileKind;
                          return (
                            <ContextMenu key={file.id}>
                              <ContextMenuTrigger
                                {...({ disabled: isMobile } as any)}
                              >
                                <Card
                                  className={cn(
                                    "group grid-card-item relative cursor-pointer overflow-hidden rounded-2xl border border-transparent bg-transparent p-2 ring-0 transition",
                                    selection.selectedIds.has(file.id) &&
                                      "border border-primary bg-primary/5"
                                  )}
                                  data-select-item="true"
                                  {...getFileDragProps(file.id, file.readOnly)}
                                  onContextMenu={(event) => {
                                    if (isMobile) {
                                      event.preventDefault();
                                    }
                                  }}
                                  onBlur={() => handlePreviewIntentEnd(file)}
                                  onClick={(event) => {
                                    if (isMobile) {
                                      handleMobileItemClick(file.id, () =>
                                        selectFile(file.id)
                                      );
                                      return;
                                    }
                                    selection.handleItemClick(
                                      event,
                                      file.id,
                                      visibleItemIds
                                    );
                                    handleOpenOnDoubleClick(event, () =>
                                      selectFile(file.id)
                                    );
                                  }}
                                  onPointerDown={(event) => {
                                    if (
                                      isMobile &&
                                      event.pointerType === "touch"
                                    ) {
                                      beginMobileItemLongPress(file.id);
                                    }
                                  }}
                                  onPointerUp={handleMobileItemPointerUp}
                                  onPointerCancel={handleMobileItemPointerUp}
                                  onFocus={() => handlePreviewIntentStart(file)}
                                  onMouseEnter={() =>
                                    handlePreviewIntentStart(file)
                                  }
                                  onMouseLeave={() =>
                                    handlePreviewIntentEnd(file)
                                  }
                                  ref={(node: HTMLDivElement | null) => {
                                    if (!node) {
                                      itemRefs.current.delete(file.id);
                                      return;
                                    }
                                    itemRefs.current.set(file.id, node);
                                  }}
                                  style={{ width: 160 }}
                                  tabIndex={0}
                                >
                                  <div className="absolute top-2 left-2 z-10">
                                    <Checkbox
                                      aria-label={`Select file ${file.name}`}
                                      checked={selection.selectedIds.has(
                                        file.id
                                      )}
                                      onCheckedChange={(checked) =>
                                        selection.setItemSelected(
                                          file.id,
                                          checked === true
                                        )
                                      }
                                      onClick={(event) =>
                                        event.stopPropagation()
                                      }
                                    />
                                  </div>
                                  <CardContent className="px-0 pt-0">
                                    <FileCard
                                      fileType={fileCardType}
                                      lastUpdated={
                                        new Date(
                                          file.updatedAt ?? file.createdAt
                                        )
                                      }
                                      name={file.name}
                                      previewContent={
                                        isImage ? (
                                          <img
                                            alt={file.name}
                                            className="block h-full w-auto rounded-md object-contain"
                                            loading="lazy"
                                            src={file.storageUrl}
                                          />
                                        ) : isVideo ? (
                                          <VideoThumbnail
                                            className="h-full w-auto rounded-md object-contain"
                                            openedCached={
                                              openedCached || isWarmed
                                            }
                                            playbackSource={
                                              videoPlaybackDescriptor?.preferredSource ??
                                              buildProgressivePlaybackSource(
                                                file.storageUrl,
                                                file.mimeType
                                              )
                                            }
                                            playOnHover={
                                              hoveredPreviewFileId === file.id
                                            }
                                            posterUrl={
                                              videoPlaybackDescriptor?.posterUrl
                                            }
                                            sizeBytes={file.sizeBytes}
                                            warm={
                                              hoveredPreviewFileId === file.id
                                            }
                                          />
                                        ) : isPdf ? (
                                          <PdfThumbnail
                                            className="h-full w-auto rounded-md"
                                            src={file.storageUrl}
                                          />
                                        ) : undefined
                                      }
                                    />
                                  </CardContent>
                                </Card>
                              </ContextMenuTrigger>
                              <ContextMenuContent>
                                <ContextMenuItem
                                  onClick={() => selectFile(file.id)}
                                >
                                  <ArrowRight className="size-3.5" />
                                  Open
                                </ContextMenuItem>
                                {file.readOnly ? null : (
                                  <>
                                    <ContextMenuItem
                                      onClick={() => openRenameFileDialog(file)}
                                    >
                                      <Pencil className="size-3.5" />
                                      Rename
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                      onClick={() => {
                                        void duplicateItem({
                                          id: file.id,
                                          kind: "file",
                                          parentId: file.folderId,
                                        });
                                      }}
                                    >
                                      <Copy className="size-3.5" />
                                      Duplicate
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                      onClick={() => {
                                        void copyFileShareLink(file);
                                      }}
                                    >
                                      <Share2 className="size-3.5" />
                                      Share
                                    </ContextMenuItem>
                                    <ContextMenuSub>
                                      <ContextMenuSubTrigger>
                                        <FolderInput className="size-3.5" />
                                        Move to
                                      </ContextMenuSubTrigger>
                                      <ContextMenuSubContent>
                                        {allFolders
                                          .filter((target) => !target.readOnly)
                                          .slice(0, 20)
                                          .map((target) => (
                                            <ContextMenuItem
                                              key={target.id}
                                              onClick={() => {
                                                const items =
                                                  resolveContextActionItems(
                                                    file.id,
                                                    "file"
                                                  );
                                                void moveItemsToFolder(
                                                  items.map((item) => item.id),
                                                  target.id
                                                );
                                              }}
                                            >
                                              {target.name}
                                            </ContextMenuItem>
                                          ))}
                                      </ContextMenuSubContent>
                                    </ContextMenuSub>
                                    <ContextMenuItem
                                      onClick={() => {
                                        downloadFileDirect(file);
                                      }}
                                    >
                                      <ArrowDownToLine className="size-3.5" />
                                      Download
                                    </ContextMenuItem>
                                  </>
                                )}
                                <ContextMenuItem
                                  onClick={() => {
                                    setPropertiesItem({
                                      kind: "file",
                                      id: file.id,
                                      name: file.name,
                                      detail: `${formatBytes(file.sizeBytes)} • ${file.mimeType ?? "unknown"} • ${file.isIngested ? "Ingested" : "Pending"}`,
                                    });
                                    setPropertiesOpen(true);
                                  }}
                                >
                                  <Info className="size-3.5" />
                                  Properties
                                </ContextMenuItem>
                                {file.readOnly ? null : (
                                  <ContextMenuItem
                                    onClick={() => {
                                      const items = resolveContextActionItems(
                                        file.id,
                                        "file"
                                      );
                                      void deleteSelectionItems(items);
                                    }}
                                    variant="destructive"
                                  >
                                    <Trash2 className="size-3.5" />
                                    Delete
                                  </ContextMenuItem>
                                )}
                              </ContextMenuContent>
                            </ContextMenu>
                          );
                        })}
                      </div>
                      {viewMode === "list" ? (
                        <div className="divide-y divide-border/70 rounded-xl border border-border/70">
                          {sortedFolders.map((folder) => (
                            <div
                              className={cn(
                                "flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/30",
                                selection.selectedIds.has(folder.id) &&
                                  "bg-primary/10",
                                dropTargetId === folder.id &&
                                  "bg-primary/15 outline outline-2 outline-primary/30"
                              )}
                              data-drop-folder-id={folder.id}
                              data-select-item="true"
                              {...getFolderDragProps(
                                folder.id,
                                folder.readOnly
                              )}
                              onContextMenu={(event) => {
                                if (isMobile) {
                                  event.preventDefault();
                                }
                              }}
                              key={folder.id}
                              onClick={(event) => {
                                if (isMobile) {
                                  handleMobileItemClick(folder.id, () =>
                                    navigateToFolder(folder.id)
                                  );
                                  return;
                                }
                                selection.handleItemClick(
                                  event,
                                  folder.id,
                                  visibleItemIds
                                );
                                handleOpenOnDoubleClick(event, () =>
                                  navigateToFolder(folder.id)
                                );
                              }}
                              onPointerDown={(event) => {
                                if (isMobile && event.pointerType === "touch") {
                                  beginMobileItemLongPress(folder.id);
                                }
                              }}
                              onPointerUp={handleMobileItemPointerUp}
                              onPointerCancel={handleMobileItemPointerUp}
                              ref={(node: HTMLDivElement | null) => {
                                if (!node) {
                                  itemRefs.current.delete(folder.id);
                                  return;
                                }
                                itemRefs.current.set(folder.id, node);
                              }}
                            >
                              <Checkbox
                                checked={selection.selectedIds.has(folder.id)}
                                onCheckedChange={(checked) =>
                                  selection.setItemSelected(
                                    folder.id,
                                    checked === true
                                  )
                                }
                                onClick={(event) => event.stopPropagation()}
                              />
                              <FolderGlyph
                                compact
                                previewKinds={
                                  folderPreviewKinds.get(folder.id) ?? []
                                }
                              />
                              <p className="min-w-0 flex-1 truncate font-medium text-sm">
                                {folder.name}
                              </p>
                              <div className="ml-auto flex items-center gap-6 text-muted-foreground text-xs">
                                <span className="min-w-[110px] text-right tabular-nums">
                                  {folderSubfolderCount.get(folder.id) ?? 0}{" "}
                                  folders •{" "}
                                  {folderFileCount.get(folder.id) ?? 0} files
                                </span>
                                <span className="min-w-[72px] text-right tabular-nums">
                                  {folder.updatedAt
                                    ? toUpdatedLabel(folder.updatedAt)
                                    : "—"}
                                </span>
                              </div>
                            </div>
                          ))}
                          {sortedFiles.map((file) => {
                            const fileKind = detectFileKind(file);
                            return (
                              <div
                                className={cn(
                                  "flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/30",
                                  selection.selectedIds.has(file.id) &&
                                    "bg-primary/10"
                                )}
                                data-select-item="true"
                                {...getFileDragProps(file.id, file.readOnly)}
                                onContextMenu={(event) => {
                                  if (isMobile) {
                                    event.preventDefault();
                                  }
                                }}
                                key={file.id}
                                onClick={(event) => {
                                  if (isMobile) {
                                    handleMobileItemClick(file.id, () =>
                                      selectFile(file.id)
                                    );
                                    return;
                                  }
                                  selection.handleItemClick(
                                    event,
                                    file.id,
                                    visibleItemIds
                                  );
                                  handleOpenOnDoubleClick(event, () =>
                                    selectFile(file.id)
                                  );
                                }}
                                onPointerDown={(event) => {
                                  if (
                                    isMobile &&
                                    event.pointerType === "touch"
                                  ) {
                                    beginMobileItemLongPress(file.id);
                                  }
                                }}
                                onPointerUp={handleMobileItemPointerUp}
                                onPointerCancel={handleMobileItemPointerUp}
                                ref={(node: HTMLDivElement | null) => {
                                  if (!node) {
                                    itemRefs.current.delete(file.id);
                                    return;
                                  }
                                  itemRefs.current.set(file.id, node);
                                }}
                              >
                                <Checkbox
                                  checked={selection.selectedIds.has(file.id)}
                                  onCheckedChange={(checked) =>
                                    selection.setItemSelected(
                                      file.id,
                                      checked === true
                                    )
                                  }
                                  onClick={(event) => event.stopPropagation()}
                                />
                                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted/60">
                                  {getFileTypeIcon(fileKind)}
                                </div>
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                  <p className="min-w-0 flex-1 truncate font-medium text-sm">
                                    {file.name}
                                  </p>
                                </div>
                                <div className="ml-auto flex items-center gap-6 text-muted-foreground text-xs">
                                  <span className="min-w-[110px] text-right tabular-nums">
                                    {formatBytes(file.sizeBytes)}
                                  </span>
                                  <span className="min-w-[72px] text-right tabular-nums">
                                    {toUpdatedLabel(
                                      file.updatedAt ?? file.createdAt
                                    )}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                      {selection.selectionRect ? (
                        <div
                          className="pointer-events-none absolute z-20 rounded-md border border-primary/30 bg-primary/10"
                          style={{
                            left: selection.selectionRect.x,
                            top: selection.selectionRect.y,
                            width: selection.selectionRect.width,
                            height: selection.selectionRect.height,
                          }}
                        />
                      ) : null}
                    </motion.div>
                  )}
                </div>
              </div>
            </ContextMenuTrigger>
            {!isMobile ? (
              <ContextMenuContent>
                <ContextMenuItem
                  disabled={isCurrentFolderReadOnly}
                  onClick={() => openCreateNoteDialog(currentFolderId)}
                >
                  <FileText className="size-3.5" />
                  New note
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={isCurrentFolderReadOnly}
                  onClick={() => openCreateFolderDialog(currentFolderId)}
                >
                  <Plus className="size-3.5" />
                  New folder
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={isCurrentFolderReadOnly}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-3.5" />
                  Upload file
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={isCurrentFolderReadOnly}
                  onClick={() => folderInputRef.current?.click()}
                >
                  <FilePlus2 className="size-3.5" />
                  Upload folder
                </ContextMenuItem>
                <ContextMenuItem onClick={() => void loadFolder()}>
                  <ArrowUpDown className="size-3.5" />
                  Refresh
                </ContextMenuItem>
              </ContextMenuContent>
            ) : null}
          </ContextMenu>
        </div>
      </div>

      {selection.selectedCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/95 px-4 py-3 backdrop-blur-sm md:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-auto">
              <p className="font-medium text-sm">
                {selection.selectedCount} selected
              </p>
              <p className="text-muted-foreground text-xs">
                Move or delete the selected items.
              </p>
            </div>
            <Button
              disabled={!breadcrumbs[breadcrumbs.length - 2]?.id}
              onClick={() => setMobileConfirmAction("move")}
              size="sm"
              type="button"
              variant="outline"
            >
              Move up
            </Button>
            <Button
              onClick={() => setMobileConfirmAction("delete")}
              size="sm"
              type="button"
              variant="destructive"
            >
              Delete
            </Button>
            <Button
              onClick={() => selection.clearSelection()}
              size="sm"
              type="button"
              variant="ghost"
            >
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog
        onOpenChange={setMobileCreateMenuOpen}
        open={mobileCreateMenuOpen}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create</DialogTitle>
            <DialogDescription>
              Choose what you want to create in this folder.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button
              disabled={isCurrentFolderReadOnly}
              onClick={() => {
                setMobileCreateMenuOpen(false);
                openCreateNoteDialog(currentFolderId);
              }}
              type="button"
              variant="outline"
            >
              <FileText className="size-4" />
              New note
            </Button>
            <Button
              disabled={isCurrentFolderReadOnly}
              onClick={() => {
                setMobileCreateMenuOpen(false);
                openCreateFolderDialog(currentFolderId);
              }}
              type="button"
              variant="outline"
            >
              <Folder className="size-4" />
              New folder
            </Button>
            <Button
              disabled={isCurrentFolderReadOnly}
              onClick={() => {
                setMobileCreateMenuOpen(false);
                fileInputRef.current?.click();
              }}
              type="button"
              variant="outline"
            >
              <Upload className="size-4" />
              Upload file
            </Button>
            <Button
              disabled={isCurrentFolderReadOnly}
              onClick={() => {
                setMobileCreateMenuOpen(false);
                folderInputRef.current?.click();
              }}
              type="button"
              variant="outline"
            >
              <FilePlus2 className="size-4" />
              Upload folder
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setMobileConfirmAction(null);
          }
        }}
        open={mobileConfirmAction !== null}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {mobileConfirmAction === "delete" ? "Delete items" : "Move items"}
            </DialogTitle>
            <DialogDescription>
              {mobileConfirmAction === "delete"
                ? "This will remove the selected items."
                : "This will move the selected items up one folder."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setMobileConfirmAction(null)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                const items = resolveSelectedActionItems();
                if (mobileConfirmAction === "delete") {
                  void deleteSelectionItems(items);
                } else {
                  const parentFolderId =
                    breadcrumbs[breadcrumbs.length - 2]?.id;
                  if (parentFolderId) {
                    void moveItemsToFolder(
                      Array.from(selection.selectedIds),
                      parentFolderId
                    );
                  }
                }
                triggerHaptic("success");
                setMobileConfirmAction(null);
              }}
              type="button"
              variant={
                mobileConfirmAction === "delete" ? "destructive" : "default"
              }
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setPropertiesOpen} open={propertiesOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Properties</DialogTitle>
            <DialogDescription>
              Item metadata and identifiers.
            </DialogDescription>
          </DialogHeader>
          {propertiesItem ? (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <p>
                <span className="font-medium">Name:</span> {propertiesItem.name}
              </p>
              <p>
                <span className="font-medium">Type:</span> {propertiesItem.kind}
              </p>
              <p>
                <span className="font-medium">ID:</span> {propertiesItem.id}
              </p>
              {propertiesItem.detail ? (
                <p>
                  <span className="font-medium">Detail:</span>{" "}
                  {propertiesItem.detail}
                </p>
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
                : editDialog?.mode === "create-note"
                  ? "Create note"
                  : editDialog?.mode === "rename-folder"
                    ? "Rename folder"
                    : "Rename file"}
            </DialogTitle>
            <DialogDescription>
              {editDialog?.mode === "create-folder"
                ? "Choose a name for the new folder."
                : editDialog?.mode === "create-note"
                  ? "Choose a name for the new note."
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
              onKeyDown={(event) => {
                if (event.key !== "Enter" || !editDialog?.value.trim()) {
                  return;
                }
                event.preventDefault();
                void applyEditDialog();
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
    </div>
  );
}
