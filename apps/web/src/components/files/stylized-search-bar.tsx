"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  snippet: string;
  title: string;
  type: "file" | "folder";
}

function toUniqueFileMatches(results: WorkspaceSearchResult[]): WorkspaceSearchResult[] {
  const byFile = new Map<string, WorkspaceSearchResult>();
  for (const result of results) {
    const key = result.fileId ?? result.id;
    const existing = byFile.get(key);
    if (!existing || result.score > existing.score) {
      byFile.set(key, result);
    }
  }
  return Array.from(byFile.values()).sort(
    (a, b) => b.score - a.score || a.title.localeCompare(b.title)
  );
}

interface StylizedSearchBarProps {
  filePathById?: Map<string, string>;
  focusSignal?: number;
  initialQuery?: string;
  initialResults?: WorkspaceSearchResult[];
  items: WorkspaceSearchItem[];
  maxWidth?: string;
  onOpenFileById?: (fileId: string) => void;
  onApplyWorkspaceFilter?: (itemIds: string[] | null) => void;
  onSelectResult?: (result: WorkspaceSearchResult) => void;
  onSearch?: (query: string, results: WorkspaceSearchResult[]) => void;
  placeholder?: string;
  selectedResultChunkId?: string | null;
  workspaceUuid: string;
}

const sanitizeSnippet = (value: string): string => {
  const cleaned = value
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "";
  }

  return cleaned.length > 420 ? `${cleaned.slice(0, 420)}...` : cleaned;
};

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

async function runRetrievalSummaryApi(
  workspaceUuid: string,
  query: string,
  vectorResults: WorkspaceSearchResult[]
): Promise<string | null> {
  const fileIds = Array.from(
    new Set(vectorResults.map((result) => result.fileId ?? result.id))
  );
  if (fileIds.length === 0) {
    return null;
  }

  const matches = vectorResults.slice(0, 12).map((result) => ({
    fileId: result.fileId ?? result.id,
    sourceType: result.sourceType === "file" || result.sourceType === "folder"
      ? undefined
      : result.sourceType,
    snippet: result.snippet,
    title: result.title,
  }));

  const response = await fetch("/api/ai/retrieval/summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceUuid,
      query,
      fileIds: fileIds.slice(0, 6),
      matches,
    }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { summary?: string };
  return payload.summary?.trim() || null;
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
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(
    initialQuery.trim().length > 0 && initialResults.length > 0
  );
  const [matchedFiles, setMatchedFiles] = useState<WorkspaceSearchResult[]>(
    toUniqueFileMatches(initialResults)
  );
  const [aiSnippet, setAiSnippet] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const latestSearchRequestRef = useRef(0);

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
    inputRef.current?.focus();
  }, [focusSignal]);

  useEffect(() => {
    if (query.trim().length > 0) {
      return;
    }
    if (!showResults && !aiSnippet) {
      return;
    }
    setShowResults(false);
    setAiSnippet("");
    setMatchedFiles([]);
    onApplyWorkspaceFilter?.(null);
    onSearch?.("", []);
  }, [aiSnippet, onApplyWorkspaceFilter, onSearch, query, showResults]);

  const handleSearch = async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      latestSearchRequestRef.current += 1;
      setShowResults(false);
      setAiSnippet("");
      setMatchedFiles([]);
      onApplyWorkspaceFilter?.(null);
      onSearch?.("", []);
      return;
    }

    const requestId = latestSearchRequestRef.current + 1;
    latestSearchRequestRef.current = requestId;
    setIsLoading(true);
    setShowResults(false);

    const vectorResults = await runWorkspaceVectorSearchApi(
      trimmed,
      workspaceUuid,
      items
    );
    const resultIds = Array.from(new Set(vectorResults.map((result) => result.id)));
    const fallbackSummary =
      vectorResults.length > 0
        ? `Found ${vectorResults.length} relevant workspace item${
            vectorResults.length === 1 ? "" : "s"
          } for “${trimmed}” via workspace ingestion retrieval.`
        : `No relevant ingested file content found for “${trimmed}”.`;

    if (requestId !== latestSearchRequestRef.current) {
      return;
    }

    setAiSnippet(fallbackSummary);
    setMatchedFiles(toUniqueFileMatches(vectorResults));
    setIsLoading(false);
    setShowResults(true);

    onApplyWorkspaceFilter?.(resultIds.length > 0 ? resultIds : null);
    onSearch?.(trimmed, vectorResults);

    if (vectorResults.length === 0) {
      return;
    }

    void runRetrievalSummaryApi(workspaceUuid, trimmed, vectorResults)
      .then((modelSummary) => {
        if (
          requestId !== latestSearchRequestRef.current ||
          !modelSummary
        ) {
          return;
        }
        setAiSnippet(modelSummary);
      })
      .catch(() => {
        // Keep fallback summary if model synthesis fails.
      });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void handleSearch(query);
  };

  const handleClear = () => {
    latestSearchRequestRef.current += 1;
    setQuery("");
    setShowResults(false);
    setAiSnippet("");
    setMatchedFiles([]);
    onApplyWorkspaceFilter?.(null);
    onSearch?.("", []);
  };

  return (
    <div className="flex w-full items-center justify-center px-4 py-8">
      <div className={`w-full ${maxWidth}`} ref={containerRef}>
        <form onSubmit={handleSubmit}>
          <div
            className={
              "relative overflow-hidden rounded-3xl transition-all duration-300 ease-out"
            }
          >
            {isLoading && (
              <div
                className="pointer-events-none absolute inset-0 animate-pulse rounded-3xl"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 20%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0.3) 80%, transparent 100%)",
                  backgroundSize: "200% 100%",
                }}
              />
            )}

            <div
              className={
                "relative rounded-3xl border border-border bg-background transition-all duration-300 ease-out"
              }
            >
              <div className="flex items-center gap-3 px-5 py-4">
                <Search
                  className={`flex-shrink-0 transition-colors duration-300 ${isLoading ? "text-muted-foreground" : "text-foreground"}
                  `}
                  size={16}
                />

                <input
                  className={
                    "flex-1 bg-transparent text-foreground text-sm outline-none transition-opacity duration-300 placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  }
                  disabled={isLoading}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={placeholder}
                  ref={inputRef}
                  type="text"
                  value={query}
                />

                {query && !isLoading && (
                  <button
                    className="flex-shrink-0 rounded-lg p-1 text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
                    onClick={handleClear}
                    type="button"
                  >
                    <X size={16} />
                  </button>
                )}

                {isLoading && (
                  <div className="flex-shrink-0">
                    <div className="animate-spin">
                      <Search className="text-muted-foreground" size={16} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </form>

        <div
          className={`overflow-hidden transition-all duration-500 ease-out ${showResults ? "mt-4 max-h-96 opacity-100" : "max-h-0 opacity-0"}
          `}
        >
          <div className="slide-in-from-top-2 fade-in animate-in max-h-[28rem] space-y-3 overflow-y-auto pr-1 duration-500 [scrollbar-color:color-mix(in_oklab,var(--color-border),transparent_30%)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2">
            <div
              className={
                "rounded-2xl border border-border bg-card p-4 backdrop-blur-sm transition-all duration-500 ease-out"
              }
              style={{
                animation: showResults
                  ? "slideInAndFade 0.5s ease-out 0.1s both"
                  : "none",
              }}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <span className="font-semibold text-primary text-sm">✨</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="mb-1 font-semibold text-foreground text-sm">
                    AI Insight
                  </h3>
                  <div className="text-muted-foreground text-sm leading-relaxed">
                    {aiSnippet}
                  </div>
                </div>
              </div>
            </div>

            {matchedFiles.length > 0 && (
              <div
                className="space-y-2"
                style={{
                  animation: showResults
                    ? "slideInAndFade 0.5s ease-out 0.2s both"
                    : "none",
                }}
              >
                <div className="rounded-2xl border border-border bg-card p-3">
                  <p className="mb-2 font-medium text-foreground text-xs uppercase tracking-wide">
                    Matched files
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {matchedFiles.slice(0, 8).map((result) => {
                      const fileId = result.fileId ?? result.id;
                      const isActive = Boolean(
                        selectedResultChunkId &&
                          result.chunkId &&
                          selectedResultChunkId === result.chunkId
                      );
                      return (
                        <button
                          className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                            isActive
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background hover:border-foreground/20"
                          }`}
                          key={`${fileId}-${result.chunkId ?? "file"}`}
                          onClick={() => {
                            onSelectResult?.(result);
                            onOpenFileById?.(fileId);
                          }}
                          title={filePathById?.get(fileId) ?? result.title}
                          type="button"
                        >
                          {result.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

export default StylizedSearchBar;
