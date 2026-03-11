"use client";

import { Button } from "@avenire/ui/components/button";
import { Separator } from "@avenire/ui/components/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@avenire/ui/components/table";
import { CheckIcon, CopyIcon } from "lucide-react";
import {
  type ComponentPropsWithoutRef,
  memo,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remend from "remend";
import type { BundledLanguage } from "shiki";
import { bundledLanguages, bundledLanguagesAlias, codeToHtml } from "shiki";
import { MermaidDiagram } from "@/components/chat/mermaid";
import { cn } from "@/lib/utils";

import "katex/dist/katex.min.css";

const WORKSPACE_FILE_OPEN_EVENT = "workspace.file.open";

type MarkdownProps = {
  content: string;
  id: string;
  parseIncompleteMarkdown?: boolean;
  className?: string;
  textSize?: "default" | "small";
};

const CODE_LANGUAGE_REGEX = /language-([^\s]+)/;
const TRAILING_NEWLINE_REGEX = /\n$/;
const CODE_THEME_LIGHT = "github-light-default";
const CODE_THEME_DARK = "github-dark-default";
const highlightedCodeCache = new Map<string, string>();

function extractCodeLanguage(className?: string) {
  const match = className?.match(CODE_LANGUAGE_REGEX);
  return (match?.[1] ?? "").toLowerCase();
}

function resolveBundledLanguage(language: string): BundledLanguage | null {
  if (!language) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(bundledLanguages, language)) {
    return language as BundledLanguage;
  }

  const alias =
    bundledLanguagesAlias[language as keyof typeof bundledLanguagesAlias];
  if (typeof alias === "string") {
    return alias;
  }

  return null;
}

function buildHighlightCacheKey(code: string, language: BundledLanguage) {
  return `${language}:${code}`;
}

function MarkdownCodeBlock({
  children,
  code,
}: {
  children: ReactNode;
  code: string;
}) {
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="chat-markdown-codeblock">
      <Button
        aria-label={copied ? "Copied" : "Copy code"}
        className="chat-markdown-copy-button"
        onClick={() => {
          if (!navigator?.clipboard) {
            return;
          }

          navigator.clipboard.writeText(code).then(
            () => {
              if (copiedTimerRef.current) {
                clearTimeout(copiedTimerRef.current);
              }
              setCopied(true);
              copiedTimerRef.current = setTimeout(() => {
                setCopied(false);
                copiedTimerRef.current = null;
              }, 1200);
            },
            () => undefined
          );
        }}
        title={copied ? "Copied" : "Copy code"}
        type="button"
        variant="ghost"
      >
        {copied ? (
          <CheckIcon className="size-3.5" />
        ) : (
          <CopyIcon className="size-3.5" />
        )}
      </Button>
      {children}
    </div>
  );
}

function HighlightedCodeBlock({
  className,
  code,
}: {
  className?: string;
  code: string;
}) {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const language = extractCodeLanguage(className);
  const bundledLanguage = resolveBundledLanguage(language);

  useEffect(() => {
    let cancelled = false;

    if (!bundledLanguage) {
      setHighlightedHtml(null);
      return;
    }

    const cacheKey = buildHighlightCacheKey(code, bundledLanguage);
    const cached = highlightedCodeCache.get(cacheKey);
    if (cached) {
      setHighlightedHtml(cached);
      return;
    }

    codeToHtml(code, {
      lang: bundledLanguage,
      themes: {
        light: CODE_THEME_LIGHT,
        dark: CODE_THEME_DARK,
      },
    })
      .then((html) => {
        if (cancelled) {
          return;
        }
        highlightedCodeCache.set(cacheKey, html);
        setHighlightedHtml(html);
      })
      .catch(() => {
        if (!cancelled) {
          setHighlightedHtml(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bundledLanguage, code]);

  return (
    <MarkdownCodeBlock code={code}>
      {highlightedHtml ? (
        <div
          className="chat-markdown-shiki"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      ) : (
        <pre className="my-0 overflow-x-auto px-4 py-4">
          <code className={cn("font-mono text-xs whitespace-pre", className)}>
            {code}
          </code>
        </pre>
      )}
    </MarkdownCodeBlock>
  );
}

function CodeRenderer({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"code">) {
  const raw = String(children ?? "");
  const code = raw.replace(TRAILING_NEWLINE_REGEX, "");
  const language = extractCodeLanguage(className);
  const isBlock = language.length > 0;

  if (isBlock && language === "mermaid") {
    return (
      <MermaidDiagram chart={code} containerHeight={420} containerWidth={920} />
    );
  }

  if (isBlock) {
    return <HighlightedCodeBlock className={className} code={code} />;
  }

  return (
    <code
      className={cn(
        "rounded bg-muted px-1 py-0.5 font-mono text-xs",
        className
      )}
      {...props}
    >
      {children}
    </code>
  );
}

const MemoizedMarkdown = memo(
  ({
    content,
    parseIncompleteMarkdown = true,
    className,
    textSize = "default",
  }: Omit<MarkdownProps, "id">) => {
    const normalized = useMemo(
      () => (parseIncompleteMarkdown ? remend(content) : content),
      [content, parseIncompleteMarkdown]
    );

    const sizeClasses =
      textSize === "small"
        ? {
            body: "[&_p]:text-xs [&_li]:text-xs [&_p]:leading-relaxed",
            h1: "mt-4 mb-2 font-semibold text-xl",
            h2: "mt-4 mb-2 font-semibold text-lg",
            h3: "mt-4 mb-2 font-semibold text-base",
            h4: "mt-3 mb-1.5 font-semibold text-sm",
            h5: "mt-3 mb-1.5 font-semibold text-sm",
            h6: "mt-3 mb-1.5 font-semibold text-xs",
          }
        : {
            body: "",
            h1: "mt-6 mb-2 font-semibold text-3xl",
            h2: "mt-6 mb-2 font-semibold text-2xl",
            h3: "mt-6 mb-2 font-semibold text-xl",
            h4: "mt-6 mb-2 font-semibold text-lg",
            h5: "mt-6 mb-2 font-semibold text-base",
            h6: "mt-6 mb-2 font-semibold text-sm",
          };

    return (
      <div
        className={cn(
          "prose prose-sm max-w-full break-words dark:prose-invert prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-pre:my-3 prose-blockquote:my-2 prose-hr:my-3",
          sizeClasses.body,
          className
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            code: CodeRenderer,
            ol: ({ children, className, ...props }: any) => (
              <ol
                className={cn("ml-4 list-outside list-decimal", className)}
                {...(props as React.OlHTMLAttributes<HTMLOListElement>)}
              >
                {children}
              </ol>
            ),
            li: ({ children, className, ...props }: any) => (
              <li
                className={cn("py-1", className)}
                {...(props as React.LiHTMLAttributes<HTMLLIElement>)}
              >
                {children}
              </li>
            ),
            ul: ({ children, className, ...props }: any) => (
              <ul
                className={cn("ml-4 list-outside list-disc", className)}
                {...(props as React.HTMLAttributes<HTMLUListElement>)}
              >
                {children}
              </ul>
            ),
            table: ({ children, className, ...props }: any) => (
              <Table
                className={className}
                {...(props as React.HTMLAttributes<HTMLTableElement>)}
              >
                {children}
              </Table>
            ),
            thead: ({ children, className, ...props }: any) => (
              <TableHeader
                className={className}
                {...(props as React.HTMLAttributes<HTMLTableSectionElement>)}
              >
                {children}
              </TableHeader>
            ),
            tr: ({ children, className, ...props }: any) => (
              <TableRow
                className={className}
                {...(props as React.HTMLAttributes<HTMLTableRowElement>)}
              >
                {children}
              </TableRow>
            ),
            th: ({ children, className, ...props }: any) => (
              <TableHead
                className={cn("text-left", className)}
                {...(props as React.HTMLAttributes<HTMLTableCellElement>)}
              >
                {children}
              </TableHead>
            ),
            tbody: ({ children, className, ...props }: any) => (
              <TableBody
                className={className}
                {...(props as React.HTMLAttributes<HTMLTableSectionElement>)}
              >
                {children}
              </TableBody>
            ),
            td: ({ children, className, ...props }: any) => (
              <TableCell
                className={className}
                {...(props as React.HTMLAttributes<HTMLTableCellElement>)}
              >
                {children}
              </TableCell>
            ),
            hr: ({ className }: any) => <Separator className={className} />,
            strong: ({ children, className, ...props }: any) => (
              <strong
                className={cn("font-semibold", className)}
                {...(props as React.HTMLAttributes<HTMLElement>)}
              >
                {children}
              </strong>
            ),
            a: ({ children, className, ...props }: any) => {
              const href =
                typeof props.href === "string" ? props.href.trim() : "";
              const isWorkspaceFileLink = href.startsWith("workspace-file://");

              if (isWorkspaceFileLink) {
                const fileId = href.replace("workspace-file://", "").trim();
                return (
                  <a
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] font-medium text-foreground no-underline hover:bg-muted/80",
                      className
                    )}
                    {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
                    rel="noreferrer"
                    target="_self"
                    href="#"
                    onClick={(event) => {
                      event.preventDefault();
                      if (!fileId) {
                        return;
                      }
                      window.dispatchEvent(
                        new CustomEvent(WORKSPACE_FILE_OPEN_EVENT, {
                          detail: { fileId },
                        })
                      );
                    }}
                  >
                    <span className="inline-block h-1.5 w-1.5 rounded-[3px] bg-primary" />
                    {children}
                  </a>
                );
              }

              return (
                <a
                  className={cn(
                    "font-medium text-primary underline underline-offset-2",
                    className
                  )}
                  rel="noreferrer"
                  target="_blank"
                  {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
                >
                  {children}
                </a>
              );
            },
            h1: ({ children, className, ...props }: any) => (
              <h1
                className={cn(sizeClasses.h1, className)}
                {...(props as React.HTMLAttributes<HTMLHeadingElement>)}
              >
                {children}
              </h1>
            ),
            h2: ({ children, className, ...props }: any) => (
              <h2
                className={cn(sizeClasses.h2, className)}
                {...(props as React.HTMLAttributes<HTMLHeadingElement>)}
              >
                {children}
              </h2>
            ),
            h3: ({ children, className, ...props }: any) => (
              <h3
                className={cn(sizeClasses.h3, className)}
                {...(props as React.HTMLAttributes<HTMLHeadingElement>)}
              >
                {children}
              </h3>
            ),
            h4: ({ children, className, ...props }: any) => (
              <h4
                className={cn(sizeClasses.h4, className)}
                {...(props as React.HTMLAttributes<HTMLHeadingElement>)}
              >
                {children}
              </h4>
            ),
            h5: ({ children, className, ...props }: any) => (
              <h5
                className={cn(sizeClasses.h5, className)}
                {...(props as React.HTMLAttributes<HTMLHeadingElement>)}
              >
                {children}
              </h5>
            ),
            h6: ({ children, className, ...props }: any) => (
              <h6
                className={cn(sizeClasses.h6, className)}
                {...(props as React.HTMLAttributes<HTMLHeadingElement>)}
              >
                {children}
              </h6>
            ),
          }}
        >
          {normalized}
        </ReactMarkdown>
      </div>
    );
  },
  (prev, next) =>
    prev.content === next.content &&
    prev.parseIncompleteMarkdown === next.parseIncompleteMarkdown &&
    prev.className === next.className &&
    prev.textSize === next.textSize
);

MemoizedMarkdown.displayName = "MemoizedMarkdown";

export const Markdown = memo(function Markdown({
  content,
  id,
  parseIncompleteMarkdown,
  className,
  textSize,
}: MarkdownProps) {
  return (
    <MemoizedMarkdown
      key={id}
      content={content}
      parseIncompleteMarkdown={parseIncompleteMarkdown}
      className={className}
      textSize={textSize}
    />
  );
});
