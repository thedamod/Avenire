import matter from "gray-matter";
import type { PageMetadataState } from "@/lib/frontmatter";
import { normalizeFrontmatterProperties } from "@/lib/frontmatter";

export interface MarkdownNoteTemplateContext {
  createdBy?: string;
  now?: Date;
  title: string;
}

const TEMPLATE_TOKEN_REGEX = /{{\s*([a-zA-Z][\w-]*)(?::([^}]+))?\s*}}/g;
const FRONTMATTER_TITLE_KEY = "title";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateToken(date: Date, format: string) {
  const utc = {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hours: date.getUTCHours(),
    minutes: date.getUTCMinutes(),
    seconds: date.getUTCSeconds(),
    weekday: date.getUTCDay(),
  };

  const replacements: Array<[RegExp, string]> = [
    [/YYYY/g, String(utc.year)],
    [/YY/g, String(utc.year).slice(-2)],
    [
      /MMMM/g,
      new Intl.DateTimeFormat("en-US", {
        month: "long",
        timeZone: "UTC",
      }).format(date),
    ],
    [
      /MMM/g,
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        timeZone: "UTC",
      }).format(date),
    ],
    [/MM/g, pad(utc.month)],
    [/DD/g, pad(utc.day)],
    [/HH/g, pad(utc.hours)],
    [/mm/g, pad(utc.minutes)],
    [/ss/g, pad(utc.seconds)],
    [/A/g, utc.hours >= 12 ? "PM" : "AM"],
    [/a/g, utc.hours >= 12 ? "pm" : "am"],
    [
      /dddd/g,
      new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        timeZone: "UTC",
      }).format(date),
    ],
    [
      /ddd/g,
      new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        timeZone: "UTC",
      }).format(date),
    ],
  ];

  return replacements.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    format
  );
}

function resolveTemplateValue(
  token: string,
  format: string | undefined,
  context: MarkdownNoteTemplateContext
) {
  const normalizedToken = token.trim().toLowerCase();
  const now = context.now ?? new Date();

  if (normalizedToken === "title") {
    return context.title;
  }

  if (normalizedToken === "createdby") {
    return context.createdBy ?? "";
  }

  if (normalizedToken === "date") {
    return formatDateToken(now, format?.trim() || "YYYY-MM-DD");
  }

  if (normalizedToken === "time") {
    return formatDateToken(now, format?.trim() || "HH:mm");
  }

  if (normalizedToken === "datetime") {
    return formatDateToken(now, format?.trim() || "YYYY-MM-DD HH:mm");
  }

  return "";
}

export function renderMarkdownNoteTemplate(
  template: string,
  context: MarkdownNoteTemplateContext
) {
  return template.replace(
    TEMPLATE_TOKEN_REGEX,
    (_match, token: string, format?: string) =>
      resolveTemplateValue(token, format, context)
  );
}

export function stripMarkdownFrontmatter(content: string) {
  if (!content.startsWith("---")) {
    return content;
  }

  const match = content.match(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/);
  if (!match) {
    return content;
  }

  return content.slice(match[0].length).replace(/^\s+/, "");
}

export function isMarkdownNoteTemplateTargetEmpty(
  content: string,
  noteTitle: string
) {
  const body = stripMarkdownFrontmatter(content).trim();
  if (!body) {
    return true;
  }

  const normalizedTitle = noteTitle.trim();
  if (!normalizedTitle) {
    return false;
  }

  const escapedTitle = normalizedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingOnlyPattern = new RegExp(`^#\\s+${escapedTitle}\\s*$`, "i");

  return headingOnlyPattern.test(body);
}

export function extractMarkdownNotePageMetadata(content: string) {
  const parsed = matter(content);
  const frontmatter = parsed.data;
  const record =
    frontmatter &&
    typeof frontmatter === "object" &&
    !Array.isArray(frontmatter)
      ? (frontmatter as Record<string, unknown>)
      : null;

  if (!record) {
    return null;
  }

  const properties = normalizeFrontmatterProperties(
    Object.fromEntries(
      Object.entries(record).filter(
        ([key]) => key.trim().toLowerCase() !== FRONTMATTER_TITLE_KEY
      )
    )
  );

  if (Object.keys(properties).length === 0) {
    return null;
  }

  return {
    bannerUrl: null,
    icon: null,
    properties,
  } satisfies PageMetadataState;
}
