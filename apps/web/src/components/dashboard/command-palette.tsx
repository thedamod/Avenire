"use client";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@avenire/ui/components/command";
import { Spinner } from "@avenire/ui/components/spinner";
import {
  Building as Building2,
  FilePlus as FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  ChatText as MessageSquareText,
  Moon,
  MagnifyingGlass as Search,
  Gear as Settings,
  Sparkle as Sparkles,
  Sun,
  Warning as TriangleAlert,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Fuse from "fuse.js";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { WorkspaceSearchResult } from "@/components/files/stylized-search-bar";
import { warmWorkspaceSurface } from "@/lib/dashboard-warmup";
import {
  commandPaletteActions,
  useCommandPaletteStore,
} from "@/stores/commandPaletteStore";
import { useDashboardOverlayStore } from "@/stores/dashboardOverlayStore";
import { filesUiActions } from "@/stores/filesUiStore";
import { quickCaptureActions } from "@/stores/quickCaptureStore";

type PaletteItemType = "file" | "folder";

type PaletteItem = {
  id: string;
  name: string;
  path: string;
  type: PaletteItemType;
  folderId?: string;
};

const FILE_FUSE_OPTIONS = {
  includeScore: true,
  ignoreLocation: true,
  keys: ["name", "path"],
  threshold: 0.45,
};

const FILE_RESULTS_LIMIT = 8;
const FILES_ROUTE_PATTERN = /^\/workspace\/files\/([^/]+)\/folder\/([^/?#]+)$/;

async function queryWorkspaceRetrieval(input: {
  files: Array<{
    folderId?: string;
    id: string;
    name: string;
  }>;
  query: string;
  signal: AbortSignal;
  workspaceUuid: string;
}): Promise<WorkspaceSearchResult[]> {
  const response = await fetch("/api/ai/retrieval/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: input.signal,
    body: JSON.stringify({
      workspaceUuid: input.workspaceUuid,
      query: input.query,
      limit: FILE_RESULTS_LIMIT,
    }),
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as {
    results?: Array<{
      chunkId?: string;
      content: string;
      endMs?: number | null;
      fileId?: string | null;
      page?: number | null;
      rerankScore?: number;
      score?: number;
      sourceType?: "audio" | "image" | "link" | "markdown" | "pdf" | "video";
      startMs?: number | null;
      title?: string | null;
    }>;
  };

  const fileById = new Map(input.files.map((file) => [file.id, file]));
  const mapped: WorkspaceSearchResult[] = [];

  for (const result of payload.results ?? []) {
    const fileId = result.fileId ?? null;
    if (!fileId) {
      continue;
    }

    const file = fileById.get(fileId);
    if (!file) {
      continue;
    }

    const snippet = (result.content || "").replace(/\s+/g, " ").trim();
    mapped.push({
      chunkId: result.chunkId,
      id: fileId,
      fileId,
      description: file.name,
      snippet:
        snippet.length > 220
          ? `${snippet.slice(0, 220)}...`
          : snippet || "Match in file content",
      title: result.title ?? file.name,
      type: "file",
      sourceType: result.sourceType,
      score: result.rerankScore ?? result.score ?? 0,
      page: result.page ?? null,
      startMs: result.startMs ?? null,
      endMs: result.endMs ?? null,
    });
  }

  mapped.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return mapped.slice(0, FILE_RESULTS_LIMIT);
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

function shouldIgnoreGlobalHotkey(event: KeyboardEvent): boolean {
  const editableSelector =
    'input, textarea, select, [contenteditable="true"], [contenteditable=""]';
  const activeElement = document.activeElement;

  return (
    isTypingTarget(event.target) ||
    (activeElement instanceof HTMLElement &&
      (activeElement.matches(editableSelector) ||
        activeElement.closest(editableSelector) !== null)) ||
    event.defaultPrevented
  );
}

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const setSettingsOpen = useDashboardOverlayStore(
    (state) => state.setSettingsOpen
  );
  const setSettingsTab = useDashboardOverlayStore(
    (state) => state.setSettingsTab
  );
  const { resolvedTheme, setTheme } = useTheme();
  const workspaceUuid = useCommandPaletteStore((state) => state.workspaceUuid);
  const folders = useCommandPaletteStore((state) => state.folders);
  const files = useCommandPaletteStore((state) => state.files);
  const generalOpen = useCommandPaletteStore((state) => state.generalOpen);
  const fileOpen = useCommandPaletteStore((state) => state.fileOpen);

  const [generalQuery, setGeneralQuery] = useState("");
  const [fileQuery, setFileQuery] = useState("");
  const [debouncedFileQuery, setDebouncedFileQuery] = useState("");
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const currentRoute = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) {
        return;
      }

      if (shouldIgnoreGlobalHotkey(event)) {
        return;
      }

      const key = event.key.toLowerCase();
      const wantsGeneral = event.shiftKey && key === "p";
      const wantsFiles = !event.shiftKey && key === "k";
      if (!(wantsGeneral || wantsFiles)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (wantsGeneral) {
        commandPaletteActions.openGeneral();
        return;
      }

      commandPaletteActions.openFiles();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  useEffect(() => {
    if (generalOpen) {
      return;
    }
    setGeneralQuery("");
  }, [generalOpen]);

  useEffect(() => {
    if (fileOpen) {
      return;
    }
    setFileQuery("");
    setDebouncedFileQuery("");
    setPendingRoute(null);
  }, [fileOpen]);

  useEffect(() => {
    if (!pendingRoute || currentRoute !== pendingRoute) {
      return;
    }

    setPendingRoute(null);
    commandPaletteActions.close();
  }, [currentRoute, pendingRoute]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedFileQuery(fileQuery);
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [fileQuery]);

  const folderById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders]
  );

  const folderPathById = useMemo(() => {
    const cache = new Map<string, string>();

    const resolvePath = (folderId: string | null): string => {
      if (!folderId) {
        return "";
      }
      const cached = cache.get(folderId);
      if (cached !== undefined) {
        return cached;
      }
      const segments: string[] = [];
      const seen = new Set<string>();
      let cursor: string | null = folderId;
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
      cache.set(folderId, resolved);
      return resolved;
    };

    const map = new Map<string, string>();
    for (const folder of folders) {
      const path = resolvePath(folder.id);
      map.set(folder.id, path || folder.name);
    }
    return map;
  }, [folderById, folders]);

  const fileItems = useMemo<PaletteItem[]>(() => {
    return files.map((file) => {
      const folderPath = folderPathById.get(file.folderId) ?? "";
      const fullPath = folderPath ? `${folderPath}/${file.name}` : file.name;
      return {
        id: file.id,
        name: file.name,
        path: fullPath,
        type: "file",
        folderId: file.folderId,
      };
    });
  }, [files, folderPathById]);

  const folderItems = useMemo<PaletteItem[]>(() => {
    return folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      path: folderPathById.get(folder.id) ?? folder.name,
      type: "folder",
    }));
  }, [folders, folderPathById]);

  const searchItems = useMemo(
    () => [...fileItems, ...folderItems],
    [fileItems, folderItems]
  );

  const fuse = useMemo(
    () => new Fuse(searchItems, FILE_FUSE_OPTIONS),
    [searchItems]
  );

  const trimmedFileQuery = debouncedFileQuery.trim();

  const fuzzyResults = useMemo(() => {
    if (!trimmedFileQuery) {
      return [];
    }
    return fuse
      .search(trimmedFileQuery)
      .filter((result) => (result.score ?? 1) <= FILE_FUSE_OPTIONS.threshold)
      .slice(0, FILE_RESULTS_LIMIT)
      .map((result) => result.item);
  }, [fuse, trimmedFileQuery]);

  const fileSearchFingerprint = useMemo(
    () =>
      files
        .map((file) => `${file.id}:${file.name}:${file.folderId ?? ""}`)
        .join("\u0001"),
    [files]
  );

  const retrievalQuery = useQuery({
    queryFn: ({ signal }) =>
      workspaceUuid && trimmedFileQuery
        ? queryWorkspaceRetrieval({
            files,
            query: trimmedFileQuery,
            signal,
            workspaceUuid,
          })
        : Promise.resolve([]),
    queryKey: [
      "command-palette",
      "retrieval",
      workspaceUuid,
      trimmedFileQuery,
      fileSearchFingerprint,
    ],
    enabled: Boolean(
      fileOpen && workspaceUuid && trimmedFileQuery && fuzzyResults.length === 0
    ),
  });

  const retrievalResults =
    fuzzyResults.length > 0 ? [] : (retrievalQuery.data ?? []);
  const isRetrieving = retrievalQuery.isFetching;

  const currentFilesRouteMatch = pathname.match(FILES_ROUTE_PATTERN);
  const currentFilesWorkspaceUuid = currentFilesRouteMatch?.[1] ?? null;
  const currentFilesFolderId = currentFilesRouteMatch?.[2] ?? null;
  const rootFolderId = useMemo(() => {
    const rootFolder = folders.find((folder) => folder.parentId === null);
    return rootFolder?.id ?? null;
  }, [folders]);

  useEffect(() => {
    if (!(fileOpen && workspaceUuid)) {
      return;
    }

    const targetRoute =
      currentFilesWorkspaceUuid === workspaceUuid && currentFilesFolderId
        ? (`/workspace/files/${workspaceUuid}/folder/${currentFilesFolderId}` as Route)
        : rootFolderId
          ? (`/workspace/files/${workspaceUuid}/folder/${rootFolderId}` as Route)
          : (`/workspace/files/${workspaceUuid}` as Route);

    router.prefetch(targetRoute);
    warmWorkspaceSurface("files", {
      currentFolderId: currentFilesFolderId,
      rootFolderId,
      workspaceUuid,
    }).catch(() => undefined);
  }, [
    currentFilesFolderId,
    currentFilesWorkspaceUuid,
    fileOpen,
    rootFolderId,
    router,
    workspaceUuid,
  ]);

  const openSearchResult = useCallback(
    (result: WorkspaceSearchResult) => {
      if (!workspaceUuid) {
        return;
      }

      const targetFileId = result.fileId ?? result.id;
      const targetFile = files.find((file) => file.id === targetFileId);
      const targetFolderId = targetFile?.folderId ?? currentFilesFolderId;

      const params = new URLSearchParams();
      params.set("file", targetFileId);
      if (result.chunkId) {
        params.set("retrievalChunk", result.chunkId);
      }

      const targetRoute = targetFolderId
        ? (`/workspace/files/${workspaceUuid}/folder/${targetFolderId}?${params.toString()}` as Route)
        : (`/workspace/files/${workspaceUuid}?${params.toString()}` as Route);

      router.prefetch(targetRoute);
      setPendingRoute(targetRoute);

      startTransition(() => {
        if (
          currentFilesWorkspaceUuid === workspaceUuid &&
          currentFilesFolderId === targetFolderId
        ) {
          router.replace(targetRoute);
        } else {
          router.push(targetRoute);
        }
      });
    },
    [
      currentFilesFolderId,
      currentFilesWorkspaceUuid,
      files,
      router,
      workspaceUuid,
    ]
  );

  const openFilesRoute = () => {
    if (pathname.startsWith("/workspace/files")) {
      return;
    }
    const targetRoute =
      workspaceUuid && rootFolderId
        ? (`/workspace/files/${workspaceUuid}/folder/${rootFolderId}` as Route)
        : ("/workspace/files" as Route);
    startTransition(() => {
      router.push(targetRoute);
    });
  };

  const handleFileIntent = (
    intent: Parameters<typeof filesUiActions.emitIntent>[0]
  ) => {
    filesUiActions.emitIntent(intent);
    openFilesRoute();
  };

  const handleOpenFolder = (folderId: string) => {
    if (!workspaceUuid) {
      return;
    }
    router.prefetch(
      `/workspace/files/${workspaceUuid}/folder/${folderId}` as Route
    );
    commandPaletteActions.close();
    startTransition(() => {
      router.push(
        `/workspace/files/${workspaceUuid}/folder/${folderId}` as Route
      );
    });
  };

  const handleOpenFile = (
    fileId: string,
    folderId: string | undefined,
    options?: { retrievalChunkId?: string | null }
  ) => {
    if (!workspaceUuid) {
      return;
    }
    if (!folderId) {
      const fallbackRoute = rootFolderId
        ? (`/workspace/files/${workspaceUuid}/folder/${rootFolderId}` as Route)
        : (`/workspace/files/${workspaceUuid}` as Route);
      router.prefetch(fallbackRoute);
      commandPaletteActions.close();
      startTransition(() => {
        router.push(fallbackRoute);
      });
      return;
    }

    const params = new URLSearchParams();
    params.set("file", fileId);
    if (options?.retrievalChunkId) {
      params.set("retrievalChunk", options.retrievalChunkId);
    }

    const targetRoute =
      `/workspace/files/${workspaceUuid}/folder/${folderId}?${params.toString()}` as Route;
    router.prefetch(targetRoute);
    setPendingRoute(targetRoute);

    startTransition(() => {
      if (
        currentFilesWorkspaceUuid === workspaceUuid &&
        currentFilesFolderId === folderId
      ) {
        router.replace(targetRoute);
      } else {
        router.push(targetRoute);
      }
    });
  };

  const openSettings = (
    tab?:
      | "account"
      | "preferences"
      | "workspace"
      | "data"
      | "billing"
      | "security"
      | "shortcuts"
  ) => {
    setSettingsTab(tab ?? null);
    setSettingsOpen(true);
    commandPaletteActions.close();
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
    commandPaletteActions.close();
  };

  const generalItems = [
    {
      key: "settings",
      label: "Settings",
      description: "Open workspace settings",
      icon: Settings,
      onSelect: () => {
        openSettings();
      },
    },
    {
      key: "toggle-theme",
      label: "Toggle light/dark mode",
      description: `Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode.`,
      icon: resolvedTheme === "dark" ? Sun : Moon,
      onSelect: () => {
        toggleTheme();
      },
    },
    {
      key: "manage-workspace",
      label: "Manage workspace",
      description: "Open the workspace files manager",
      icon: Folder,
      onSelect: () => {
        openFilesRoute();
        commandPaletteActions.close();
      },
    },
    {
      key: "change-workspace",
      label: "Change workspace",
      description: "Open the workspace switcher",
      icon: Building2,
      onSelect: () => {
        openSettings("workspace");
      },
    },
    {
      key: "search",
      label: "Search",
      description: "Search files and workspace content",
      icon: Search,
      shortcut: "Ctrl+K",
      onSelect: () => {
        commandPaletteActions.openFiles();
      },
    },
  ];

  const createItems = [
    {
      key: "new-chat",
      label: "New Method",
      description: "Start a new method thread",
      icon: MessageSquareText,
      shortcut: "Ctrl+N",
      onSelect: () => {
        startTransition(() => {
          router.push("/workspace/chats/new" as Route);
        });
        commandPaletteActions.close();
      },
    },
    {
      key: "new-task",
      label: "New Task",
      description: "Capture a task and push it into the calendar",
      icon: FilePlus2,
      shortcut: "Ctrl+Shift+T",
      onSelect: () => {
        quickCaptureActions.open("task");
        commandPaletteActions.close();
      },
    },
    {
      key: "new-misconception",
      label: "New Misconception",
      description: "Record a misconception for later review",
      icon: TriangleAlert,
      shortcut: "Ctrl+Shift+M",
      onSelect: () => {
        quickCaptureActions.open("misconception");
        commandPaletteActions.close();
      },
    },
    {
      key: "new-flashcard",
      label: "New Flashcard Set",
      description: "Create a workspace flashcard set",
      icon: Sparkles,
      onSelect: () => {
        startTransition(() => {
          router.push("/workspace/flashcards?create=1" as Route);
        });
        commandPaletteActions.close();
      },
    },
    {
      key: "new-note",
      label: "Create new note",
      description: "Create a workspace note",
      icon: FileText,
      shortcut: "Ctrl+Shift+O",
      onSelect: () => {
        handleFileIntent("newNote");
        commandPaletteActions.close();
      },
    },
    {
      key: "new-file",
      label: "Upload File",
      description: "Add a new file to the workspace",
      icon: FilePlus2,
      shortcut: "Ctrl+U",
      onSelect: () => {
        handleFileIntent("uploadFile");
        commandPaletteActions.close();
      },
    },
    {
      key: "new-folder",
      label: "Create new folder",
      description: "Create a folder in the workspace",
      icon: FolderPlus,
      shortcut: "Ctrl+Shift+N",
      onSelect: () => {
        handleFileIntent("createFolder");
        commandPaletteActions.close();
      },
    },
  ];

  const filteredGeneralItems = (() => {
    const needle = generalQuery.trim().toLowerCase();
    if (!needle) {
      return { general: generalItems, create: createItems };
    }
    const match = (value: { label: string; description: string }) =>
      value.label.toLowerCase().includes(needle) ||
      value.description.toLowerCase().includes(needle);
    return {
      general: generalItems.filter(match),
      create: createItems.filter(match),
    };
  })();
  return (
    <>
      <CommandDialog
        className="sm:max-w-6xl lg:max-w-[88rem]"
        onOpenChange={(open) => {
          if (!open) {
            commandPaletteActions.close();
            return;
          }
          commandPaletteActions.openGeneral();
        }}
        open={generalOpen}
      >
        <Command className="min-h-[34rem]">
          <CommandInput
            onValueChange={setGeneralQuery}
            placeholder="Search commands..."
            value={generalQuery}
          />
          <CommandList>
            {filteredGeneralItems.general.length === 0 &&
            filteredGeneralItems.create.length === 0 ? (
              <CommandEmpty>No commands found.</CommandEmpty>
            ) : (
              <>
                {filteredGeneralItems.general.length > 0 ? (
                  <CommandGroup heading="General">
                    {filteredGeneralItems.general.map((item) => (
                      <CommandItem
                        key={item.key}
                        onSelect={() => item.onSelect()}
                      >
                        <item.icon className="size-3.5 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground text-xs">
                            {item.label}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {item.description}
                          </p>
                        </div>
                        {item.shortcut ? (
                          <CommandShortcut>{item.shortcut}</CommandShortcut>
                        ) : null}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
                {filteredGeneralItems.create.length > 0 ? (
                  <>
                    <CommandSeparator />
                    <CommandGroup heading="Create">
                      {filteredGeneralItems.create.map((item) => (
                        <CommandItem
                          key={item.key}
                          onSelect={() => item.onSelect()}
                        >
                          <item.icon className="size-3.5 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="font-medium text-foreground text-xs">
                              {item.label}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {item.description}
                            </p>
                          </div>
                          {item.shortcut ? (
                            <CommandShortcut>{item.shortcut}</CommandShortcut>
                          ) : null}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                ) : null}
              </>
            )}
          </CommandList>
        </Command>
      </CommandDialog>

      <CommandDialog
        className="sm:max-w-6xl lg:max-w-[88rem]"
        onOpenChange={(open) => {
          if (!open) {
            commandPaletteActions.close();
            return;
          }
          commandPaletteActions.openFiles();
        }}
        open={fileOpen}
      >
        <Command className="min-h-[34rem] p-0" shouldFilter={false}>
          <CommandInput
            onValueChange={setFileQuery}
            placeholder="Search manage items, folders, or content..."
            value={fileQuery}
          />
          {pendingRoute ? (
            <div className="flex items-center gap-2 border-border/60 border-t px-4 py-3 text-muted-foreground text-xs">
              <Spinner className="size-3.5" />
              Opening selection...
            </div>
          ) : null}
          <div className="grid min-h-0 flex-1 grid-cols-1 border-border/60 border-t">
            <div className="min-h-0">
              <CommandList className="max-h-none min-h-0">
                {workspaceUuid ? (
                  <>
                    {fuzzyResults.length > 0 ? (
                      <CommandGroup heading="Manage and folders">
                        {fuzzyResults.map((item) => (
                          <CommandItem
                            key={`${item.type}-${item.id}`}
                            onSelect={() => {
                              if (item.type === "folder") {
                                handleOpenFolder(item.id);
                              } else {
                                handleOpenFile(item.id, item.folderId);
                              }
                            }}
                          >
                            {item.type === "folder" ? (
                              <Folder className="size-3.5 text-muted-foreground" />
                            ) : (
                              <FileText className="size-3.5 text-muted-foreground" />
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-medium text-foreground text-xs">
                                {item.name}
                              </p>
                              <p className="truncate text-[11px] text-muted-foreground">
                                {item.path}
                              </p>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ) : null}

                    {fuzzyResults.length === 0 &&
                    (isRetrieving || retrievalResults.length > 0) ? (
                      <>
                        <CommandSeparator />
                        <CommandGroup heading="Content search">
                          {isRetrieving ? (
                            <CommandItem disabled>
                              <Spinner className="size-3.5" />
                              <span className="text-muted-foreground text-xs">
                                Searching workspace content...
                              </span>
                            </CommandItem>
                          ) : null}
                          {retrievalResults.map((result) => {
                            const file = files.find(
                              (entry) => entry.id === result.id
                            );
                            const folderPath = file
                              ? (folderPathById.get(file.folderId) ?? "")
                              : "";
                            const filePath = file
                              ? folderPath
                                ? `${folderPath}/${file.name}`
                                : file.name
                              : result.title;
                            return (
                              <CommandItem
                                key={`retrieval-${result.id}-${result.chunkId ?? "main"}`}
                                onSelect={() => {
                                  openSearchResult(result);
                                }}
                              >
                                <Search className="size-3.5 text-muted-foreground" />
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-foreground text-xs">
                                    {result.title}
                                  </p>
                                  <p className="truncate text-[11px] text-muted-foreground">
                                    {filePath}
                                  </p>
                                  <p className="truncate text-[11px] text-muted-foreground">
                                    {result.snippet}
                                  </p>
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </>
                    ) : null}

                    {trimmedFileQuery &&
                    fuzzyResults.length === 0 &&
                    !isRetrieving &&
                    retrievalResults.length === 0 ? (
                      <CommandEmpty>No matches found.</CommandEmpty>
                    ) : null}

                    {trimmedFileQuery ? null : (
                      <CommandEmpty>
                        Type a file name, path, or topic to search.
                      </CommandEmpty>
                    )}
                  </>
                ) : (
                  <CommandEmpty>
                    Open a workspace to search manage items.
                  </CommandEmpty>
                )}
              </CommandList>
            </div>
          </div>
        </Command>
      </CommandDialog>
    </>
  );
}
