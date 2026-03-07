"use client";

import { memo, useMemo, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remend from "remend";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@avenire/ui/components/table"
import { Separator } from "@avenire/ui/components/separator"
import { cn } from "@/lib/utils";
import { MermaidDiagram } from "@/components/chat/mermaid";

import "katex/dist/katex.min.css";

type MarkdownProps = {
  content: string;
  id: string;
  parseIncompleteMarkdown?: boolean;
  className?: string;
};

/**
 * Render inline or block code elements and render Mermaid charts for `language-mermaid` blocks.
 *
 * Renders a mermaid diagram when the code block language is `mermaid`; renders a styled block `<pre><code>` for fenced code blocks; renders a styled inline `<code>` for inline code.
 *
 * @returns A React element representing the rendered code block, inline code, or Mermaid diagram.
 */
function CodeRenderer({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"code">) {
  const raw = String(children ?? "");
  const code = raw.replace(/\n$/, "");
  const match = /language-(\w+)/.exec(className ?? "");
  const language = (match?.[1] ?? "").toLowerCase();
  const isBlock = Boolean(match);

  if (isBlock && language === "mermaid") {
    return <MermaidDiagram chart={code} containerHeight={420} containerWidth={920} />;
  }

  if (isBlock) {
    return (
      <pre className="my-3 overflow-x-auto rounded-md border border-border bg-muted/40 p-3">
        <code className={cn("font-mono text-xs whitespace-pre", className)} {...props}>
          {code}
        </code>
      </pre>
    );
  }

  return (
    <code className={cn("rounded bg-muted px-1 py-0.5 font-mono text-xs", className)} {...props}>
      {children}
    </code>
  );
}

const MemoizedMarkdown = memo(
  ({
    content,
    parseIncompleteMarkdown = true,
    className,
  }: Omit<MarkdownProps, "id">) => {
    const normalized = useMemo(
      () => (parseIncompleteMarkdown ? remend(content) : content),
      [content, parseIncompleteMarkdown]
    );

    return (
      <div className={cn("prose prose-sm max-w-full dark:prose-invert", className)}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            code: CodeRenderer,
  ol: ({ node, children, className, ...props }: any) => (
    <ol className={cn('ml-4 list-outside list-decimal', className)} {...(props as React.OlHTMLAttributes<HTMLOListElement>)}>
      {children}
    </ol>
  ),
  li: ({ node, children, className, ...props }: any) => (
    <li className={cn('py-1', className)} {...(props as React.LiHTMLAttributes<HTMLLIElement>)}>
      {children}
    </li>
  ),
  ul: ({ node, children, className, ...props }: any) => (
    <ul className={cn('ml-4 list-outside list-disc', className)} {...(props as React.HTMLAttributes<HTMLUListElement>)}>
      {children}
    </ul>
  ),
  table: ({ node, children, className, ...props }: any) => <Table className={className} {...(props as React.HTMLAttributes<HTMLTableElement>)}>{children}</Table>,
  thead: ({ node, children, className, ...props }: any) => <TableHeader className={className} {...(props as React.HTMLAttributes<HTMLTableSectionElement>)}>{children}</TableHeader>,
  tr: ({ node, children, className, ...props }: any) => <TableRow className={className} {...(props as React.HTMLAttributes<HTMLTableRowElement>)}>{children}</TableRow>,
  th: ({ node, children, className, ...props }: any) => (
    <TableHead className="text-left">{children}</TableHead>
  ),
  tbody: ({ node, children, className, ...props }: any) => <TableBody className={className} {...(props as React.HTMLAttributes<HTMLTableSectionElement>)}>{children}</TableBody>,
  td: ({ node, children, className, ...props }: any) => <TableCell className={className} {...(props as React.HTMLAttributes<HTMLTableCellElement>)}>{children}</TableCell>,
  hr: ({ className }: any) => <Separator className={className} />,
  strong: ({ node, children, className, ...props }: any) => (
    <span className={cn('font-semibold', className)} {...(props as React.HTMLAttributes<HTMLSpanElement>)}>
      {children}
    </span>
  ),
  a: ({ node, children, className, ...props }: any) => (
    <a
      className={cn('font-medium text-primary underline', className)}
      {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
      rel="noreferrer"
      target="_blank"
      {...props}
    >
      {children}
    </a>
  ),
  h1: ({ node, children, className, ...props }: any) => (
    <h1
      className={cn('mt-6 mb-2 font-semibold text-3xl', className)}
      {...(props as React.HTMLAttributes<HTMLHeadingElement>)}
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ node, children, className, ...props }: any) => (
    <h2
      className={cn('mt-6 mb-2 font-semibold text-2xl', className)}
      {...(props as React.HTMLAttributes<HTMLHeadingElement>)}
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ node, children, className, ...props }: any) => (
    <h3 className={cn('mt-6 mb-2 font-semibold text-xl', className)} {...(props as React.HTMLAttributes<HTMLHeadingElement>)}>
      {children}
    </h3>
  ),
  h4: ({ node, children, className, ...props }: any) => (
    <h4 className={cn('mt-6 mb-2 font-semibold text-lg', className)} {...(props as React.HTMLAttributes<HTMLHeadingElement>)}>
      {children}
    </h4>
  ),
  h5: ({ node, children, className, ...props }: any) => (
    <h5
      className={cn('mt-6 mb-2 font-semibold text-base', className)}
      {...(props as React.HTMLAttributes<HTMLHeadingElement>)}
    >
      {children}
    </h5>
  ),
  h6: ({ node, children, className, ...props }: any) => (
    <h6 className={cn('mt-6 mb-2 font-semibold text-sm', className)} {...(props as React.HTMLAttributes<HTMLHeadingElement>)}>
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
    prev.className === next.className
);

MemoizedMarkdown.displayName = "MemoizedMarkdown";

export const Markdown = memo(function Markdown({
  content,
  id,
  parseIncompleteMarkdown,
  className,
}: MarkdownProps) {
  return (
    <MemoizedMarkdown
      key={id}
      content={content}
      parseIncompleteMarkdown={parseIncompleteMarkdown}
      className={className}
    />
  );
});
