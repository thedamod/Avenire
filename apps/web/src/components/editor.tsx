"use client";

import { Button } from "@avenire/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@avenire/ui/components/dropdown-menu";
import { cn } from "@avenire/ui/lib/utils";
import {
  Extension,
  InputRule,
  mergeAttributes,
  Node as TiptapNode,
} from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import {
  BulletList,
  ListItem,
  ListKeymap,
  OrderedList,
  TaskItem,
  TaskList,
} from "@tiptap/extension-list";
import {
  BlockMath,
  InlineMath,
  migrateMathStrings,
} from "@tiptap/extension-mathematics";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import { TextStyle } from "@tiptap/extension-text-style";
import { Markdown } from "@tiptap/markdown";
import { Fragment } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import {
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
} from "@tiptap/pm/state";
import {
  type Editor,
  EditorContent,
  useEditor,
  useEditorState,
} from "@tiptap/react";
import { BubbleMenu, FloatingMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { renderMermaidSVG } from "beautiful-mermaid";
import { common, createLowlight } from "lowlight";
import {
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  Bold,
  Check,
  ChevronDown,
  Code,
  Columns3,
  Copy,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  type LucideIcon,
  Merge,
  Minus,
  Palette,
  Pilcrow,
  Quote,
  Rows3,
  Sigma,
  Split,
  Strikethrough,
  Table2,
  Trash2,
  Workflow,
} from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "../editor.css";
const lowlight = createLowlight(common);
const MENU_OFFSET = 10;
const VIEWPORT_PADDING = 12;
const INLINE_MATH_INPUT_REGEX = /(^|[^$])\$([^$\n]+)\$$/;
const BLOCK_MATH_INPUT_REGEX = /^\$\$([\s\S]+)\$\$$/;
const LATEX_TOKEN_REGEX =
  /(%.*$|\\[A-Za-z]+|\\.|[{}[\]()]|[_^&]|(?:\d+\.\d+|\d+))/gm;
const WIKI_LINK_REGEX = /\[\[([^[\]]+)\]\]/g;
const TEXT_COLORS = [
  { name: "Default", value: null },
  { name: "Slate", value: "#475569" },
  { name: "Red", value: "#b91c1c" },
  { name: "Orange", value: "#c2410c" },
  { name: "Green", value: "#166534" },
  { name: "Blue", value: "#1d4ed8" },
  { name: "Purple", value: "#6d28d9" },
] as const;
const BG_COLORS = [
  { name: "Default", value: null },
  { name: "Yellow", value: "#fde68a" },
  { name: "Green", value: "#bbf7d0" },
  { name: "Blue", value: "#bfdbfe" },
  { name: "Pink", value: "#fbcfe8" },
  { name: "Gray", value: "#e5e7eb" },
] as const;

type SlashMatch = {
  query: string;
  from: number;
  to: number;
  text: string;
  key: string;
};

type MathKind = "inlineMath" | "blockMath";

type MathPopoverState = {
  kind: MathKind;
  pos: number;
  draft: string;
};

type MermaidPopoverState = {
  pos: number;
  draft: string;
};

type WikiPage = {
  id: string;
  title: string;
  excerpt: string;
  content: string;
};

type AiAction = "explain" | "elaborate" | "simplify";

type SlashCommand = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  keywords: string[];
  clearTrigger?: boolean;
  run: (context: { match: SlashMatch | null }) => void | Promise<void>;
};

type TableAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  disabled: boolean;
  run: () => void;
};

interface AvenireEditorProps {
  defaultValue: string;
  onChange: (markdown: string) => void;
  onOpenWikiLink?: (page: WikiPage) => void;
  saveMessage?: string;
  saveState?: "idle" | "saving" | "saved" | "error";
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  wikiPages: WikiPage[];
}

const InlineMathExtension = InlineMath.extend({
  addInputRules() {
    return [
      new InputRule({
        find: INLINE_MATH_INPUT_REGEX,
        handler: ({
          state,
          range,
          match,
        }: {
          state: EditorState;
          range: { from: number; to: number };
          match: RegExpMatchArray;
        }) => {
          const [, prefix, latex] = match;
          const start = range.from + prefix.length;
          const end = range.to;
          const { tr } = state;

          tr.replaceWith(start, end, this.type.create({ latex: latex.trim() }));
        },
      }),
    ];
  },
});

const BlockMathExtension = BlockMath.extend({
  addInputRules() {
    return [
      new InputRule({
        find: BLOCK_MATH_INPUT_REGEX,
        handler: ({
          state,
          range,
          match,
        }: {
          state: EditorState;
          range: { from: number; to: number };
          match: RegExpMatchArray;
        }) => {
          const [, latex] = match;
          const { tr } = state;

          tr.replaceWith(
            range.from,
            range.to,
            this.type.create({ latex: latex.trim() })
          );
        },
      }),
    ];
  },
});

const MERMAID_DEFAULT = `graph LR
  A[Start] --> B[End]`;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    deleteMermaidDiagram: (options: { pos: number }) => ReturnType;
    insertMermaidDiagram: (options: {
      code?: string;
      pos?: number;
    }) => ReturnType;
    updateMermaidDiagram: (options: {
      pos: number;
      code: string;
    }) => ReturnType;
  }
}

const MermaidDiagramExtension = TiptapNode.create({
  name: "mermaidDiagram",
  group: "block",
  atom: true,
  addOptions() {
    return {
      onClick: undefined as
        | ((node: { attrs: { code?: string } }, pos: number) => void)
        | undefined,
    };
  },
  addAttributes() {
    return {
      code: {
        default: MERMAID_DEFAULT,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-code") ?? "",
        renderHTML: (attrs) => ({ "data-code": attrs.code }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="mermaid-diagram"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "mermaid-diagram" }),
    ];
  },
  addCommands() {
    return {
      insertMermaidDiagram:
        (options: { code?: string; pos?: number }) =>
        ({
          commands,
          editor,
        }: {
          commands: {
            insertContentAt: (pos: number, content: unknown) => boolean;
          };
          editor: Editor;
        }) => {
          const code = options.code ?? MERMAID_DEFAULT;
          const pos = options.pos ?? editor.state.selection.from;
          return commands.insertContentAt(pos, {
            type: this.name,
            attrs: { code },
          });
        },
      updateMermaidDiagram:
        (options: { pos: number; code: string }) =>
        ({
          editor,
          tr,
        }: {
          editor: Editor;
          tr: import("@tiptap/pm/state").Transaction;
        }) => {
          const node = editor.state.doc.nodeAt(options.pos);
          if (!node || node.type.name !== this.name) {
            return false;
          }
          tr.setNodeMarkup(options.pos, this.type, {
            ...node.attrs,
            code: options.code,
          });
          return true;
        },
      deleteMermaidDiagram:
        (options: { pos: number }) =>
        ({
          editor,
          tr,
        }: {
          editor: Editor;
          tr: import("@tiptap/pm/state").Transaction;
        }) => {
          const node = editor.state.doc.nodeAt(options.pos);
          if (!node || node.type.name !== this.name) {
            return false;
          }
          tr.delete(options.pos, options.pos + node.nodeSize);
          return true;
        },
    } as Record<string, unknown>;
  },
  parseMarkdown(token: unknown) {
    const code = (token as { code?: string }).code ?? MERMAID_DEFAULT;
    return { type: "mermaidDiagram", attrs: { code } };
  },
  renderMarkdown(node: { attrs?: { code?: string } }) {
    const code = node.attrs?.code ?? "";
    return ["```mermaid\n", code, "\n```"].join("");
  },
  markdownTokenName: "mermaidDiagram",
  markdownTokenizer: {
    name: "mermaidDiagram",
    level: "block",
    start: (src: string) => src.indexOf("```mermaid"),
    tokenize(src: string) {
      const match = src.match(/^```mermaid\n([\s\S]*?)```/);
      if (!match) {
        return undefined;
      }
      const [, code] = match;
      return {
        type: "mermaidDiagram",
        raw: match[0],
        code: (code ?? "").trim(),
      };
    },
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const wrapper = document.createElement("div");
      wrapper.className = "mermaid-diagram-wrapper";
      wrapper.setAttribute("data-type", "mermaid-diagram");
      const container = document.createElement("div");
      container.className = "mermaid-diagram-container";
      wrapper.appendChild(container);

      let mounted = true;
      const renderDiagram = () => {
        const code =
          (node.attrs as { code?: string }).code?.trim() || MERMAID_DEFAULT;
        try {
          if (!mounted) {
            return;
          }
          const svg = renderMermaidSVG(code, {
            bg: "var(--background)",
            fg: "var(--foreground)",
            accent: "var(--primary)",
            transparent: true,
          });
          container.innerHTML = svg;
        } catch {
          if (mounted) {
            container.innerHTML = "";
            const pre = document.createElement("pre");
            pre.className = "mermaid-diagram-error";
            pre.textContent = code || "Invalid diagram";
            container.appendChild(pre);
          }
        }
      };

      renderDiagram();

      const handleClick = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        const pos = getPos();
        if (typeof pos !== "number") {
          return;
        }
        if (this.options.onClick) {
          this.options.onClick(node, pos);
        }
      };
      wrapper.addEventListener("click", handleClick);
      if (this.options.onClick) {
        wrapper.style.cursor = "pointer";
      }

      return {
        dom: wrapper,
        update: (updatedNode) => {
          if (updatedNode.type !== this.type) {
            return false;
          }
          node = updatedNode;
          renderDiagram();
          return true;
        },
        destroy: () => {
          mounted = false;
          wrapper.removeEventListener("click", handleClick);
        },
      };
    };
  },
});

/** Keeps task list items sorted so completed (checked) items are always at the top. */
const TaskListSortExtension = Extension.create({
  name: "taskListSort",
  addProseMirrorPlugins() {
    const taskListType = this.editor.schema.nodes.taskList;
    const taskItemType = this.editor.schema.nodes.taskItem;
    if (!(taskListType && taskItemType)) {
      return [];
    }

    return [
      new Plugin({
        key: new PluginKey("taskListSort"),
        appendTransaction(transactions, _oldState, state) {
          const ranges: {
            from: number;
            to: number;
            fragment: ReturnType<typeof Fragment.from>;
          }[] = [];

          state.doc.descendants((node, pos) => {
            if (node.type !== taskListType) {
              return;
            }
            const contentStart = pos + 1;
            const contentEnd = pos + node.nodeSize - 1;
            const items: { node: ReturnType<typeof node.child> }[] = [];
            for (let i = 0; i < node.childCount; i++) {
              const child = node.child(i);
              if (child.type === taskItemType) {
                items.push({ node: child });
              }
            }
            const sorted = [...items].sort((a, b) => {
              const aChecked = (a.node.attrs as { checked?: boolean }).checked
                ? 0
                : 1;
              const bChecked = (b.node.attrs as { checked?: boolean }).checked
                ? 0
                : 1;
              return aChecked - bChecked;
            });
            const sameOrder = items.every((item, i) =>
              item.node.eq(sorted[i]!.node)
            );
            if (!sameOrder) {
              ranges.push({
                from: contentStart,
                to: contentEnd,
                fragment: Fragment.from(sorted.map((s) => s.node)),
              });
            }
          });

          if (ranges.length === 0) {
            return null;
          }
          const tr = state.tr;
          for (let i = ranges.length - 1; i >= 0; i--) {
            const { from, to, fragment } = ranges[i]!;
            tr.replaceWith(from, to, fragment);
          }
          return tr;
        },
      }),
    ];
  },
});

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getSlashMatch(editor: Editor): SlashMatch | null {
  const { selection } = editor.state;

  if (!selection.empty) {
    return null;
  }

  const { $from } = selection;

  if (!$from.parent.isTextblock) {
    return null;
  }

  const text = $from.parent.textContent.slice(0, $from.parentOffset);
  const slashStart = text.lastIndexOf("/");

  if (slashStart < 0) {
    return null;
  }
  if (slashStart > 0 && !/\s/.test(text[slashStart - 1])) {
    return null;
  }

  const typed = text.slice(slashStart + 1);

  if (/\s/.test(typed)) {
    return null;
  }

  const from = $from.start() + slashStart;

  return {
    query: typed.trim().toLowerCase(),
    from,
    to: from + typed.length + 1,
    text: `/${typed}`,
    key: `${from}:${typed}`,
  };
}

function getWikiMatch(editor: Editor): SlashMatch | null {
  const { selection } = editor.state;

  if (!selection.empty) {
    return null;
  }

  const { $from } = selection;

  if (!$from.parent.isTextblock) {
    return null;
  }

  const text = $from.parent.textContent.slice(0, $from.parentOffset);
  const openIndex = text.lastIndexOf("[[");

  if (openIndex < 0) {
    return null;
  }
  if (text.slice(openIndex).includes("]]")) {
    return null;
  }

  const query = text.slice(openIndex + 2);
  const from = $from.start() + openIndex;

  return {
    query: query.trim().toLowerCase(),
    from,
    to: $from.start() + $from.parentOffset,
    text: text.slice(openIndex),
    key: `${from}:${query}`,
  };
}

function slugifyWikiTitle(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getWikiHref(title: string, pages: WikiPage[]) {
  const normalized = title.trim().toLowerCase();
  const page = pages.find((entry) => entry.title.toLowerCase() === normalized);
  const slug = page?.id ?? slugifyWikiTitle(title);

  return `wiki:${slug}`;
}

function normalizeWikiSyntax(markdown: string, pages: WikiPage[]) {
  return markdown.replaceAll(WIKI_LINK_REGEX, (_full, rawTitle: string) => {
    const title = rawTitle.trim();

    if (!title) {
      return _full;
    }

    return `[${title}](${getWikiHref(title, pages)})`;
  });
}

function clearSlashText(editor: Editor, match: SlashMatch | null) {
  if (!match) {
    return;
  }

  editor.chain().focus().deleteRange({ from: match.from, to: match.to }).run();
}

function insertWikiLink(
  editor: Editor,
  title: string,
  pages: WikiPage[],
  range?: { from: number; to: number }
) {
  const chain = editor.chain().focus();

  if (range) {
    chain.deleteRange(range);
  }

  chain
    .insertContent([
      {
        type: "text",
        text: title,
        marks: [{ type: "link", attrs: { href: getWikiHref(title, pages) } }],
      },
      { type: "text", text: " " },
    ])
    .run();
}

function linkPrompt(editor: Editor) {
  const previous =
    (editor.getAttributes("link").href as string | undefined) ?? "";
  const raw = window.prompt("Paste a URL", previous);

  if (raw === null) {
    return;
  }

  const value = raw.trim();

  if (!value) {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }

  const href = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
}

function getScrollTarget(scrollContainerRef: RefObject<HTMLDivElement | null>) {
  return scrollContainerRef.current ?? window;
}

function getMathAnchorRect(editor: Editor, pos: number) {
  const nodeDom = editor.view.nodeDOM(pos);

  if (nodeDom instanceof HTMLElement) {
    return nodeDom.getBoundingClientRect();
  }

  const coords = editor.view.coordsAtPos(pos);

  return new DOMRect(
    coords.left,
    coords.top,
    1,
    Math.max(coords.bottom - coords.top, 1)
  );
}

function getActiveCodeBlockNode(editor: Editor) {
  const { $from } = editor.state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "codeBlock") {
      return { node, pos: $from.before(depth) };
    }
  }

  return null;
}

function highlightLatex(source: string) {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of source.matchAll(LATEX_TOKEN_REGEX)) {
    const token = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      parts.push(
        <span key={`plain-${lastIndex}`}>{source.slice(lastIndex, index)}</span>
      );
    }

    let className = "token-symbol";

    if (token.startsWith("%")) {
      className = "token-comment";
    } else if (token.startsWith("\\")) {
      className = "token-command";
    } else if (/^\d/.test(token)) {
      className = "token-number";
    }

    parts.push(
      <span className={className} key={`token-${index}`}>
        {token}
      </span>
    );

    lastIndex = index + token.length;
  }

  if (lastIndex < source.length) {
    parts.push(
      <span key={`tail-${lastIndex}`}>{source.slice(lastIndex)}</span>
    );
  }

  if (parts.length === 0) {
    return <span>&nbsp;</span>;
  }

  return parts;
}

type ToolbarButtonProps = {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
};

function ToolbarButton({
  title,
  active = false,
  onClick,
  children,
}: ToolbarButtonProps) {
  return (
    <Button
      aria-label={title}
      className={cn(
        "h-7 w-7 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        active && "bg-accent text-accent-foreground"
      )}
      onClick={onClick}
      onMouseDown={(event) => event.preventDefault()}
      size="icon-sm"
      title={title}
      type="button"
      variant="ghost"
    >
      {children}
    </Button>
  );
}

function SelectionBubbleMenu({
  editor,
  scrollContainerRef,
}: {
  editor: Editor;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor ? editor.isActive("bold") : false,
      italic: editor ? editor.isActive("italic") : false,
      strike: editor ? editor.isActive("strike") : false,
      code: editor ? editor.isActive("code") : false,
      highlight: editor ? editor.isActive("highlight") : false,
      link: editor ? editor.isActive("link") : false,
      table: editor ? editor.isActive("table") : false,
      textColor: editor
        ? (editor.getAttributes("textStyle").color as string)
        : null,
      highlightColor: editor
        ? (editor.getAttributes("highlight").color as string)
        : null,
    }),
  });

  return (
    <BubbleMenu
      appendTo={() => document.body}
      className="z-[80]"
      editor={editor}
      getReferencedVirtualElement={() => {
        // Anchor at the beginning of the selection (not the combined selection rect),
        // so multiline selections (e.g. Ctrl+A) don't position the bubble mid-page.
        const { from } = editor.state.selection;
        const pos = Math.max(1, from);
        const coords = editor.view.coordsAtPos(pos);

        return {
          getBoundingClientRect: () =>
            new DOMRect(
              coords.left,
              coords.top,
              1,
              Math.max(1, coords.bottom - coords.top)
            ),
        };
      }}
      options={{
        strategy: "fixed",
        placement: "top",
        offset: 8,
        flip: { padding: VIEWPORT_PADDING },
        shift: { padding: VIEWPORT_PADDING },
        scrollTarget: getScrollTarget(scrollContainerRef),
      }}
      pluginKey="formattingBubbleMenu"
      resizeDelay={0}
      shouldShow={({ editor, state }) =>
        Boolean(editor) &&
        !state.selection.empty &&
        !editor.isActive("table") &&
        !editor.isActive("inlineMath") &&
        !editor.isActive("blockMath") &&
        !editor.isActive("mermaidDiagram")
      }
      updateDelay={0}
    >
      <div className="flex items-center gap-1 rounded-xl border border-border bg-popover p-1 shadow-black/5 shadow-lg">
        <ToolbarButton
          active={state.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={state.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={state.strike}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={state.code}
          onClick={() => editor.chain().focus().toggleCode().run()}
          title="Code"
        >
          <Code className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={state.highlight}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          title="Highlight"
        >
          <Highlighter className="h-3.5 w-3.5" />
        </ToolbarButton>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-muted-foreground text-xs hover:bg-accent hover:text-accent-foreground"
            onMouseDown={(event) => event.preventDefault()}
          >
            Turn into
            <ChevronDown className="h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent sideOffset={6}>
            <DropdownMenuItem
              onClick={() => editor.chain().focus().setParagraph().run()}
            >
              Text
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 1 }).run()
              }
            >
              Heading 1
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 2 }).run()
              }
            >
              Heading 2
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 3 }).run()
              }
            >
              Heading 3
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              Bullet list
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              Numbered list
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => editor.chain().focus().toggleTaskList().run()}
            >
              To-do list
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            >
              Code block
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
            >
              Quote
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-muted-foreground text-xs hover:bg-accent hover:text-accent-foreground"
            onMouseDown={(event) => event.preventDefault()}
          >
            <Palette className="h-3.5 w-3.5" />
            Color
            <ChevronDown className="h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent sideOffset={6}>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Text</DropdownMenuLabel>
              {TEXT_COLORS.map((item) => (
                <DropdownMenuItem
                  key={`text-${item.name}`}
                  onClick={() => {
                    const chain = editor.chain().focus();
                    if (!item.value) {
                      chain.unsetColor().run();
                      return;
                    }
                    chain.setColor(item.value).run();
                  }}
                >
                  <span
                    className="h-3.5 w-3.5 rounded-sm border border-border"
                    style={{ background: item.value ?? "transparent" }}
                  />
                  {item.name}
                  {(item.value === null && !state.textColor) ||
                  item.value === state.textColor ? (
                    <Check className="ml-auto h-3.5 w-3.5" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Background</DropdownMenuLabel>
              {BG_COLORS.map((item) => (
                <DropdownMenuItem
                  key={`bg-${item.name}`}
                  onClick={() => {
                    const chain = editor.chain().focus();
                    if (!item.value) {
                      chain.unsetHighlight().run();
                      return;
                    }
                    chain.setHighlight({ color: item.value }).run();
                  }}
                >
                  <span
                    className="h-3.5 w-3.5 rounded-sm border border-border"
                    style={{ background: item.value ?? "transparent" }}
                  />
                  {item.name}
                  {(item.value === null && !state.highlightColor) ||
                  item.value === state.highlightColor ? (
                    <Check className="ml-auto h-3.5 w-3.5" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <ToolbarButton
          active={state.link}
          onClick={() => linkPrompt(editor)}
          title={state.link ? "Edit link" : "Add link"}
        >
          <Link2 className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>
    </BubbleMenu>
  );
}

function CodeBlockBubbleControls({
  editor,
  scrollContainerRef,
  onCopy,
}: {
  editor: Editor;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onCopy: () => void;
}) {
  const languageState = useEditorState({
    editor,
    selector: ({ editor }) => ({
      language: editor
        ? ((editor.getAttributes("codeBlock").language as string | null) ??
          "plaintext")
        : "plaintext",
    }),
  });
  const languages = useMemo(
    () => [
      "plaintext",
      ...Object.keys(common).sort((a, b) => a.localeCompare(b)),
    ],
    []
  );

  return (
    <BubbleMenu
      appendTo={() => document.body}
      className="z-[82]"
      editor={editor}
      options={{
        strategy: "fixed",
        placement: "top-end",
        offset: 6,
        flip: { padding: VIEWPORT_PADDING },
        shift: { padding: VIEWPORT_PADDING },
        scrollTarget: getScrollTarget(scrollContainerRef),
      }}
      pluginKey="codeBlockBubbleMenu"
      resizeDelay={0}
      shouldShow={({ editor }) =>
        Boolean(editor) && editor.isActive("codeBlock")
      }
      updateDelay={0}
    >
      <div className="flex items-center gap-1 rounded-md border border-border bg-popover p-1 shadow-md">
        <label className="relative inline-flex items-center">
          <select
            className="h-7 min-w-28 appearance-none rounded-sm border border-border bg-background px-2 pr-6 text-foreground text-xs outline-none"
            onChange={(event) => {
              const value = event.target.value;
              editor
                .chain()
                .focus()
                .updateAttributes("codeBlock", {
                  language: value === "plaintext" ? null : value,
                })
                .run();
            }}
            value={languageState.language || "plaintext"}
          >
            {languages.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 text-muted-foreground" />
        </label>
        <Button onClick={onCopy} size="sm" type="button" variant="outline">
          <Copy className="h-3.5 w-3.5" />
          Copy
        </Button>
      </div>
    </BubbleMenu>
  );
}

function SlashMenu({
  query,
  commands,
  activeIndex,
  onPick,
}: {
  query: string;
  commands: SlashCommand[];
  activeIndex: number;
  onPick: (index: number) => void;
}) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div className="w-80 overflow-hidden rounded-md border border-border bg-popover p-1 shadow-black/8 shadow-lg">
      <div className="border-border border-b px-3 py-2 text-[11px] text-muted-foreground">
        Slash commands {query ? `for “${query}”` : ""}
      </div>
      <div className="max-h-80 overflow-y-auto py-1">
        {commands.length === 0 ? (
          <p className="px-3 py-2 text-muted-foreground text-xs">
            No matching command
          </p>
        ) : (
          commands.map((command, index) => {
            const Icon = command.icon;
            const active = index === activeIndex;

            return (
              <button
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent"
                )}
                data-active={active}
                key={command.id}
                onClick={() => onPick(index)}
                onMouseDown={(event) => event.preventDefault()}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-xs">
                    {command.label}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {command.description}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function WikiMenu({
  query,
  pages,
  activeIndex,
  onPick,
}: {
  query: string;
  pages: WikiPage[];
  activeIndex: number;
  onPick: (index: number) => void;
}) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div className="w-80 overflow-hidden rounded-md border border-border bg-popover p-1 shadow-black/8 shadow-lg">
      <div className="border-border border-b px-3 py-2 text-[11px] text-muted-foreground">
        Wiki links {query ? `for “${query}”` : ""}
      </div>
      <div className="max-h-80 overflow-y-auto py-1">
        {pages.length === 0 ? (
          <p className="px-3 py-2 text-muted-foreground text-xs">
            No wiki pages found
          </p>
        ) : (
          pages.map((page, index) => {
            const active = index === activeIndex;

            return (
              <button
                className={cn(
                  "flex w-full flex-col rounded-sm px-2.5 py-2 text-left transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent"
                )}
                key={page.id}
                onClick={() => onPick(index)}
                onMouseDown={(event) => event.preventDefault()}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
              >
                <span className="truncate font-medium text-xs">
                  {page.title}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {page.excerpt}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function HighlightedTextarea({
  value,
  onChange,
  onKeyDown,
}: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);

  const syncScroll = () => {
    if (!(textareaRef.current && preRef.current)) {
      return;
    }

    preRef.current.scrollTop = textareaRef.current.scrollTop;
    preRef.current.scrollLeft = textareaRef.current.scrollLeft;
  };

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="latex-highlighter relative overflow-hidden rounded-xl border border-border bg-card">
      <pre
        aria-hidden
        className="pointer-events-none min-h-32 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[13px] leading-6"
        ref={preRef}
      >
        {highlightLatex(value)}
      </pre>
      <textarea
        className="absolute inset-0 min-h-32 resize-none overflow-auto bg-transparent px-3 py-2 font-mono text-[13px] text-transparent leading-6 caret-foreground outline-none selection:bg-accent/80 selection:text-transparent"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onScroll={syncScroll}
        ref={textareaRef}
        spellCheck={false}
        value={value}
      />
    </div>
  );
}

function MathPopover({
  editor,
  value,
  onChange,
  onSave,
  onCancel,
  onDelete,
  scrollContainerRef,
}: {
  editor: Editor;
  value: MathPopoverState | null;
  onChange: (next: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (!(value && popoverRef.current)) {
      return;
    }

    const updatePosition = () => {
      if (!popoverRef.current) {
        return;
      }

      const anchorRect = getMathAnchorRect(editor, value.pos);
      const popoverRect = popoverRef.current.getBoundingClientRect();
      const left = clamp(
        anchorRect.left,
        VIEWPORT_PADDING,
        window.innerWidth - popoverRect.width - VIEWPORT_PADDING
      );
      const canPlaceBelow =
        anchorRect.bottom + MENU_OFFSET + popoverRect.height <
        window.innerHeight - VIEWPORT_PADDING;
      const top = canPlaceBelow
        ? anchorRect.bottom + MENU_OFFSET
        : Math.max(
            VIEWPORT_PADDING,
            anchorRect.top - popoverRect.height - MENU_OFFSET
          );

      setStyle({ left, top });
    };

    updatePosition();

    const scrollTarget = scrollContainerRef.current;

    window.addEventListener("resize", updatePosition);
    scrollTarget?.addEventListener("scroll", updatePosition, { passive: true });

    return () => {
      window.removeEventListener("resize", updatePosition);
      scrollTarget?.removeEventListener("scroll", updatePosition);
    };
  }, [editor, scrollContainerRef, value]);

  useEffect(() => {
    if (!value) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;

      if (!target) {
        return;
      }
      if (popoverRef.current?.contains(target)) {
        return;
      }
      if (
        target.closest("[data-type='inline-math'], [data-type='block-math']")
      ) {
        return;
      }

      onCancel();
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [onCancel, value]);

  if (!value) {
    return null;
  }

  return (
    <div
      className="fixed z-[90] w-[min(24rem,calc(100vw-1.25rem))] rounded-lg border border-border bg-popover p-2.5 shadow-black/10 shadow-lg"
      ref={popoverRef}
      style={style ?? undefined}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-popover-foreground text-sm">
            {value.kind === "blockMath" ? "Block equation" : "Inline math"}
          </p>
        </div>
        <div className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {value.kind === "blockMath" ? "$$...$$" : "$...$"}
        </div>
      </div>

      <HighlightedTextarea
        onChange={onChange}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onSave();
            return;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
            return;
          }

          if (event.key === "Tab") {
            event.preventDefault();
            const textarea = event.currentTarget;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const nextValue = `${value.draft.slice(0, start)}  ${value.draft.slice(end)}`;

            onChange(nextValue);

            requestAnimationFrame(() => {
              textarea.selectionStart = start + 2;
              textarea.selectionEnd = start + 2;
            });
          }
        }}
        value={value.draft}
      />

      <div className="mt-2 flex items-center justify-between gap-2">
        <Button
          onClick={onDelete}
          onMouseDown={(event) => event.preventDefault()}
          size="sm"
          type="button"
          variant="destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
        <div className="flex items-center gap-2">
          <Button
            onClick={onCancel}
            onMouseDown={(event) => event.preventDefault()}
            size="sm"
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            onClick={onSave}
            onMouseDown={(event) => event.preventDefault()}
            size="sm"
            type="button"
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function MermaidPopover({
  editor,
  value,
  onChange,
  onSave,
  onCancel,
  onDelete,
  scrollContainerRef,
}: {
  editor: Editor;
  value: MermaidPopoverState | null;
  onChange: (next: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (!(value && popoverRef.current)) {
      return;
    }
    const updatePosition = () => {
      if (!popoverRef.current) {
        return;
      }
      const anchorRect = getMathAnchorRect(editor, value.pos);
      const popoverRect = popoverRef.current.getBoundingClientRect();
      const left = clamp(
        anchorRect.left,
        VIEWPORT_PADDING,
        window.innerWidth - popoverRect.width - VIEWPORT_PADDING
      );
      const canPlaceBelow =
        anchorRect.bottom + MENU_OFFSET + popoverRect.height <
        window.innerHeight - VIEWPORT_PADDING;
      const top = canPlaceBelow
        ? anchorRect.bottom + MENU_OFFSET
        : Math.max(
            VIEWPORT_PADDING,
            anchorRect.top - popoverRect.height - MENU_OFFSET
          );
      setStyle({ left, top });
    };
    updatePosition();
    const scrollTarget = scrollContainerRef.current;
    window.addEventListener("resize", updatePosition);
    scrollTarget?.addEventListener("scroll", updatePosition, { passive: true });
    return () => {
      window.removeEventListener("resize", updatePosition);
      scrollTarget?.removeEventListener("scroll", updatePosition);
    };
  }, [editor, scrollContainerRef, value]);

  useEffect(() => {
    if (!value) {
      return;
    }
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || popoverRef.current?.contains(target)) {
        return;
      }
      if (target.closest('[data-type="mermaid-diagram"]')) {
        return;
      }
      onCancel();
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [onCancel, value]);

  if (!value) {
    return null;
  }

  return (
    <div
      className="fixed z-[90] w-[min(28rem,calc(100vw-1.25rem))] rounded-lg border border-border bg-popover p-2.5 shadow-black/10 shadow-lg"
      ref={popoverRef}
      style={style ?? undefined}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-medium text-popover-foreground text-sm">
          Mermaid diagram
        </p>
        <div className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
          ```mermaid
        </div>
      </div>
      <textarea
        className="min-h-32 w-full resize-y rounded-xl border border-border bg-card px-3 py-2 font-mono text-[13px] text-foreground leading-6 outline-none"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onSave();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        rows={10}
        spellCheck={false}
        value={value.draft}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <Button
          onClick={onDelete}
          onMouseDown={(e) => e.preventDefault()}
          size="sm"
          type="button"
          variant="destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
        <div className="flex gap-2">
          <Button
            onClick={onCancel}
            onMouseDown={(e) => e.preventDefault()}
            size="sm"
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            onClick={onSave}
            onMouseDown={(e) => e.preventDefault()}
            size="sm"
            type="button"
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

type ImagePopoverState = {
  pos: number;
  src: string;
};

function ImagePopover({
  editor,
  value,
  onChange,
  onSave,
  onCancel,
  scrollContainerRef,
}: {
  editor: Editor;
  value: ImagePopoverState | null;
  onChange: (next: string) => void;
  onSave: () => void;
  onCancel: () => void;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (!(value && popoverRef.current)) {
      return;
    }

    const updatePosition = () => {
      if (!popoverRef.current) {
        return;
      }
      const anchorRect = getMathAnchorRect(editor, value.pos);
      const popoverRect = popoverRef.current.getBoundingClientRect();
      const left = clamp(
        anchorRect.left,
        VIEWPORT_PADDING,
        window.innerWidth - popoverRect.width - VIEWPORT_PADDING
      );
      const canPlaceBelow =
        anchorRect.bottom + MENU_OFFSET + popoverRect.height <
        window.innerHeight - VIEWPORT_PADDING;
      const top = canPlaceBelow
        ? anchorRect.bottom + MENU_OFFSET
        : Math.max(
            VIEWPORT_PADDING,
            anchorRect.top - popoverRect.height - MENU_OFFSET
          );
      setStyle({ left, top });
    };

    updatePosition();

    const scrollTarget = scrollContainerRef.current;
    window.addEventListener("resize", updatePosition);
    scrollTarget?.addEventListener("scroll", updatePosition, { passive: true });
    return () => {
      window.removeEventListener("resize", updatePosition);
      scrollTarget?.removeEventListener("scroll", updatePosition);
    };
  }, [editor, scrollContainerRef, value]);

  useEffect(() => {
    if (!value) {
      return;
    }
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) {
        return;
      }
      if (popoverRef.current?.contains(target)) {
        return;
      }
      if (target.closest("img")) {
        return;
      }
      onCancel();
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [onCancel, value]);

  if (!value) {
    return null;
  }

  return (
    <div
      className="fixed z-[90] w-[min(26rem,calc(100vw-1.25rem))] rounded-lg border border-border bg-popover p-2.5 shadow-black/10 shadow-lg"
      ref={popoverRef}
      style={style ?? undefined}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-medium text-popover-foreground text-sm">Image</p>
        <div className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
          URL
        </div>
      </div>
      <input
        className="h-8 w-full rounded-md border border-border bg-card px-2 text-foreground text-xs outline-none"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onSave();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder="https://example.com/image.png"
        value={value.src}
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button
          onClick={onCancel}
          onMouseDown={(e) => e.preventDefault()}
          size="sm"
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <Button
          onClick={onSave}
          onMouseDown={(e) => e.preventDefault()}
          size="sm"
          type="button"
        >
          Insert
        </Button>
      </div>
    </div>
  );
}

export default function AvenireEditor({
  defaultValue,
  onChange,
  scrollContainerRef,
  wikiPages,
  onOpenWikiLink,
  saveState,
  saveMessage,
}: AvenireEditorProps) {
  const slashCommandsRef = useRef<SlashCommand[]>([]);
  const wikiPagesRef = useRef<WikiPage[]>([]);
  const allWikiPagesRef = useRef<WikiPage[]>(wikiPages);
  const activeSlashIndexRef = useRef(0);
  const activeWikiIndexRef = useRef(0);
  const [slashNav, setSlashNav] = useState<{
    key: string | null;
    index: number;
  }>({
    key: null,
    index: 0,
  });
  const [wikiNav, setWikiNav] = useState<{
    key: string | null;
    index: number;
  }>({
    key: null,
    index: 0,
  });
  const [mathPopover, setMathPopover] = useState<MathPopoverState | null>(null);
  const [mermaidPopover, setMermaidPopover] =
    useState<MermaidPopoverState | null>(null);
  const [imagePopover, setImagePopover] = useState<ImagePopoverState | null>(
    null
  );
  const [aiLoading, setAiLoading] = useState<AiAction | null>(null);
  const [aiReview, setAiReview] = useState<{
    from: number;
    generatedLength: number;
    original: string;
  } | null>(null);
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);
  const [wikiPreview, setWikiPreview] = useState<{
    x: number;
    y: number;
    page: WikiPage;
  } | null>(null);
  const [tableContextMenu, setTableContextMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
  }>({ open: false, x: 0, y: 0 });
  const tableContextMenuRef = useRef<HTMLDivElement | null>(null);

  const resolveWikiPageFromHref = (href: string | null) => {
    if (!href) {
      return null;
    }
    const pageId = href.startsWith("wiki:")
      ? href.slice(5).toLowerCase()
      : href.startsWith("/wiki/")
        ? href.slice(6).toLowerCase()
        : "";

    if (!pageId) {
      return null;
    }
    return wikiPages.find((entry) => entry.id.toLowerCase() === pageId) ?? null;
  };

  const openMathEditor = (editor: Editor, kind: MathKind, pos: number) => {
    const node = editor.state.doc.nodeAt(pos);

    if (!node) {
      return;
    }

    setMathPopover({
      kind,
      pos,
      draft: String(node.attrs.latex ?? ""),
    });
  };

  useEffect(() => {
    allWikiPagesRef.current = wikiPages;
  }, [wikiPages]);

  useEffect(() => {
    if (!inlineNotice) {
      return;
    }

    const timer = window.setTimeout(() => setInlineNotice(null), 2200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [inlineNotice]);
  const normalizedDefaultValue = useMemo(
    () => normalizeWikiSyntax(defaultValue, wikiPages),
    [defaultValue, wikiPages]
  );

  const editor = useEditor({
    extensions: [
      Markdown.configure({
        markedOptions: {
          gfm: true,
        },
      }),
      StarterKit.configure({
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      BulletList.configure({
        keepMarks: true,
        keepAttributes: false,
      }),
      OrderedList.configure({
        keepMarks: true,
        keepAttributes: false,
      }),
      ListItem,
      ListKeymap.configure({
        listTypes: [
          {
            itemName: "listItem",
            wrapperNames: ["bulletList", "orderedList"],
          },
          {
            itemName: "taskItem",
            wrapperNames: ["taskList"],
          },
        ],
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TaskListSortExtension,
      TextStyle,
      Color,
      CodeBlockLowlight.configure({
        lowlight,
      }),
      HorizontalRule,
      Placeholder.configure({
        placeholder: "Type '/' for commands, or start with markdown shortcuts…",
      }),
      Highlight.configure({ multicolor: true }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
      }),
      BlockMathExtension.configure({
        onClick: (node, pos) => {
          setMathPopover({
            kind: "blockMath",
            pos,
            draft: String(node.attrs.latex ?? ""),
          });
        },
      }),
      InlineMathExtension.configure({
        onClick: (node, pos) => {
          setMathPopover({
            kind: "inlineMath",
            pos,
            draft: String(node.attrs.latex ?? ""),
          });
        },
      }),
      TableKit.configure({
        table: {
          resizable: true,
          renderWrapper: true,
          allowTableNodeSelection: true,
        },
      }),
      Image.configure({
        allowBase64: true,
        inline: false,
        resize: {
          enabled: true,
          directions: ["top", "bottom", "left", "right"],
          minWidth: 80,
          minHeight: 80,
          alwaysPreserveAspectRatio: true,
        },
      }),
      MermaidDiagramExtension.configure({
        onClick: (node: { attrs: { code?: string } }, pos: number) => {
          setMermaidPopover({
            pos,
            draft: String(node.attrs?.code ?? MERMAID_DEFAULT),
          });
        },
      }),
    ],
    content: normalizedDefaultValue,
    contentType: "markdown",
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        class:
          "tiptap scribe-surface min-h-[100dvh] px-4 py-8 outline-none sm:px-10 sm:py-10",
      },
      handleClick(_view, _pos, event) {
        const target = event.target as HTMLElement | null;
        const anchor = target?.closest(
          "a[href^='wiki:'], a[href^='/wiki/']"
        ) as HTMLAnchorElement | null;
        if (!(anchor && onOpenWikiLink)) {
          return false;
        }
        const page = resolveWikiPageFromHref(anchor.getAttribute("href"));
        if (!page) {
          return false;
        }
        event.preventDefault();
        onOpenWikiLink(page);
        return true;
      },
      handleDrop(view, event) {
        const files = event.dataTransfer?.files;
        if (!files?.length) {
          return false;
        }
        const file = files[0];
        if (!file?.type.startsWith("image/")) {
          return false;
        }
        event.preventDefault();
        const reader = new FileReader();
        reader.onload = () => {
          const src = reader.result as string;
          const coords = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          });
          if (coords) {
            const node = view.state.schema.nodes.image.create({ src });
            const tr = view.state.tr.insert(coords.pos, node);
            view.dispatch(tr);
          }
        };
        reader.readAsDataURL(file);
        return true;
      },
      handlePaste(view, event) {
        const files = event.clipboardData?.files;
        if (!files?.length) {
          return false;
        }
        const file = Array.from(files).find((f) => f.type.startsWith("image/"));
        if (!file) {
          return false;
        }
        event.preventDefault();
        const reader = new FileReader();
        reader.onload = () => {
          const src = reader.result as string;
          view.dispatch(
            view.state.tr.replaceSelectionWith(
              view.state.schema.nodes.image.create({ src })
            )
          );
        };
        reader.readAsDataURL(file);
        return true;
      },
    },
    onCreate: ({ editor }) => {
      migrateMathStrings(editor);
    },
    onUpdate: ({ editor }) => {
      onChange(
        normalizeWikiSyntax(editor.getMarkdown(), allWikiPagesRef.current)
      );
    },
  });

  const slashMatch = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? getSlashMatch(editor) : null),
  });
  const wikiMatch = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? getWikiMatch(editor) : null),
  });
  const tableState = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor) {
        return {
          active: false,
          addRowBefore: false,
          addRowAfter: false,
          addColumnBefore: false,
          addColumnAfter: false,
          deleteRow: false,
          deleteColumn: false,
          toggleHeaderRow: false,
          mergeOrSplit: false,
          splitCell: false,
          deleteTable: false,
        };
      }

      return {
        active: editor.isActive("table"),
        addRowBefore: editor.can().addRowBefore(),
        addRowAfter: editor.can().addRowAfter(),
        addColumnBefore: editor.can().addColumnBefore(),
        addColumnAfter: editor.can().addColumnAfter(),
        deleteRow: editor.can().deleteRow(),
        deleteColumn: editor.can().deleteColumn(),
        toggleHeaderRow: editor.can().toggleHeaderRow(),
        mergeOrSplit: editor.can().mergeOrSplit(),
        splitCell: editor.can().splitCell(),
        deleteTable: editor.can().deleteTable(),
      };
    },
  });

  const slashCommands = useMemo<SlashCommand[]>(() => {
    if (!editor) {
      return [];
    }

    const resolveAiTarget = () => {
      const { selection, doc } = editor.state;

      if (!selection.empty) {
        const selected = doc.textBetween(
          selection.from,
          selection.to,
          "\n",
          "\n"
        );
        if (selected.trim()) {
          return {
            from: selection.from,
            to: selection.to,
            text: selected,
          };
        }
      }

      const { $from } = selection;
      const currentBlockText = $from.parent.textContent;
      if ($from.parent.isTextblock && currentBlockText.trim()) {
        return {
          from: $from.start(),
          to: $from.end(),
          text: currentBlockText,
        };
      }

      let candidate: { from: number; to: number; text: string } | null = null;
      doc.nodesBetween(0, selection.from, (node, pos) => {
        if (!node.isTextblock) {
          return;
        }
        const text = node.textContent.trim();
        if (!text) {
          return;
        }
        candidate = {
          from: pos + 1,
          to: pos + node.nodeSize - 1,
          text: node.textContent,
        };
      });

      return candidate;
    };

    const runAiAction = async (action: AiAction) => {
      const target = resolveAiTarget();

      if (!target) {
        setInlineNotice("No text found to transform in this context.");
        return;
      }

      const source = target.text;

      if (!source.trim()) {
        setInlineNotice("No text found to transform in this context.");
        return;
      }

      setAiLoading(action);

      try {
        const response = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, text: source }),
        });

        if (!response.ok) {
          throw new Error("AI request failed");
        }

        const payload = (await response.json()) as { text?: string };
        const generated = payload.text?.trim();

        if (!generated) {
          throw new Error("No text generated");
        }

        const from = target.from;

        editor
          .chain()
          .focus()
          .deleteRange({ from: target.from, to: target.to })
          .insertContentAt(from, generated)
          .setTextSelection({ from, to: from + generated.length })
          .run();

        setAiReview({
          from,
          generatedLength: generated.length,
          original: source,
        });
      } catch {
        setInlineNotice("Could not generate text right now.");
      } finally {
        setAiLoading(null);
      }
    };

    const focusAndOpenMath = (kind: MathKind, latex: string) => {
      const pos = editor.state.selection.from;

      if (kind === "inlineMath") {
        editor.chain().focus().insertInlineMath({ latex, pos }).run();
      } else {
        editor.chain().focus().insertBlockMath({ latex, pos }).run();
      }

      requestAnimationFrame(() => {
        openMathEditor(editor, kind, pos);
      });
    };

    return [
      {
        id: "text",
        label: "Text",
        description: "Plain paragraph",
        icon: Pilcrow,
        keywords: ["paragraph", "p"],
        run: () => editor.chain().focus().setParagraph().run(),
      },
      {
        id: "h1",
        label: "Heading 1",
        description: "Large section title",
        icon: Heading1,
        keywords: ["title", "#"],
        run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      },
      {
        id: "h2",
        label: "Heading 2",
        description: "Medium heading",
        icon: Heading2,
        keywords: ["subtitle", "##"],
        run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        id: "h3",
        label: "Heading 3",
        description: "Small heading",
        icon: Heading3,
        keywords: ["###"],
        run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      },
      {
        id: "bullet",
        label: "Bullet List",
        description: "Create an unordered list",
        icon: List,
        keywords: ["list", "-", "ul"],
        run: () => editor.chain().focus().toggleBulletList().run(),
      },
      {
        id: "ordered",
        label: "Numbered List",
        description: "Create an ordered list",
        icon: ListOrdered,
        keywords: ["list", "1.", "ol"],
        run: () => editor.chain().focus().toggleOrderedList().run(),
      },
      {
        id: "task",
        label: "To-do List",
        description: "Track tasks with checkboxes",
        icon: ListTodo,
        keywords: ["task", "checkbox", "[]"],
        run: () => editor.chain().focus().toggleTaskList().run(),
      },
      {
        id: "quote",
        label: "Quote",
        description: "Blockquote",
        icon: Quote,
        keywords: [">", "blockquote"],
        run: () => editor.chain().focus().toggleBlockquote().run(),
      },
      {
        id: "code",
        label: "Code Block",
        description: "Multiline code snippet",
        icon: Code,
        keywords: ["```", "pre"],
        run: () => editor.chain().focus().toggleCodeBlock().run(),
      },
      {
        id: "image",
        label: "Image",
        description: "Insert image from URL",
        icon: ImageIcon,
        keywords: ["image", "photo", "picture"],
        run: () => {
          const previous =
            (editor.getAttributes("image").src as string | undefined) ?? "";
          const pos = editor.state.selection.from;
          setImagePopover({
            pos,
            src: previous,
          });
        },
      },
      {
        id: "divider",
        label: "Divider",
        description: "Horizontal rule",
        icon: Minus,
        keywords: ["hr", "---"],
        run: () => editor.chain().focus().setHorizontalRule().run(),
      },
      {
        id: "inline-math",
        label: "Inline Math",
        description: "Insert $...$ math",
        icon: Sigma,
        keywords: ["math", "latex", "$"],
        run: () => focusAndOpenMath("inlineMath", "x^2"),
      },
      {
        id: "block-math",
        label: "Block Equation",
        description: "Insert $$...$$ equation",
        icon: Sigma,
        keywords: ["math", "equation", "$$"],
        run: () => focusAndOpenMath("blockMath", "\\sum_{i=1}^{n} x_i"),
      },
      {
        id: "mermaid",
        label: "Mermaid Diagram",
        description: "Flowchart, sequence diagram, etc.",
        icon: Workflow,
        keywords: ["mermaid", "diagram", "flowchart", "chart"],
        run: () => {
          const pos = editor.state.selection.from;
          (
            editor.chain().focus() as unknown as {
              insertMermaidDiagram: (o: { pos: number }) => { run: () => void };
            }
          )
            .insertMermaidDiagram({ pos })
            .run();
          requestAnimationFrame(() => {
            const node = editor.state.doc.nodeAt(pos);
            if (node?.type.name === "mermaidDiagram") {
              setMermaidPopover({
                pos,
                draft: String(
                  (node.attrs as { code?: string }).code ?? MERMAID_DEFAULT
                ),
              });
            }
          });
        },
      },
      {
        id: "table",
        label: "Table",
        description: "Insert a 3x3 table with headers",
        icon: Table2,
        keywords: ["table", "grid", "|"],
        run: () =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run(),
      },
      {
        id: "ai-explain",
        label: "/explain",
        description:
          aiLoading === "explain" ? "Generating..." : "Explain selected text",
        icon: Sigma,
        keywords: ["explain", "ai"],
        run: () => runAiAction("explain"),
      },
      {
        id: "ai-elaborate",
        label: "/elaborate",
        description:
          aiLoading === "elaborate"
            ? "Generating..."
            : "Elaborate selected text",
        icon: Sigma,
        keywords: ["elaborate", "ai", "expand"],
        run: () => runAiAction("elaborate"),
      },
      {
        id: "ai-simplify",
        label: "/simplify",
        description:
          aiLoading === "simplify" ? "Generating..." : "Simplify selected text",
        icon: Sigma,
        keywords: ["simplify", "ai"],
        run: () => runAiAction("simplify"),
      },
    ];
  }, [aiLoading, editor]);

  const filteredSlashCommands = useMemo(() => {
    if (!slashMatch) {
      return [];
    }
    if (!slashMatch.query) {
      return slashCommands;
    }

    return slashCommands.filter((command) => {
      const haystack = [command.label, command.description, ...command.keywords]
        .join(" ")
        .toLowerCase();

      return haystack.includes(slashMatch.query);
    });
  }, [slashCommands, slashMatch]);
  const filteredWikiPages = useMemo(() => {
    if (!wikiMatch) {
      return [];
    }
    if (!wikiMatch.query) {
      return wikiPages;
    }

    return wikiPages.filter((page) => {
      const haystack =
        `${page.title} ${page.excerpt} ${page.content}`.toLowerCase();
      return haystack.includes(wikiMatch.query);
    });
  }, [wikiMatch, wikiPages]);

  const visibleSlashMatch = slashMatch ?? null;
  const visibleWikiMatch = wikiMatch ?? null;

  const activeSlashIndex =
    visibleSlashMatch && slashNav.key === visibleSlashMatch.key
      ? clamp(slashNav.index, 0, Math.max(filteredSlashCommands.length - 1, 0))
      : 0;
  const activeWikiIndex =
    visibleWikiMatch && wikiNav.key === visibleWikiMatch.key
      ? clamp(wikiNav.index, 0, Math.max(filteredWikiPages.length - 1, 0))
      : 0;

  useEffect(() => {
    slashCommandsRef.current = filteredSlashCommands;
  }, [filteredSlashCommands]);
  useEffect(() => {
    wikiPagesRef.current = filteredWikiPages;
  }, [filteredWikiPages]);

  useEffect(() => {
    activeSlashIndexRef.current = activeSlashIndex;
  }, [activeSlashIndex]);
  useEffect(() => {
    activeWikiIndexRef.current = activeWikiIndex;
  }, [activeWikiIndex]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    // When a slash or wiki match becomes visible, immediately recompute
    // the floating menu position using current selection + viewport.
    if (visibleSlashMatch || visibleWikiMatch) {
      const { state, view } = editor;
      view.dispatch(state.tr.setMeta("slashFloatingMenu", "updatePosition"));
      view.dispatch(state.tr.setMeta("wikiFloatingMenu", "updatePosition"));
    }
  }, [editor, visibleSlashMatch, visibleWikiMatch]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      const match = getSlashMatch(editor);
      const wiki = getWikiMatch(editor);

      if (event.key === "Escape") {
        const selection = editor.state.selection;

        if (mathPopover) {
          event.preventDefault();
          const pos = mathPopover.pos;
          const node = editor.state.doc.nodeAt(pos);
          setMathPopover(null);
          if (node) {
            const after = Math.min(
              pos + node.nodeSize,
              editor.state.doc.content.size
            );
            editor.view.dispatch(
              editor.state.tr.setSelection(
                TextSelection.create(editor.state.doc, after)
              )
            );
          }
          editor.view.focus();
          return;
        }

        if (mermaidPopover) {
          event.preventDefault();
          const pos = mermaidPopover.pos;
          const node = editor.state.doc.nodeAt(pos);
          setMermaidPopover(null);
          if (node) {
            const after = Math.min(
              pos + node.nodeSize,
              editor.state.doc.content.size
            );
            editor.view.dispatch(
              editor.state.tr.setSelection(
                TextSelection.create(editor.state.doc, after)
              )
            );
          }
          editor.view.focus();
          return;
        }

        if (selection instanceof NodeSelection) {
          const nodeName = selection.node.type.name;
          if (nodeName === "blockMath" || nodeName === "mermaidDiagram") {
            event.preventDefault();
            const after = Math.min(
              selection.from + selection.node.nodeSize,
              editor.state.doc.content.size
            );
            editor.view.dispatch(
              editor.state.tr.setSelection(
                TextSelection.create(editor.state.doc, after)
              )
            );
            editor.view.focus();
            return;
          }
        }

        // Escape out of code blocks (markdown code blocks) to the paragraph after.
        if (editor.isActive("codeBlock")) {
          const active = getActiveCodeBlockNode(editor);
          if (active) {
            event.preventDefault();
            const after = Math.min(
              active.pos + active.node.nodeSize,
              editor.state.doc.content.size
            );
            editor.view.dispatch(
              editor.state.tr.setSelection(
                TextSelection.create(editor.state.doc, after)
              )
            );
            editor.view.focus();
            return;
          }
        }
      }

      if (wiki) {
        const pages = wikiPagesRef.current;
        const activeIndex = activeWikiIndexRef.current;

        if (event.key === "ArrowDown") {
          event.preventDefault();
          setWikiNav((current) => ({
            key: wiki.key,
            index:
              pages.length === 0
                ? 0
                : current.key === wiki.key
                  ? (current.index + 1) % pages.length
                  : 0,
          }));
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          setWikiNav((current) => ({
            key: wiki.key,
            index:
              pages.length === 0
                ? 0
                : current.key === wiki.key
                  ? (current.index - 1 + pages.length) % pages.length
                  : Math.max(pages.length - 1, 0),
          }));
          return;
        }

        if (
          (event.key === "Enter" || event.key === "Tab") &&
          pages.length > 0
        ) {
          event.preventDefault();
          const page = pages[activeIndex];
          if (!page) {
            return;
          }
          insertWikiLink(editor, page.title, wikiPages, {
            from: wiki.from,
            to: wiki.to,
          });
          setWikiNav({ key: null, index: 0 });
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          editor
            .chain()
            .focus()
            .deleteRange({ from: wiki.from, to: wiki.to })
            .run();
          setWikiNav({ key: null, index: 0 });
          return;
        }
      }

      if (!match) {
        return;
      }

      const commands = slashCommandsRef.current;
      const activeIndex = activeSlashIndexRef.current;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSlashNav((current) => ({
          key: match.key,
          index:
            commands.length === 0
              ? 0
              : current.key === match.key
                ? (current.index + 1) % commands.length
                : 0,
        }));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSlashNav((current) => ({
          key: match.key,
          index:
            commands.length === 0
              ? 0
              : current.key === match.key
                ? (current.index - 1 + commands.length) % commands.length
                : Math.max(commands.length - 1, 0),
        }));
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        clearSlashText(editor, match);
        setSlashNav({ key: null, index: 0 });
        return;
      }

      if (
        (event.key === "Enter" || event.key === "Tab") &&
        commands.length > 0
      ) {
        event.preventDefault();
        const command = commands[activeIndex];
        if (!command) {
          return;
        }
        if (command.clearTrigger ?? true) {
          clearSlashText(editor, match);
        }
        void command.run({ match });
        setSlashNav({ key: null, index: 0 });
      }
    };

    const dom = editor.view.dom;

    dom.addEventListener("keydown", handleKeyDown, true);

    return () => {
      dom.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [editor, wikiPages]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const scrollTarget = getScrollTarget(scrollContainerRef);
    let frame = 0;

    const updateMenus = () => {
      if (frame) {
        return;
      }
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const { state, view } = editor;
        view.dispatch(state.tr.setMeta("slashFloatingMenu", "updatePosition"));
        view.dispatch(state.tr.setMeta("wikiFloatingMenu", "updatePosition"));
        view.dispatch(
          state.tr.setMeta("formattingBubbleMenu", "updatePosition")
        );
        view.dispatch(
          state.tr.setMeta("codeBlockBubbleMenu", "updatePosition")
        );
      });
    };

    scrollTarget.addEventListener("scroll", updateMenus, { passive: true });
    window.addEventListener("resize", updateMenus);

    return () => {
      scrollTarget.removeEventListener("scroll", updateMenus);
      window.removeEventListener("resize", updateMenus);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [editor, scrollContainerRef]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const dom = editor.view.dom;

    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;

      if (!target?.closest(".tableWrapper, table, th, td")) {
        return;
      }

      event.preventDefault();

      const pos = editor.view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
      });

      if (pos?.pos != null) {
        editor.chain().focus().setTextSelection(pos.pos).run();
      }

      setTableContextMenu({ open: true, x: event.clientX, y: event.clientY });
    };

    const closeMenu = () =>
      setTableContextMenu((current) =>
        current.open ? { ...current, open: false } : current
      );
    const handlePointerDown = (event: MouseEvent) => {
      if (
        !tableContextMenuRef.current?.contains(event.target as globalThis.Node)
      ) {
        closeMenu();
      }
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    dom.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", closeMenu, true);
    document.addEventListener("keydown", handleEscape);

    return () => {
      dom.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", closeMenu, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const dom = editor.view.dom;

    const handleMouseMove = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest(
        "a[href^='wiki:'], a[href^='/wiki/']"
      ) as HTMLAnchorElement | null;

      if (!anchor) {
        setWikiPreview(null);
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href) {
        setWikiPreview(null);
        return;
      }

      const page = resolveWikiPageFromHref(href);

      if (!page) {
        setWikiPreview(null);
        return;
      }

      setWikiPreview({
        x: event.clientX + 12,
        y: event.clientY + 12,
        page,
      });
    };

    const clearPreview = () => setWikiPreview(null);

    dom.addEventListener("mousemove", handleMouseMove);
    dom.addEventListener("mouseleave", clearPreview);

    return () => {
      dom.removeEventListener("mousemove", handleMouseMove);
      dom.removeEventListener("mouseleave", clearPreview);
    };
  }, [editor, wikiPages]);

  const tableActions = useMemo<TableAction[]>(() => {
    if (!(editor && tableState)) {
      return [];
    }

    return [
      {
        id: "add-row-before",
        label: "Row before",
        icon: BetweenHorizontalStart,
        disabled: !tableState.addRowBefore,
        run: () => editor.chain().focus().addRowBefore().run(),
      },
      {
        id: "add-row-after",
        label: "Row after",
        icon: BetweenHorizontalEnd,
        disabled: !tableState.addRowAfter,
        run: () => editor.chain().focus().addRowAfter().run(),
      },
      {
        id: "add-column-before",
        label: "Column before",
        icon: BetweenVerticalStart,
        disabled: !tableState.addColumnBefore,
        run: () => editor.chain().focus().addColumnBefore().run(),
      },
      {
        id: "add-column-after",
        label: "Column after",
        icon: BetweenVerticalEnd,
        disabled: !tableState.addColumnAfter,
        run: () => editor.chain().focus().addColumnAfter().run(),
      },
      {
        id: "delete-row",
        label: "Delete row",
        icon: Rows3,
        disabled: !tableState.deleteRow,
        run: () => editor.chain().focus().deleteRow().run(),
      },
      {
        id: "delete-column",
        label: "Delete column",
        icon: Columns3,
        disabled: !tableState.deleteColumn,
        run: () => editor.chain().focus().deleteColumn().run(),
      },
      {
        id: "toggle-header-row",
        label: "Header row",
        icon: Table2,
        disabled: !tableState.toggleHeaderRow,
        run: () => editor.chain().focus().toggleHeaderRow().run(),
      },
      {
        id: "merge-or-split",
        label: "Merge / split",
        icon: Merge,
        disabled: !tableState.mergeOrSplit,
        run: () => editor.chain().focus().mergeOrSplit().run(),
      },
      {
        id: "split-cell",
        label: "Split cell",
        icon: Split,
        disabled: !tableState.splitCell,
        run: () => editor.chain().focus().splitCell().run(),
      },
      {
        id: "delete-table",
        label: "Delete table",
        icon: Trash2,
        disabled: !tableState.deleteTable,
        run: () => editor.chain().focus().deleteTable().run(),
      },
    ];
  }, [editor, tableState]);

  if (!editor) {
    return null;
  }

  const executeSlashCommand = (index: number) => {
    const match = getSlashMatch(editor);
    const command = filteredSlashCommands[index];

    if (!command) {
      return;
    }

    if (command.clearTrigger ?? true) {
      clearSlashText(editor, match);
    }
    void command.run({ match });
    setSlashNav({ key: null, index: 0 });
  };

  return (
    <>
      <div className="scribe-shell">
        <SelectionBubbleMenu
          editor={editor}
          scrollContainerRef={scrollContainerRef}
        />

        <FloatingMenu
          appendTo={() => document.body}
          className="z-[80]"
          editor={editor}
          options={{
            strategy: "fixed",
            placement: "bottom-start",
            offset: 10,
            onUpdate: () => editor.commands.updateFloatingMenuPosition(),
            flip: { padding: VIEWPORT_PADDING },
            shift: { padding: VIEWPORT_PADDING },
            scrollTarget: getScrollTarget(scrollContainerRef),
          }}
          pluginKey="wikiFloatingMenu"
          resizeDelay={0}
          shouldShow={({ editor }) =>
            Boolean(editor) && getWikiMatch(editor) !== null
          }
          updateDelay={0}
        >
          {visibleWikiMatch ? (
            <WikiMenu
              activeIndex={activeWikiIndex}
              onPick={(index) => {
                const page = filteredWikiPages[index];
                if (!page) {
                  return;
                }
                insertWikiLink(editor, page.title, wikiPages, {
                  from: visibleWikiMatch.from,
                  to: visibleWikiMatch.to,
                });
                setWikiNav({ key: null, index: 0 });
              }}
              pages={filteredWikiPages}
              query={visibleWikiMatch.query}
            />
          ) : null}
        </FloatingMenu>

        <FloatingMenu
          appendTo={() => document.body}
          className="z-[80]"
          editor={editor}
          options={{
            strategy: "fixed",
            placement: "bottom-start",
            offset: 12,
            onUpdate: () => editor.commands.updateFloatingMenuPosition(),
            flip: { padding: VIEWPORT_PADDING },
            shift: { padding: VIEWPORT_PADDING },
            scrollTarget: getScrollTarget(scrollContainerRef),
          }}
          pluginKey="slashFloatingMenu"
          resizeDelay={0}
          shouldShow={({ editor }) =>
            Boolean(editor) && getSlashMatch(editor) !== null
          }
          updateDelay={0}
        >
          {visibleSlashMatch ? (
            <SlashMenu
              activeIndex={activeSlashIndex}
              commands={filteredSlashCommands}
              onPick={executeSlashCommand}
              query={visibleSlashMatch.query}
            />
          ) : null}
        </FloatingMenu>

        <CodeBlockBubbleControls
          editor={editor}
          onCopy={() => {
            const activeCodeBlock = getActiveCodeBlockNode(editor);

            if (!activeCodeBlock) {
              setInlineNotice("Place cursor in a code block first.");
              return;
            }

            void navigator.clipboard
              .writeText(activeCodeBlock.node.textContent)
              .then(() => setInlineNotice("Code copied."))
              .catch(() => setInlineNotice("Could not copy code."));
          }}
          scrollContainerRef={scrollContainerRef}
        />

        <EditorContent
          className="[&_.ProseMirror-focused]:outline-none"
          editor={editor}
        />

        <MathPopover
          editor={editor}
          onCancel={() => setMathPopover(null)}
          onChange={(next) => {
            setMathPopover((current) =>
              current ? { ...current, draft: next } : null
            );

            if (!mathPopover) {
              return;
            }

            if (mathPopover.kind === "inlineMath") {
              editor.commands.updateInlineMath({
                pos: mathPopover.pos,
                latex: next,
              });
            } else {
              editor.commands.updateBlockMath({
                pos: mathPopover.pos,
                latex: next,
              });
            }
          }}
          onDelete={() => {
            if (!mathPopover) {
              return;
            }

            if (mathPopover.kind === "inlineMath") {
              editor
                .chain()
                .focus()
                .deleteInlineMath({ pos: mathPopover.pos })
                .run();
            } else {
              editor
                .chain()
                .focus()
                .deleteBlockMath({ pos: mathPopover.pos })
                .run();
            }

            setMathPopover(null);
          }}
          onSave={() => {
            if (!mathPopover) {
              return;
            }

            if (mathPopover.kind === "inlineMath") {
              editor
                .chain()
                .focus()
                .updateInlineMath({
                  pos: mathPopover.pos,
                  latex: mathPopover.draft,
                })
                .run();
            } else {
              editor
                .chain()
                .focus()
                .updateBlockMath({
                  pos: mathPopover.pos,
                  latex: mathPopover.draft,
                })
                .run();
            }

            setMathPopover(null);
          }}
          scrollContainerRef={scrollContainerRef}
          value={mathPopover}
        />

        <MermaidPopover
          editor={editor}
          onCancel={() => setMermaidPopover(null)}
          onChange={(next) => {
            setMermaidPopover((current) =>
              current ? { ...current, draft: next } : null
            );
            if (mermaidPopover) {
              (
                editor.commands as unknown as {
                  updateMermaidDiagram: (o: {
                    pos: number;
                    code: string;
                  }) => boolean;
                }
              ).updateMermaidDiagram({
                pos: mermaidPopover.pos,
                code: next,
              });
            }
          }}
          onDelete={() => {
            if (!mermaidPopover) {
              return;
            }
            (
              editor.chain().focus() as unknown as {
                deleteMermaidDiagram: (o: { pos: number }) => {
                  run: () => void;
                };
              }
            )
              .deleteMermaidDiagram({ pos: mermaidPopover.pos })
              .run();
            setMermaidPopover(null);
          }}
          onSave={() => {
            if (!mermaidPopover) {
              return;
            }
            (
              editor.chain().focus() as unknown as {
                updateMermaidDiagram: (o: { pos: number; code: string }) => {
                  run: () => void;
                };
              }
            )
              .updateMermaidDiagram({
                pos: mermaidPopover.pos,
                code: mermaidPopover.draft,
              })
              .run();
            setMermaidPopover(null);
          }}
          scrollContainerRef={scrollContainerRef}
          value={mermaidPopover}
        />

        <ImagePopover
          editor={editor}
          onCancel={() => setImagePopover(null)}
          onChange={(next) => {
            setImagePopover((current) =>
              current ? { ...current, src: next } : null
            );
          }}
          onSave={() => {
            if (!imagePopover) {
              return;
            }
            const src = imagePopover.src.trim();
            if (!src) {
              setImagePopover(null);
              return;
            }
            editor.chain().focus().setImage({ src }).run();
            setImagePopover(null);
          }}
          scrollContainerRef={scrollContainerRef}
          value={imagePopover}
        />

        {tableContextMenu.open && tableState?.active ? (
          <div
            className="fixed z-[85] w-56 rounded-md border border-border bg-popover p-1 shadow-lg"
            onMouseDown={(event) => event.preventDefault()}
            ref={tableContextMenuRef}
            style={{ left: tableContextMenu.x, top: tableContextMenu.y }}
          >
            {tableActions.map((action) => {
              const Icon = action.icon;

              return (
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={action.disabled}
                  key={action.id}
                  onClick={() => {
                    action.run();
                    setTableContextMenu({ open: false, x: 0, y: 0 });
                  }}
                  type="button"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {action.label}
                </button>
              );
            })}
          </div>
        ) : null}

        {wikiPreview ? (
          <div
            className="fixed z-[90] w-72 rounded-md border border-border bg-popover p-2 shadow-lg"
            style={{ left: wikiPreview.x, top: wikiPreview.y }}
          >
            <p className="font-medium text-popover-foreground text-xs">
              {wikiPreview.page.title}
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              {wikiPreview.page.excerpt}
            </p>
          </div>
        ) : null}

        {inlineNotice ? (
          <div className="absolute right-3 bottom-3 z-[90] rounded-md border border-border bg-popover px-3 py-2 text-popover-foreground text-xs shadow-md">
            {inlineNotice}
          </div>
        ) : null}

        {saveState && saveState !== "idle" ? (
          <div
            className="scribe-autosave-badge"
            data-state={saveState}
            role="status"
          >
            {saveMessage ??
              (saveState === "saving"
                ? "Saving..."
                : saveState === "saved"
                  ? "Saved"
                  : "Save failed")}
          </div>
        ) : null}

        {aiReview ? (
          <div className="absolute right-3 bottom-3 z-[90] flex items-center gap-2 rounded-md border border-border bg-popover px-3 py-2 text-popover-foreground text-xs shadow-md">
            <span>Keep generated text?</span>
            <Button
              onClick={() => {
                editor
                  .chain()
                  .focus()
                  .deleteRange({
                    from: aiReview.from,
                    to: aiReview.from + aiReview.generatedLength,
                  })
                  .insertContentAt(aiReview.from, aiReview.original)
                  .setTextSelection({
                    from: aiReview.from,
                    to: aiReview.from + aiReview.original.length,
                  })
                  .run();
                setAiReview(null);
              }}
              onMouseDown={(event) => event.preventDefault()}
              size="xs"
              type="button"
              variant="outline"
            >
              Deny
            </Button>
            <Button
              onClick={() => setAiReview(null)}
              onMouseDown={(event) => event.preventDefault()}
              size="xs"
              type="button"
            >
              Accept
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
}
