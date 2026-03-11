"use client";

import type { UIMessage } from "@avenire/ai/message-types";
import { ChevronRight } from "lucide-react";
import { motion, useSpring } from "framer-motion";
import { useEffect, useId, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type ToolPart = Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;

type ReadPreview = {
  content: string;
  path: string;
};

type SearchPreview = {
  matches: string[];
  query: string;
};

export type ActivityAction =
  | {
      kind: "create" | "delete" | "edit";
      path: string;
      pending: boolean;
    }
  | {
      from: string;
      kind: "move";
      pending: boolean;
      to?: string;
    }
  | {
      kind: "list";
      pending: boolean;
      value: string;
    }
  | {
      kind: "read";
      pending: boolean;
      preview?: ReadPreview;
      value: string;
    }
  | {
      kind: "search";
      pending: boolean;
      preview?: SearchPreview;
      value: string;
    };

type ExploreAction = Extract<
  ActivityAction,
  { kind: "list" | "read" | "search" }
>;
type MutationAction = Exclude<ActivityAction, ExploreAction>;

type ExploreItem = {
  action: ExploreAction;
  label: string;
  value: string;
};

type ActionGroup =
  | { items: ExploreItem[]; type: "explore" }
  | { action: MutationAction; type: "mutation" };

const ROLLING_TOOL_TYPES = new Set([
  "tool-create_note",
  "tool-delete_file",
  "tool-get_file_summary",
  "tool-list_files",
  "tool-move_file",
  "tool-read_note",
  "tool-read_workspace_file",
  "tool-search_materials",
  "tool-update_note",
]);

const EXPLORE_KINDS = new Set<ActivityAction["kind"]>([
  "list",
  "read",
  "search",
]);
const ROW_HEIGHT = 22;
const VISIBLE_ROWS = 3;
const WINDOW_HEIGHT = ROW_HEIGHT * VISIBLE_ROWS;

function isOutputAvailable(part: ToolPart) {
  return part.state === "output-available";
}

function isPending(part: ToolPart) {
  return part.state === "input-streaming" || part.state === "input-available";
}

function isExploreAction(action: ActivityAction): action is ExploreAction {
  return EXPLORE_KINDS.has(action.kind);
}

function toPreviewContent(value: string | undefined) {
  if (!value) {
    return "";
  }

  return value.trim();
}

function toReadPreview(part: ToolPart): ReadPreview | undefined {
  switch (part.type) {
    case "tool-read_note":
    case "tool-read_workspace_file":
      if (!isOutputAvailable(part)) {
        return undefined;
      }
      return {
        content: toPreviewContent(part.output.content),
        path: part.output.workspacePath,
      };
    case "tool-get_file_summary":
      if (!isOutputAvailable(part)) {
        return undefined;
      }
      return {
        content: toPreviewContent(
          part.output.chunks
            .slice(0, 2)
            .map((chunk) => chunk.content)
            .join("\n")
        ),
        path: part.output.workspacePath,
      };
    default:
      return undefined;
  }
}

function toSearchPreview(part: ToolPart): SearchPreview | undefined {
  if (part.type !== "tool-search_materials" || !isOutputAvailable(part)) {
    return undefined;
  }

  return {
    matches: part.output.matches
      .map((match) => match.workspacePath)
      .filter(Boolean)
      .slice(0, 6),
    query: part.output.query,
  };
}

function toActionValue(part: ToolPart) {
  switch (part.type) {
    case "tool-read_note":
    case "tool-read_workspace_file":
      return isOutputAvailable(part)
        ? part.output.workspacePath
        : (part.input?.fileId ?? "note");
    case "tool-get_file_summary":
      return isOutputAvailable(part)
        ? part.output.workspacePath
        : (part.input?.fileId ?? "file");
    case "tool-search_materials":
      return part.input?.query ?? "search";
    case "tool-list_files":
      return part.input?.folderId ?? "workspace";
    case "tool-create_note":
      return isOutputAvailable(part)
        ? part.output.workspacePath
        : `${part.input?.title?.trim() || "untitled-note"}.md`;
    case "tool-update_note":
      return isOutputAvailable(part)
        ? part.output.workspacePath
        : (part.input?.fileId ?? "note");
    case "tool-move_file":
      return isOutputAvailable(part)
        ? part.output.workspacePath
        : (part.input?.workspacePathHint ?? part.input?.fileId ?? "file");
    case "tool-delete_file":
      return isOutputAvailable(part)
        ? part.output.workspacePath
        : (part.input?.workspacePathHint ?? part.input?.fileId ?? "file");
    default:
      return "";
  }
}

function toAction(part: ToolPart): ActivityAction | null {
  if (
    part.state === "output-error" ||
    part.state === "approval-requested" ||
    part.state === "approval-responded" ||
    !ROLLING_TOOL_TYPES.has(part.type)
  ) {
    return null;
  }

  switch (part.type) {
    case "tool-read_note":
    case "tool-read_workspace_file":
    case "tool-get_file_summary":
      return {
        kind: "read",
        pending: isPending(part),
        preview: toReadPreview(part),
        value: toActionValue(part) || "file",
      };
    case "tool-search_materials":
      return {
        kind: "search",
        pending: isPending(part),
        preview: toSearchPreview(part),
        value: toActionValue(part) || "search",
      };
    case "tool-list_files":
      return {
        kind: "list",
        pending: isPending(part),
        value: toActionValue(part) || "workspace",
      };
    case "tool-create_note":
      return {
        kind: "create",
        path: toActionValue(part) || "note",
        pending: isPending(part),
      };
    case "tool-update_note":
      return {
        kind: "edit",
        path: toActionValue(part) || "note",
        pending: isPending(part),
      };
    case "tool-move_file":
      return {
        from: isOutputAvailable(part)
          ? part.output.previousWorkspacePath
          : (part.input?.workspacePathHint ?? part.input?.fileId ?? "file"),
        kind: "move",
        pending: isPending(part),
        to: isOutputAvailable(part)
          ? part.output.workspacePath
          : part.input?.targetFolderPathHint,
      };
    case "tool-delete_file":
      return {
        kind: "delete",
        path: toActionValue(part) || "file",
        pending: isPending(part),
      };
    default:
      return null;
  }
}

function labelFor(action: ExploreAction): string {
  switch (action.kind) {
    case "read":
      return "Read";
    case "search":
      return "Search";
    case "list":
      return "List";
    default:
      return "";
  }
}

function groupActions(actions: ActivityAction[]): ActionGroup[] {
  const groups: ActionGroup[] = [];

  for (const action of actions) {
    if (isExploreAction(action)) {
      const item: ExploreItem = {
        action,
        label: labelFor(action),
        value: action.value,
      };
      const lastGroup = groups.at(-1);
      if (lastGroup?.type === "explore") {
        lastGroup.items.push(item);
      } else {
        groups.push({ items: [item], type: "explore" });
      }
      continue;
    }

    groups.push({ action, type: "mutation" });
  }

  return groups;
}

function buildSummary(items: ExploreItem[]) {
  const reads = items.filter((item) => item.action.kind === "read").length;
  const searches = items.filter((item) => item.action.kind === "search").length;
  const lists = items.filter((item) => item.action.kind === "list").length;
  const parts: string[] = [];

  if (reads > 0) {
    parts.push(`${reads} read${reads === 1 ? "" : "s"}`);
  }
  if (searches > 0) {
    parts.push(`${searches} search${searches === 1 ? "" : "es"}`);
  }
  if (lists > 0) {
    parts.push(`${lists} list${lists === 1 ? "" : "s"}`);
  }

  return parts.join(", ");
}

function Dot({ delay }: { delay: number }) {
  return (
    <motion.span
      animate={{ opacity: [0.15, 0.7, 0.15] }}
      aria-hidden="true"
      className="inline-block size-[3px] rounded-full bg-current"
      transition={{ delay, duration: 1.5, ease: "easeInOut", repeat: Infinity }}
    />
  );
}

function ThinkingDots() {
  return (
    <span
      aria-hidden="true"
      className="ml-1 inline-flex -translate-y-px items-center gap-[3px]"
    >
      <Dot delay={0} />
      <Dot delay={0.25} />
      <Dot delay={0.5} />
    </span>
  );
}

function RollingWindow({ items }: { items: ExploreItem[] }) {
  const targetY =
    items.length > VISIBLE_ROWS
      ? -(items.length - VISIBLE_ROWS) * ROW_HEIGHT
      : 0;
  const springY = useSpring(targetY, {
    damping: 20,
    mass: 0.5,
    stiffness: 160,
  });

  useEffect(() => {
    springY.set(targetY);
  }, [springY, targetY]);

  return (
    <>
      <div
        aria-hidden="true"
        className="relative mt-[3px]"
        style={{ height: WINDOW_HEIGHT, overflow: "hidden" }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10"
          style={{
            background:
              "linear-gradient(to bottom, hsl(var(--background)) 15%, transparent 100%)",
            height: ROW_HEIGHT * 1.4,
          }}
        />
        <motion.div style={{ y: springY }}>
          {items.map((item, index) => (
            <div
              className="flex items-baseline gap-2 pl-4"
              key={`${item.label}-${item.value}-${index}`}
              style={{ height: ROW_HEIGHT }}
            >
              <span className="w-14 shrink-0 text-[11px] font-semibold text-foreground/45">
                {item.label}
              </span>
              <span className="truncate font-mono text-[11px] text-foreground/22">
                {item.value}
              </span>
            </div>
          ))}
        </motion.div>
      </div>
      <ul className="sr-only">
        {items.map((item, index) => (
          <li key={`${item.label}-${item.value}-${index}`}>
            {item.label}: {item.value}
          </li>
        ))}
      </ul>
    </>
  );
}

function ReadPreviewPanel({
  open,
  preview,
}: {
  open: boolean;
  preview: ReadPreview;
}) {
  const lines = preview.content
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .slice(0, 2);

  return (
    <motion.div
      animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
      initial={false}
      style={{ overflow: "hidden" }}
      transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="mt-0.5 mb-1.5 ml-[60px] overflow-hidden rounded border border-foreground/[0.07] bg-foreground/[0.025]">
        <div className="border-foreground/[0.06] border-b px-2.5 pt-1.5 pb-1">
          <span className="block truncate font-mono text-[10px] text-foreground/28">
            {preview.path}
          </span>
        </div>
        <pre className="overflow-hidden px-2.5 py-1.5 font-mono text-[10.5px] leading-[1.55] text-foreground/32">
          {lines.join("\n")}
        </pre>
      </div>
    </motion.div>
  );
}

function SearchPreviewPanel({
  open,
  preview,
}: {
  open: boolean;
  preview: SearchPreview;
}) {
  return (
    <motion.div
      animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
      initial={false}
      style={{ overflow: "hidden" }}
      transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="mt-0.5 mb-1.5 ml-[60px] overflow-hidden rounded border border-foreground/[0.07] bg-foreground/[0.025]">
        <div className="border-foreground/[0.06] border-b px-2.5 pt-1.5 pb-1">
          <span className="font-mono text-[10px] text-foreground/28">
            {preview.matches.length} match
            {preview.matches.length === 1 ? "" : "es"}
            {" · "}
            <span className="text-foreground/40">{preview.query}</span>
          </span>
        </div>
        <ul className="space-y-[3px] px-2.5 py-1.5">
          {preview.matches.map((match, index) => (
            <li
              className="truncate font-mono text-[10.5px] text-foreground/30"
              key={`${match}-${index}`}
            >
              {match}
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

function AccordionFileRow({
  index,
  item,
  parentOpen,
}: {
  index: number;
  item: ExploreItem;
  parentOpen: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const rowId = useId();
  const panelId = useId();

  const hasPreview =
    (item.action.kind === "read" && item.action.preview) ||
    (item.action.kind === "search" && item.action.preview);

  useEffect(() => {
    if (!parentOpen) {
      setExpanded(false);
    }
  }, [parentOpen]);

  const rowContent = (
    <div
      className="flex items-baseline gap-2 pl-4"
      style={{ height: ROW_HEIGHT }}
    >
      <span className="w-14 shrink-0 text-[11px] font-semibold text-foreground/32">
        {item.label}
      </span>
      <span className="flex-1 truncate font-mono text-[11px] text-foreground/20">
        {item.value}
      </span>
      {hasPreview ? (
        <motion.span
          animate={{ rotate: expanded ? 90 : 0 }}
          aria-hidden="true"
          className="mr-2 shrink-0 text-foreground/18 transition-colors duration-150 group-hover:text-foreground/36"
          transition={{ duration: 0.2, ease: "easeInOut" }}
        >
          <ChevronRight className="size-3" strokeWidth={1.5} />
        </motion.span>
      ) : null}
    </div>
  );

  return (
    <motion.li
      animate={{ opacity: parentOpen ? 1 : 0 }}
      initial={{ opacity: 0 }}
      key={`${item.label}-${item.value}-${index}`}
      transition={{ delay: parentOpen ? index * 0.025 : 0, duration: 0.16 }}
    >
      {hasPreview ? (
        <button
          aria-controls={panelId}
          aria-expanded={expanded}
          className={cn(
            "group w-full rounded-sm text-left transition-colors duration-150 hover:bg-foreground/[0.03]",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          )}
          id={rowId}
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          {rowContent}
        </button>
      ) : (
        <div>{rowContent}</div>
      )}

      {item.action.kind === "read" && item.action.preview ? (
        <div aria-labelledby={rowId} id={panelId} role="region">
          <ReadPreviewPanel open={expanded} preview={item.action.preview} />
        </div>
      ) : null}
      {item.action.kind === "search" && item.action.preview ? (
        <div aria-labelledby={rowId} id={panelId} role="region">
          <SearchPreviewPanel open={expanded} preview={item.action.preview} />
        </div>
      ) : null}
    </motion.li>
  );
}

function AccordionPanel({
  id,
  items,
  open,
}: {
  id: string;
  items: ExploreItem[];
  open: boolean;
}) {
  return (
    <motion.div
      animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
      id={id}
      initial={false}
      role="region"
      style={{ overflow: "hidden" }}
      transition={{ duration: 0.36, ease: [0.4, 0, 0.2, 1] }}
    >
      <ul aria-label="Files accessed" className="mt-[3px]">
        {items.map((item, index) => (
          <AccordionFileRow
            index={index}
            item={item}
            key={`${item.label}-${item.value}-${index}`}
            parentOpen={open}
          />
        ))}
      </ul>
    </motion.div>
  );
}

function ExploreBlock({
  done,
  items,
}: {
  done: boolean;
  items: ExploreItem[];
}) {
  const [open, setOpen] = useState(false);
  const triggerId = useId();
  const panelId = useId();
  const summary = buildSummary(items);

  useEffect(() => {
    if (!done) {
      setOpen(false);
    }
  }, [done]);

  return (
    <div className="mb-0.5">
      {done ? (
        <button
          aria-controls={panelId}
          aria-expanded={open}
          className={cn(
            "group flex h-7 w-full items-center gap-2 rounded-sm text-left",
            "text-foreground/52 transition-colors duration-200 hover:text-foreground/72",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          )}
          id={triggerId}
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <span className="text-sm font-semibold">Explored</span>
          {summary ? (
            <span className="text-[11px] text-foreground/26">{summary}</span>
          ) : null}
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            aria-hidden="true"
            className="ml-0.5 text-foreground/22 transition-colors duration-200 group-hover:text-foreground/42"
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <ChevronRight className="size-3 rotate-90" strokeWidth={2} />
          </motion.span>
        </button>
      ) : (
        <div
          aria-label={`Exploring: ${summary || "starting"}`}
          aria-live="polite"
          className="flex h-7 items-center gap-2"
          role="status"
        >
          <span className="text-sm font-semibold text-foreground/32">
            Exploring
          </span>
          {summary ? (
            <span aria-hidden="true" className="text-[11px] text-foreground/26">
              {summary}
            </span>
          ) : null}
          <ThinkingDots />
        </div>
      )}

      {!done && items.length > 0 ? <RollingWindow items={items} /> : null}
      {done ? <AccordionPanel id={panelId} items={items} open={open} /> : null}
    </div>
  );
}

function MutationBlock({ action }: { action: MutationAction }) {
  const path =
    action.kind === "move" ? (action.to ?? action.from) : action.path;
  const pathParts = path.split("/");
  const filename = pathParts.pop() ?? path;
  const directory = pathParts.length > 0 ? `${pathParts.join("/")}/` : "";
  const label =
    action.kind === "create"
      ? "Create"
      : action.kind === "delete"
        ? "Delete"
        : action.kind === "move"
          ? "Move"
          : "Edit";

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="mb-1 flex items-baseline gap-2 text-sm"
      initial={{ opacity: 0, y: 5 }}
      role="listitem"
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <span className="font-semibold text-foreground/72">{label}</span>
      <span className="font-mono text-[12px] text-foreground/62">
        {filename}
      </span>
      <span className="font-mono text-[11px] text-foreground/20">
        {directory}
      </span>
      {action.kind === "move" ? (
        <span className="font-mono text-[11px] text-foreground/32">
          {action.from}
          {action.to ? ` -> ${action.to}` : ""}
        </span>
      ) : null}
      {action.pending ? (
        <span className="font-mono text-[11px] text-foreground/28">
          running
          <ThinkingDots />
        </span>
      ) : null}
    </motion.div>
  );
}

export function isRollingToolPart(part: ToolPart) {
  return toAction(part) !== null;
}

export function RollingAgentActivity({
  actions,
  isStreaming,
}: {
  actions: ActivityAction[];
  isStreaming: boolean;
}) {
  const groups = useMemo(() => groupActions(actions), [actions]);

  if (groups.length === 0) {
    return null;
  }

  const isGroupDone = (groupIndex: number) => {
    const group = groups[groupIndex];
    if (!group || group.type !== "explore") {
      return true;
    }

    const isLastGroup = groupIndex === groups.length - 1;
    return !(isLastGroup && isStreaming);
  };

  return (
    <div className="mb-0.5 font-mono" role="list" aria-label="Agent activity">
      {groups.map((group, index) => {
        if (group.type === "explore") {
          return (
            <ExploreBlock
              done={isGroupDone(index)}
              items={group.items}
              key={`agent-explore-${index}`}
            />
          );
        }

        return (
          <MutationBlock
            action={group.action}
            key={`agent-mutation-${index}`}
          />
        );
      })}
    </div>
  );
}

export function RollingToolActivity({
  isStreaming,
  parts,
}: {
  isStreaming: boolean;
  parts: ToolPart[];
}) {
  const actions = useMemo(
    () => parts.map((part) => toAction(part)).filter((part) => part !== null),
    [parts]
  );
  const groups = useMemo(() => groupActions(actions), [actions]);

  if (groups.length === 0) {
    return null;
  }

  const isGroupDone = (groupIndex: number) => {
    const group = groups[groupIndex];
    if (!group || group.type !== "explore") {
      return true;
    }

    const isLastGroup = groupIndex === groups.length - 1;
    return !(isLastGroup && isStreaming);
  };

  return (
    <div className="mb-0.5 font-mono" role="list" aria-label="Agent activity">
      {groups.map((group, index) => {
        if (group.type === "explore") {
          return (
            <ExploreBlock
              done={isGroupDone(index)}
              items={group.items}
              key={`explore-${index}`}
            />
          );
        }

        return (
          <MutationBlock action={group.action} key={`mutation-${index}`} />
        );
      })}
    </div>
  );
}
