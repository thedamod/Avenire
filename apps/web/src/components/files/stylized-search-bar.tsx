"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

export interface WorkspaceSearchItem {
  id: string;
  type: "file" | "folder";
  title: string;
  description: string;
  snippet: string;
}

export interface WorkspaceSearchResult {
  id: string;
  title: string;
  description: string;
  snippet: string;
  type: "file" | "folder";
  score: number;
}

interface StylizedSearchBarProps {
  items: WorkspaceSearchItem[];
  onSearch?: (query: string, results: WorkspaceSearchResult[]) => void;
  onApplyWorkspaceFilter?: (itemIds: string[] | null) => void;
  focusSignal?: number;
  placeholder?: string;
  maxWidth?: string;
}

async function runWorkspaceVectorSearchStub(
  searchQuery: string,
  items: WorkspaceSearchItem[],
): Promise<WorkspaceSearchResult[]> {
  // TODO(vector-search): replace with workspace embedding/vector search API.
  const query = searchQuery.trim().toLowerCase();

  if (!query) {
    return [];
  }

  const scored = items
    .map((item) => {
      const title = item.title.toLowerCase();
      const description = item.description.toLowerCase();
      const snippet = item.snippet.toLowerCase();

      let score = 0;
      if (title.includes(query)) {
        score += 5;
      }
      if (description.includes(query)) {
        score += 3;
      }
      if (snippet.includes(query)) {
        score += 2;
      }

      return {
        id: item.id,
        title: item.title,
        description: item.description,
        snippet: item.snippet,
        type: item.type,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, 8);

  return scored;
}

export function StylizedSearchBar({
  items,
  onSearch,
  onApplyWorkspaceFilter,
  focusSignal,
  placeholder = "Search anything...",
  maxWidth = "max-w-2xl",
}: StylizedSearchBarProps) {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<WorkspaceSearchResult[]>([]);
  const [aiSnippet, setAiSnippet] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onSearchRef = useRef(onSearch);
  const onApplyWorkspaceFilterRef = useRef(onApplyWorkspaceFilter);

  useEffect(() => {
    onSearchRef.current = onSearch;
    onApplyWorkspaceFilterRef.current = onApplyWorkspaceFilter;
  }, [onApplyWorkspaceFilter, onSearch]);

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
    setShowResults(false);
    setResults([]);
    setAiSnippet("");
    onApplyWorkspaceFilterRef.current?.(null);
    onSearchRef.current?.("", []);
  }, [query]);

  const handleSearch = async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setShowResults(false);
      setResults([]);
      setAiSnippet("");
      onApplyWorkspaceFilter?.(null);
      return;
    }

    setIsLoading(true);
    setShowResults(false);

    // Keeps current UI behavior while backend search is not wired.
    await new Promise((resolve) => setTimeout(resolve, 650));

    const vectorResults = await runWorkspaceVectorSearchStub(trimmed, items);
    const resultIds = vectorResults.map((result) => result.id);

    const summary =
      vectorResults.length > 0
        ? `Found ${vectorResults.length} relevant workspace item${
            vectorResults.length === 1 ? "" : "s"
          } for “${trimmed}”. This preview is currently backed by a local vector-search stub and will be switched to real embeddings.`
        : `No direct matches found for “${trimmed}”. Try broader keywords while vector search wiring is in progress.`;

    setResults(vectorResults);
    setAiSnippet(summary);
    setIsLoading(false);
    setShowResults(true);

    onApplyWorkspaceFilter?.(resultIds);
    onSearch?.(trimmed, vectorResults);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void handleSearch(query);
  };

  const handleClear = () => {
    setQuery("");
    setShowResults(false);
    setResults([]);
    setAiSnippet("");
    onApplyWorkspaceFilter?.(null);
    onSearch?.("", []);
  };

  return (
    <div className="flex w-full items-center justify-center px-4 py-8">
      <div ref={containerRef} className={`w-full ${maxWidth}`}>
        <form onSubmit={handleSubmit}>
          <div
            className={`
              relative overflow-hidden rounded-3xl
              transition-all duration-300 ease-out
            `}
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
              className={`
                relative rounded-3xl border border-border bg-background
                transition-all duration-300 ease-out
              `}
            >
              <div className="flex items-center gap-3 px-5 py-4">
                <Search
                  size={16}
                  className={`
                    flex-shrink-0 transition-colors duration-300
                    ${isLoading ? "text-muted-foreground" : "text-foreground"}
                  `}
                />

                <input
                  className={`
                    flex-1 bg-transparent text-sm text-foreground outline-none
                    placeholder:text-muted-foreground
                    disabled:cursor-not-allowed disabled:opacity-50
                    transition-opacity duration-300
                  `}
                  disabled={isLoading}
                  ref={inputRef}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={placeholder}
                  type="text"
                  value={query}
                />

                {query && !isLoading && (
                  <button
                    className="
                      flex-shrink-0 rounded-lg p-1 text-muted-foreground
                      transition-colors duration-200 hover:bg-muted hover:text-foreground
                    "
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
          className={`
            overflow-hidden transition-all duration-500 ease-out
            ${showResults ? "mt-4 max-h-96 opacity-100" : "max-h-0 opacity-0"}
          `}
        >
          <div className="animate-in slide-in-from-top-2 fade-in space-y-3 duration-500">
            <div
              className={`
                rounded-2xl border border-border bg-card p-4
                backdrop-blur-sm transition-all duration-500 ease-out motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2
              `}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <span className="text-sm font-semibold text-primary">✨</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="mb-1 text-sm font-semibold text-foreground">
                    AI Insight
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {aiSnippet}
                  </p>
                </div>
              </div>
            </div>

            {results.length > 0 && (
              <div className="space-y-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2">
                {results.map((result, index) => (
                  <div
                    className="
                      rounded-2xl border border-border bg-card p-3
                      transition-colors duration-200 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2
                    "
                    key={result.id}
                    style={{ animationDelay: `${index * 60}ms` }}
                  >
                    <h4 className="text-sm font-medium text-foreground transition-colors duration-200">
                      {result.title}
                    </h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {result.snippet}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

export default StylizedSearchBar;
