"use client";

import {
  AnnotationLayer,
  CanvasLayer,
  Page,
  Pages,
  Root,
  Search,
  TextLayer,
  usePdfJump,
  useSearch,
} from "@anaralabs/lector";
import { cn } from "@avenire/ui/lib/utils";
import { memo, useEffect } from "react";
import "pdfjs-dist/web/pdf_viewer.css";

function normalizePdfSearchText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E]/g, " ")
    .trim()
    .toLowerCase();
}

function buildPdfHighlightQueries(
  highlightText?: string | null,
  fallbackHighlightText?: string | null
) {
  const candidates: string[] = [];
  const primary = normalizePdfSearchText(highlightText ?? "");
  const fallback = normalizePdfSearchText(fallbackHighlightText ?? "");

  if (primary.length > 0) {
    candidates.push(primary);
    if (primary.length > 180) {
      candidates.push(primary.slice(0, 180).trim());
    }
  }

  if (fallback.length > 0) {
    candidates.push(fallback);
  }

  return Array.from(new Set(candidates.filter((value) => value.length > 0)));
}

const PdfAutoJump = memo(function PdfAutoJump({
  fallbackHighlightText,
  highlightPage,
  highlightText,
}: {
  fallbackHighlightText?: string | null;
  highlightPage?: number | null;
  highlightText?: string | null;
}) {
  const { jumpToPage } = usePdfJump();
  const { search, textContent } = useSearch();

  useEffect(() => {
    const hasHighlightPage =
      typeof highlightPage === "number" && highlightPage > 0;
    const queries = buildPdfHighlightQueries(
      highlightText,
      fallbackHighlightText
    );

    if (hasHighlightPage) {
      jumpToPage(highlightPage, { align: "center", behavior: "smooth" });
      return;
    }

    if (queries.length === 0 || (textContent?.length ?? 0) === 0) {
      return;
    }

    for (const query of queries) {
      const resultSet = search(query, { limit: 20, threshold: 0.35 });
      const candidate =
        resultSet.exactMatches?.[0] ?? resultSet.fuzzyMatches?.[0] ?? null;
      if (!candidate) {
        continue;
      }

      jumpToPage(candidate.pageNumber, {
        align: "center",
        behavior: "smooth",
      });
      return;
    }
  }, [fallbackHighlightText, highlightPage, highlightText, jumpToPage, search, textContent]);

  return null;
});

function PDFViewer({
  source,
  fallbackHighlightText,
  highlightPage,
  highlightText,
  invertColors = true,
  className,
}: {
  source: string;
  fallbackHighlightText?: string | null;
  highlightPage?: number | null;
  highlightText?: string | null;
  invertColors?: boolean;
  className?: string;
}) {
  return (
    <Root
      className={cn("w-full h-[500px] border overflow-hidden rounded-lg", className)}
      loader={<div className="p-4">Loading...</div>}
      source={source}
      >
      <PdfAutoJump
        fallbackHighlightText={fallbackHighlightText}
        highlightPage={highlightPage}
        highlightText={highlightText}
      />
      <Search>
        <Pages
          className={cn(
            invertColors &&
              "dark:invert-[94%] dark:hue-rotate-180 dark:brightness-[80%] dark:contrast-[228%]"
          )}
        >
          <Page>
            <CanvasLayer />
            <TextLayer />
            <AnnotationLayer />
          </Page>
        </Pages>
      </Search>
    </Root>
  );
}

export default PDFViewer;
