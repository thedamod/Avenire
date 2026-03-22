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
import {
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
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type ComponentProps,
  type ComponentType,
  startTransition,
  useDeferredValue,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChatIcon } from "@/components/chat/chat-icon";
import { ThinkingGlyph } from "@/components/chat/thinking-indicator";
import { NavUser } from "@/components/dashboard/nav-user";
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
import { filesUiActions } from "@/stores/filesUiStore";
import {
  readCachedChats,
  readCachedWorkspaces,
  writeCachedChats,
  writeCachedWorkspaces,
} from "@/lib/dashboard-browser-cache";
import {
  warmDashboardBackground,
  warmWorkspaceSurface,
} from "@/lib/dashboard-warmup";

const FlashcardsSidebarPanel = dynamic(
  () =>
    import("@/components/flashcards/sidebar-panel").then((module) => ({
      default: module.FlashcardsSidebarPanel,
    })),
  {
    loading: () => (
      <div className="absolute inset-0 flex items-start p-4">
        <p className="text-muted-foreground text-xs">Loading flashcards...</p>
      </div>
    ),
  }
);

const DeferredFilesSidebarPanel = dynamic(
  () =>
    import("@/components/dashboard/sidebar-files-panel").then((module) => ({
      default: module.FilesSidebarPanel,
    })),
  {
    loading: () => (
      <div className="absolute inset-0 flex items-start p-4">
        <p className="text-muted-foreground text-xs">Loading files...</p>
      </div>
    ),
  }
);

const SettingsDialog = dynamic(() =>
  import("@/components/settings/settings-dialog").then((module) => ({
    default: module.SettingsDialog,
  }))
);

const TrashDialog = dynamic(() =>
  import("@/components/dashboard/trash-dialog").then((module) => ({
    default: module.TrashDialog,
  }))
);

interface DashboardSidebarUser {
  avatar?: string;
  email: string;
  name: string;
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

const DASHBOARD_FLASHCARDS_ROUTE_REGEX = /^\/workspace\/flashcards\/([^/?#]+)/;
const DASHBOARD_FILES_FOLDER_ROUTE_REGEX =
  /^\/workspace\/files\/[^/]+\/folder\/([^/?#]+)/;

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
  activeWorkspace,
  initialWorkspaces = [],
  initialChats = [],
  activeChatSlug: activeChatSlugProp,
  ...props
}: ComponentProps<typeof Sidebar> & {
  activeWorkspace?: {
    name?: string;
    rootFolderId: string;
    workspaceId: string;
  } | null;
  user?: DashboardSidebarUser;
  initialWorkspaces?: Array<{
    workspaceId: string;
    organizationId: string;
    rootFolderId: string;
    name: string;
  }>;
  initialChats?: ChatSummary[];
  activeChatSlug?: string;
}) {
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const triggerHaptic = useHaptics();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [chats, setChats] = useState<ChatSummary[]>(
    () =>
      (activeWorkspace?.workspaceId
        ? readCachedChats(activeWorkspace.workspaceId)
        : null) ?? initialChats
  );
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [editingChatSlug, setEditingChatSlug] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [pendingChatSlug, setPendingChatSlug] = useState<string | null>(null);
  const [activeChatSlugOverride, setActiveChatSlugOverride] = useState<
    string | null
  >(null);
  const [workspaceUuid, setWorkspaceUuid] = useState<string | null>(
    activeWorkspace?.workspaceId ?? null
  );
  const [workspaces, setWorkspaces] = useState<
    Array<{
      workspaceId: string;
      organizationId: string;
      rootFolderId: string;
      name: string;
    }>
  >(() => readCachedWorkspaces() ?? initialWorkspaces);
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
  const chatsWorkspaceRef = useRef<string | null>(
    activeWorkspace?.workspaceId ?? null
  );
  const deferredChatSearchQuery = useDeferredValue(chatSearchQuery);
  const sessionCloseRef = useRef<{
    chatId: string;
    sent: boolean;
    sessionId: string;
  } | null>(null);
  const sessionCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  let routeView: "chat" | "flashcards" | "files" | "workspace" | null = null;
  if (pathname.startsWith("/workspace/flashcards")) {
    routeView = "flashcards";
  } else if (pathname.startsWith("/workspace/files")) {
    routeView = "files";
  } else if (isChatsRoute) {
    routeView = "chat";
  } else if (pathname === "/workspace") {
    routeView = "workspace";
  }
  const activeView = routeView;
  const activeTabValue = activeView === "workspace" ? null : activeView;
  const [mountedViews, setMountedViews] = useState<
    Set<"chat" | "flashcards" | "files">
  >(() =>
    activeView && activeView !== "workspace" ? new Set([activeView]) : new Set()
  );
  const primaryChatRoute = useMemo<Route>(() => {
    const chatSlug = activeChatSlug || chats[0]?.slug;
    return chatSlug
      ? (`/workspace/chats/${chatSlug}` as Route)
      : ("/workspace/chats" as Route);
  }, [activeChatSlug, chats]);
  const primaryFilesRoute = useMemo<Route>(() => {
    const activeWorkspaceSummary =
      (workspaceUuid
        ? workspaces.find(
            (workspace) => workspace.workspaceId === workspaceUuid
          )
        : undefined) ??
      (activeWorkspace
        ? {
            name: "Workspace",
            organizationId: undefined,
            rootFolderId: activeWorkspace.rootFolderId,
            workspaceId: activeWorkspace.workspaceId,
          }
        : undefined) ??
      workspaces[0];

    return activeWorkspaceSummary
      ? (`/workspace/files/${activeWorkspaceSummary.workspaceId}/folder/${activeWorkspaceSummary.rootFolderId}` as Route)
      : ("/workspace/files" as Route);
  }, [activeWorkspace, workspaceUuid, workspaces]);
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
  const warmWorkspaceSection = useCallback(
    (section: "chat" | "flashcards" | "files") => {
      if (section === "chat") {
        router.prefetch(primaryChatRoute);
        warmWorkspaceSurface("chat", {
          rootFolderId: activeWorkspace?.rootFolderId ?? null,
          workspaceUuid,
        }).catch(() => undefined);
        return;
      }

      if (section === "flashcards") {
        router.prefetch("/workspace/flashcards" as Route);
        import("@/components/flashcards/sidebar-panel").catch(
          () => undefined
        );
        warmWorkspaceSurface("flashcards", {
          rootFolderId: activeWorkspace?.rootFolderId ?? null,
          workspaceUuid,
        }).catch(() => undefined);
        return;
      }

      router.prefetch(primaryFilesRoute);
      import("@/components/dashboard/sidebar-files-panel").catch(
        () => undefined
      );
      warmWorkspaceSurface("files", {
        currentFolderId,
        rootFolderId: activeWorkspace?.rootFolderId ?? null,
        workspaceUuid,
      }).catch(() => undefined);
    },
    [
      activeWorkspace?.rootFolderId,
      currentFolderId,
      primaryChatRoute,
      primaryFilesRoute,
      router,
      workspaceUuid,
    ]
  );

  useEffect(() => {
    if (
      !activeView ||
      activeView === "workspace" ||
      mountedViews.has(activeView)
    ) {
      return;
    }

    setMountedViews((previous) => {
      if (previous.has(activeView)) {
        return previous;
      }

      const next = new Set(previous);
      next.add(activeView);
      return next;
    });
  }, [activeView, mountedViews]);

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
    if (initialChats.length === 0) {
      return;
    }
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

  useEffect(() => {
    if (!workspaceUuid) {
      return;
    }
    chatsWorkspaceRef.current = workspaceUuid;
    const cachedChats = readCachedChats(workspaceUuid);
    if (cachedChats) {
      setChats(cachedChats);
      return;
    }
    setChats([]);
  }, [workspaceUuid]);

  const loadChats = useCallback(async () => {
    try {
      const response = await fetch("/api/chat/history", {
        cache: "no-store",
      });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as { chats?: ChatSummary[] };
      const nextChats = payload.chats ?? [];
      setChats(nextChats);
      if (workspaceUuid && chatsWorkspaceRef.current === workspaceUuid) {
        writeCachedChats(workspaceUuid, nextChats);
      }
    } catch {
      // ignore
    }
  }, [workspaceUuid]);

  useEffect(() => {
    loadChats().catch(() => undefined);
  }, [loadChats]);

  useEffect(() => {
    if (!workspaceUuid) {
      return;
    }
    if (chatsWorkspaceRef.current !== workspaceUuid) {
      return;
    }
    writeCachedChats(workspaceUuid, chats);
  }, [chats, workspaceUuid]);

  useEffect(() => {
    if (!activeWorkspace?.workspaceId) {
      return;
    }
    setWorkspaceUuid((prev) =>
      prev === activeWorkspace.workspaceId ? prev : activeWorkspace.workspaceId
    );
  }, [activeWorkspace?.workspaceId]);

  useEffect(() => {
    const warmTargets = () => {
      router.prefetch(primaryChatRoute);
      router.prefetch("/workspace/flashcards" as Route);
      router.prefetch(primaryFilesRoute);
      import("@/components/dashboard/sidebar-files-panel").catch(
        () => undefined
      );
      import("@/components/flashcards/sidebar-panel").catch(
        () => undefined
      );
      import("@/components/settings/settings-dialog").catch(
        () => undefined
      );
      import("@/components/dashboard/task-manager").catch(() => undefined);
      import("@/components/student-calendar").catch(() => undefined);
      warmDashboardBackground({
        currentFolderId,
        rootFolderId: activeWorkspace?.rootFolderId ?? null,
        workspaceUuid,
      }).catch(() => undefined);
    };

    if (typeof window === "undefined") {
      return;
    }

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(() => {
        warmTargets();
      });
      return () => {
        window.cancelIdleCallback?.(idleId);
      };
    }

    const timeoutId = setTimeout(warmTargets, 150);
    return () => {
      clearTimeout(timeoutId);
    };
  }, [
    activeWorkspace?.rootFolderId,
    currentFolderId,
    primaryChatRoute,
    primaryFilesRoute,
    router,
    workspaceUuid,
  ]);

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
      activeWorkspace?.workspaceId ??
      chats.find((chat) => chat.workspaceId)?.workspaceId ??
      workspaces[0]?.workspaceId ??
      null;
    setWorkspaceUuid((prev) =>
      prev === fallbackWorkspaceId ? prev : fallbackWorkspaceId
    );
  }, [
    activeChatSlug,
    activeWorkspace?.workspaceId,
    chats,
    pathname,
    workspaces,
  ]);

  useEffect(() => {
    if (pathname !== "/workspace") {
      return;
    }

    const preferredWorkspaceId = readPreferredWorkspaceId();
    if (!preferredWorkspaceId) {
      return;
    }

    const preferredWorkspace = workspaces.find(
      (workspace) => workspace.workspaceId === preferredWorkspaceId
    );
    if (!preferredWorkspace) {
      return;
    }

    if (workspaceUuid === preferredWorkspace.workspaceId) {
      return;
    }

    setWorkspaceUuid(preferredWorkspace.workspaceId);
    navigate(
      `/workspace/files/${preferredWorkspace.workspaceId}/folder/${preferredWorkspace.rootFolderId}` as Route
    );
  }, [navigate, pathname, workspaces, workspaceUuid]);

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
  const filteredChatNeedleDeferred = deferredChatSearchQuery
    .trim()
    .toLowerCase();
  const filteredPinnedChats = useMemo(
    () =>
      pinnedChats.filter((chat) =>
        filteredChatNeedleDeferred
          ? chat.title.toLowerCase().includes(filteredChatNeedleDeferred)
          : true
      ),
    [filteredChatNeedleDeferred, pinnedChats]
  );
  const filteredOtherChats = useMemo(
    () =>
      otherChats.filter((chat) =>
        filteredChatNeedleDeferred
          ? chat.title.toLowerCase().includes(filteredChatNeedleDeferred)
          : true
      ),
    [filteredChatNeedleDeferred, otherChats]
  );

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
      const targetWorkspace =
        preferred ??
        (activeWorkspace
          ? {
              name: "Workspace",
              organizationId: undefined,
              rootFolderId: activeWorkspace.rootFolderId,
              workspaceId: activeWorkspace.workspaceId,
            }
          : undefined) ??
        workspaces[0];

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
  }, [activeWorkspace, router, workspaces]);

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
      const nextWorkspaces = payload.workspaces ?? [];
      setWorkspaces(nextWorkspaces);
      writeCachedWorkspaces(nextWorkspaces);
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

  useEffect(() => {
    const onWorkspaceInvalidated = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          kind?: string;
          workspaceUuid?: string;
        }>
      ).detail;
      if (!detail?.workspaceUuid || detail.workspaceUuid !== workspaceUuid) {
        return;
      }

      if (detail.kind === "chat") {
        void loadChats();
      }
    };

    window.addEventListener(
      "avenire:workspace-data-invalidated",
      onWorkspaceInvalidated
    );
    return () => {
      window.removeEventListener(
        "avenire:workspace-data-invalidated",
        onWorkspaceInvalidated
      );
    };
  }, [loadChats, workspaceUuid]);

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

                warmWorkspaceSection(nextView);

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
              onItemHover={(item) => {
                warmWorkspaceSection(
                  item.value as "chat" | "flashcards" | "files"
                );
              }}
              persistenceKey="dashboard-workspace-tabs"
              value={activeTabValue}
            />
          </SidebarGroup>
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {activeView === "workspace" ? (
              <div className="absolute inset-0 overflow-y-auto px-2 py-2">
                <SidebarGroup>
                  <SidebarGroupLabel>Workspace Home</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <p className="px-2 pb-2 text-muted-foreground text-xs leading-relaxed">
                      Pick a surface to continue. This home view keeps the
                      workspace shell visible without pretending to be chat.
                    </p>
                    <SidebarMenu>
                      <SectionButton
                        icon={MessageSquare}
                        label="Open Chat"
                        onClick={() => {
                          const chatSlug = activeChatSlug || chats[0]?.slug;
                          closeMobileSidebar();
                          if (chatSlug) {
                            navigate(`/workspace/chats/${chatSlug}` as Route);
                            return;
                          }
                          navigate("/workspace/chats" as Route);
                        }}
                      />
                      <SectionButton
                        icon={Sparkles}
                        label="Open Flashcards"
                        onClick={() => {
                          closeMobileSidebar();
                          navigate("/workspace/flashcards" as Route);
                        }}
                      />
                      <SectionButton
                        icon={Files}
                        label="Open Files"
                        onClick={() => {
                          closeMobileSidebar();
                          void navigateToFilesRoot();
                        }}
                      />
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </div>
            ) : activeView ? (
              <>
                <div
                  aria-hidden={activeView !== "chat"}
                  className={
                    mountedViews.has("chat")
                      ? `absolute inset-0 overflow-y-auto ${
                          activeView === "chat"
                            ? ""
                            : "pointer-events-none hidden"
                        }`
                      : "hidden"
                  }
                >
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
                    hideWhenEmpty
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
                <div
                  aria-hidden={activeView !== "files"}
                  className={
                    mountedViews.has("files")
                      ? `absolute inset-0 ${
                          activeView === "files"
                            ? ""
                            : "pointer-events-none hidden"
                        }`
                      : "hidden"
                  }
                >
                  <DeferredFilesSidebarPanel
                    currentFileId={currentFileId}
                    currentFolderId={currentFolderId}
                    navigateToFilesRoot={navigateToFilesRoot}
                    workspaceUuid={workspaceUuid}
                  />
                </div>
                <div
                  aria-hidden={activeView !== "flashcards"}
                  className={
                    mountedViews.has("flashcards")
                      ? `absolute inset-0 ${
                          activeView === "flashcards"
                            ? ""
                            : "pointer-events-none hidden"
                        }`
                      : "hidden"
                  }
                >
                  <FlashcardsSidebarPanel
                    active={activeView === "flashcards"}
                    activeSetId={currentFlashcardSetId}
                    workspaceUuid={workspaceUuid}
                  />
                </div>
              </>
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
        {settingsOpen ? (
          <SettingsDialog onOpenChange={setSettingsOpen} open={settingsOpen} />
        ) : null}
        {trashOpen ? (
          <TrashDialog
            onOpenChange={setTrashOpen}
            open={trashOpen}
            workspaceUuid={workspaceUuid}
          />
        ) : null}
      </SidebarFooter>
    </Sidebar>
  );
}
