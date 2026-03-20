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
  useSidebar,
} from "@avenire/ui/components/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@avenire/ui/components/tooltip";
import { useHotkey } from "@tanstack/react-hotkeys";
import Fuse, { type IFuseOptions } from "fuse.js";
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
  Settings,
  Sparkles,
  Trash2,
  Waves,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type ComponentProps,
  type ComponentType,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChatIcon } from "@/components/chat/chat-icon";
import { ThinkingGlyph } from "@/components/chat/thinking-indicator";
import { NavUser } from "@/components/dashboard/nav-user";
import { TrashDialog } from "@/components/dashboard/trash-dialog";
import { FlashcardsSidebarPanel } from "@/components/flashcards/sidebar-panel";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { type TreeDataItem, TreeView } from "@/components/ui/tree-view";
import { useHaptics } from "@/hooks/use-haptics";
import type { ChatSummary } from "@/lib/chat-data";
import {
  CHAT_CREATED_EVENT,
  CHAT_NAME_UPDATED_EVENT,
  CHAT_STREAM_STATUS_EVENT,
  type ChatCreatedDetail,
  type ChatNameUpdatedDetail,
  type ChatStreamStatusDetail,
} from "@/lib/chat-events";
import { isChatIconName } from "@/lib/chat-icons";
import { useDashboardOverlayStore } from "@/stores/dashboardOverlayStore";
import { useFilesPinsStore } from "@/stores/filesPinsStore";
import { filesUiActions, useFilesUiStore } from "@/stores/filesUiStore";

interface DashboardSidebarUser {
  avatar?: string;
  email: string;
  name: string;
}

interface SidebarFolderNode {
  id: string;
  name: string;
  parentId: string | null;
  readOnly?: boolean;
}

interface SidebarFileNode {
  folderId: string;
  id: string;
  name: string;
  readOnly?: boolean;
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
    <TreeIconImage alt="" className={className} src="/icons/_folder.svg" />
  );
}

function TreeFolderOpenIcon({ className }: { className?: string }) {
  return (
    <TreeIconImage alt="" className={className} src="/icons/_folder_open.svg" />
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
const DASHBOARD_FLASHCARDS_ROUTE_REGEX = /^\/workspace\/flashcards\/([^/?#]+)/;
const DASHBOARD_FILES_FOLDER_ROUTE_REGEX =
  /^\/workspace\/files\/[^/]+\/folder\/([^/?#]+)/;
const SIDEBAR_SEARCH_SCORE_MAX = 0.45;
const SIDEBAR_SEARCH_FUSE_OPTIONS: IFuseOptions<{ name: string }> = {
  includeScore: true,
  ignoreLocation: true,
  keys: ["name"],
  threshold: 0.6,
};

function ChatListSection({
  title,
  chats,
  activeChatSlug,
  editingChatSlug,
  editingTitle,
  pendingChatSlug,
  onEditingTitleChange,
  onStartRename,
  onFinishRename,
  onCancelRename,
  onSelect,
  onTogglePin,
  onDelete,
  hideWhenEmpty = false,
}: {
  title: string;
  chats: ChatSummary[];
  activeChatSlug: string;
  editingChatSlug: string | null;
  editingTitle: string;
  pendingChatSlug: string | null;
  onEditingTitleChange: (value: string) => void;
  onStartRename: (chat: ChatSummary) => void;
  onFinishRename: (chatSlug: string) => void;
  onCancelRename: () => void;
  onSelect: (chatSlug: string) => void;
  onTogglePin: (chatSlug: string, pinned: boolean) => void;
  onDelete: (chatSlug: string) => void;
  hideWhenEmpty?: boolean;
}) {
  if (chats.length === 0) {
    if (hideWhenEmpty) {
      return null;
    }
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
            const isPending = pendingChatSlug === chat.slug;
            const iconName = isChatIconName(chat.icon) ? chat.icon : null;

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
                      {isPending ? (
                        <ThinkingGlyph className="size-4" />
                      ) : iconName ? (
                        <ChatIcon
                          className="text-muted-foreground"
                          name={iconName}
                        />
                      ) : null}
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
  activeChatSlug: activeChatSlugProp,
  ...props
}: ComponentProps<typeof Sidebar> & {
  user: DashboardSidebarUser;
  initialChats: ChatSummary[];
  activeChatSlug?: string;
}) {
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const triggerHaptic = useHaptics();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filesSyncVersion = useFilesUiStore((state) => state.sync.version);
  const filesSyncWorkspaceUuid = useFilesUiStore(
    (state) => state.sync.workspaceUuid
  );
  const [chats, setChats] = useState<ChatSummary[]>(initialChats);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [filesNameSearchQuery, setFilesNameSearchQuery] = useState("");
  const [editingChatSlug, setEditingChatSlug] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [pendingChatSlug, setPendingChatSlug] = useState<string | null>(null);
  const [activeChatSlugOverride, setActiveChatSlugOverride] = useState<
    string | null
  >(null);
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
  const [folderTree, setFolderTree] = useState<SidebarFolderNode[]>([]);
  const [fileTree, setFileTree] = useState<SidebarFileNode[]>([]);
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
  const isChatsRoute =
    pathname === "/workspace/chats" || pathname.startsWith("/workspace/chats/");
  const activeChatSlugFromPath = useMemo(() => {
    const match = pathname.match(/^\/workspace\/chats\/([^/?#]+)/);
    if (!match?.[1] || match[1] === "new") {
      return "";
    }
    return match[1];
  }, [pathname]);
  const activeChatSlug =
    activeChatSlugFromPath ||
    activeChatSlugOverride ||
    activeChatSlugProp ||
    "";
  const sessionCloseRef = useRef<{
    chatId: string;
    sent: boolean;
    sessionId: string;
  } | null>(null);
  const sessionCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  let routeView: "chat" | "flashcards" | "files" | null = null;
  if (pathname.startsWith("/workspace/flashcards")) {
    routeView = "flashcards";
  } else if (pathname.startsWith("/workspace/files")) {
    routeView = "files";
  } else if (isChatsRoute) {
    routeView = "chat";
  }
  const activeView = routeView;
  const closeMobileSidebar = useCallback(() => {
    setOpenMobile(false);
  }, [setOpenMobile]);
  const navigate = useCallback(
    (href: Route) => {
      startTransition(() => {
        router.push(href);
      });
    },
    [router]
  );
  const currentFlashcardSetId = useMemo(() => {
    const match = pathname.match(DASHBOARD_FLASHCARDS_ROUTE_REGEX);
    return match?.[1] ?? undefined;
  }, [pathname]);
  const currentFolderId = useMemo(() => {
    const match = pathname.match(DASHBOARD_FILES_FOLDER_ROUTE_REGEX);
    return match?.[1] ?? undefined;
  }, [pathname]);
  const currentFileId = searchParams.get("file") ?? undefined;
  const pinnedByWorkspace = useFilesPinsStore(
    (state) => state.pinnedByWorkspace
  );
  const pinnedItems = useMemo(
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
  const expandedTreeStorageKey = useMemo(
    () => (workspaceUuid ? `files-tree-expanded:${workspaceUuid}` : null),
    [workspaceUuid]
  );
  const expandedTreePathIds = useMemo(
    () => Array.from(expandedTreePaths),
    [expandedTreePaths]
  );

  useEffect(() => {
    router.prefetch("/workspace/chats" as Route);
    router.prefetch("/workspace/flashcards" as Route);
    router.prefetch("/workspace/files" as Route);
  }, [router]);

  useEffect(() => {
    const clearSessionCloseTimer = () => {
      if (sessionCloseTimerRef.current) {
        clearTimeout(sessionCloseTimerRef.current);
        sessionCloseTimerRef.current = null;
      }
    };

    const startSessionCloseTimer = () => {
      if (sessionCloseRef.current?.sent || !sessionCloseRef.current?.chatId) {
        return;
      }
      if (sessionCloseTimerRef.current) {
        return;
      }

      sessionCloseTimerRef.current = setTimeout(
        () => {
          const scope = sessionCloseRef.current;
          sessionCloseTimerRef.current = null;
          if (!scope || scope.sent || !scope.chatId) {
            return;
          }
          scope.sent = true;

          const payload = JSON.stringify({
            kind: "session-close",
            chatId: scope.chatId,
            sessionId: scope.sessionId,
          });

          if (navigator.sendBeacon) {
            navigator.sendBeacon(
              "/api/chat",
              new Blob([payload], { type: "application/json" })
            );
            return;
          }

          void fetch("/api/chat", {
            body: payload,
            keepalive: true,
            headers: {
              "Content-Type": "application/json",
            },
            method: "POST",
          }).catch(() => undefined);
        },
        5 * 60 * 1000
      );
    };

    const updateSessionScope = () => {
      const nextChatId = activeChatSlug || "";
      if (!nextChatId || nextChatId === "new") {
        if (routeView === "chat") {
          sessionCloseRef.current = null;
        }
        return;
      }

      if (sessionCloseRef.current?.chatId !== nextChatId) {
        sessionCloseRef.current = {
          chatId: nextChatId,
          sent: false,
          sessionId:
            globalThis.crypto?.randomUUID?.() ??
            `session-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        };
      }
    };

    const sendCloseNow = () => {
      const scope = sessionCloseRef.current;
      if (!scope || scope.sent || !scope.chatId) {
        return;
      }
      scope.sent = true;
      const payload = JSON.stringify({
        kind: "session-close",
        chatId: scope.chatId,
        sessionId: scope.sessionId,
      });

      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/chat",
          new Blob([payload], { type: "application/json" })
        );
        return;
      }

      void fetch("/api/chat", {
        body: payload,
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      }).catch(() => undefined);
    };

    updateSessionScope();

    if (routeView === "chat") {
      clearSessionCloseTimer();
    } else if (sessionCloseRef.current?.chatId) {
      startSessionCloseTimer();
    }

    const handlePageHide = () => {
      clearSessionCloseTimer();
      sendCloseNow();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (routeView === "chat") {
          return;
        }
        startSessionCloseTimer();
        return;
      }

      clearSessionCloseTimer();
    };

    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearSessionCloseTimer();
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeChatSlug, routeView]);

  useEffect(() => {
    setChats((prev) => {
      if (prev === initialChats) {
        return prev;
      }
      if (
        prev.length === initialChats.length &&
        prev.every((chat, i) => chat.id === initialChats[i]?.id)
      ) {
        return prev;
      }
      return initialChats;
    });
  }, [initialChats]);

  const pinsRehydratedRef = useRef(false);
  useEffect(() => {
    if (!pinsRehydratedRef.current) {
      pinsRehydratedRef.current = true;
      useFilesPinsStore.persist.rehydrate();
    }
  }, []);

  useEffect(() => {
    const fileRouteMatch = pathname.match(/^\/workspace\/files\/([^/]+)/);
    if (fileRouteMatch?.[1]) {
      setWorkspaceUuid((prev) =>
        prev === fileRouteMatch[1] ? prev : fileRouteMatch[1]
      );
      if (readPreferredWorkspaceId() !== fileRouteMatch[1]) {
        window.localStorage.setItem("preferredWorkspaceId", fileRouteMatch[1]);
      }
      return;
    }

    const preferredWorkspaceId = readPreferredWorkspaceId();
    if (preferredWorkspaceId) {
      setWorkspaceUuid((prev) =>
        prev === preferredWorkspaceId ? prev : preferredWorkspaceId
      );
      return;
    }

    const activeChatWorkspaceId = activeChatSlug
      ? (chats.find((chat) => chat.slug === activeChatSlug)?.workspaceId ??
        null)
      : null;
    if (activeChatWorkspaceId) {
      setWorkspaceUuid((prev) =>
        prev === activeChatWorkspaceId ? prev : activeChatWorkspaceId
      );
      return;
    }

    const fallbackWorkspaceId =
      chats.find((chat) => chat.workspaceId)?.workspaceId ??
      workspaces[0]?.workspaceId ??
      null;
    setWorkspaceUuid((prev) =>
      prev === fallbackWorkspaceId ? prev : fallbackWorkspaceId
    );
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
            icon: null,
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

      if (
        pathname === "/workspace/chats/new" ||
        activeChatSlug === "new" ||
        detail.fromId === "new"
      ) {
        setActiveChatSlugOverride(detail.id);
        window.history.replaceState(
          { chatId: detail.id },
          "",
          `/workspace/chats/${detail.id}`
        );
      }
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
                icon: detail.icon ?? chat.icon ?? null,
                updatedAt: new Date().toISOString(),
              }
            : chat
        )
      );
    };

    const onChatStreamStatus = (event: Event) => {
      const detail = (event as CustomEvent<ChatStreamStatusDetail>).detail;
      if (!detail?.chatId) {
        return;
      }
      if (detail.status === "submitted" || detail.status === "streaming") {
        setPendingChatSlug(detail.chatId);
        return;
      }
      if (detail.status === "ready" || detail.status === "error") {
        setPendingChatSlug((prev) => (prev === detail.chatId ? null : prev));
      }
    };

    window.addEventListener(CHAT_CREATED_EVENT, onChatCreated);
    window.addEventListener(CHAT_NAME_UPDATED_EVENT, onChatNameUpdated);
    window.addEventListener(CHAT_STREAM_STATUS_EVENT, onChatStreamStatus);
    return () => {
      window.removeEventListener(CHAT_CREATED_EVENT, onChatCreated);
      window.removeEventListener(CHAT_NAME_UPDATED_EVENT, onChatNameUpdated);
      window.removeEventListener(CHAT_STREAM_STATUS_EVENT, onChatStreamStatus);
    };
  }, [activeChatSlug, pathname, router, workspaceUuid]);

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
  const filteredChatNeedle = chatSearchQuery.trim().toLowerCase();
  const filteredPinnedChats = useMemo(
    () =>
      pinnedChats.filter((chat) =>
        filteredChatNeedle
          ? chat.title.toLowerCase().includes(filteredChatNeedle)
          : true
      ),
    [filteredChatNeedle, pinnedChats]
  );
  const filteredOtherChats = useMemo(
    () =>
      otherChats.filter((chat) =>
        filteredChatNeedle
          ? chat.title.toLowerCase().includes(filteredChatNeedle)
          : true
      ),
    [filteredChatNeedle, otherChats]
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

  const navigateToFilesRoot = useCallback(async () => {
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
          `/workspace/files/${targetWorkspace.workspaceId}/folder/${targetWorkspace.rootFolderId}` as Route
        );
        return;
      }

      const response = await fetch("/api/workspaces", { cache: "no-store" });
      if (!response.ok) {
        router.push("/workspace/files" as Route);
        return;
      }

      const payload = (await response.json()) as {
        workspaceUuid?: string;
        rootFolderUuid?: string;
      };

      if (payload.workspaceUuid && payload.rootFolderUuid) {
        setWorkspaceUuid(payload.workspaceUuid);
        router.push(
          `/workspace/files/${payload.workspaceUuid}/folder/${payload.rootFolderUuid}` as Route
        );
        return;
      }

      router.push("/workspace/files" as Route);
    } catch {
      router.push("/workspace/files" as Route);
    }
  }, [router, workspaces]);

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

  const activeOrgSyncRef = useRef<string | null>(null);
  useEffect(() => {
    const match = pathname.match(/^\/workspace\/files\/([^/]+)/);
    const workspaceIdFromRoute = match?.[1];
    if (!(workspaceIdFromRoute && workspaces.length > 0)) {
      return;
    }
    const targetWorkspace = workspaces.find(
      (workspace) => workspace.workspaceId === workspaceIdFromRoute
    );
    if (!targetWorkspace?.organizationId) {
      return;
    }
    const syncKey = `${workspaceIdFromRoute}:${targetWorkspace.organizationId}`;
    if (activeOrgSyncRef.current === syncKey) {
      return;
    }
    activeOrgSyncRef.current = syncKey;
    void setActiveOrganization(targetWorkspace.organizationId).catch(() => {
      activeOrgSyncRef.current = null;
    });
  }, [pathname, workspaces]);

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
        folders?: SidebarFolderNode[];
        files?: SidebarFileNode[];
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
    if (!pathname.startsWith("/workspace/files")) {
      return;
    }

    const match = pathname.match(
      /^\/workspace\/files\/([^/]+)\/folder\/([^/]+)/
    );
    const currentWorkspace = match?.[1];
    if (!currentWorkspace) {
      return;
    }

    setWorkspaceUuid((prev) =>
      prev === currentWorkspace ? prev : currentWorkspace
    );
  }, [pathname]);

  const loadedWorkspaceRef = useRef<string | null>(null);
  useEffect(() => {
    if (!workspaceUuid) {
      return;
    }
    if (loadedWorkspaceRef.current === workspaceUuid) {
      return;
    }
    loadedWorkspaceRef.current = workspaceUuid;
    void loadWorkspaceTree(workspaceUuid);
  }, [loadWorkspaceTree, workspaceUuid]);

  const prevWorkspaceUuidRef = useRef<string | null>(null);
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
        return;
      }
      lastTreeRevealTargetRef.current = targetPath;
      target.scrollIntoView({ block: "nearest" });
    }, 180);

    return () => {
      clearTimeout(timer);
    };
  }, [
    activeView,
    currentFileId,
    currentFolderId,
    fileTree.length,
    folderTree.length,
  ]);

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
    navigate("/workspace/chats/new" as Route);
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
        navigate(`/workspace/chats/${remaining[0].slug}` as Route);
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
    window.localStorage.setItem("preferredWorkspaceId", workspace.workspaceId);
    navigate(
      `/workspace/files/${workspace.workspaceId}/folder/${workspace.rootFolderId}` as Route
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
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation: "delete",
            items,
          }),
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
        void navigateToFilesRoot();
      }

      await loadWorkspaceTree(workspaceUuid);
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
        id: folder.id,
        name: folder.name,
        draggable: !folder.readOnly,
        droppable: !folder.readOnly,
        icon: TreeFolderClosedIcon,
        openIcon: TreeFolderOpenIcon,
        selectedIcon: TreeFolderOpenIcon,
        onClick: () => {
          router.push(
            `/workspace/files/${workspaceUuid}/folder/${folder.id}` as Route
          );
        },
        actions: (
          <>
            {folder.readOnly ? null : (
              <Button
                onClick={(event) => {
                  event.stopPropagation();
                  router.push(
                    `/workspace/files/${workspaceUuid}/folder/${folder.id}` as Route
                  );
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
                  void deleteTreeItems([{ id: folder.id, kind: "folder" }]);
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
      };
      addChild(folder.parentId, folderItem);
    }

    for (const file of [...filteredFileTreeState.files].sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const FileIcon = () => getTreeFileIcon(file.name);
      addChild(file.folderId, {
        id: file.id,
        name: file.name,
        draggable: !file.readOnly,
        icon: FileIcon,
        onClick: () => {
          router.push(
            `/workspace/files/${workspaceUuid}/folder/${file.folderId}?file=${file.id}` as Route
          );
        },
        actions: file.readOnly ? null : (
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
        ),
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
    router,
    workspaceUuid,
  ]);

  useHotkey(
    "Mod+1",
    (event) => {
      event.preventDefault();
      if (!isChatsRoute) {
        const chatSlug = activeChatSlug || chats[0]?.slug;
        if (chatSlug) {
          navigate(`/workspace/chats/${chatSlug}` as Route);
          return;
        }
        navigate("/workspace/chats" as Route);
        return;
      }
    },
    { ignoreInputs: true }
  );

  useHotkey(
    "Mod+2",
    (event) => {
      event.preventDefault();
      if (!pathname.startsWith("/workspace/flashcards")) {
        navigate("/workspace/flashcards" as Route);
        return;
      }
    },
    { ignoreInputs: true }
  );

  useHotkey(
    "Mod+3",
    (event) => {
      event.preventDefault();
      if (!pathname.startsWith("/workspace/files")) {
        void navigateToFilesRoot();
        return;
      }
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
      filesUiActions.emitIntent("focusSearch");
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
      filesUiActions.emitIntent("createFolder");
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
      filesUiActions.emitIntent("uploadFile");
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
      filesUiActions.emitIntent("uploadFolder");
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
      filesUiActions.emitIntent("openSelection");
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
      filesUiActions.emitIntent("deleteSelection");
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
      filesUiActions.emitIntent("goParent");
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
      filesUiActions.emitIntent("moveSelectionUp");
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
      filesUiActions.emitIntent("newNote");
    },
    { ignoreInputs: true }
  );

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader className="pb-0">
        <div className="flex items-center justify-end px-2 pt-1">
          <SidebarTrigger className="hit-area rounded-md" />
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
              onValueChange={(nextValue) => {
                if (!nextValue) {
                  return;
                }
                const nextView = nextValue as "chat" | "flashcards" | "files";
                if (nextView === activeView) {
                  return;
                }

                if (
                  nextView === "files" &&
                  !pathname.startsWith("/workspace/files")
                ) {
                  closeMobileSidebar();
                  void navigateToFilesRoot();
                  return;
                }

                if (
                  nextView === "flashcards" &&
                  !pathname.startsWith("/workspace/flashcards")
                ) {
                  closeMobileSidebar();
                  navigate("/workspace/flashcards" as Route);
                  return;
                }

                if (nextView === "chat" && !isChatsRoute) {
                  const chatSlug = activeChatSlug || chats[0]?.slug;
                  if (chatSlug) {
                    closeMobileSidebar();
                    navigate(`/workspace/chats/${chatSlug}` as Route);
                    return;
                  }
                  closeMobileSidebar();
                  navigate("/workspace/chats" as Route);
                  return;
                }
              }}
              persistenceKey="dashboard-workspace-tabs"
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
                          void triggerHaptic("selection");
                          setEditingChatSlug(null);
                          setEditingTitle("");
                          void createChat();
                        }}
                      />
                    </SidebarMenu>
                    <Input
                      className="mt-2 h-8 text-xs"
                      onChange={(event) =>
                        setChatSearchQuery(event.target.value)
                      }
                      placeholder="Search chats by title..."
                      value={chatSearchQuery}
                    />
                  </SidebarGroupContent>
                </SidebarGroup>

                <ChatListSection
                  activeChatSlug={activeChatSlug}
                  chats={filteredPinnedChats}
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
                    navigate(`/workspace/chats/${chatSlug}` as Route);
                  }}
                  onStartRename={(chat) => {
                    setEditingChatSlug(chat.slug);
                    setEditingTitle(chat.title);
                  }}
                  onTogglePin={(chatSlug, pinned) => {
                    void updateChat(chatSlug, { pinned });
                  }}
                  pendingChatSlug={pendingChatSlug}
                  hideWhenEmpty
                  title="Pinned Chats"
                />

                <ChatListSection
                  activeChatSlug={activeChatSlug}
                  chats={filteredOtherChats}
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
                    navigate(`/workspace/chats/${chatSlug}` as Route);
                  }}
                  onStartRename={(chat) => {
                    setEditingChatSlug(chat.slug);
                    setEditingTitle(chat.title);
                  }}
                  onTogglePin={(chatSlug, pinned) => {
                    void updateChat(chatSlug, { pinned });
                  }}
                  pendingChatSlug={pendingChatSlug}
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
                          filesUiActions.emitIntent("newNote");
                          void triggerHaptic("selection");
                        }}
                      />
                    </SidebarMenu>
                    <Input
                      className="mt-2 h-8 text-xs"
                      onChange={(event) =>
                        setFilesNameSearchQuery(event.target.value)
                      }
                      placeholder="Search files by name..."
                      value={filesNameSearchQuery}
                    />
                  </SidebarGroupContent>
                </SidebarGroup>

                <SidebarGroup className="min-h-0 flex-1">
                  {workspaceUuid &&
                  (filteredPinnedFolders.length > 0 ||
                    filteredPinnedFiles.length > 0) ? (
                    <>
                      <SidebarGroupLabel>Pinned</SidebarGroupLabel>
                      <SidebarGroupContent>
                        <SidebarMenu>
                          {filteredPinnedFolders.map((item) => (
                            <SidebarMenuItem key={`pinned-folder-${item.id}`}>
                              <SidebarMenuButton
                                onClick={() => {
                                  navigate(
                                    `/workspace/files/${item.workspaceId}/folder/${item.id}` as Route
                                  );
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
                                  navigate(
                                    `/workspace/files/${item.workspaceId}/folder/${item.folderId}?file=${item.id}` as Route
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
                          initialSelectedItemId={
                            currentFileId ?? currentFolderId
                          }
                          onExpandedChange={(itemIds) => {
                            setExpandedTreePaths(new Set(itemIds));
                          }}
                          onMoveItem={(draggedItemId, targetItemId) => {
                            const draggedFolder = folderTree.find(
                              (item) => item.id === draggedItemId
                            );
                            if (draggedFolder) {
                              void moveTreeItem(
                                { id: draggedItemId, kind: "folder" },
                                targetItemId
                              );
                              return;
                            }
                            const draggedFile = fileTree.find(
                              (item) => item.id === draggedItemId
                            );
                            if (draggedFile) {
                              void moveTreeItem(
                                { id: draggedItemId, kind: "file" },
                                targetItemId
                              );
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
            ) : activeView === "flashcards" ? (
              <FlashcardsSidebarPanel
                active={activeView === "flashcards"}
                activeSetId={currentFlashcardSetId}
              />
            ) : (
              <div className="absolute inset-0 flex items-start p-4">
                <p className="text-muted-foreground text-xs">
                  Select Chat, Flashcards, or Files.
                </p>
              </div>
            )}
          </div>
        </TooltipProvider>
      </SidebarContent>
      <SidebarFooter>
        <div className="mb-2 flex items-center justify-between gap-2 px-2">
          <div className="flex items-center gap-1">
            <Button
              className="hit-area h-8 w-8"
              onClick={() => {
                void triggerHaptic("selection");
                closeMobileSidebar();
                setTrashOpen(true);
              }}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Trash2 className="size-4" />
              <span className="sr-only">Open trash</span>
            </Button>
            <Button
              className="hit-area h-8 w-8"
              onClick={() => {
                void triggerHaptic("selection");
                closeMobileSidebar();
                filesUiActions.toggleUploadActivityOpen();
              }}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Waves className="size-4" />
              <span className="sr-only">Open upload activity</span>
            </Button>
            <Button
              className="hit-area h-8 w-8"
              onClick={() => {
                void triggerHaptic("selection");
                closeMobileSidebar();
                setSettingsOpen(true);
              }}
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
