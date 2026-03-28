"use client";

import { Button } from "@avenire/ui/components/button";
import { Input } from "@avenire/ui/components/input";
import {
  SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, } from "@avenire/ui/components/sidebar";
import Fuse, { type IFuseOptions } from "fuse.js";
import { FilePlus as FilePlus2, Files, PushPin as Pin, Trash as Trash2 } from "@phosphor-icons/react"
import type { Route } from "next";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  type ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type TreeDataItem, TreeView } from "@/components/ui/tree-view";
import { useHaptics } from "@/hooks/use-haptics";
import { cn } from "@/lib/utils";
import {
  readWorkspaceTreeCache,
  writeWorkspaceTreeCache,
} from "@/lib/workspace-tree-cache";
import { invalidateWorkspaceFolderCache } from "@/lib/workspace-folder-cache";
import { invalidateWorkspaceMarkdownCache } from "@/lib/workspace-markdown-cache";
import {
  type CommandPaletteFileNode,
  type CommandPaletteFolderNode,
  commandPaletteActions,
} from "@/stores/commandPaletteStore";
import {
  type PinnedExplorerItem,
  useFilesPinsStore,
} from "@/stores/filesPinsStore";
import { filesUiActions, useFilesUiStore } from "@/stores/filesUiStore";

interface SidebarFolderNode extends CommandPaletteFolderNode {}

interface SidebarFileNode extends CommandPaletteFileNode {}

interface FilesInvalidationEventPayload {
  folderId?: string | null;
}

interface FilesRealtimeConnectionOptions {
  onConnectedChange: (connected: boolean) => void;
  onInvalidate: (payload: FilesInvalidationEventPayload | null) => void;
  workspaceUuid: string;
}

const SIDEBAR_SEARCH_SCORE_MAX = 0.45;
const SIDEBAR_SEARCH_FUSE_OPTIONS: IFuseOptions<{ name: string }> = {
  includeScore: true,
  ignoreLocation: true,
  keys: ["name"],
  threshold: 0.6,
};

const TREE_FILE_ICON_SRC_BY_EXTENSION: Record<string, string> = {
  astro: "/icons/astro.svg",
  avif: "/icons/image.svg",
  bmp: "/icons/image.svg",
  c: "/icons/c.svg",
  cpp: "/icons/cpp.svg",
  css: "/icons/css.svg",
  csv: "/icons/csv.svg",
  gif: "/icons/image.svg",
  go: "/icons/go.svg",
  html: "/icons/html.svg",
  ico: "/icons/image.svg",
  java: "/icons/java.svg",
  jpeg: "/icons/image.svg",
  jpg: "/icons/image.svg",
  js: "/icons/javascript.svg",
  json: "/icons/json.svg",
  jsx: "/icons/react.svg",
  m4a: "/icons/audio.svg",
  markdown: "/icons/markdown.svg",
  md: "/icons/markdown.svg",
  mkv: "/icons/video.svg",
  mov: "/icons/video.svg",
  mp3: "/icons/audio.svg",
  mp4: "/icons/video.svg",
  pdf: "/icons/pdf.svg",
  php: "/icons/php.svg",
  png: "/icons/image.svg",
  py: "/icons/python.svg",
  rb: "/icons/ruby.svg",
  rs: "/icons/rust.svg",
  scss: "/icons/scss.svg",
  sql: "/icons/database.svg",
  svg: "/icons/svg.svg",
  tar: "/icons/zip.svg",
  ts: "/icons/typescript.svg",
  tsx: "/icons/react-typescript.svg",
  txt: "/icons/text.svg",
  wav: "/icons/audio.svg",
  webm: "/icons/video.svg",
  webp: "/icons/image.svg",
  xls: "/icons/csv.svg",
  xlsx: "/icons/csv.svg",
  xml: "/icons/xml.svg",
  yaml: "/icons/yaml.svg",
  yml: "/icons/yaml.svg",
  zip: "/icons/zip.svg",
};
const treeFileIconComponentCache = new Map<
  string,
  ComponentType<{ className?: string }>
>();

function TreeIconImage({
  alt,
  className,
  src,
}: {
  alt: string;
  className?: string;
  src: string;
}) {
  return (
    <Image
      alt={alt}
      aria-hidden="true"
      className={className}
      height={16}
      src={src}
      unoptimized
      width={16}
    />
  );
}

function TreeFolderClosedIcon({ className }: { className?: string }) {
  return (
    <TreeIconImage alt="" className={className} src="/icons/_folder.svg" />
  );
}

function TreeFolderOpenIcon({ className }: { className?: string }) {
  return (
    <TreeIconImage alt="" className={className} src="/icons/_folder_open.svg" />
  );
}

function getTreeFileIconSrc(name: string) {
  const ext = name.includes(".")
    ? (name.split(".").pop()?.toLowerCase() ?? "")
    : "";
  return TREE_FILE_ICON_SRC_BY_EXTENSION[ext] ?? "/icons/_file.svg";
}

function getTreeFileIconComponent(name: string) {
  const iconSrc = getTreeFileIconSrc(name);
  const cached = treeFileIconComponentCache.get(iconSrc);
  if (cached) {
    return cached;
  }

  const TreeFileIcon = ({ className }: { className?: string }) => (
    <TreeIconImage
      alt=""
      className={cn("size-4 shrink-0", className)}
      src={iconSrc}
    />
  );
  TreeFileIcon.displayName = `TreeFileIcon(${iconSrc})`;
  treeFileIconComponentCache.set(iconSrc, TreeFileIcon);
  return TreeFileIcon;
}

function createFilesRealtimeConnection({
  onConnectedChange,
  onInvalidate,
  workspaceUuid,
}: FilesRealtimeConnectionOptions) {
  let closed = false;
  let eventSource: EventSource | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const cleanupCurrent = () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };

  const clearRetryTimer = () => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (closed) {
      return;
    }

    clearRetryTimer();
    retryTimer = setTimeout(() => {
      connect().catch(() => undefined);
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
        onConnectedChange(false);
        scheduleReconnect();
        return;
      }

      const payload = (await tokenResponse.json()) as { token?: string };
      if (!payload.token) {
        onConnectedChange(false);
        scheduleReconnect();
        return;
      }

      cleanupCurrent();

      const url = new URL("/api/realtime/files", window.location.origin);
      url.searchParams.set("workspaceUuid", workspaceUuid);
      url.searchParams.set("token", payload.token);

      eventSource = new EventSource(url.toString());
      eventSource.onopen = () => {
        onConnectedChange(true);
      };
      eventSource.onerror = () => {
        onConnectedChange(false);
        cleanupCurrent();
        scheduleReconnect();
      };
      eventSource.addEventListener("files.invalidate", (event) => {
        const detail = (() => {
          try {
            return JSON.parse((event as MessageEvent<string>).data) as
              | FilesInvalidationEventPayload
              | null;
          } catch {
            return null;
          }
        })();

        onInvalidate(detail);
      });
    } catch {
      onConnectedChange(false);
      scheduleReconnect();
    }
  };

  return {
    start() {
      connect().catch(() => undefined);
    },
    stop() {
      closed = true;
      onConnectedChange(false);
      clearRetryTimer();
      cleanupCurrent();
    },
  };
}

function SectionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton onClick={onClick}>
        <Icon className="size-4" />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function FilesSidebarPanel({
  currentFileId,
  currentFolderId,
  navigateToFilesRoot,
  workspaceUuid,
}: {
  currentFileId?: string;
  currentFolderId?: string;
  navigateToFilesRoot: () => Promise<void>;
  workspaceUuid: string | null;
}) {
  const router = useRouter();
  const triggerHaptic = useHaptics();
  const filesSyncVersion = useFilesUiStore((state) => state.sync.version);
  const filesSyncWorkspaceUuid = useFilesUiStore(
    (state) => state.sync.workspaceUuid
  );
  const pinnedByWorkspace = useFilesPinsStore(
    (state) => state.pinnedByWorkspace
  );
  const [filesNameSearchQuery, setFilesNameSearchQuery] = useState("");
  const [folderTree, setFolderTree] = useState<SidebarFolderNode[]>([]);
  const [fileTree, setFileTree] = useState<SidebarFileNode[]>([]);
  const [expandedTreePaths, setExpandedTreePaths] = useState<Set<string>>(
    new Set()
  );
  const [sseConnected, setSseConnected] = useState(false);
  const fileTreePanelRef = useRef<HTMLDivElement | null>(null);
  const lastTreeRevealTargetRef = useRef<string | null>(null);
  const processedSyncVersionRef = useRef(0);
  const treeRefreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const loadedWorkspaceRef = useRef<string | null>(null);
  const prevWorkspaceUuidRef = useRef<string | null>(null);
  const expandedTreeStorageKey = workspaceUuid
    ? `files-tree-expanded:${workspaceUuid}`
    : null;
  const expandedTreePathIds = useMemo(
    () => Array.from(expandedTreePaths),
    [expandedTreePaths]
  );
  const pinnedItems = useMemo<PinnedExplorerItem[]>(
    () => (workspaceUuid ? (pinnedByWorkspace[workspaceUuid] ?? []) : []),
    [pinnedByWorkspace, workspaceUuid]
  );
  const pinnedFolders = useMemo(
    () =>
      pinnedItems.filter(
        (item) =>
          item.kind === "folder" &&
          folderTree.some((folder) => folder.id === item.id)
      ),
    [folderTree, pinnedItems]
  );
  const pinnedFiles = useMemo(
    () =>
      pinnedItems.filter(
        (item) =>
          item.kind === "file" && fileTree.some((file) => file.id === item.id)
      ),
    [fileTree, pinnedItems]
  );

  useEffect(() => {
    commandPaletteActions.setFileIndex({
      fileOpen: false,
      generalOpen: false,
      workspaceUuid,
      folders: folderTree,
      files: fileTree,
    });
  }, [fileTree, folderTree, workspaceUuid]);

  const loadWorkspaceTree = useCallback(async (workspaceId: string) => {
    const cached = readWorkspaceTreeCache<SidebarFolderNode, SidebarFileNode>(
      workspaceId
    );
    if (cached) {
      setFolderTree(cached.folders);
      setFileTree(cached.files);
    }

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/tree`, {
        cache: "no-store",
      });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as {
        folders?: SidebarFolderNode[];
        files?: SidebarFileNode[];
      };
      setFolderTree(payload.folders ?? []);
      setFileTree(
        (payload.files ?? []).map((file) => ({
          folderId: file.folderId,
          id: file.id,
          name: file.name,
          readOnly: file.readOnly,
        }))
      );
      writeWorkspaceTreeCache<SidebarFolderNode, SidebarFileNode>(workspaceId, {
        files: payload.files ?? [],
        folders: payload.folders ?? [],
      });
    } catch {
      // ignore
    }
  }, []);

  const refreshWorkspaceTreeDebounced = useCallback(
    (workspaceId: string) => {
      if (treeRefreshDebounceRef.current) {
        clearTimeout(treeRefreshDebounceRef.current);
      }

      treeRefreshDebounceRef.current = setTimeout(() => {
        loadWorkspaceTree(workspaceId).catch(() => undefined);
      }, 150);
    },
    [loadWorkspaceTree]
  );

  useEffect(() => {
    if (!workspaceUuid) {
      return;
    }
    if (loadedWorkspaceRef.current === workspaceUuid) {
      return;
    }
    loadedWorkspaceRef.current = workspaceUuid;
    loadWorkspaceTree(workspaceUuid).catch(() => undefined);
  }, [loadWorkspaceTree, workspaceUuid]);

  useEffect(() => {
    if (!expandedTreeStorageKey) {
      return;
    }
    if (prevWorkspaceUuidRef.current !== expandedTreeStorageKey) {
      prevWorkspaceUuidRef.current = expandedTreeStorageKey;
      setExpandedTreePaths(new Set());
    }
  }, [expandedTreeStorageKey]);

  useEffect(() => {
    if (!expandedTreeStorageKey) {
      return;
    }
    window.localStorage.setItem(
      expandedTreeStorageKey,
      JSON.stringify(Array.from(expandedTreePaths))
    );
  }, [expandedTreePaths, expandedTreeStorageKey]);

  useEffect(() => {
    if (folderTree.length === 0) {
      return;
    }

    const foldersById = new Map(
      folderTree.map((folder) => [folder.id, folder])
    );
    const nextExpanded = new Set(
      folderTree.filter((folder) => !folder.parentId).map((folder) => folder.id)
    );

    const expandAncestors = (folderId: string) => {
      let cursor = foldersById.get(folderId);
      while (cursor) {
        nextExpanded.add(cursor.id);
        if (!cursor.parentId) {
          break;
        }
        cursor = foldersById.get(cursor.parentId);
      }
    };

    if (currentFolderId) {
      expandAncestors(currentFolderId);
    }

    if (currentFileId) {
      const file = fileTree.find((entry) => entry.id === currentFileId);
      if (file?.folderId) {
        expandAncestors(file.folderId);
      }
    }

    setExpandedTreePaths((previous) => {
      const merged = new Set([...previous, ...nextExpanded]);
      if (
        merged.size === previous.size &&
        Array.from(previous).every((id) => merged.has(id))
      ) {
        return previous;
      }
      return merged;
    });
  }, [currentFileId, currentFolderId, fileTree, folderTree]);

  useEffect(() => {
    const targetPath = currentFileId ?? currentFolderId;
    if (!targetPath) {
      return;
    }
    if (lastTreeRevealTargetRef.current === targetPath) {
      return;
    }

    const timer = setTimeout(() => {
      const panel = fileTreePanelRef.current;
      const target = panel?.querySelector<HTMLElement>(
        `[data-tree-id="${targetPath}"]`
      );
      if (!target) {
        return;
      }
      lastTreeRevealTargetRef.current = targetPath;
      target.scrollIntoView({ block: "nearest" });
    }, 180);

    return () => {
      clearTimeout(timer);
    };
  }, [currentFileId, currentFolderId, fileTree.length, folderTree.length]);

  useEffect(() => {
    if (!workspaceUuid) {
      return;
    }

    const onFocus = () => {
      loadWorkspaceTree(workspaceUuid).catch(() => undefined);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        loadWorkspaceTree(workspaceUuid).catch(() => undefined);
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadWorkspaceTree, workspaceUuid]);

  useEffect(() => {
    if (!workspaceUuid || filesSyncVersion === 0) {
      return;
    }
    if (filesSyncWorkspaceUuid && filesSyncWorkspaceUuid !== workspaceUuid) {
      return;
    }
    if (filesSyncVersion <= processedSyncVersionRef.current) {
      return;
    }
    processedSyncVersionRef.current = filesSyncVersion;
    refreshWorkspaceTreeDebounced(workspaceUuid);
  }, [
    filesSyncVersion,
    filesSyncWorkspaceUuid,
    refreshWorkspaceTreeDebounced,
    workspaceUuid,
  ]);

  useEffect(() => {
    if (!workspaceUuid) {
      setSseConnected(false);
      return;
    }

    const connection = createFilesRealtimeConnection({
      onConnectedChange: setSseConnected,
      onInvalidate: (detail) => {
        invalidateWorkspaceFolderCache(workspaceUuid, detail?.folderId);
        invalidateWorkspaceMarkdownCache(workspaceUuid);
        refreshWorkspaceTreeDebounced(workspaceUuid);
      },
      workspaceUuid,
    });
    connection.start();

    return () => {
      connection.stop();
      if (treeRefreshDebounceRef.current) {
        clearTimeout(treeRefreshDebounceRef.current);
        treeRefreshDebounceRef.current = null;
      }
    };
  }, [refreshWorkspaceTreeDebounced, workspaceUuid]);

  const navigateToFolder = useCallback(
    (folderId: string, routeWorkspaceUuid: string) => {
      const href =
        `/workspace/files/${routeWorkspaceUuid}/folder/${folderId}` as Route;
      router.prefetch(href);
      router.push(href);
    },
    [router]
  );

  const navigateToFile = useCallback(
    (fileId: string, folderId: string, routeWorkspaceUuid: string) => {
      const href =
        `/workspace/files/${routeWorkspaceUuid}/folder/${folderId}?file=${fileId}` as Route;
      router.prefetch(href);
      router.push(href);
    },
    [router]
  );

  const isFolderDescendant = useCallback(
    (folderId: string, possibleDescendantId: string) => {
      const byId = new Map(folderTree.map((folder) => [folder.id, folder]));
      let cursor = byId.get(possibleDescendantId);
      while (cursor?.parentId) {
        if (cursor.parentId === folderId) {
          return true;
        }
        cursor = byId.get(cursor.parentId);
      }
      return false;
    },
    [folderTree]
  );

  const moveTreeItem = useCallback(
    async (
      item: { id: string; kind: "file" | "folder" },
      targetFolderId: string
    ) => {
      if (!workspaceUuid) {
        return;
      }
      const targetFolder = folderTree.find(
        (folder) => folder.id === targetFolderId
      );
      if (targetFolder?.readOnly) {
        return;
      }

      if (item.kind === "folder") {
        const sourceFolder = folderTree.find((folder) => folder.id === item.id);
        if (sourceFolder?.readOnly) {
          return;
        }
        if (
          item.id === targetFolderId ||
          isFolderDescendant(item.id, targetFolderId)
        ) {
          return;
        }
        await fetch(`/api/workspaces/${workspaceUuid}/folders/${item.id}`, {
          body: JSON.stringify({ parentId: targetFolderId }),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        });
      } else {
        const sourceFile = fileTree.find((file) => file.id === item.id);
        if (sourceFile?.readOnly) {
          return;
        }
        await fetch(`/api/workspaces/${workspaceUuid}/files/${item.id}`, {
          body: JSON.stringify({ folderId: targetFolderId }),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        });
      }

      if (item.kind === "folder") {
        setFolderTree((previous) => {
          const next = previous.map((folder) =>
            folder.id === item.id
              ? { ...folder, parentId: targetFolderId }
              : folder
          );
          writeWorkspaceTreeCache(workspaceUuid, {
            files: fileTree,
            folders: next,
          });
          return next;
        });
      } else {
        setFileTree((previous) => {
          const next = previous.map((file) =>
            file.id === item.id ? { ...file, folderId: targetFolderId } : file
          );
          writeWorkspaceTreeCache(workspaceUuid, {
            files: next,
            folders: folderTree,
          });
          return next;
        });
      }
      filesUiActions.emitSync(workspaceUuid);
      router.refresh();
    },
    [
      fileTree,
      folderTree,
      isFolderDescendant,
      loadWorkspaceTree,
      router,
      workspaceUuid,
    ]
  );

  const deleteTreeItems = useCallback(
    async (items: Array<{ id: string; kind: "file" | "folder" }>) => {
      if (!(workspaceUuid && items.length > 0)) {
        return;
      }

      const response = await fetch(
        `/api/workspaces/${workspaceUuid}/items/bulk`,
        {
          body: JSON.stringify({
            items,
            operation: "delete",
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      );

      if (!response.ok) {
        return;
      }

      if (
        items.some(
          (item) =>
            (item.kind === "file" && item.id === currentFileId) ||
            (item.kind === "folder" && item.id === currentFolderId)
        )
      ) {
        await navigateToFilesRoot();
      }

      const folderIdsToRemove = new Set<string>();
      const childFoldersByParent = new Map<string | null, string[]>();
      for (const folder of folderTree) {
        const siblings = childFoldersByParent.get(folder.parentId ?? null) ?? [];
        siblings.push(folder.id);
        childFoldersByParent.set(folder.parentId ?? null, siblings);
      }
      const collectFolderIds = (folderId: string) => {
        if (folderIdsToRemove.has(folderId)) {
          return;
        }
        folderIdsToRemove.add(folderId);
        for (const childId of childFoldersByParent.get(folderId) ?? []) {
          collectFolderIds(childId);
        }
      };
      for (const item of items) {
        if (item.kind === "folder") {
          collectFolderIds(item.id);
        }
      }

      const nextFolders = folderTree.filter(
        (folder) => !folderIdsToRemove.has(folder.id)
      );
      const nextFiles = fileTree.filter(
        (file) =>
          !items.some(
            (item) =>
              (item.kind === "file" && item.id === file.id) ||
              (item.kind === "folder" && folderIdsToRemove.has(file.folderId ?? ""))
          )
      );

      setFolderTree(nextFolders);
      setFileTree(nextFiles);
      writeWorkspaceTreeCache(workspaceUuid, {
        files: nextFiles,
        folders: nextFolders,
      });
      filesUiActions.emitSync(workspaceUuid);
      router.refresh();
    },
    [
      currentFileId,
      currentFolderId,
      loadWorkspaceTree,
      navigateToFilesRoot,
      router,
      workspaceUuid,
    ]
  );

  const fileSearchNeedle = filesNameSearchQuery.trim().toLowerCase();
  const folderFuse = useMemo(
    () => new Fuse(folderTree, SIDEBAR_SEARCH_FUSE_OPTIONS),
    [folderTree]
  );
  const fileFuse = useMemo(
    () => new Fuse(fileTree, SIDEBAR_SEARCH_FUSE_OPTIONS),
    [fileTree]
  );
  const fuzzyMatchedFolders = useMemo(() => {
    if (!fileSearchNeedle) {
      return folderTree;
    }
    const exactMatches = folderTree.filter((folder) =>
      folder.name.toLowerCase().includes(fileSearchNeedle)
    );
    if (fileSearchNeedle.length < 2) {
      return exactMatches;
    }
    const fuzzyMatches = folderFuse
      .search(fileSearchNeedle)
      .filter((result) => (result.score ?? 1) <= SIDEBAR_SEARCH_SCORE_MAX)
      .map((result) => result.item);
    const unique = new Map<string, SidebarFolderNode>();
    for (const match of exactMatches) {
      unique.set(match.id, match);
    }
    for (const match of fuzzyMatches) {
      unique.set(match.id, match);
    }
    return Array.from(unique.values());
  }, [fileSearchNeedle, folderFuse, folderTree]);
  const fuzzyMatchedFiles = useMemo(() => {
    if (!fileSearchNeedle) {
      return fileTree;
    }
    const exactMatches = fileTree.filter((file) =>
      file.name.toLowerCase().includes(fileSearchNeedle)
    );
    if (fileSearchNeedle.length < 2) {
      return exactMatches;
    }
    const fuzzyMatches = fileFuse
      .search(fileSearchNeedle)
      .filter((result) => (result.score ?? 1) <= SIDEBAR_SEARCH_SCORE_MAX)
      .map((result) => result.item);
    const unique = new Map<string, SidebarFileNode>();
    for (const match of exactMatches) {
      unique.set(match.id, match);
    }
    for (const match of fuzzyMatches) {
      unique.set(match.id, match);
    }
    return Array.from(unique.values());
  }, [fileFuse, fileSearchNeedle, fileTree]);

  const filteredFileTreeState = useMemo(() => {
    if (!fileSearchNeedle) {
      return {
        files: fileTree,
        folders: folderTree,
      };
    }

    const folderById = new Map(folderTree.map((folder) => [folder.id, folder]));
    const allowedFolderIds = new Set<string>();
    const allowedFileIds = new Set<string>();

    for (const folder of fuzzyMatchedFolders) {
      allowedFolderIds.add(folder.id);
      let cursor = folder.parentId;
      while (cursor) {
        allowedFolderIds.add(cursor);
        cursor = folderById.get(cursor)?.parentId ?? null;
      }
    }

    for (const file of fuzzyMatchedFiles) {
      allowedFileIds.add(file.id);
      let cursor: string | null = file.folderId;
      while (cursor) {
        allowedFolderIds.add(cursor);
        cursor = folderById.get(cursor)?.parentId ?? null;
      }
    }

    return {
      files: fileTree.filter((file) => allowedFileIds.has(file.id)),
      folders: folderTree.filter((folder) => allowedFolderIds.has(folder.id)),
    };
  }, [
    fileSearchNeedle,
    fileTree,
    folderTree,
    fuzzyMatchedFiles,
    fuzzyMatchedFolders,
  ]);
  const filteredPinnedFolders = useMemo(() => {
    if (!fileSearchNeedle) {
      return pinnedFolders;
    }
    const folderIdSet = new Set(fuzzyMatchedFolders.map((folder) => folder.id));
    return pinnedFolders.filter((item) => folderIdSet.has(item.id));
  }, [fileSearchNeedle, fuzzyMatchedFolders, pinnedFolders]);
  const filteredPinnedFiles = useMemo(() => {
    if (!fileSearchNeedle) {
      return pinnedFiles;
    }
    const fileIdSet = new Set(fuzzyMatchedFiles.map((file) => file.id));
    return pinnedFiles.filter((item) => fileIdSet.has(item.id));
  }, [fileSearchNeedle, fuzzyMatchedFiles, pinnedFiles]);

  const sidebarTreeData = useMemo<TreeDataItem[]>(() => {
    if (!workspaceUuid) {
      return [];
    }

    const childrenByFolderId = new Map<string | null, TreeDataItem[]>();
    const addChild = (parentId: string | null, item: TreeDataItem) => {
      const existing = childrenByFolderId.get(parentId) ?? [];
      existing.push(item);
      childrenByFolderId.set(parentId, existing);
    };

    for (const folder of [...filteredFileTreeState.folders].sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const folderItem: TreeDataItem = {
        actions: (
          <>
            {folder.readOnly ? null : (
              <Button
                onClick={(event) => {
                  event.stopPropagation();
                  navigateToFolder(folder.id, workspaceUuid);
                  filesUiActions.emitIntent("uploadFile");
                }}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <FilePlus2 className="size-3.5" />
                <span className="sr-only">Upload file</span>
              </Button>
            )}
            {folder.readOnly ? null : (
              <Button
                onClick={(event) => {
                  event.stopPropagation();
                  deleteTreeItems([{ id: folder.id, kind: "folder" }]).catch(
                    () => undefined
                  );
                }}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <Trash2 className="size-3.5" />
                <span className="sr-only">Delete folder</span>
              </Button>
            )}
          </>
        ),
        draggable: !folder.readOnly,
        droppable: !folder.readOnly,
        icon: TreeFolderClosedIcon,
        id: folder.id,
        name: folder.name,
        onClick: () => {
          navigateToFolder(folder.id, workspaceUuid);
        },
        openIcon: TreeFolderOpenIcon,
        selectedIcon: TreeFolderOpenIcon,
      };
      addChild(folder.parentId, folderItem);
    }

    for (const file of [...filteredFileTreeState.files].sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      addChild(file.folderId, {
        actions: file.readOnly ? null : (
          <Button
            onClick={(event) => {
              event.stopPropagation();
              deleteTreeItems([{ id: file.id, kind: "file" }]).catch(
                () => undefined
              );
            }}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <Trash2 className="size-3.5" />
            <span className="sr-only">Delete file</span>
          </Button>
        ),
        draggable: !file.readOnly,
        icon: getTreeFileIconComponent(file.name),
        id: file.id,
        name: file.name,
        onClick: () => {
          navigateToFile(file.id, file.folderId, workspaceUuid);
        },
      });
    }

    const attachChildren = (parentId: string | null): TreeDataItem[] =>
      (childrenByFolderId.get(parentId) ?? []).map((item) => ({
        ...item,
        children: attachChildren(item.id),
      }));

    return attachChildren(null);
  }, [
    deleteTreeItems,
    filteredFileTreeState.files,
    filteredFileTreeState.folders,
    navigateToFile,
    navigateToFolder,
    workspaceUuid,
  ]);

  return (
    <div
      className="absolute inset-0 flex flex-col overflow-hidden"
      ref={fileTreePanelRef}
    >
      <SidebarGroup>
        <SidebarGroupLabel>
          {sseConnected ? "Manage Live" : "Manage"}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SectionButton
              icon={FilePlus2}
              label="New Note"
              onClick={() => {
                filesUiActions.emitIntent("newNote");
                triggerHaptic("selection");
              }}
            />
          </SidebarMenu>
          <Input
            className="mt-2 h-8 text-xs"
            onChange={(event) => setFilesNameSearchQuery(event.target.value)}
            placeholder="Search items by name..."
            value={filesNameSearchQuery}
          />
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup className="min-h-0 flex-1">
        {workspaceUuid &&
        (filteredPinnedFolders.length > 0 || filteredPinnedFiles.length > 0) ? (
          <>
            <SidebarGroupLabel>Pinned</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredPinnedFolders.map((item) => (
                  <SidebarMenuItem key={`pinned-folder-${item.id}`}>
                    <SidebarMenuButton
                      onClick={() => {
                        navigateToFolder(item.id, item.workspaceId);
                      }}
                    >
                      <Pin className="size-4" />
                      <span className="truncate">{item.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {filteredPinnedFiles.map((item) => (
                  <SidebarMenuItem key={`pinned-file-${item.id}`}>
                    <SidebarMenuButton
                      onClick={() => {
                        if (!item.folderId) {
                          return;
                        }
                        navigateToFile(
                          item.id,
                          item.folderId,
                          item.workspaceId
                        );
                      }}
                    >
                      <Pin className="size-4" />
                      <span className="truncate">{item.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </>
        ) : null}
        <SidebarGroupLabel>File Tree</SidebarGroupLabel>
        <SidebarGroupContent className="min-h-0">
          {workspaceUuid && folderTree.length > 0 ? (
            <div className="h-full min-w-0 overflow-y-auto pr-1">
              <TreeView
                className="min-w-0 rounded-xl"
                data={sidebarTreeData}
                initialExpandedItemIds={expandedTreePathIds}
                initialSelectedItemId={currentFileId ?? currentFolderId}
                onExpandedChange={(itemIds) => {
                  setExpandedTreePaths(new Set(itemIds));
                }}
                onMoveItem={(draggedItemId, targetItemId) => {
                  const draggedFolder = folderTree.find(
                    (item) => item.id === draggedItemId
                  );
                  if (draggedFolder) {
                    moveTreeItem(
                      { id: draggedItemId, kind: "folder" },
                      targetItemId
                    ).catch(() => undefined);
                    return;
                  }
                  const draggedFile = fileTree.find(
                    (item) => item.id === draggedItemId
                  );
                  if (draggedFile) {
                    moveTreeItem(
                      { id: draggedItemId, kind: "file" },
                      targetItemId
                    ).catch(() => undefined);
                  }
                }}
                onSelectChange={(item) => {
                  if (!item) {
                    return;
                  }
                  item.onClick?.();
                }}
              />
            </div>
          ) : (
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => {
                    navigateToFilesRoot().catch(() => undefined);
                  }}
                >
                  <Files className="size-4" />
                  <span>Workspace</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          )}
        </SidebarGroupContent>
      </SidebarGroup>
    </div>
  );
}
