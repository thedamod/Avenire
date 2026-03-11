import matter from "gray-matter";

export interface FrontmatterProperties {
  [key: string]: string | number | boolean | string[] | null;
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

export function parseFrontmatter(content: string): ParsedFrontmatter {
  try {
    const { data } = matter(content);

    if (Object.keys(data).length === 0) {
      return {
        properties: {},
        hasFrontmatter: false,
      };
    }

    return {
      properties: data as FrontmatterProperties,
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
    return {
      body: parsed.content,
      hasFrontmatter: Object.keys(parsed.data).length > 0,
      properties: parsed.data as FrontmatterProperties,
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
