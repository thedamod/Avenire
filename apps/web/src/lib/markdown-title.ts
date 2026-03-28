const FRONTMATTER_BLOCK_REGEX = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/;
const FRONTMATTER_TITLE_REGEX = /^\s*title:\s*(.+?)\s*$/im;
const ATX_HEADING_REGEX = /^#\s+(.+?)\s*$/m;

function stripQuotes(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }

  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if (
    (first === '"' && last === '"') ||
    (first === "'" && last === "'")
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function extractFrontmatterTitle(markdown: string) {
  const frontmatter = markdown.match(FRONTMATTER_BLOCK_REGEX)?.[1] ?? "";
  if (!frontmatter) {
    return null;
  }

  const title = frontmatter.match(FRONTMATTER_TITLE_REGEX)?.[1] ?? "";
  const normalized = stripQuotes(title);
  return normalized.length > 0 ? normalized : null;
}

function extractFirstHeading(markdown: string) {
  const heading = markdown.match(ATX_HEADING_REGEX)?.[1] ?? "";
  const normalized = heading.trim();
  return normalized.length > 0 ? normalized : null;
}

export function getMarkdownDisplayTitle(
  markdown: string,
  fallbackTitle: string
) {
  const frontmatterTitle = extractFrontmatterTitle(markdown);
  if (frontmatterTitle) {
    return frontmatterTitle;
  }

  const heading = extractFirstHeading(markdown);
  if (heading) {
    return heading;
  }

  return fallbackTitle;
}
