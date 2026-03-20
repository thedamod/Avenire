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
import Fuse from "fuse.js";
import {
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  MessageSquareText,
  Search,
  Settings,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { startTransition, useEffect, useMemo, useState } from "react";
import type { WorkspaceSearchResult } from "@/components/files/stylized-search-bar";
import { useCommandPaletteStore } from "@/stores/commandPaletteStore";
import { useDashboardOverlayStore } from "@/stores/dashboardOverlayStore";
import { quickCaptureActions } from "@/stores/quickCaptureStore";
import { filesUiActions } from "@/stores/filesUiStore";

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
  const setSettingsOpen = useDashboardOverlayStore((state) => state.setSettingsOpen);
  const { workspaceUuid, folders, files } = useCommandPaletteStore();

  const [generalOpen, setGeneralOpen] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [generalQuery, setGeneralQuery] = useState("");
  const [fileQuery, setFileQuery] = useState("");
  const [retrievalResults, setRetrievalResults] = useState<WorkspaceSearchResult[]>([]);
  const [isRetrieving, setIsRetrieving] = useState(false);

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
        setFileOpen(false);
        setGeneralOpen(true);
        return;
      }

      setGeneralOpen(false);
      setFileOpen(true);
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
    setRetrievalResults([]);
    setIsRetrieving(false);
  }, [fileOpen]);

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

  const fuse = useMemo(() => new Fuse(searchItems, FILE_FUSE_OPTIONS), [searchItems]);

  const trimmedFileQuery = fileQuery.trim();

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

  useEffect(() => {
    if (!fileOpen) {
      return;
    }
    if (!workspaceUuid || !trimmedFileQuery) {
      setRetrievalResults([]);
      setIsRetrieving(false);
      return;
    }
    if (fuzzyResults.length > 0) {
      setRetrievalResults([]);
      setIsRetrieving(false);
      return;
    }

    const controller = new AbortController();
    let canceled = false;
    setIsRetrieving(true);

    const run = async () => {
      try {
        const response = await fetch("/api/ai/retrieval/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            workspaceUuid,
            query: trimmedFileQuery,
            limit: FILE_RESULTS_LIMIT,
          }),
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as {
          results?: Array<{
            chunkId?: string;
            fileId?: string | null;
            content: string;
            endMs?: number | null;
            page?: number | null;
            sourceType?: "pdf" | "image" | "video" | "audio" | "markdown" | "link";
            startMs?: number | null;
            title?: string | null;
            rerankScore?: number;
            score?: number;
          }>;
        };

        if (canceled) {
          return;
        }

        const fileById = new Map(files.map((file) => [file.id, file]));
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
            snippet: snippet.length > 220 ? `${snippet.slice(0, 220)}...` : snippet || "Match in file content",
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
        setRetrievalResults(mapped.slice(0, FILE_RESULTS_LIMIT));
      } finally {
        if (!canceled) {
          setIsRetrieving(false);
        }
      }
    };

    run().catch(() => {
      if (!canceled) {
        setIsRetrieving(false);
      }
    });

    return () => {
      canceled = true;
      controller.abort();
    };
  }, [fileOpen, files, fuzzyResults.length, trimmedFileQuery, workspaceUuid]);

  const openFilesRoute = () => {
    if (pathname.startsWith("/workspace/files")) {
      return;
    }
    startTransition(() => {
      router.push("/workspace/files" as Route);
    });
  };

  const handleFileIntent = (intent: Parameters<typeof filesUiActions.emitIntent>[0]) => {
    filesUiActions.emitIntent(intent);
    openFilesRoute();
  };

  const handleOpenFolder = (folderId: string) => {
    if (!workspaceUuid) {
      return;
    }
    startTransition(() => {
      router.push(
        `/workspace/files/${workspaceUuid}/folder/${folderId}` as Route
      );
    });
    setFileOpen(false);
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
      startTransition(() => {
        router.push(`/workspace/files/${workspaceUuid}` as Route);
      });
      setFileOpen(false);
      return;
    }

    const params = new URLSearchParams();
    params.set("file", fileId);
    if (options?.retrievalChunkId) {
      params.set("retrievalChunk", options.retrievalChunkId);
    }

    startTransition(() => {
      router.push(
        `/workspace/files/${workspaceUuid}/folder/${folderId}?${params.toString()}` as Route
      );
    });
    setFileOpen(false);
  };

  const generalItems = [
    {
      key: "settings",
      label: "Settings",
      description: "Open workspace settings",
      icon: Settings,
      onSelect: () => {
        setSettingsOpen(true);
        setGeneralOpen(false);
      },
    },
    {
      key: "open-files",
      label: "Open Files",
      description: "Jump to files search",
      icon: Search,
      shortcut: "Ctrl+K",
      onSelect: () => {
        setGeneralOpen(false);
        setFileOpen(true);
      },
    },
  ];

  const createItems = [
    {
      key: "new-chat",
      label: "New Chat",
      description: "Start a new chat thread",
      icon: MessageSquareText,
      shortcut: "Ctrl+N",
      onSelect: () => {
        startTransition(() => {
          router.push("/workspace/chats/new" as Route);
        });
        setGeneralOpen(false);
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
        setGeneralOpen(false);
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
        setGeneralOpen(false);
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
        setGeneralOpen(false);
      },
    },
    {
      key: "new-note",
      label: "New Note",
      description: "Create a workspace note",
      icon: FileText,
      shortcut: "Ctrl+Shift+O",
      onSelect: () => {
        handleFileIntent("newNote");
        setGeneralOpen(false);
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
        setGeneralOpen(false);
      },
    },
    {
      key: "new-folder",
      label: "New Folder",
      description: "Create a folder in the workspace",
      icon: FolderPlus,
      shortcut: "Ctrl+Shift+N",
      onSelect: () => {
        handleFileIntent("createFolder");
        setGeneralOpen(false);
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
        className="max-w-5xl"
        open={generalOpen}
        onOpenChange={setGeneralOpen}
      >
        <Command className="min-h-[30rem]">
          <CommandInput
            placeholder="Search commands..."
            value={generalQuery}
            onValueChange={setGeneralQuery}
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
                          <p className="text-xs font-medium text-foreground">
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
                            <p className="text-xs font-medium text-foreground">
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
        className="max-w-5xl"
        open={fileOpen}
        onOpenChange={setFileOpen}
      >
        <Command className="min-h-[30rem]" shouldFilter={false}>
          <CommandInput
            placeholder="Search files, folders, or content..."
            value={fileQuery}
            onValueChange={setFileQuery}
          />
          <CommandList>
            {!workspaceUuid ? (
              <CommandEmpty>Open a workspace to search files.</CommandEmpty>
            ) : (
              <>
                {fuzzyResults.length > 0 ? (
                  <CommandGroup heading="Files and folders">
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
                          <p className="truncate text-xs font-medium text-foreground">
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

                {fuzzyResults.length === 0 && (isRetrieving || retrievalResults.length > 0) ? (
                  <>
                    <CommandSeparator />
                    <CommandGroup heading="Content search">
                      {isRetrieving ? (
                        <CommandItem disabled>
                          <Search className="size-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            Searching workspace content...
                          </span>
                        </CommandItem>
                      ) : null}
                      {retrievalResults.map((result) => {
                        const file = files.find((entry) => entry.id === result.id);
                        const folderPath = file ? folderPathById.get(file.folderId) ?? "" : "";
                        const filePath = file
                          ? folderPath
                            ? `${folderPath}/${file.name}`
                            : file.name
                          : result.title;
                        return (
                          <CommandItem
                            key={`retrieval-${result.id}-${result.chunkId ?? "main"}`}
                            onSelect={() => {
                              handleOpenFile(
                                result.id,
                                file?.folderId,
                                { retrievalChunkId: result.chunkId ?? null }
                              );
                            }}
                          >
                            <Search className="size-3.5 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-foreground">
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

                {trimmedFileQuery && fuzzyResults.length === 0 && !isRetrieving && retrievalResults.length === 0 ? (
                  <CommandEmpty>No matches found.</CommandEmpty>
                ) : null}

                {!trimmedFileQuery ? (
                  <CommandEmpty>Type a file name, path, or topic to search.</CommandEmpty>
                ) : null}
              </>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
