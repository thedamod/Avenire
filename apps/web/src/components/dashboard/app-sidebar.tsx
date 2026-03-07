"use client";

import { Button } from "@avenire/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@avenire/ui/components/dropdown-menu";
import { ExpandableTabs } from "@avenire/ui/components/expandable-tabs";
import { Input } from "@avenire/ui/components/input";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@avenire/ui/components/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@avenire/ui/components/tooltip";
import { useHotkey } from "@tanstack/react-hotkeys";
import {
  FilePlus2,
  Files,
  GitBranch,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  PlusCircle,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Waves,
} from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type ComponentProps,
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { NavUser } from "@/components/dashboard/nav-user";
import { TrashDialog } from "@/components/dashboard/trash-dialog";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import type { ChatSummary } from "@/lib/chat-data";
import {
  CHAT_CREATED_EVENT,
  CHAT_NAME_UPDATED_EVENT,
  type ChatCreatedDetail,
  type ChatNameUpdatedDetail,
} from "@/lib/chat-events";
import { useDashboardOverlayStore } from "@/stores/dashboardOverlayStore";
import {
  type DashboardView,
  useDashboardViewStore,
} from "@/stores/dashboardViewStore";
import { useFilesPinsStore } from "@/stores/filesPinsStore";
import { useFilesUiStore } from "@/stores/filesUiStore";
import { TreeView, type TreeDataItem } from "@/components/ui/tree-view";

interface DashboardSidebarUser {
  avatar?: string;
  email: string;
  name: string;
}

function TreeIconImage({
  alt,
  className,
  src,
}: {
  alt: string;
  className?: string;
  src: string;
}) {
  return <img alt={alt} aria-hidden="true" className={className} src={src} />;
}

function TreeFolderClosedIcon({ className }: { className?: string }) {
  return (
    <TreeIconImage
      alt=""
      className={className}
      src="/icons/_folder.svg"
    />
  );
}

function TreeFolderOpenIcon({ className }: { className?: string }) {
  return (
    <TreeIconImage
      alt=""
      className={className}
      src="/icons/_folder_open.svg"
    />
  );
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

const imageExt = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "avif",
  "bmp",
  "ico",
]);
const videoExt = new Set(["mp4", "mov", "m4v", "webm", "avi", "mkv"]);
const audioExt = new Set(["mp3", "wav", "flac", "m4a", "aac", "ogg"]);
const codeExt = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "java",
  "c",
  "cpp",
  "cs",
  "go",
  "rs",
  "php",
  "rb",
  "json",
  "yaml",
  "yml",
  "xml",
  "html",
  "css",
  "scss",
  "md",
  "sql",
]);
const archiveExt = new Set(["zip", "rar", "7z", "tar", "gz", "bz2", "xz"]);
const sheetExt = new Set(["csv", "xls", "xlsx"]);

function ChatListSection({
  title,
  chats,
  activeChatSlug,
  editingChatSlug,
  editingTitle,
  onEditingTitleChange,
  onStartRename,
  onFinishRename,
  onCancelRename,
  onSelect,
  onTogglePin,
  onDelete,
}: {
  title: string;
  chats: ChatSummary[];
  activeChatSlug: string;
  editingChatSlug: string | null;
  editingTitle: string;
  onEditingTitleChange: (value: string) => void;
  onStartRename: (chat: ChatSummary) => void;
  onFinishRename: (chatSlug: string) => void;
  onCancelRename: () => void;
  onSelect: (chatSlug: string) => void;
  onTogglePin: (chatSlug: string, pinned: boolean) => void;
  onDelete: (chatSlug: string) => void;
}) {
  if (chats.length === 0) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>{title}</SidebarGroupLabel>
        <SidebarGroupContent>
          <p className="px-2 py-1 text-muted-foreground text-xs">
            No chats yet.
          </p>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {chats.map((chat) => {
            const isEditing = editingChatSlug === chat.slug;

            return (
              <SidebarMenuItem key={chat.slug}>
                {isEditing ? (
                  <form
                    className="px-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      onFinishRename(chat.slug);
                    }}
                  >
                    <Input
                      autoFocus
                      className="h-7 text-xs"
                      onBlur={() => onFinishRename(chat.slug)}
                      onChange={(event) =>
                        onEditingTitleChange(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          onCancelRename();
                        }
                      }}
                      value={editingTitle}
                    />
                  </form>
                ) : (
                  <>
                    <SidebarMenuButton
                      isActive={activeChatSlug === chat.slug}
                      onClick={() => onSelect(chat.slug)}
                    >
                      {chat.branching ? <GitBranch className="size-4" /> : null}
                      <Tooltip>
                        <TooltipTrigger render={<span className="truncate" />}>
                          {chat.title}
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <span className="max-w-72 break-words">
                            {chat.title}
                          </span>
                        </TooltipContent>
                      </Tooltip>
                    </SidebarMenuButton>

                    {chat.readOnly ? null : (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <SidebarMenuAction
                              onClick={(event) => event.stopPropagation()}
                              showOnHover
                            />
                          }
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation();
                              onStartRename(chat);
                            }}
                          >
                            <Pencil className="size-3.5" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation();
                              onTogglePin(chat.slug, !chat.pinned);
                            }}
                          >
                            {chat.pinned ? (
                              <>
                                <PinOff className="size-3.5" />
                                Unpin
                              </>
                            ) : (
                              <>
                                <Pin className="size-3.5" />
                                Pin
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation();
                              onDelete(chat.slug);
                            }}
                            variant="destructive"
                          >
                            <Trash2 className="size-3.5" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </>
                )}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

async function parseResponse<T>(response: Response): Promise<T | null> {
  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
}

function readPreferredWorkspaceId() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem("preferredWorkspaceId");
}

function getTreeFileIcon(name: string) {
  const ext = name.includes(".")
    ? (name.split(".").pop()?.toLowerCase() ?? "")
    : "";
  const iconByExtension: Record<string, string> = {
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
    md: "/icons/markdown.svg",
    m4a: "/icons/audio.svg",
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

  return (
    <TreeIconImage
      alt=""
      className="size-4 shrink-0"
      src={iconByExtension[ext] ?? "/icons/_file.svg"}
    />
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName.toLowerCase();
  if (tagName === "textarea" || tagName === "select") {
    return true;
  }

  if (tagName !== "input") {
    return false;
  }

  const input = target as HTMLInputElement;
  const ignoredInputTypes = new Set([
    "button",
    "checkbox",
    "color",
    "file",
    "hidden",
    "image",
    "radio",
    "range",
    "reset",
    "submit",
  ]);

  return !ignoredInputTypes.has(input.type.toLowerCase());
}

export function DashboardSidebar({
  user,
  initialChats,
  activeChatSlug,
  ...props
}: ComponentProps<typeof Sidebar> & {
  user: DashboardSidebarUser;
  initialChats: ChatSummary[];
  activeChatSlug: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = useDashboardViewStore((state) => state.view);
  const setView = useDashboardViewStore((state) => state.setView);
  const emitFilesIntent = useFilesUiStore((state) => state.emitIntent);
  const emitFilesSync = useFilesUiStore((state) => state.emitSync);
  const toggleUploadActivityOpen = useFilesUiStore(
    (state) => state.toggleUploadActivityOpen
  );
  const filesSyncVersion = useFilesUiStore((state) => state.sync.version);
  const filesSyncWorkspaceUuid = useFilesUiStore(
    (state) => state.sync.workspaceUuid
  );
  const [chats, setChats] = useState<ChatSummary[]>(initialChats);
  const [editingChatSlug, setEditingChatSlug] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [workspaceUuid, setWorkspaceUuid] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<
    Array<{
      workspaceId: string;
      organizationId: string;
      rootFolderId: string;
      name: string;
    }>
  >([]);
  const [invitations, setInvitations] = useState<
    Array<{
      id: string;
      organizationId: string;
      organizationName: string;
      inviterName: string | null;
      inviterEmail: string;
    }>
  >([]);
  const settingsOpen = useDashboardOverlayStore((state) => state.settingsOpen);
  const setSettingsOpen = useDashboardOverlayStore(
    (state) => state.setSettingsOpen
  );
  const trashOpen = useDashboardOverlayStore((state) => state.trashOpen);
  const setTrashOpen = useDashboardOverlayStore((state) => state.setTrashOpen);
  const [folderTree, setFolderTree] = useState<
    Array<{
      id: string;
      name: string;
      parentId: string | null;
      readOnly?: boolean;
    }>
  >([]);
  const [fileTree, setFileTree] = useState<
    Array<{ id: string; name: string; folderId: string; readOnly?: boolean }>
  >([]);
  const [expandedTreePaths, setExpandedTreePaths] = useState<Set<string>>(
    new Set()
  );
  const fileTreePanelRef = useRef<HTMLDivElement | null>(null);
  const lastTreeRevealTargetRef = useRef<string | null>(null);
  const processedSyncVersionRef = useRef(0);
  const [sseConnected, setSseConnected] = useState(false);
  const treeRefreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const sseRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeView: Exclude<DashboardView, null> = view ?? "chat";
  const currentFolderId = useMemo(() => {
    const match = pathname.match(
      /^\/dashboard\/files\/[^/]+\/folder\/([^/?#]+)/
    );
    return match?.[1] ?? undefined;
  }, [pathname]);
  const currentFileId = searchParams.get("file") ?? undefined;
  const pinnedByWorkspace = useFilesPinsStore((state) => state.pinnedByWorkspace);
  const pinnedItems = useMemo(
    () => (workspaceUuid ? pinnedByWorkspace[workspaceUuid] ?? [] : []),
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
          item.kind === "file" &&
          fileTree.some((file) => file.id === item.id)
      ),
    [fileTree, pinnedItems]
  );
  const expandedTreeStorageKey = useMemo(
    () => (workspaceUuid ? `files-tree-expanded:${workspaceUuid}` : null),
    [workspaceUuid]
  );
  const expandedTreePathIds = useMemo(
    () => Array.from(expandedTreePaths),
    [expandedTreePaths]
  );

  useEffect(() => {
    setChats(initialChats);
  }, [initialChats]);

  useEffect(() => {
    if (pathname.startsWith("/dashboard/files")) {
      if (view !== "files") {
        setView("files");
      }
      return;
    }

    if (pathname.startsWith("/dashboard/chats/")) {
      if (view !== "chat") {
        setView("chat");
      }
      return;
    }

    if (!view) {
      setView("chat");
    }
  }, [pathname, setView, view]);

  useEffect(() => {
    const fileRouteMatch = pathname.match(/^\/dashboard\/files\/([^/]+)/);
    if (fileRouteMatch?.[1]) {
      setWorkspaceUuid(fileRouteMatch[1]);
      if (readPreferredWorkspaceId() !== fileRouteMatch[1]) {
        window.localStorage.setItem("preferredWorkspaceId", fileRouteMatch[1]);
      }
      return;
    }

    const preferredWorkspaceId = readPreferredWorkspaceId();
    if (preferredWorkspaceId) {
      setWorkspaceUuid(preferredWorkspaceId);
      return;
    }

    const activeChatWorkspaceId = activeChatSlug
      ? chats.find((chat) => chat.slug === activeChatSlug)?.workspaceId ?? null
      : null;
    if (activeChatWorkspaceId) {
      setWorkspaceUuid(activeChatWorkspaceId);
      return;
    }

    const fallbackWorkspaceId =
      chats.find((chat) => chat.workspaceId)?.workspaceId ??
      workspaces[0]?.workspaceId ??
      null;
    setWorkspaceUuid(fallbackWorkspaceId);
  }, [activeChatSlug, chats, pathname, workspaces]);

  useEffect(() => {
    const onChatCreated = (event: Event) => {
      const detail = (event as CustomEvent<ChatCreatedDetail>).detail;
      if (!(detail?.id && detail?.title)) {
        return;
      }

      setChats((prev) => {
        if (prev.some((chat) => chat.slug === detail.id)) {
          return prev;
        }

        const now = new Date().toISOString();
        return [
          {
            branching: null,
            createdAt: now,
            id: detail.id,
            lastMessageAt: now,
            pinned: false,
            slug: detail.id,
            title: detail.title,
            updatedAt: now,
            workspaceId: workspaceUuid,
          },
          ...prev,
        ];
      });
    };

    const onChatNameUpdated = (event: Event) => {
      const detail = (event as CustomEvent<ChatNameUpdatedDetail>).detail;
      if (!(detail?.id && detail?.name)) {
        return;
      }

      setChats((prev) =>
        prev.map((chat) =>
          chat.slug === detail.id
            ? {
                ...chat,
                title: detail.name,
                updatedAt: new Date().toISOString(),
              }
            : chat
        )
      );
    };

    window.addEventListener(CHAT_CREATED_EVENT, onChatCreated);
    window.addEventListener(CHAT_NAME_UPDATED_EVENT, onChatNameUpdated);
    return () => {
      window.removeEventListener(CHAT_CREATED_EVENT, onChatCreated);
      window.removeEventListener(CHAT_NAME_UPDATED_EVENT, onChatNameUpdated);
    };
  }, [workspaceUuid]);

  const sortedChats = useMemo(
    () =>
      [...chats].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
    [chats]
  );

  const pinnedChats = useMemo(
    () => sortedChats.filter((chat) => chat.pinned),
    [sortedChats]
  );

  const otherChats = useMemo(
    () => sortedChats.filter((chat) => !chat.pinned),
    [sortedChats]
  );

  const refreshChats = async () => {
    const data = await parseResponse<{ chats: ChatSummary[] }>(
      await fetch("/api/chat/history")
    );
    if (data?.chats) {
      setChats(data.chats);
    }
  };

  const navigateToFilesRoot = async () => {
    try {
      const preferredWorkspaceId =
        typeof window !== "undefined"
          ? window.localStorage.getItem("preferredWorkspaceId")
          : null;
      const preferred = preferredWorkspaceId
        ? workspaces.find(
            (workspace) => workspace.workspaceId === preferredWorkspaceId
          )
        : undefined;
      const targetWorkspace = preferred ?? workspaces[0];

      if (targetWorkspace) {
        setWorkspaceUuid(targetWorkspace.workspaceId);
        router.push(
          `/dashboard/files/${targetWorkspace.workspaceId}/folder/${targetWorkspace.rootFolderId}` as Route
        );
        return;
      }

      const response = await fetch("/api/workspaces", { cache: "no-store" });
      if (!response.ok) {
        router.push("/dashboard/files" as Route);
        return;
      }

      const payload = (await response.json()) as {
        workspaceUuid?: string;
        rootFolderUuid?: string;
      };

      if (payload.workspaceUuid && payload.rootFolderUuid) {
        setWorkspaceUuid(payload.workspaceUuid);
        router.push(
          `/dashboard/files/${payload.workspaceUuid}/folder/${payload.rootFolderUuid}` as Route
        );
        return;
      }

      router.push("/dashboard/files" as Route);
    } catch {
      router.push("/dashboard/files" as Route);
    }
  };

  const loadWorkspaces = useCallback(async () => {
    try {
      const response = await fetch("/api/workspaces/list", {
        cache: "no-store",
      });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as {
        workspaces?: Array<{
          workspaceId: string;
          organizationId: string;
          rootFolderId: string;
          name: string;
        }>;
      };
      setWorkspaces(payload.workspaces ?? []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  const loadInvitations = useCallback(async () => {
    try {
      const response = await fetch("/api/workspaces/invitations", {
        cache: "no-store",
      });
      if (!response.ok) {
        setInvitations([]);
        return;
      }
      const payload = (await response.json()) as {
        invitations?: Array<{
          id: string;
          organizationId: string;
          organizationName: string;
          inviterName: string | null;
          inviterEmail: string;
        }>;
      };
      setInvitations(payload.invitations ?? []);
    } catch {
      setInvitations([]);
    }
  }, []);

  useEffect(() => {
    void loadInvitations();
  }, [loadInvitations]);

  const loadWorkspaceTree = useCallback(async (workspaceId: string) => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/tree`, {
        cache: "no-store",
      });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as {
        folders?: Array<{
          id: string;
          name: string;
          parentId: string | null;
          readOnly?: boolean;
        }>;
        files?: Array<{
          id: string;
          name: string;
          folderId: string;
          readOnly?: boolean;
        }>;
      };
      setFolderTree(payload.folders ?? []);
      setFileTree(
        (payload.files ?? []).map((file) => ({
          id: file.id,
          name: file.name,
          folderId: file.folderId,
          readOnly: file.readOnly,
        }))
      );
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
        void loadWorkspaceTree(workspaceId);
      }, 150);
    },
    [loadWorkspaceTree]
  );

  useEffect(() => {
    if (!pathname.startsWith("/dashboard/files")) {
      return;
    }

    const match = pathname.match(
      /^\/dashboard\/files\/([^/]+)\/folder\/([^/]+)/
    );
    const currentWorkspace = match?.[1] ?? workspaceUuid;
    if (!currentWorkspace) {
      return;
    }

    setWorkspaceUuid(currentWorkspace);
    void loadWorkspaceTree(currentWorkspace);
  }, [loadWorkspaceTree, pathname, workspaceUuid]);

  useEffect(() => {
    if (!expandedTreeStorageKey) {
      return;
    }
    setExpandedTreePaths(new Set());
    setHasSavedExpandedTreeState(false);
    setHydratedTreeStorageKey(null);
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
    if (activeView !== "files" || folderTree.length === 0) {
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
  }, [activeView, currentFileId, currentFolderId, fileTree, folderTree]);

  useEffect(() => {
    if (activeView !== "files") {
      lastTreeRevealTargetRef.current = null;
      return;
    }

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
        if (Date.now() - startedAt < MAX_WAIT_MS) {
          retryTimer = setTimeout(tryHighlightTarget, RETRY_DELAY_MS);
        }
        return;
      }
      lastTreeRevealTargetRef.current = targetPath;
      target.scrollIntoView({ block: "nearest" });
    }, 180);

    return () => {
      clearTimeout(timer);
    };
  }, [activeView, currentFileId, currentFolderId, fileTree.length, folderTree.length]);

  useEffect(() => {
    if (activeView !== "files" || !workspaceUuid) {
      return;
    }

    const onFocus = () => {
      void loadWorkspaceTree(workspaceUuid);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadWorkspaceTree(workspaceUuid);
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [activeView, loadWorkspaceTree, workspaceUuid]);

  useEffect(() => {
    if (activeView !== "files" || !workspaceUuid || filesSyncVersion === 0) {
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
    activeView,
    filesSyncVersion,
    filesSyncWorkspaceUuid,
    refreshWorkspaceTreeDebounced,
    workspaceUuid,
  ]);

  useEffect(() => {
    if (activeView !== "files" || !workspaceUuid) {
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
          refreshWorkspaceTreeDebounced(workspaceUuid);
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
      if (treeRefreshDebounceRef.current) {
        clearTimeout(treeRefreshDebounceRef.current);
        treeRefreshDebounceRef.current = null;
      }
    };
  }, [activeView, refreshWorkspaceTreeDebounced, workspaceUuid]);

  const createChat = async () => {
    setView("chat");
    router.push("/dashboard/chats/new" as Route);
  };

  const updateChat = async (
    chatSlug: string,
    updates: { title?: string; pinned?: boolean }
  ) => {
    const data = await parseResponse<{ chat: ChatSummary }>(
      await fetch(`/api/chats/${chatSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
    );

    if (!data?.chat) {
      return;
    }

    setChats((prev) =>
      prev.map((chat) => (chat.slug === chatSlug ? data.chat : chat))
    );
  };

  const deleteChat = async (chatSlug: string) => {
    const response = await fetch(
      `/api/chat?${new URLSearchParams({ id: chatSlug }).toString()}`,
      {
        method: "DELETE",
      }
    );

    if (!response.ok) {
      return;
    }

    const remaining = chats.filter((chat) => chat.slug !== chatSlug);
    setChats(remaining);

    if (activeChatSlug === chatSlug) {
      if (remaining.length > 0) {
        router.push(`/dashboard/chats/${remaining[0].slug}` as Route);
      } else {
        await createChat();
      }
      router.refresh();
    }
  };

  const setActiveOrganization = async (organizationId?: string | null) => {
    if (!organizationId) {
      return;
    }
    const response = await fetch("/api/auth/organization/set-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    if (!response.ok) {
      throw new Error("Unable to switch active organization");
    }
  };

  const switchWorkspace = async (workspace: {
    workspaceId: string;
    organizationId?: string;
    rootFolderId: string;
    name: string;
  }) => {
    try {
      await setActiveOrganization(workspace.organizationId ?? null);
    } catch {
      return;
    }
    setWorkspaceUuid(workspace.workspaceId);
    setView("files");
    window.localStorage.setItem("preferredWorkspaceId", workspace.workspaceId);
    router.push(
      `/dashboard/files/${workspace.workspaceId}/folder/${workspace.rootFolderId}` as Route
    );
  };

  const createWorkspace = async (name: string) => {
    const response = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      let message = "Unable to create workspace.";
      try {
        const payload = (await response.json()) as { error?: string };
        if (payload.error) {
          message = payload.error;
        }
      } catch {
        // ignore parse errors
      }
      throw new Error(message);
    }

    const payload = (await response.json()) as {
      workspace?: {
        workspaceId: string;
        organizationId: string;
        rootFolderId: string;
        name: string;
      };
    };
    if (!payload.workspace) {
      throw new Error("Workspace was created but could not be loaded.");
    }

    await loadWorkspaces();
    await switchWorkspace(payload.workspace);
  };

  const respondToInvitation = async (
    invitationId: string,
    action: "accept" | "decline"
  ) => {
    const response = await fetch(
      `/api/workspaces/invitations/${invitationId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }
    );
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as {
      organizationId?: string | null;
      workspace?: {
        workspaceId: string;
        organizationId: string;
        rootFolderId: string;
        name: string;
      } | null;
    };

    await loadInvitations();

    if (action === "accept") {
      if (payload.organizationId) {
        await setActiveOrganization(payload.organizationId);
      }
      await loadWorkspaces();
      if (payload.workspace) {
        await switchWorkspace(payload.workspace);
      }
    }
  };

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
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentId: targetFolderId }),
        });
      } else {
        const sourceFile = fileTree.find((file) => file.id === item.id);
        if (sourceFile?.readOnly) {
          return;
        }
        await fetch(`/api/workspaces/${workspaceUuid}/files/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: targetFolderId }),
        });
      }

      await loadWorkspaceTree(workspaceUuid);
      emitFilesSync(workspaceUuid);
      router.refresh();
    },
    [
      emitFilesSync,
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

      const response = await fetch(`/api/workspaces/${workspaceUuid}/items/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "delete",
          items,
        }),
      });

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
        void navigateToFilesRoot();
      }

      await loadWorkspaceTree(workspaceUuid);
      emitFilesSync(workspaceUuid);
      router.refresh();
    },
    [
      currentFileId,
      currentFolderId,
      emitFilesSync,
      loadWorkspaceTree,
      navigateToFilesRoot,
      router,
      workspaceUuid,
    ]
  );

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

    for (const folder of [...folderTree].sort((a, b) => a.name.localeCompare(b.name))) {
      const folderItem: TreeDataItem = {
        id: folder.id,
        name: folder.name,
        draggable: !folder.readOnly,
        droppable: !folder.readOnly,
        icon: TreeFolderClosedIcon,
        openIcon: TreeFolderOpenIcon,
        selectedIcon: TreeFolderOpenIcon,
        onClick: () => {
          router.push(`/dashboard/files/${workspaceUuid}/folder/${folder.id}` as Route);
        },
        actions: (
          <>
            {!folder.readOnly ? (
              <Button
                onClick={(event) => {
                  event.stopPropagation();
                  router.push(`/dashboard/files/${workspaceUuid}/folder/${folder.id}` as Route);
                  emitFilesIntent("uploadFile");
                }}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <FilePlus2 className="size-3.5" />
                <span className="sr-only">Upload file</span>
              </Button>
            ) : null}
            {!folder.readOnly ? (
              <Button
                onClick={(event) => {
                  event.stopPropagation();
                  void deleteTreeItems([{ id: folder.id, kind: "folder" }]);
                }}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <Trash2 className="size-3.5" />
                <span className="sr-only">Delete folder</span>
              </Button>
            ) : null}
          </>
        ),
      };
      addChild(folder.parentId, folderItem);
    }

    for (const file of [...fileTree].sort((a, b) => a.name.localeCompare(b.name))) {
      const FileIcon = () => getTreeFileIcon(file.name);
      addChild(file.folderId, {
        id: file.id,
        name: file.name,
        draggable: !file.readOnly,
        icon: FileIcon,
        onClick: () => {
          router.push(
            `/dashboard/files/${workspaceUuid}/folder/${file.folderId}?file=${file.id}` as Route
          );
        },
        actions: !file.readOnly ? (
          <Button
            onClick={(event) => {
              event.stopPropagation();
              void deleteTreeItems([{ id: file.id, kind: "file" }]);
            }}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <Trash2 className="size-3.5" />
            <span className="sr-only">Delete file</span>
          </Button>
        ) : null,
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
    emitFilesIntent,
    fileTree,
    folderTree,
    router,
    workspaceUuid,
  ]);

  useHotkey(
    "Mod+1",
    (event) => {
      event.preventDefault();
      if (!pathname.startsWith("/dashboard/chats/")) {
        const chatSlug = activeChatSlug || chats[0]?.slug;
        if (chatSlug) {
          router.push(`/dashboard/chats/${chatSlug}` as Route);
          return;
        }
        router.push("/dashboard/chats/new" as Route);
        return;
      }
      setView("chat");
    },
    { ignoreInputs: true }
  );

  useHotkey(
    "Mod+2",
    (event) => {
      event.preventDefault();
      setView("flashcards");
    },
    { ignoreInputs: true }
  );

  useHotkey(
    "Mod+3",
    (event) => {
      event.preventDefault();
      if (!pathname.startsWith("/dashboard/files")) {
        void navigateToFilesRoot();
        return;
      }
      setView("files");
    },
    { ignoreInputs: true }
  );

  useHotkey(
    "Mod+N",
    (event) => {
      event.preventDefault();
      setEditingChatSlug(null);
      setEditingTitle("");
      void createChat();
    },
    { ignoreInputs: true }
  );

  useHotkey(
    "Mod+K",
    (event) => {
      event.preventDefault();
      if (activeView !== "files") {
        void navigateToFilesRoot();
        return;
      }
      emitFilesIntent("focusSearch");
    },
    { ignoreInputs: true }
  );

  useHotkey(
    "Mod+Shift+N",
    (event) => {
      event.preventDefault();
      if (activeView !== "files") {
        return;
      }
      emitFilesIntent("createFolder");
    },
    { ignoreInputs: true }
  );

  useHotkey(
    "Mod+U",
    (event) => {
      event.preventDefault();
      if (activeView !== "files") {
        return;
      }
      emitFilesIntent("uploadFile");
    },
    { ignoreInputs: true }
  );

  useHotkey(
    "Mod+Shift+U",
    (event) => {
      event.preventDefault();
      if (activeView !== "files") {
        return;
      }
      emitFilesIntent("uploadFolder");
    },
    { ignoreInputs: true }
  );

  useHotkey(
    "Mod+O",
    (event) => {
      event.preventDefault();
      if (activeView !== "files") {
        return;
      }
      emitFilesIntent("openSelection");
    },
    { ignoreInputs: true }
  );

  useHotkey(
    "Delete",
    (event) => {
      if (isTypingTarget(event.target)) {
        return;
      }
      event.preventDefault();
      if (activeView !== "files") {
        return;
      }
      emitFilesIntent("deleteSelection");
    },
    { ignoreInputs: true }
  );

  useHotkey(
    "Alt+ArrowLeft",
    (event) => {
      if (isTypingTarget(event.target)) {
        return;
      }
      event.preventDefault();
      if (activeView !== "files") {
        return;
      }
      emitFilesIntent("goParent");
    },
    { ignoreInputs: true }
  );

  useHotkey(
    "Mod+Shift+M",
    (event) => {
      event.preventDefault();
      if (activeView !== "files") {
        return;
      }
      emitFilesIntent("moveSelectionUp");
    },
    { ignoreInputs: true }
  );

  useHotkey(
    "Mod+Shift+O",
    (event) => {
      event.preventDefault();
      if (activeView !== "files") {
        return;
      }
      emitFilesIntent("newNote");
    },
    { ignoreInputs: true }
  );

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader className="pb-0">
        <div className="flex items-center justify-end px-2 pt-1">
          <SidebarTrigger className="rounded-md" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <TooltipProvider delay={280}>
          <SidebarGroup className="px-2 pb-1">
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <ExpandableTabs
              allowDeselect={false}
              className="mt-1"
              items={[
                { value: "chat", label: "Chat", icon: MessageSquare },
                { value: "flashcards", label: "Flashcards", icon: Sparkles },
                { value: "files", label: "Files", icon: Files },
              ]}
              persistenceKey="dashboard-workspace-tabs"
              onValueChange={(nextValue) => {
                if (!nextValue) {
                  return;
                }
                const nextView = nextValue as Exclude<DashboardView, null>;
                if (nextView === activeView) {
                  return;
                }

                if (
                  nextView === "files" &&
                  !pathname.startsWith("/dashboard/files")
                ) {
                  void navigateToFilesRoot();
                  return;
                }

                if (
                  nextView === "chat" &&
                  !pathname.startsWith("/dashboard/chats/")
                ) {
                  const chatSlug = activeChatSlug || chats[0]?.slug;
                  if (chatSlug) {
                    router.push(`/dashboard/chats/${chatSlug}` as Route);
                    return;
                  }
                  void createChat();
                  return;
                }

                setView(nextView);
              }}
              value={activeView}
            />
          </SidebarGroup>
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {activeView === "chat" ? (
              <div className="absolute inset-0 overflow-y-auto">
                <SidebarGroup>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SectionButton
                        icon={PlusCircle}
                        label="New Chat"
                        onClick={() => {
                          setEditingChatSlug(null);
                          setEditingTitle("");
                          void createChat();
                        }}
                      />
                      <SectionButton
                        icon={Search}
                        label="Refresh Chats"
                        onClick={() => {
                          void refreshChats();
                        }}
                      />
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>

                <ChatListSection
                  activeChatSlug={activeChatSlug}
                  chats={pinnedChats}
                  editingChatSlug={editingChatSlug}
                  editingTitle={editingTitle}
                  onCancelRename={() => {
                    setEditingChatSlug(null);
                    setEditingTitle("");
                  }}
                  onDelete={(chatSlug) => {
                    setEditingChatSlug(null);
                    setEditingTitle("");
                    void deleteChat(chatSlug);
                  }}
                  onEditingTitleChange={setEditingTitle}
                  onFinishRename={(chatSlug) => {
                    void updateChat(chatSlug, { title: editingTitle });
                    setEditingChatSlug(null);
                    setEditingTitle("");
                  }}
                  onSelect={(chatSlug) => {
                    setEditingChatSlug(null);
                    setEditingTitle("");
                    router.push(`/dashboard/chats/${chatSlug}` as Route);
                  }}
                  onStartRename={(chat) => {
                    setEditingChatSlug(chat.slug);
                    setEditingTitle(chat.title);
                  }}
                  onTogglePin={(chatSlug, pinned) => {
                    void updateChat(chatSlug, { pinned });
                  }}
                  title="Pinned Chats"
                />

                <ChatListSection
                  activeChatSlug={activeChatSlug}
                  chats={otherChats}
                  editingChatSlug={editingChatSlug}
                  editingTitle={editingTitle}
                  onCancelRename={() => {
                    setEditingChatSlug(null);
                    setEditingTitle("");
                  }}
                  onDelete={(chatSlug) => {
                    setEditingChatSlug(null);
                    setEditingTitle("");
                    void deleteChat(chatSlug);
                  }}
                  onEditingTitleChange={setEditingTitle}
                  onFinishRename={(chatSlug) => {
                    void updateChat(chatSlug, { title: editingTitle });
                    setEditingChatSlug(null);
                    setEditingTitle("");
                  }}
                  onSelect={(chatSlug) => {
                    setEditingChatSlug(null);
                    setEditingTitle("");
                    router.push(`/dashboard/chats/${chatSlug}` as Route);
                  }}
                  onStartRename={(chat) => {
                    setEditingChatSlug(chat.slug);
                    setEditingTitle(chat.title);
                  }}
                  onTogglePin={(chatSlug, pinned) => {
                    void updateChat(chatSlug, { pinned });
                  }}
                  title="Other Chats"
                />
              </div>
            ) : activeView === "files" ? (
              <div
                className="absolute inset-0 flex flex-col overflow-hidden"
                ref={fileTreePanelRef}
              >
                <SidebarGroup>
                  <SidebarGroupLabel>Files</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SectionButton
                        icon={FilePlus2}
                        label="New Note"
                        onClick={() => {
                          emitFilesIntent("newNote");
                        }}
                      />
                      <SectionButton
                        icon={Search}
                        label="Search Files"
                        onClick={() => {
                          emitFilesIntent("focusSearch");
                        }}
                      />
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>

	                <SidebarGroup className="min-h-0 flex-1">
	                  {workspaceUuid && (pinnedFolders.length > 0 || pinnedFiles.length > 0) ? (
	                    <>
	                      <SidebarGroupLabel>Pinned</SidebarGroupLabel>
	                      <SidebarGroupContent>
	                        <SidebarMenu>
	                          {pinnedFolders.map((item) => (
	                            <SidebarMenuItem key={`pinned-folder-${item.id}`}>
	                              <SidebarMenuButton
	                                onClick={() => {
	                                  router.push(
	                                    `/dashboard/files/${item.workspaceId}/folder/${item.id}` as Route
	                                  );
	                                }}
	                              >
	                                <Pin className="size-4" />
	                                <span className="truncate">{item.name}</span>
	                              </SidebarMenuButton>
	                            </SidebarMenuItem>
	                          ))}
	                          {pinnedFiles.map((item) => (
	                            <SidebarMenuItem key={`pinned-file-${item.id}`}>
	                              <SidebarMenuButton
	                                onClick={() => {
	                                  if (!item.folderId) {
	                                    return;
	                                  }
	                                  router.push(
	                                    `/dashboard/files/${item.workspaceId}/folder/${item.folderId}?file=${item.id}` as Route
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
                      <div className="h-full overflow-y-auto pr-1">
                        <TreeView
                          className="rounded-xl"
                          data={sidebarTreeData}
                          initialExpandedItemIds={expandedTreePathIds}
                          initialSelectedItemId={currentFileId ?? currentFolderId}
                          onExpandedChange={(itemIds) => {
                            setExpandedTreePaths(new Set(itemIds));
                          }}
                          onMoveItem={(draggedItemId, targetItemId) => {
                            const draggedFolder = folderTree.find((item) => item.id === draggedItemId);
                            if (draggedFolder) {
                              void moveTreeItem({ id: draggedItemId, kind: "folder" }, targetItemId);
                              return;
                            }
                            const draggedFile = fileTree.find((item) => item.id === draggedItemId);
                            if (draggedFile) {
                              void moveTreeItem({ id: draggedItemId, kind: "file" }, targetItemId);
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
                              void navigateToFilesRoot();
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
            ) : (
              <div className="absolute inset-0 overflow-y-auto">
                <SidebarGroup>
                  <SidebarGroupLabel>
                    {activeView === "flashcards" ? "Flashcards" : "Files"}
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <p className="px-2 py-1 text-muted-foreground text-xs">
                      {activeView === "flashcards"
                        ? "Flashcard tools and sets will appear here."
                        : "File uploads and attached resources will appear here."}
                    </p>
                  </SidebarGroupContent>
                </SidebarGroup>
              </div>
            )}
          </div>
        </TooltipProvider>
      </SidebarContent>
      <SidebarFooter>
        <div className="mb-2 flex items-center justify-between gap-2 px-2">
          <div className="flex items-center gap-1">
            <Button
              className="h-8 w-8"
              onClick={() => setTrashOpen(true)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Trash2 className="size-4" />
              <span className="sr-only">Open trash</span>
            </Button>
            <Button
              className="h-8 w-8"
              onClick={() => toggleUploadActivityOpen()}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Waves className="size-4" />
              <span className="sr-only">Open upload activity</span>
            </Button>
            <Button
              className="h-8 w-8"
              onClick={() => setSettingsOpen(true)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Settings className="size-4" />
              <span className="sr-only">Open settings</span>
            </Button>
          </div>
        </div>
        <NavUser
          activeWorkspaceId={workspaceUuid}
          invitations={invitations}
          onAcceptInvitation={(invitationId) => {
            void respondToInvitation(invitationId, "accept");
          }}
          onCreateWorkspace={createWorkspace}
          onDeclineInvitation={(invitationId) => {
            void respondToInvitation(invitationId, "decline");
          }}
          onSwitchWorkspace={(workspace) => {
            void switchWorkspace(workspace);
          }}
          user={user}
          workspaces={workspaces}
        />
        <SettingsDialog onOpenChange={setSettingsOpen} open={settingsOpen} />
        <TrashDialog
          onOpenChange={setTrashOpen}
          open={trashOpen}
          workspaceUuid={workspaceUuid}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
