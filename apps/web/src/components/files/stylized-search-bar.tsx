"use client";

import { useChat } from "@ai-sdk/react";
import { Button } from "@avenire/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@avenire/ui/components/command";
import { TextStreamChatTransport, type UIMessage } from "ai";
import {
  ChevronRight,
  FileAudio2,
  FileCode2,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  Globe,
  Sparkles,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Markdown } from "@/components/chat/markdown";
import { cn } from "@/lib/utils";

export interface WorkspaceSearchItem {
  description: string;
  id: string;
  snippet: string;
  title: string;
  type: "file" | "folder";
}

export interface WorkspaceSearchResult {
  chunkId?: string;
  description: string;
  endMs?: number | null;
  fileId?: string | null;
  highlightText?: string;
  id: string;
  page?: number | null;
  score: number;
  snippet: string;
  sourceType?:
    | "file"
    | "folder"
    | "pdf"
    | "video"
    | "audio"
    | "image"
    | "markdown"
    | "link";
  startMs?: number | null;
  title: string;
  type: "file" | "folder";
}

interface StylizedSearchBarProps {
  filePathById?: Map<string, string>;
  focusSignal?: number;
  initialQuery?: string;
  initialResults?: WorkspaceSearchResult[];
  items: WorkspaceSearchItem[];
  maxWidth?: string;
  onApplyWorkspaceFilter?: (itemIds: string[] | null) => void;
  onOpenFileById?: (fileId: string) => void;
  onSearch?: (query: string, results: WorkspaceSearchResult[]) => void;
  onSelectResult?: (result: WorkspaceSearchResult) => void;
  placeholder?: string;
  selectedResultChunkId?: string | null;
  workspaceUuid: string;
}

const sanitizeSnippet = (value: string): string => {
  const cleaned = value
    .replace(/[^\x20-\x7E\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "";
  }

  return cleaned.length > 420 ? `${cleaned.slice(0, 420)}...` : cleaned;
};

const toResultKey = (result: WorkspaceSearchResult): string =>
  result.chunkId ? `${result.id}:${result.chunkId}` : result.id;

const getMessageTextContent = (message: UIMessage | undefined): string => {
  if (!message?.parts?.length) {
    return "";
  }

  return message.parts
    .filter(
      (part): part is { type: "text"; text: string } => part.type === "text"
    )
    .map((part) => part.text)
    .join("")
    .trim();
};

const getResultIcon = (result: WorkspaceSearchResult) => {
  switch (result.sourceType) {
    case "folder":
      return Folder;
    case "image":
      return FileImage;
    case "video":
      return FileVideo;
    case "audio":
      return FileAudio2;
    case "markdown":
      return FileCode2;
    case "link":
      return Globe;
    default:
      return FileText;
  }
};

const formatTimestamp = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const getResultMeta = (result: WorkspaceSearchResult) => {
  const parts: string[] = [];

  if (typeof result.page === "number" && result.page > 0) {
    parts.push(`Page ${result.page}`);
  }

  if (typeof result.startMs === "number") {
    const start = formatTimestamp(result.startMs);
    if (typeof result.endMs === "number" && result.endMs > result.startMs) {
      parts.push(`${start}-${formatTimestamp(result.endMs)}`);
    } else {
      parts.push(start);
    }
  }

  return parts.join(" • ");
};

const getScoreLabel = (score: number) =>
  `${Math.min(100, Math.max(0, Math.round(score * 100)))}%`;

async function runWorkspaceVectorSearchApi(
  searchQuery: string,
  workspaceUuid: string,
  items: WorkspaceSearchItem[]
): Promise<WorkspaceSearchResult[]> {
  const query = searchQuery.trim();
  if (!query) {
    return [];
  }

  const response = await fetch("/api/ai/retrieval/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceUuid,
      query,
      limit: 8,
    }),
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as {
    query?: string;
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

  const filesById = new Map(
    items.filter((item) => item.type === "file").map((item) => [item.id, item])
  );

  const mapped: WorkspaceSearchResult[] = [];
  for (const result of payload.results ?? []) {
    const fileId = result.fileId ?? null;
    if (!fileId) {
      continue;
    }
    const item = filesById.get(fileId);
    if (!item) {
      continue;
    }

    const snippet = sanitizeSnippet(result.content || item.snippet);
    if (!snippet) {
      continue;
    }

    mapped.push({
      chunkId: result.chunkId,
      id: item.id,
      fileId,
      highlightText: (result.content || "").trim(),
      page: result.page ?? null,
      startMs: result.startMs ?? null,
      endMs: result.endMs ?? null,
      sourceType: result.sourceType,
      title: item.title,
      description: item.description,
      snippet,
      type: "file",
      score: result.rerankScore ?? result.score ?? 0,
    });
  }

  return mapped
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, 8);
}

export function StylizedSearchBar({
  items,
  workspaceUuid,
  filePathById,
  initialQuery = "",
  initialResults = [],
  onSearch,
  onOpenFileById,
  onApplyWorkspaceFilter,
  onSelectResult,
  selectedResultChunkId,
  focusSignal,
  placeholder = "Search anything...",
  maxWidth = "max-w-2xl",
}: StylizedSearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(
    initialQuery.trim().length > 0 && initialResults.length > 0
  );
  const [results, setResults] =
    useState<WorkspaceSearchResult[]>(initialResults);
  const [selectedValue, setSelectedValue] = useState<string>(
    selectedResultChunkId ??
      (initialResults[0] ? toResultKey(initialResults[0]) : "")
  );
  const [aiSummary, setAiSummary] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const latestSearchRequestRef = useRef(0);
  const aiSummaryRef = useRef(aiSummary);
  const previousQueryRef = useRef(initialQuery);
  const onSearchRef = useRef(onSearch);
  const onApplyWorkspaceFilterRef = useRef(onApplyWorkspaceFilter);

  const {
    messages: summaryMessages,
    setMessages: setSummaryMessages,
    sendMessage: sendSummaryMessage,
    status: summaryStatus,
    stop: stopSummary,
  } = useChat<UIMessage>({
    id: `retrieval-summary-${workspaceUuid}`,
    transport: new TextStreamChatTransport({
      api: "/api/ai/retrieval/summary",
    }),
  });
  const summaryApiRef = useRef({
    setMessages: setSummaryMessages,
    stop: stopSummary,
  });

  useEffect(() => {
    summaryApiRef.current = {
      setMessages: setSummaryMessages,
      stop: stopSummary,
    };
  }, [setSummaryMessages, stopSummary]);

  const clearSummaryConversation = useCallback(() => {
    summaryApiRef.current.stop();
    summaryApiRef.current.setMessages((previous) =>
      previous.length === 0 ? previous : []
    );
  }, []);

  const latestSummaryText = useMemo(() => {
    const assistant = [...summaryMessages]
      .reverse()
      .find((message) => message.role === "assistant");
    return getMessageTextContent(assistant);
  }, [summaryMessages]);

  useEffect(() => {
    aiSummaryRef.current = aiSummary;
  }, [aiSummary]);

  useEffect(() => {
    onSearchRef.current = onSearch;
    onApplyWorkspaceFilterRef.current = onApplyWorkspaceFilter;
  }, [onApplyWorkspaceFilter, onSearch]);

  useEffect(() => {
    if (!latestSummaryText) {
      return;
    }
    setAiSummary(latestSummaryText);
  }, [latestSummaryText]);

  const isSummaryStreaming =
    summaryStatus === "submitted" || summaryStatus === "streaming";

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current) {
        return;
      }
      if (!containerRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (focusSignal === undefined) {
      return;
    }

    const input = containerRef.current?.querySelector<HTMLInputElement>(
      '[data-slot="command-input"]'
    );
    input?.focus();
  }, [focusSignal]);

  useEffect(() => {
    const externalSelected =
      selectedResultChunkId && results.length > 0
        ? results.find((result) => result.chunkId === selectedResultChunkId)
        : null;
    if (externalSelected) {
      setSelectedValue(toResultKey(externalSelected));
    }
  }, [results, selectedResultChunkId]);

  useEffect(() => {
    const trimmed = query.trim();
    const previousTrimmed = previousQueryRef.current.trim();
    previousQueryRef.current = query;

    if (trimmed.length > 0) {
      return;
    }
    if (previousTrimmed.length === 0) {
      return;
    }

    clearSummaryConversation();
    setShowResults(false);
    setAiSummary("");
    setResults([]);
    setSelectedValue("");
    onApplyWorkspaceFilterRef.current?.(null);
    onSearchRef.current?.("", []);
  }, [clearSummaryConversation, query]);

  const openResult = (result: WorkspaceSearchResult) => {
    const fileId = result.fileId ?? result.id;
    onSelectResult?.(result);
    onOpenFileById?.(fileId);
  };

  const handleSearch = async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      latestSearchRequestRef.current += 1;
      clearSummaryConversation();
      setIsSearching(false);
      setShowResults(false);
      setAiSummary("");
      setResults([]);
      setSelectedValue("");
      onApplyWorkspaceFilter?.(null);
      onSearch?.("", []);
      return;
    }

    const requestId = latestSearchRequestRef.current + 1;
    latestSearchRequestRef.current = requestId;
    clearSummaryConversation();

    setIsSearching(true);
    setShowResults(true);
    setAiSummary("");

    const vectorResults = await runWorkspaceVectorSearchApi(
      trimmed,
      workspaceUuid,
      items
    );

    if (requestId !== latestSearchRequestRef.current) {
      return;
    }

    const fallbackSummary =
      vectorResults.length > 0
        ? `Found ${vectorResults.length} relevant workspace item${
            vectorResults.length === 1 ? "" : "s"
          } for "${trimmed}".`
        : `No relevant ingested file content found for "${trimmed}".`;

    setResults(vectorResults);
    setSelectedValue(vectorResults[0] ? toResultKey(vectorResults[0]) : "");
    setIsSearching(false);

    onApplyWorkspaceFilter?.(null);
    onSearch?.(trimmed, vectorResults);

    if (vectorResults.length === 0) {
      setAiSummary(fallbackSummary);
      return;
    }

    try {
      const fileIds = Array.from(
        new Set(vectorResults.map((result) => result.fileId ?? result.id))
      );
      const matches = vectorResults.slice(0, 12).map((result) => ({
        fileId: result.fileId ?? result.id,
        sourceType:
          result.sourceType === "file" || result.sourceType === "folder"
            ? undefined
            : result.sourceType,
        snippet: result.snippet,
        title: result.title,
      }));

      await sendSummaryMessage(
        { text: trimmed },
        {
          body: {
            workspaceUuid,
            query: trimmed,
            fileIds: fileIds.slice(0, 6),
            matches,
            stream: true,
          },
        }
      );

      if (requestId !== latestSearchRequestRef.current) {
        return;
      }

      if (!aiSummaryRef.current.trim()) {
        setAiSummary(fallbackSummary);
      }
    } catch {
      if (requestId === latestSearchRequestRef.current) {
        setAiSummary(fallbackSummary);
      }
    }
  };

  const runSearch = (searchQuery: string) => {
    handleSearch(searchQuery).catch(() => undefined);
  };

  return (
    <div className="flex w-full min-w-0 items-center justify-center px-2 py-3">
      <div className={`w-full min-w-0 ${maxWidth}`} ref={containerRef}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            runSearch(query);
          }}
        >
          <div className="relative overflow-visible rounded-lg border border-border/70 bg-card">
            {(isSearching || isSummaryStreaming) && (
              <div
                className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--foreground) 16%, transparent) 50%, transparent 100%)",
                  backgroundSize: "200% 100%",
                  animation: "retrievalShimmer 2.2s linear infinite",
                }}
              />
            )}

            <Command
              className="rounded-none border-0 bg-transparent p-0 [&_[data-slot=command-input-wrapper]]:p-0 [&_[data-slot=input-group-addon]]:pr-0 [&_[data-slot=input-group]]:h-9 [&_[data-slot=input-group]]:border-0 [&_[data-slot=input-group]]:bg-transparent [&_[data-slot=input-group]]:shadow-none"
              onValueChange={setSelectedValue}
              shouldFilter={false}
              value={selectedValue}
            >
              <div className="border-border/70 border-b px-3 py-3">
                <div className="relative">
                  <CommandInput
                    className="pr-10 text-sm"
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setQuery("");
                        return;
                      }
                      if (event.key !== "Enter") {
                        return;
                      }
                      event.preventDefault();
                      runSearch(query);
                    }}
                    onValueChange={setQuery}
                    placeholder={placeholder}
                    value={query}
                  />
                  <div className="absolute top-1/2 right-2 z-20 flex -translate-y-1/2 items-center gap-1">
                    {query.trim().length > 0 ? (
                      <Button
                        className="h-6 w-6 rounded-md p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => setQuery("")}
                        size="icon-xs"
                        type="button"
                        variant="ghost"
                      >
                        <X className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </div>
                  {results.length > 0 ? (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-xs">
                      <span>
                        {`${results.length} match${results.length === 1 ? "" : "es"} in indexed workspace content`}
                      </span>
                      {isSearching || isSummaryStreaming ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Sparkles className="size-3.5" />
                          Retrieving
                        </span>
                      ) : null}
                    </div>
                  ) : null}
              </div>

              <div
                className={cn(
                  "pointer-events-none absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-border/70 bg-card shadow-xl transition-all duration-150",
                  showResults
                    ? "pointer-events-auto translate-y-0 opacity-100"
                    : "translate-y-1 opacity-0"
                )}
              >
                <div className="grid gap-0 border-border/70 md:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
                  <section className="border-border/70 border-b px-4 py-3 md:border-r md:border-b-0">
                    <div className="mb-2 flex items-center gap-2 text-muted-foreground text-xs">
                      <Sparkles className="size-3.5" />
                      <span>
                        {isSummaryStreaming ? "Summarizing answer" : "Answer"}
                      </span>
                    </div>
                    <div
                      className="scroll-fade-frame scroll-fade-top scroll-fade-bottom relative"
                      style={
                        {
                          "--scroll-fade-color": "var(--card)",
                        } as CSSProperties
                      }
                    >
                      <div className="max-h-[min(23rem,calc(100vh-22rem))] overflow-y-auto pr-2 [scrollbar-color:color-mix(in_oklab,var(--color-border),transparent_30%)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2">
                        {aiSummary ? (
                          <Markdown
                            className="max-w-full break-words text-muted-foreground"
                            content={aiSummary}
                            id={`retrieval-summary-${query}`}
                            textSize="small"
                          />
                        ) : (
                          <p className="text-muted-foreground text-sm leading-6">
                            {isSearching
                              ? "Searching indexed content."
                              : "Run a search to generate a concise answer from the best matching workspace evidence."}
                          </p>
                        )}
                      </div>
                    </div>
                  </section>

                  <section className="px-2 py-2">
                    <div className="px-1 pb-2 text-muted-foreground text-xs">
                      Matches
                    </div>
                    {results.length === 0 && !isSearching ? (
                      <CommandEmpty className="rounded-md px-3 py-6 text-left text-muted-foreground text-sm">
                        No relevant matches yet. Try a narrower phrase, a file
                        name, or a concept from your notes.
                      </CommandEmpty>
                    ) : null}

                    <div
                      className="scroll-fade-frame scroll-fade-top scroll-fade-bottom relative"
                      style={
                        {
                          "--scroll-fade-color": "var(--card)",
                        } as CSSProperties
                      }
                    >
                      <CommandList className="max-h-[min(23rem,calc(100vh-22rem))] overflow-x-hidden pr-1 [scrollbar-color:color-mix(in_oklab,var(--color-border),transparent_30%)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2">
                        {results.map((result) => {
                          const value = toResultKey(result);
                          const fileId = result.fileId ?? result.id;
                          const Icon = getResultIcon(result);
                          const isSelected = selectedValue === value;
                          const meta = getResultMeta(result);

                          return (
                            <CommandItem
                              className="items-start gap-2.5 rounded-md border border-transparent px-2.5 py-2 data-selected:border-border/80 data-selected:bg-muted/55"
                              key={value}
                              onSelect={() => openResult(result)}
                              title={filePathById?.get(fileId) ?? result.title}
                              value={value}
                            >
                              <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background">
                                <Icon className="size-3.5 text-muted-foreground" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-xs">
                                      {result.title}
                                    </p>
                                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                      {filePathById?.get(fileId) ??
                                        result.description}
                                    </p>
                                  </div>
                                  <span className="shrink-0 text-[10px] text-muted-foreground">
                                    {getScoreLabel(result.score)}
                                  </span>
                                </div>
                                {meta ? (
                                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                                    {meta}
                                  </p>
                                ) : null}
                                <p className="mt-1.5 line-clamp-2 whitespace-normal break-words text-[11px] text-muted-foreground leading-5">
                                  {result.snippet}
                                </p>
                              </div>
                              <ChevronRight
                                className={cn(
                                  "mt-0.5 size-3 shrink-0 text-muted-foreground transition-transform duration-150",
                                  isSelected
                                    ? "translate-x-0.5"
                                    : "translate-x-0"
                                )}
                              />
                            </CommandItem>
                          );
                        })}
                      </CommandList>
                    </div>
                  </section>
                </div>
              </div>
            </Command>
          </div>
        </form>

        <style>{`
          @keyframes retrievalShimmer {
            0% {
              background-position: -200% 0;
            }
            100% {
              background-position: 200% 0;
            }
          }
        `}</style>
      </div>
    </div>
  );
}

export default StylizedSearchBar;
