"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@avenire/ui/components/dropdown-menu";
import { Input } from "@avenire/ui/components/input";
import { ExpandableTabs } from "@avenire/ui/components/expandable-tabs";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@avenire/ui/components/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@avenire/ui/components/tooltip";
import {
  FilePlus2,
  FileText,
  Files,
  GitBranch,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  PlusCircle,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { Route } from "next";
import { AnimatePresence, motion } from "motion/react";
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
import { FileTree, FileTreeFile, FileTreeFolder } from "@/components/files/tree";
import type { ChatSummary } from "@/lib/chat-data";
import {
  CHAT_NAME_UPDATED_EVENT,
  type ChatNameUpdatedDetail,
} from "@/lib/chat-events";
import {
  DASHBOARD_FILES_FOCUS_SEARCH_EVENT,
  DASHBOARD_FILES_NEW_NOTE_EVENT,
  DASHBOARD_FILES_SYNC_EVENT,
} from "@/lib/file-events";
import {
  type DashboardView,
  useDashboardViewStore,
} from "@/stores/dashboardViewStore";

interface DashboardSidebarUser {
  name: string;
  email: string;
  avatar?: string;
}

/**
 * Render a sidebar section button composed of an icon and a label.
 *
 * @param icon - React component used to render the icon; receives an optional `className` prop.
 * @param label - Text label shown next to the icon.
 * @param onClick - Optional click handler for the button.
 * @returns A JSX element representing a sidebar menu item containing the icon and label.
 */
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

/**
 * Renders a labeled sidebar group with a list of chat entries or a placeholder when there are no chats.
 *
 * Displays each chat as a selectable menu button, supports inline renaming when a chat is in edit mode,
 * and exposes per-chat actions (rename, pin/unpin, delete) via a dropdown for non-readOnly chats.
 *
 * @param title - Section label shown above the chat list
 * @param chats - Array of chat summaries to render
 * @param activeChatSlug - Slug of the currently active chat; used to mark the active item
 * @param editingChatSlug - Slug of the chat currently being renamed, or `null` when none
 * @param editingTitle - Current edit buffer value shown in the rename input
 * @param onEditingTitleChange - Called when the rename input value changes
 * @param onStartRename - Called to begin renaming a chat; receives the chat summary
 * @param onFinishRename - Called to commit a rename; receives the chat slug
 * @param onCancelRename - Called to cancel an ongoing rename operation
 * @param onSelect - Called when a chat is selected; receives the chat slug
 * @param onTogglePin - Toggles the pinned state for a chat; receives the chat slug and the new pinned value
 * @param onDelete - Called to delete a chat; receives the chat slug
 * @returns A SidebarGroup element that contains the chat list or a "No chats yet." placeholder
 */
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
                          <span className="max-w-72 break-words">{chat.title}</span>
                        </TooltipContent>
                      </Tooltip>
                    </SidebarMenuButton>

                    {!chat.readOnly ? (
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
                    ) : null}
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

/**
 * Parse a Fetch `Response` body as JSON and return the resulting value typed as `T`.
 *
 * @returns The parsed JSON as `T` if the response status is successful (`response.ok`); `null` otherwise.
 */
async function parseResponse<T>(response: Response): Promise<T | null> {
  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
}

/**
 * Render the dashboard sidebar with Chat, Flashcards, and Files panels and associated workspace/file-tree and chat management UI.
 *
 * Provides workspace switching, workspace tree loading and real-time file sync, chat creation/rename/pin/delete, and drag-and-drop file/folder moves.
 *
 * @param user - The current user's display information (name, email, optional avatar)
 * @param initialChats - Initial list of chat summaries used to seed the chat list
 * @param activeChatSlug - The slug of the currently active chat
 * @returns The Sidebar React element containing tabs for Chat, Flashcards, and Files along with workspace controls, chat lists, and an interactive file tree
 */
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
  const [chats, setChats] = useState<ChatSummary[]>(initialChats);
  const [editingChatSlug, setEditingChatSlug] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [workspaceUuid, setWorkspaceUuid] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<
    Array<{ workspaceId: string; organizationId: string; rootFolderId: string; name: string }>
  >([]);
  const [folderTree, setFolderTree] = useState<
    Array<{ id: string; name: string; parentId: string | null; readOnly?: boolean }>
  >([]);
  const [fileTree, setFileTree] = useState<
    Array<{ id: string; name: string; folderId: string; readOnly?: boolean }>
  >([]);
  const [treeDropFolderId, setTreeDropFolderId] = useState<string | null>(null);
  const [draggedTreeItem, setDraggedTreeItem] = useState<{
    id: string;
    kind: "file" | "folder";
  } | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [slideDirection, setSlideDirection] = useState(1);
  const treeRefreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sseRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousViewRef = useRef<Exclude<DashboardView, null>>("chat");
  const activeView: Exclude<DashboardView, null> = view ?? "chat";
  const currentFolderId = useMemo(() => {
    const match = pathname.match(/^\/dashboard\/files\/[^/]+\/folder\/([^/?#]+)/);
    return match?.[1] ?? undefined;
  }, [pathname]);
  const currentFileId = searchParams.get("file") ?? undefined;

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
    const order: Record<Exclude<DashboardView, null>, number> = {
      chat: 0,
      flashcards: 1,
      files: 2,
    };
    const previousView = previousViewRef.current;
    const nextDirection =
      order[activeView] >= order[previousView] ? 1 : -1;

    setSlideDirection(nextDirection);
    previousViewRef.current = activeView;
  }, [activeView]);

  useEffect(() => {
    const onChatNameUpdated = (event: Event) => {
      const detail = (event as CustomEvent<ChatNameUpdatedDetail>).detail;
      if (!detail?.id || !detail?.name) {
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
            : chat,
        ),
      );
    };

    window.addEventListener(CHAT_NAME_UPDATED_EVENT, onChatNameUpdated);
    return () => {
      window.removeEventListener(CHAT_NAME_UPDATED_EVENT, onChatNameUpdated);
    };
  }, []);

  const sortedChats = useMemo(
    () =>
      [...chats].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
    [chats],
  );

  const pinnedChats = useMemo(
    () => sortedChats.filter((chat) => chat.pinned),
    [sortedChats],
  );

  const otherChats = useMemo(
    () => sortedChats.filter((chat) => !chat.pinned),
    [sortedChats],
  );

  const refreshChats = async () => {
    const data = await parseResponse<{ chats: ChatSummary[] }>(
      await fetch("/api/chat/history"),
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
        ? workspaces.find((workspace) => workspace.workspaceId === preferredWorkspaceId)
        : undefined;
      const targetWorkspace = preferred ?? workspaces[0];

      if (targetWorkspace) {
        setWorkspaceUuid(targetWorkspace.workspaceId);
        router.push(
          `/dashboard/files/${targetWorkspace.workspaceId}/folder/${targetWorkspace.rootFolderId}` as Route,
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
          `/dashboard/files/${payload.workspaceUuid}/folder/${payload.rootFolderUuid}` as Route,
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
      const response = await fetch("/api/workspaces/list", { cache: "no-store" });
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

  const loadWorkspaceTree = useCallback(async (workspaceId: string) => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/tree`, {
        cache: "no-store",
      });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as {
        folders?: Array<{ id: string; name: string; parentId: string | null; readOnly?: boolean }>;
        files?: Array<{ id: string; name: string; folderId: string; readOnly?: boolean }>;
      };
      setFolderTree(payload.folders ?? []);
      setFileTree((payload.files ?? []).map((file) => ({
        id: file.id,
        name: file.name,
        folderId: file.folderId,
        readOnly: file.readOnly,
      })));
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
    [loadWorkspaceTree],
  );

  useEffect(() => {
    if (!pathname.startsWith("/dashboard/files")) {
      return;
    }

    const match = pathname.match(/^\/dashboard\/files\/([^/]+)\/folder\/([^/]+)/);
    const currentWorkspace = match?.[1] ?? workspaceUuid;
    if (!currentWorkspace) {
      return;
    }

    setWorkspaceUuid(currentWorkspace);
    void loadWorkspaceTree(currentWorkspace);
  }, [loadWorkspaceTree, pathname, workspaceUuid]);

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
    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<{ workspaceUuid?: string }>).detail;
      if (!detail?.workspaceUuid || detail.workspaceUuid === workspaceUuid) {
        refreshWorkspaceTreeDebounced(workspaceUuid);
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
  }, [activeView, loadWorkspaceTree, refreshWorkspaceTreeDebounced, workspaceUuid]);

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
    const data = await parseResponse<{ chat: ChatSummary }>(
      await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );

    if (!data?.chat) {
      return;
    }

    setChats((prev) => [
      data.chat,
      ...prev.filter((chat) => chat.slug !== data.chat.slug),
    ]);
    setView("chat");
    router.push(`/dashboard/chats/${data.chat.slug}` as Route);
    router.refresh();
  };

  const updateChat = async (
    chatSlug: string,
    updates: { title?: string; pinned?: boolean },
  ) => {
    const data = await parseResponse<{ chat: ChatSummary }>(
      await fetch(`/api/chats/${chatSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }),
    );

    if (!data?.chat) {
      return;
    }

    setChats((prev) =>
      prev.map((chat) => (chat.slug === chatSlug ? data.chat : chat)),
    );
  };

  const deleteChat = async (chatSlug: string) => {
    const response = await fetch(
      `/api/chat?${new URLSearchParams({ id: chatSlug }).toString()}`,
      {
      method: "DELETE",
      },
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
    await fetch("/api/auth/organization/set-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
  };

  const switchWorkspace = async (workspace: {
    workspaceId: string;
    organizationId?: string;
    rootFolderId: string;
    name: string;
  }) => {
    await setActiveOrganization(workspace.organizationId ?? null);
    setWorkspaceUuid(workspace.workspaceId);
    setView("files");
    window.localStorage.setItem("preferredWorkspaceId", workspace.workspaceId);
    router.push(
      `/dashboard/files/${workspace.workspaceId}/folder/${workspace.rootFolderId}` as Route,
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
    [folderTree],
  );

  const moveTreeItem = useCallback(
    async (item: { id: string; kind: "file" | "folder" }, targetFolderId: string) => {
      if (!workspaceUuid) {
        return;
      }
      const targetFolder = folderTree.find((folder) => folder.id === targetFolderId);
      if (targetFolder?.readOnly) {
        return;
      }

      if (item.kind === "folder") {
        const sourceFolder = folderTree.find((folder) => folder.id === item.id);
        if (sourceFolder?.readOnly) {
          return;
        }
        if (item.id === targetFolderId || isFolderDescendant(item.id, targetFolderId)) {
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
      window.dispatchEvent(
        new CustomEvent(DASHBOARD_FILES_SYNC_EVENT, {
          detail: { source: "sidebar", workspaceUuid, ts: Date.now() },
        }),
      );
      router.refresh();
    },
    [fileTree, folderTree, isFolderDescendant, loadWorkspaceTree, router, workspaceUuid],
  );

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarContent>
        <TooltipProvider>
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
              const nextView = nextValue as Exclude<DashboardView, null>;
              if (nextView === activeView) {
                return;
              }

              if (nextView === "files" && !pathname.startsWith("/dashboard/files")) {
                setView("files");
                void navigateToFilesRoot();
                return;
              }

              if (nextView === "chat" && !pathname.startsWith("/dashboard/chats/")) {
                setView("chat");
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
          <AnimatePresence custom={slideDirection} initial={false} mode="wait">
            {activeView === "chat" ? (
              <motion.div
                animate={{ opacity: 1, x: 0 }}
                className="absolute inset-0 overflow-y-auto"
                custom={slideDirection}
                exit={{ opacity: 0, x: slideDirection > 0 ? -18 : 18 }}
                initial={{ opacity: 0, x: slideDirection > 0 ? 18 : -18 }}
                key="sidebar-chat-panel"
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
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
                    setView("chat");
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
                    setView("chat");
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
              </motion.div>
            ) : activeView === "files" ? (
              <motion.div
                animate={{ opacity: 1, x: 0 }}
                className="absolute inset-0 overflow-y-auto"
                custom={slideDirection}
                exit={{ opacity: 0, x: slideDirection > 0 ? -18 : 18 }}
                initial={{ opacity: 0, x: slideDirection > 0 ? 18 : -18 }}
                key="sidebar-files-panel"
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                <SidebarGroup>
                  <SidebarGroupLabel>Files</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SectionButton
                        icon={FilePlus2}
                        label="New Note"
                        onClick={() => {
                          window.dispatchEvent(new Event(DASHBOARD_FILES_NEW_NOTE_EVENT));
                        }}
                      />
                      <SectionButton
                        icon={Search}
                        label="Search Files"
                        onClick={() => {
                          window.dispatchEvent(new Event(DASHBOARD_FILES_FOCUS_SEARCH_EVENT));
                        }}
                      />
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>

                <SidebarGroup>
                  <SidebarGroupLabel>File Tree</SidebarGroupLabel>
                  <SidebarGroupContent>
                    {workspaceUuid && folderTree.length > 0 ? (
                      <FileTree
                        className="border-none bg-transparent"
                        defaultExpanded={new Set(folderTree.filter((f) => !f.parentId).map((f) => f.id))}
                        selectedPath={currentFileId ?? currentFolderId}
                      >
                        {renderWorkspaceTree({
                          files: fileTree,
                          folders: folderTree,
                          onDoubleOpenFile: (fileId, folderId) => {
                            if (!workspaceUuid) {
                              return;
                            }
                            router.push(
                              `/dashboard/files/${workspaceUuid}/folder/${folderId}?file=${fileId}` as Route,
                            );
                          },
                          onDoubleOpenFolder: (folderId) => {
                            if (!workspaceUuid) {
                              return;
                            }
                            router.push(
                              `/dashboard/files/${workspaceUuid}/folder/${folderId}` as Route,
                            );
                          },
                          onDragStart: (item) => setDraggedTreeItem(item),
                          onDropToFolder: (folderId) => {
                            if (!draggedTreeItem) {
                              return;
                            }
                            void moveTreeItem(draggedTreeItem, folderId);
                            setDraggedTreeItem(null);
                            setTreeDropFolderId(null);
                          },
                          onDragTargetChange: (folderId) => setTreeDropFolderId(folderId),
                          treeDropFolderId,
                        })}
                      </FileTree>
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
              </motion.div>
            ) : (
              <motion.div
                animate={{ opacity: 1, x: 0 }}
                className="absolute inset-0 overflow-y-auto"
                custom={slideDirection}
                exit={{ opacity: 0, x: slideDirection > 0 ? -18 : 18 }}
                initial={{ opacity: 0, x: slideDirection > 0 ? 18 : -18 }}
                key={`sidebar-${activeView}-panel`}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        </TooltipProvider>
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          activeWorkspaceId={workspaceUuid}
          onCreateWorkspace={createWorkspace}
          onSwitchWorkspace={(workspace) => {
            void switchWorkspace(workspace);
          }}
          user={user}
          workspaces={workspaces}
        />
      </SidebarFooter>
    </Sidebar>
  );
}

/**
 * Render a nested, interactive file-and-folder tree with drag-and-drop and double-open handlers.
 *
 * @param input - Configuration and callbacks for rendering the tree.
 * @param input.folders - Array of folders with `id`, `name`, `parentId` (null for root), and optional `readOnly` to disable interactions.
 * @param input.files - Array of files with `id`, `name`, `folderId` (the parent folder) and optional `readOnly` to disable interactions.
 * @param input.treeDropFolderId - The folder id currently highlighted as a drop target, or `null` when none.
 * @param input.onDoubleOpenFolder - Called when a folder is double-clicked with the folder's id.
 * @param input.onDoubleOpenFile - Called when a file is double-clicked with the file id and its parent folder id.
 * @param input.onDragStart - Called when a drag starts for a file or folder; receives `{ id, kind }`.
 * @param input.onDropToFolder - Called when an item is dropped onto a folder; receives the target folder id.
 * @param input.onDragTargetChange - Called when the current drag-over target changes; receives the folder id or `null`.
 * @returns A ReactNode containing a recursive FileTreeFolder / FileTreeFile structure representing the workspace tree.
 */
function renderWorkspaceTree(input: {
  folders: Array<{ id: string; name: string; parentId: string | null; readOnly?: boolean }>;
  files: Array<{ id: string; name: string; folderId: string; readOnly?: boolean }>;
  treeDropFolderId: string | null;
  onDoubleOpenFolder: (folderId: string) => void;
  onDoubleOpenFile: (fileId: string, folderId: string) => void;
  onDragStart: (item: { id: string; kind: "file" | "folder" }) => void;
  onDropToFolder: (folderId: string) => void;
  onDragTargetChange: (folderId: string | null) => void;
}): ReactNode {
  const renderChildren = (parentId: string | null): ReactNode => {
    const folders = input.folders
      .filter((folder) => folder.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name));

    return folders.map((folder) => (
      <FileTreeFolder
        className={input.treeDropFolderId === folder.id ? "rounded-md bg-emerald-500/10" : ""}
        draggable={!folder.readOnly}
        key={folder.id}
        name={folder.name}
        onDoubleClick={() => input.onDoubleOpenFolder(folder.id)}
        onDragEnd={() => input.onDragTargetChange(null)}
        onDragLeave={() => input.onDragTargetChange(null)}
        onDragOver={(event) => {
          if (folder.readOnly) {
            return;
          }
          event.preventDefault();
          input.onDragTargetChange(folder.id);
        }}
        onDragStart={() => {
          if (folder.readOnly) {
            return;
          }
          input.onDragStart({ id: folder.id, kind: "folder" });
        }}
        onDrop={(event) => {
          if (folder.readOnly) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          input.onDropToFolder(folder.id);
        }}
        path={folder.id}
      >
        {renderChildren(folder.id)}
        {input.files
          .filter((file) => file.folderId === folder.id)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((file) => (
            <FileTreeFile
              draggable={!file.readOnly}
              key={file.id}
              name={file.name}
              onDoubleClick={() => input.onDoubleOpenFile(file.id, folder.id)}
              onDragStart={() => {
                if (file.readOnly) {
                  return;
                }
                input.onDragStart({ id: file.id, kind: "file" });
              }}
              path={file.id}
            >
              <div className="flex items-center gap-1 rounded px-2 py-1 hover:bg-muted/50">
                <span className="size-4" />
                <FileText className="size-4 text-muted-foreground" />
                <span className="truncate text-sm">{file.name}</span>
              </div>
            </FileTreeFile>
          ))}
      </FileTreeFolder>
    ));
  };

  return renderChildren(null);
}
