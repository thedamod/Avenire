import matter from "gray-matter";

export interface FrontmatterProperties {
  [key: string]: string | number | boolean | string[] | null;
}

export interface PageMetadataState {
  bannerUrl: string | null;
  icon: string | null;
  properties: FrontmatterProperties;
}

export interface ParsedFrontmatter {
  hasFrontmatter: boolean;
  properties: FrontmatterProperties;
}

export interface FrontmatterDocument {
  body: string;
  hasFrontmatter: boolean;
  properties: FrontmatterProperties;
}

export interface ResolvedPageDocument {
  body: string;
  hasLegacyFrontmatter: boolean;
  page: PageMetadataState;
}

export const EMPTY_PAGE_METADATA_STATE: PageMetadataState = {
  bannerUrl: null,
  icon: null,
  properties: {},
};

function isFrontmatterScalar(
  value: unknown
): value is string | number | boolean | string[] | null {
  if (value === null) {
    return true;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  return (
    Array.isArray(value) &&
    value.every(
      (entry) => typeof entry === "string" && entry.trim().length > 0
    )
  );
}

export function normalizeFrontmatterProperties(
  value: unknown
): FrontmatterProperties {
  if (!(value && typeof value === "object" && !Array.isArray(value))) {
    return {};
  }

  const entries: Array<
    readonly [string, string | number | boolean | string[] | null]
  > = [];
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.trim();
    if (!normalizedKey || !isFrontmatterScalar(entry)) {
      continue;
    }
    if (Array.isArray(entry)) {
      entries.push([
        normalizedKey,
        entry.map((item) => item.trim()).filter(Boolean),
      ]);
      continue;
    }
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      entries.push([normalizedKey, trimmed.length > 0 ? trimmed : null]);
      continue;
    }
    entries.push([normalizedKey, entry]);
  }

  return Object.fromEntries(entries);
}

export function normalizePageMetadataState(value: unknown): PageMetadataState {
  if (!(value && typeof value === "object" && !Array.isArray(value))) {
    return EMPTY_PAGE_METADATA_STATE;
  }

  const record = value as Record<string, unknown>;
  const bannerUrl =
    typeof record.bannerUrl === "string" && record.bannerUrl.trim().length > 0
      ? record.bannerUrl.trim()
      : null;
  const icon =
    typeof record.icon === "string" && record.icon.trim().length > 0
      ? record.icon.trim()
      : null;

  return {
    bannerUrl,
    icon,
    properties: normalizeFrontmatterProperties(record.properties),
  };
}

export function resolvePageDocument(input: {
  content: string;
  page?: unknown;
}): ResolvedPageDocument {
  const split = splitFrontmatterDocument(input.content);
  const metadataPage = normalizePageMetadataState(input.page);
  const page =
    split.hasFrontmatter && Object.keys(split.properties).length > 0
      ? {
          ...metadataPage,
          properties: split.properties,
        }
      : metadataPage;

  return {
    body: split.body,
    hasLegacyFrontmatter: split.hasFrontmatter,
    page,
  };
}

export function areFrontmatterPropertiesEqual(
  left: FrontmatterProperties,
  right: FrontmatterProperties
) {
  return (
    JSON.stringify(normalizeFrontmatterProperties(left)) ===
    JSON.stringify(normalizeFrontmatterProperties(right))
  );
}

export function arePageMetadataStatesEqual(
  left: PageMetadataState,
  right: PageMetadataState
) {
  return (
    left.bannerUrl === right.bannerUrl &&
    left.icon === right.icon &&
    areFrontmatterPropertiesEqual(left.properties, right.properties)
  );
}

export function parseFrontmatter(content: string): ParsedFrontmatter {
  try {
    const { data } = matter(content);
    const properties = normalizeFrontmatterProperties(data);

    if (Object.keys(properties).length === 0) {
      return {
        properties: {},
        hasFrontmatter: false,
      };
    }

    return {
      properties,
      hasFrontmatter: true,
    };
  } catch {
    return {
      properties: {},
      hasFrontmatter: false,
    };
  }
}

export function stripFrontmatter(content: string): string {
  return splitFrontmatterDocument(content).body;
}

export function splitFrontmatterDocument(content: string): FrontmatterDocument {
  if (!content.trimStart().startsWith("---")) {
    return {
      body: content,
      hasFrontmatter: false,
      properties: {},
    };
  }

  try {
    const parsed = matter(content);
    const properties = normalizeFrontmatterProperties(parsed.data);
    return {
      body: parsed.content,
      hasFrontmatter: Object.keys(properties).length > 0,
      properties,
    };
  } catch {
    return {
      body: content,
      hasFrontmatter: false,
      properties: {},
    };
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function parseValue(
  value: string,
  type?: string
): FrontmatterProperties[string] {
  if (!value || value.trim() === "") {
    return null;
  }

  if (type === "array") {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  if (type === "number") {
    const num = Number(value);
    return isNaN(num) ? value : num;
  }

  if (type === "boolean") {
    return value.toLowerCase() === "true";
  }

  return value;
}

export function serializeFrontmatter(
  properties: FrontmatterProperties
): string {
  if (Object.keys(properties).length === 0) {
    return "";
  }

  const lines: string[] = [];
  for (const [key, value] of Object.entries(properties)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(", ")}]`);
    } else if (typeof value === "object") {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else if (typeof value === "string" && value.includes("\n")) {
      lines.push(`${key}: |`);
      for (const line of value.split("\n")) {
        lines.push(`  ${line}`);
      }
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  return lines.join("\n");
}

export function updateContentWithFrontmatter(
  content: string,
  properties: FrontmatterProperties
): string {
  const frontmatterContent = serializeFrontmatter(properties);
  const { body } = splitFrontmatterDocument(content);
  if (!frontmatterContent) {
    return body.trimStart();
  }

  const normalizedBody = body.replace(/^\n+/, "");
  if (!normalizedBody) {
    return `---\n${frontmatterContent}\n---\n`;
  }

  return `---\n${frontmatterContent}\n---\n\n${normalizedBody}`;
}

export { formatValue, parseValue };

export const COMMON_PROPERTIES = [
  { key: "title", label: "Title", type: "string" },
  { key: "tags", label: "Tags", type: "array" },
  { key: "date", label: "Date", type: "date" },
  { key: "status", label: "Status", type: "select" },
  { key: "type", label: "Type", type: "select" },
  { key: "archived", label: "Archived", type: "boolean" },
  { key: "author", label: "Author", type: "string" },
  { key: "description", label: "Description", type: "string" },
  { key: "priority", label: "Priority", type: "select" },
];

export const STATUS_OPTIONS = ["draft", "review", "published", "archived"];
export const TYPE_OPTIONS = [
  "note",
  "document",
  "article",
  "journal",
  "reference",
];
export const PRIORITY_OPTIONS = ["low", "medium", "high", "critical"];
