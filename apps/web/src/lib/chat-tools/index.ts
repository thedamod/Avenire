import {
  generateText,
  Output,
  type ToolSet,
  tool,
} from "@avenire/ai";
import type {
  AgentActivityAction,
  AgentActivityData,
} from "@avenire/ai/message-types";
import { apollo } from "@avenire/ai/models";
import { chatToolSchemas } from "@avenire/ai/tools";
import {
  AVAILABLE_MODULES,
  getGuidelines,
} from "@avenire/ai/generative-ui/guidelines";
import { retrieveWorkspaceChunks } from "@avenire/ingestion";
import { scheduleIngestionJob } from "@avenire/ingestion/queue";
import { createClient, type RedisClientType } from "redis";
import { z } from "zod";
import {
  createFolder,
  createWorkspaceNoteFile,
  getFileAssetById,
  getNoteContent,
  isSharedFilesVirtualFolderId,
  listWorkspaceFiles,
  listWorkspaceFolders,
  updateNoteContent,
  userCanEditFile,
  userCanEditFolder,
} from "@/lib/file-data";
import { publishFilesInvalidationEvent } from "@/lib/files-realtime-publisher";
import {
  createFlashcardCardForUser,
  createFlashcardSetForUser,
  type FlashcardCardKind,
  getFlashcardDashboardForUser,
  listDueFlashcardsForUser,
} from "@/lib/flashcards";
import {
  deleteIngestionDataForFile,
  getIngestionSummaryForFile,
} from "@/lib/ingestion-data";
import { publishWorkspaceStreamEvent } from "@/lib/workspace-event-stream";

const DEFAULT_SEARCH_LIMIT = 8;
const DEFAULT_FILE_LIST_LIMIT = 50;
const DEFAULT_DUE_CARD_LIMIT = 5;
const DEFAULT_NOTE_MAX_CHARS = 16_000;
const NOTE_TEXT_BYTE_LIMIT = 512_000;
const STUDY_SOURCE_CHAR_LIMIT = 18_000;
const STUDY_QUERY_MATCH_LIMIT = 8;
const NOTES_FOLDER_NAME = "Notes";
const AGENT_DEFAULT_MATCH_LIMIT = 10;
const AGENT_DEFAULT_MAX_FILES = 3;
const AGENT_MAX_FILE_CHARS = 4000;
const AGENT_MAX_OUTPUT_TOKENS = 220;
const FILE_MANAGER_DEFAULT_MAX_FILES = 4;
const FILE_MANAGER_LIST_LIMIT = 120;
const FILE_MANAGER_MAX_FILE_CHARS = 5000;
const FILE_MANAGER_MAX_OUTPUT_TOKENS = 260;
const MISCONCEPTION_KEY_PREFIX = "chat-misconceptions:";
const MISCONCEPTION_CONTEXT_LIMIT = 5;

type FlashcardTaxonomy = {
  concept: string;
  subject: string;
  topic: string;
};

type ChatToolContext = {
  agentActivityId: string;
  chatSlug: string;
  emitAgentActivity?: (data: AgentActivityData) => void;
  rootFolderId: string;
  userId: string;
  workspaceId: string;
};

type ExplorerFileLike = Awaited<ReturnType<typeof listWorkspaceFiles>>[number];

type WorkspacePathMaps = {
  filePathById: Map<string, string>;
  folderPathById: Map<string, string>;
};

type MisconceptionRecord = {
  confidence: number;
  concept: string;
  createdAt: string;
  reason: string;
  resolvedAt: string | null;
  source: string;
  subject: string;
  topic: string;
  updatedAt: string;
  workspaceId: string;
};

const misconceptionRecordSchema = z.object({
  confidence: z.number().min(0).max(1),
  concept: z.string(),
  createdAt: z.string(),
  reason: z.string(),
  resolvedAt: z.string().nullable(),
  source: z.string(),
  subject: z.string(),
  topic: z.string(),
  updatedAt: z.string(),
  workspaceId: z.string(),
});

const misconceptionListSchema = z.array(misconceptionRecordSchema);

let misconceptionRedisClient: RedisClientType | null = null;

function hasMisconceptionStore() {
  return Boolean(process.env.REDIS_URL);
}

async function getMisconceptionRedisClient() {
  if (!process.env.REDIS_URL) {
    return null;
  }

  if (!misconceptionRedisClient) {
    misconceptionRedisClient = createClient({ url: process.env.REDIS_URL });
    misconceptionRedisClient.on("error", (error) => {
      console.error("Redis client error in chat-tools misconception store", error);
    });
  }

  if (!misconceptionRedisClient.isOpen) {
    await misconceptionRedisClient.connect();
  }

  return misconceptionRedisClient;
}

function getMisconceptionStoreKey(params: {
  userId: string;
  workspaceId: string;
}) {
  return `${MISCONCEPTION_KEY_PREFIX}${params.workspaceId}:${params.userId}`;
}

function normalizeMisconceptionField(value: string, maxLength: number) {
  return sanitizeTaxonomyLabel(value, maxLength).replace(/\s+/g, " ");
}

function normalizeMisconceptionIdentity(record: {
  concept: string;
  subject: string;
}) {
  return `${normalizeMisconceptionField(record.subject, 80).toLowerCase()}::${normalizeMisconceptionField(record.concept, 180).toLowerCase()}`;
}

async function loadMisconceptions(params: {
  userId: string;
  workspaceId: string;
}) {
  if (!hasMisconceptionStore()) {
    return [];
  }

  try {
    const client = await getMisconceptionRedisClient();
    if (!client) {
      return [];
    }

    const raw = await client.get(getMisconceptionStoreKey(params));
    if (!raw) {
      return [];
    }

    const parsed = misconceptionListSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return [];
    }

    return parsed.data;
  } catch (error) {
    console.error("Failed to load misconceptions", { error, ...params });
    return [];
  }
}

async function saveMisconceptions(params: {
  misconceptions: MisconceptionRecord[];
  userId: string;
  workspaceId: string;
}) {
  if (!hasMisconceptionStore()) {
    return;
  }

  try {
    const client = await getMisconceptionRedisClient();
    if (!client) {
      return;
    }

    await client.set(
      getMisconceptionStoreKey(params),
      JSON.stringify(params.misconceptions),
      { EX: 60 * 60 * 24 * 30 }
    );
  } catch (error) {
    console.error("Failed to save misconceptions", { error, ...params });
  }
}

function buildMisconceptionContext(misconceptions: MisconceptionRecord[]) {
  if (misconceptions.length === 0) {
    return null;
  }

  const lines = misconceptions.slice(0, MISCONCEPTION_CONTEXT_LIMIT).map(
    (misconception, index) =>
      `${index + 1}. ${misconception.concept} [${misconception.subject} / ${misconception.topic}] - ${misconception.reason} (confidence ${misconception.confidence.toFixed(2)})`
  );

  return [
    "Active learning misconceptions:",
    ...lines,
    "Use this as private tutoring context. Correct these misunderstandings when relevant, but do not mention that this context was injected unless the user asks.",
  ].join("\n");
}

export async function getActiveMisconceptionContext(params: {
  subject?: string | null;
  userId: string;
  workspaceId: string;
}) {
  const subject = params.subject?.trim();
  if (!subject) {
    return null;
  }

  const misconceptions = await loadMisconceptions({
    userId: params.userId,
    workspaceId: params.workspaceId,
  });
  const active = misconceptions
    .filter(
      (misconception) =>
        !misconception.resolvedAt &&
        normalizeMisconceptionField(misconception.subject, 80).toLowerCase() ===
          normalizeMisconceptionField(subject, 80).toLowerCase()
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MISCONCEPTION_CONTEXT_LIMIT);

  return buildMisconceptionContext(active);
}

async function upsertMisconception(params: {
  confidence: number;
  concept: string;
  reason: string;
  subject: string;
  topic: string;
  userId: string;
  workspaceId: string;
}) {
  const now = new Date().toISOString();
  const normalizedConcept = sanitizeTaxonomyLabel(params.concept, 180);
  const normalizedSubject = sanitizeTaxonomyLabel(params.subject, 80);
  const normalizedTopic = sanitizeTaxonomyLabel(params.topic, 120);
  const normalizedReason = sanitizeTaxonomyLabel(params.reason, 400);

  const misconceptions = await loadMisconceptions({
    userId: params.userId,
    workspaceId: params.workspaceId,
  });

  const nextRecord: MisconceptionRecord = {
    confidence: Math.max(0, Math.min(1, params.confidence)),
    concept: normalizedConcept,
    createdAt: now,
    reason: normalizedReason,
    resolvedAt: null,
    source: "chat_tool",
    subject: normalizedSubject,
    topic: normalizedTopic,
    updatedAt: now,
    workspaceId: params.workspaceId,
  };

  const identity = normalizeMisconceptionIdentity(nextRecord);
  const index = misconceptions.findIndex(
    (record) =>
      !record.resolvedAt &&
      normalizeMisconceptionIdentity(record) === identity
  );

  if (index >= 0) {
    const existing = misconceptions[index];
    misconceptions[index] = {
      ...existing,
      confidence: Math.min(
        1,
        Math.max(existing.confidence, nextRecord.confidence) + 0.1
      ),
      reason: nextRecord.reason,
      subject: nextRecord.subject,
      topic: nextRecord.topic,
      updatedAt: now,
    };
  } else {
    misconceptions.unshift(nextRecord);
  }

  await saveMisconceptions({
    misconceptions,
    userId: params.userId,
    workspaceId: params.workspaceId,
  });

  const activeCount = misconceptions.filter(
    (record) =>
      !record.resolvedAt &&
      normalizeMisconceptionIdentity(record) === identity
  ).length;

  return {
    activeCount,
    misconception: misconceptions.find(
      (record) => normalizeMisconceptionIdentity(record) === identity
    ) ?? nextRecord,
  };
}

function formatCitationLocation(match: {
  endMs?: number | null;
  page?: number | null;
  startMs?: number | null;
}) {
  if (typeof match.page === "number") {
    return ` p.${match.page}`;
  }

  if (typeof match.startMs === "number") {
    const startSeconds = Math.max(0, Math.floor(match.startMs / 1000));
    const startMinutes = Math.floor(startSeconds / 60);
    const remainingSeconds = startSeconds % 60;

    if (typeof match.endMs === "number") {
      const endSeconds = Math.max(0, Math.floor(match.endMs / 1000));
      const endMinutes = Math.floor(endSeconds / 60);
      const remainingEndSeconds = endSeconds % 60;
      return ` ${startMinutes}:${String(remainingSeconds).padStart(2, "0")}-${endMinutes}:${String(remainingEndSeconds).padStart(2, "0")}`;
    }

    return ` ${startMinutes}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return "";
}

function buildCitationMarkdown(
  citations: Array<{
    endMs?: number | null;
    fileId: string | null;
    page?: number | null;
    startMs?: number | null;
    workspacePath: string;
  }>
) {
  return citations
    .filter((citation) => Boolean(citation.fileId))
    .slice(0, 3)
    .map((citation) => {
      const label = `${citation.workspacePath}${formatCitationLocation(citation)}`;
      return `[${label}](workspace-file://${citation.fileId})`;
    })
    .join(", ");
}

const flashcardGenerationSchema = z.object({
  cards: z
    .array(
      z.object({
        backMarkdown: z.string().min(1),
        frontMarkdown: z.string().min(1),
        notesMarkdown: z.string().nullable().optional(),
        tags: z.array(z.string()).max(12).optional(),
      })
    )
    .min(1)
    .max(24),
  title: z.string().min(1),
});

const quizGenerationSchema = z.object({
  questions: z
    .array(
      z.object({
        backMarkdown: z.string().min(1),
        correctOptionIndex: z.number().int().nonnegative(),
        explanation: z.string().nullable().optional(),
        frontMarkdown: z.string().min(1),
        options: z.array(z.string().min(1)).min(2).max(8),
        tags: z.array(z.string()).max(12).optional(),
      })
    )
    .min(3)
    .max(5),
  title: z.string().min(1),
});

const agentSelectionSchema = z.object({
  indices: z.array(z.number().int().nonnegative()).max(6),
});

function emitAgentActivityUpdate(
  ctx: ChatToolContext,
  actions: AgentActivityAction[],
  status: AgentActivityData["status"] = "running"
) {
  ctx.emitAgentActivity?.({
    actions,
    id: ctx.agentActivityId,
    status,
  });
}

function slugifyTitle(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return normalized.length > 0 ? normalized.slice(0, 80) : "untitled-note";
}

function toMarkdownFileName(title: string) {
  const base = slugifyTitle(title);
  return base.endsWith(".md") ? base : `${base}.md`;
}

function isMarkdownFile(file: ExplorerFileLike) {
  const mime = file.mimeType?.toLowerCase() ?? "";
  const name = file.name.toLowerCase();
  return (
    mime.startsWith("text/markdown") ||
    mime.startsWith("text/plain") ||
    name.endsWith(".md") ||
    name.endsWith(".mdx") ||
    name.endsWith(".txt")
  );
}

function buildNoteContent(params: {
  content: string;
  tags?: string[];
  title: string;
}) {
  const normalizedContent = params.content.trim();
  const tags = (params.tags ?? []).map((tag) => tag.trim()).filter(Boolean);
  const frontMatterLines = [`title: ${params.title}`];
  if (tags.length > 0) {
    frontMatterLines.push(`tags: [${tags.join(", ")}]`);
  }
  const frontMatter = `---\n${frontMatterLines.join("\n")}\n---\n\n`;
  return `${frontMatter}${normalizedContent}\n`;
}

function applyNoteUpdate(params: {
  content: string;
  currentContent: string;
  mode: "append" | "replace_entire" | "replace_section";
  sectionHeading?: string | undefined;
}) {
  if (params.mode === "append") {
    const base = params.currentContent.trimEnd();
    return `${base}${base.length > 0 ? "\n\n" : ""}${params.content.trim()}\n`;
  }

  if (params.mode === "replace_entire") {
    return `${params.content.trim()}\n`;
  }

  const heading = params.sectionHeading?.trim();
  if (!heading) {
    throw new Error("replace_section requires sectionHeading.");
  }

  const lines = params.currentContent.split("\n");
  const headingPattern = new RegExp(
    `^#{1,6}\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
    "i"
  );
  const sectionStart = lines.findIndex((line) =>
    headingPattern.test(line.trim())
  );
  const replacement = [`## ${heading}`, "", params.content.trim(), ""];

  if (sectionStart < 0) {
    const base = params.currentContent.trimEnd();
    return (
      `${base}${base.length > 0 ? "\n\n" : ""}${replacement.join("\n")}`.trimEnd() +
      "\n"
    );
  }

  let sectionEnd = lines.length;
  for (let index = sectionStart + 1; index < lines.length; index += 1) {
    if (/^#{1,6}\s+/.test(lines[index] ?? "")) {
      sectionEnd = index;
      break;
    }
  }

  return (
    [
      ...lines.slice(0, sectionStart),
      ...replacement,
      ...lines.slice(sectionEnd),
    ]
      .join("\n")
      .trimEnd() + "\n"
  );
}

function sanitizeTaxonomyLabel(value: string, maxLength: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function inferFlashcardTaxonomy(input: {
  query?: string;
  sourceText: string;
  title: string;
}): FlashcardTaxonomy {
  const haystack = `${input.title} ${input.query ?? ""} ${input.sourceText}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ");

  const subjectMatchers: Array<{ keywords: string[]; subject: string }> = [
    {
      keywords: ["physics", "quantum", "mechanics", "thermodynamics"],
      subject: "physics",
    },
    {
      keywords: ["chemistry", "molecule", "reaction", "organic", "gibbs"],
      subject: "chemistry",
    },
    {
      keywords: ["biology", "cell", "gene", "genetics", "evolution"],
      subject: "biology",
    },
    {
      keywords: ["calculus", "algebra", "geometry", "statistics", "probability"],
      subject: "mathematics",
    },
    {
      keywords: ["history", "war", "revolution", "empire", "civilization"],
      subject: "history",
    },
    {
      keywords: ["economics", "market", "inflation", "finance", "trade"],
      subject: "economics",
    },
    {
      keywords: ["computer", "algorithm", "database", "network", "programming"],
      subject: "computer science",
    },
    {
      keywords: ["psychology", "behavior", "memory", "cognition", "emotion"],
      subject: "psychology",
    },
    {
      keywords: ["law", "contract", "tort", "liability", "statute"],
      subject: "law",
    },
  ];

  const matchedSubject =
    subjectMatchers.find((entry) =>
      entry.keywords.some((keyword) => haystack.includes(keyword))
    )?.subject ?? "general studies";

  const topicSource =
    input.query?.trim() || input.title.trim() || input.sourceText.trim();
  const topic = sanitizeTaxonomyLabel(topicSource || matchedSubject, 120);
  const concept = sanitizeTaxonomyLabel(
    topicSource || `${matchedSubject} core concept`,
    180
  );

  return {
    concept,
    subject: matchedSubject,
    topic,
  };
}

async function buildWorkspacePathMaps(
  workspaceId: string,
  userId: string
): Promise<WorkspacePathMaps> {
  const [folders, files] = await Promise.all([
    listWorkspaceFolders(workspaceId, userId),
    listWorkspaceFiles(workspaceId, userId),
  ]);

  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const folderPathCache = new Map<string, string>();

  const getFolderPath = (folderId: string | null): string => {
    if (!folderId) {
      return "";
    }

    const cached = folderPathCache.get(folderId);
    if (typeof cached === "string") {
      return cached;
    }

    const folder = folderById.get(folderId);
    if (!folder) {
      return "";
    }

    const parentPath = getFolderPath(folder.parentId);
    const currentSegment = folder.parentId === null ? "" : folder.name;
    const nextPath = [parentPath, currentSegment].filter(Boolean).join("/");
    folderPathCache.set(folderId, nextPath);
    return nextPath;
  };

  const filePathById = new Map<string, string>();
  for (const folder of folders) {
    getFolderPath(folder.id);
  }
  for (const file of files) {
    const folderPath = getFolderPath(file.folderId);
    filePathById.set(
      file.id,
      [folderPath, file.name].filter(Boolean).join("/")
    );
  }

  return {
    filePathById,
    folderPathById: folderPathCache,
  };
}

async function fetchWorkspaceFileText(
  file: ExplorerFileLike,
  maxChars = DEFAULT_NOTE_MAX_CHARS
) {
  if (!isMarkdownFile(file)) {
    throw new Error("Only markdown and text files can be read as notes.");
  }

  if (file.isNote) {
    const note = await getNoteContent(file.id);
    if (note?.content == null) {
      throw new Error("Failed to fetch note content.");
    }
    const text = note.content;
    if (Buffer.byteLength(text, "utf8") > NOTE_TEXT_BYTE_LIMIT) {
      throw new Error("The note is too large to load into chat context.");
    }
    return text.slice(0, Math.max(250, maxChars));
  }

  const response = await fetch(file.storageUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch file content (${response.status}).`);
  }

  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > NOTE_TEXT_BYTE_LIMIT) {
    throw new Error("The note is too large to load into chat context.");
  }

  return text.slice(0, Math.max(250, maxChars));
}

function getWorkspacePathForFile(
  file: Pick<ExplorerFileLike, "id" | "name">,
  maps: WorkspacePathMaps
) {
  return maps.filePathById.get(file.id) ?? file.name ?? "Untitled file";
}

function normalizeWorkspacePath(value: string) {
  return value
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/")
    .toLowerCase();
}

function resolveFolderIdByPathHint(
  maps: WorkspacePathMaps,
  rootFolderId: string,
  hint?: string
) {
  if (typeof hint !== "string") {
    return null;
  }

  const normalizedHint = normalizeWorkspacePath(hint);
  if (!normalizedHint) {
    return rootFolderId;
  }

  for (const [folderId, folderPath] of maps.folderPathById.entries()) {
    if (normalizeWorkspacePath(folderPath) === normalizedHint) {
      return folderId;
    }
  }

  if (normalizedHint.includes("/")) {
    return null;
  }

  let matchedFolderId: string | null = null;
  for (const [folderId, folderPath] of maps.folderPathById.entries()) {
    const normalizedPath = normalizeWorkspacePath(folderPath);
    if (
      normalizedPath === normalizedHint ||
      normalizedPath.endsWith(`/${normalizedHint}`)
    ) {
      if (matchedFolderId) {
        return null;
      }
      matchedFolderId = folderId;
    }
  }

  if (matchedFolderId) {
    return matchedFolderId;
  }

  if (normalizedHint === "root" || normalizedHint === "workspace") {
    return rootFolderId;
  }

  return null;
}

function resolveFileIdByPathHint(maps: WorkspacePathMaps, hint?: string) {
  if (typeof hint !== "string") {
    return null;
  }

  const normalizedHint = normalizeWorkspacePath(hint);
  if (!normalizedHint) {
    return null;
  }

  for (const [fileId, filePath] of maps.filePathById.entries()) {
    if (normalizeWorkspacePath(filePath) === normalizedHint) {
      return fileId;
    }
  }

  if (normalizedHint.includes("/")) {
    return null;
  }

  let matchedFileId: string | null = null;
  for (const [fileId, filePath] of maps.filePathById.entries()) {
    const normalizedPath = normalizeWorkspacePath(filePath);
    if (
      normalizedPath === normalizedHint ||
      normalizedPath.endsWith(`/${normalizedHint}`)
    ) {
      if (matchedFileId) {
        return null;
      }
      matchedFileId = fileId;
    }
  }

  return matchedFileId;
}

async function readWorkspaceFileContent(params: {
  workspaceId: string;
  file: ExplorerFileLike;
  maps: WorkspacePathMaps;
  maxChars?: number;
}) {
  const workspacePath = getWorkspacePathForFile(params.file, params.maps);
  const maxChars = params.maxChars ?? DEFAULT_NOTE_MAX_CHARS;

  if (isMarkdownFile(params.file)) {
    return {
      content: await fetchWorkspaceFileText(params.file, maxChars),
      fileId: params.file.id,
      mimeType: params.file.mimeType ?? null,
      name: params.file.name,
      readMode: "text" as const,
      updatedAt: params.file.updatedAt,
      workspacePath,
    };
  }

  const summary = await getIngestionSummaryForFile(
    params.workspaceId,
    params.file.id
  );
  const summaryChunks =
    summary?.resources.flatMap((resource) => resource.chunks) ?? [];

  const content = summaryChunks
    .slice(0, 5)
    .map((chunk) => chunk.content.trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, Math.max(250, maxChars));

  if (!content) {
    throw new Error(
      "No readable content is available for this file yet. Try get_file_summary after ingestion finishes."
    );
  }

  return {
    content,
    fileId: params.file.id,
    mimeType: params.file.mimeType ?? null,
    name: params.file.name,
    readMode: "summary" as const,
    updatedAt: params.file.updatedAt,
    workspacePath,
  };
}

async function publishTreeMutationEvents(input: {
  folderId?: string | null;
  reason: "file.created" | "file.deleted" | "file.updated";
  workspaceId: string;
}) {
  await Promise.allSettled([
    publishFilesInvalidationEvent({
      workspaceUuid: input.workspaceId,
      folderId: input.folderId ?? undefined,
      reason: input.reason,
    }),
    publishFilesInvalidationEvent({
      workspaceUuid: input.workspaceId,
      reason: "tree.changed",
    }),
  ]);
}

function mapSearchResultsToCitations(params: {
  maps: WorkspacePathMaps;
  results: Awaited<ReturnType<typeof retrieveWorkspaceChunks>>["results"];
}) {
  return params.results.map((match) => ({
    chunkId: match.chunkId,
    endMs: match.endMs ?? null,
    fileId: match.fileId,
    page: match.page ?? null,
    score: match.score,
    snippet: match.content,
    sourceType: match.sourceType,
    startMs: match.startMs ?? null,
    title: match.title ?? null,
    workspacePath:
      (match.fileId ? params.maps.filePathById.get(match.fileId) : null) ??
      match.title ??
      match.source,
  }));
}

async function resolveWorkspaceSearchMatches(params: {
  workspaceId: string;
  userId: string;
  query: string;
  limit: number;
  sourceType?: z.infer<
    typeof chatToolSchemas.search_materials.input
  >["sourceType"];
}) {
  const result = await retrieveWorkspaceChunks({
    workspaceId: params.workspaceId,
    query: params.query,
    limit: params.limit,
    sourceType: params.sourceType,
  });
  const maps = await buildWorkspacePathMaps(params.workspaceId, params.userId);
  const matches = mapSearchResultsToCitations({
    maps,
    results: result.results,
  });

  return { maps, matches };
}

async function resolveFileExcerpt(params: {
  workspaceId: string;
  fileId: string;
  maxChars: number;
  maps: WorkspacePathMaps;
}) {
  const file = await getFileAssetById(params.workspaceId, params.fileId);
  if (!file) {
    return null;
  }

  try {
    const result = await readWorkspaceFileContent({
      workspaceId: params.workspaceId,
      file,
      maps: params.maps,
      maxChars: params.maxChars,
    });

    return {
      excerpt: result.content,
      fileId: result.fileId,
      workspacePath: result.workspacePath,
    };
  } catch {
    return null;
  }
}

function buildAgentSelectionPrompt(params: {
  query: string;
  matches: Array<{
    fileId: string | null;
    workspacePath: string;
    snippet: string;
    sourceType: string;
  }>;
  maxFiles: number;
}) {
  const matchLines =
    params.matches.length > 0
      ? params.matches
          .map(
            (match, index) =>
              `${index}. ${match.workspacePath} (${match.sourceType}) fileId=${match.fileId ?? "none"} :: ${match.snippet.slice(0, 220)}`
          )
          .join("\n")
      : "None";

  return [
    "You are a retrieval agent.",
    "Select the most relevant files to open based on the query.",
    "Prefer markdown/text files when possible.",
    `Select up to ${params.maxFiles} items.`,
    'Return JSON with this shape: {"indices": number[]}.',
    `Query: ${params.query}`,
    "Results:",
    matchLines,
  ].join("\n\n");
}

function buildFileManagerSelectionPrompt(params: {
  files: Array<{
    fileId: string;
    mimeType: string | null;
    updatedAt: string;
    workspacePath: string;
  }>;
  maxFiles: number;
  task: string;
}) {
  const fileLines =
    params.files.length > 0
      ? params.files
          .map(
            (file, index) =>
              `${index}. ${file.workspacePath} :: fileId=${file.fileId} :: mime=${file.mimeType ?? "unknown"} :: updatedAt=${file.updatedAt}`
          )
          .join("\n")
      : "None";

  return [
    "You are a file manager agent.",
    "Select the files that should be inspected before responding to the task.",
    "Prefer files whose paths clearly match the task.",
    `Select up to ${params.maxFiles} items.`,
    'Return JSON with this shape: {"indices": number[]}.',
    `Task: ${params.task}`,
    "Workspace files:",
    fileLines,
  ].join("\n\n");
}

async function ensureWritableTargetFolder(
  ctx: ChatToolContext,
  folderId: string
) {
  if (isSharedFilesVirtualFolderId(folderId, ctx.workspaceId)) {
    throw new Error("Files cannot be moved into Shared Files.");
  }

  const canEdit = await userCanEditFolder({
    workspaceId: ctx.workspaceId,
    folderId,
    userId: ctx.userId,
  });

  if (!canEdit) {
    throw new Error("The destination folder is read-only.");
  }
}

async function ensureNotesFolder(input: {
  rootFolderId: string;
  userId: string;
  workspaceId: string;
}) {
  const folder = await createFolder(
    input.workspaceId,
    input.rootFolderId,
    NOTES_FOLDER_NAME,
    input.userId
  );

  if (!folder) {
    throw new Error("Unable to create or resolve the Notes folder.");
  }

  return folder;
}

async function enqueueIngestionForFile(input: {
  fileId: string;
  folderId?: string;
  workspaceId: string;
}) {
  const ingestionJob = await scheduleIngestionJob({
    workspaceId: input.workspaceId,
    fileId: input.fileId,
  }).catch(() => null);

  await Promise.allSettled([
    publishWorkspaceStreamEvent({
      workspaceUuid: input.workspaceId,
      type: "upload.finalized",
      payload: {
        deduplicated: false,
        fileId: input.fileId,
        folderId: input.folderId ?? null,
        workspaceUuid: input.workspaceId,
      },
    }),
    ...(ingestionJob
      ? [
          publishWorkspaceStreamEvent({
            workspaceUuid: input.workspaceId,
            type: "ingestion.job",
            payload: {
              createdAt: new Date().toISOString(),
              eventType: "job.queued",
              jobId: ingestionJob.id,
              payload: { status: "queued", source: "chat.tools" },
              workspaceId: input.workspaceId,
            },
          }),
        ]
      : []),
  ]);

  return ingestionJob;
}

async function resolveStudySource(
  ctx: ChatToolContext,
  input: {
    fileId?: string;
    query?: string;
    sourceText?: string;
  }
) {
  if (typeof input.sourceText === "string") {
    return {
      content: input.sourceText.trim().slice(0, STUDY_SOURCE_CHAR_LIMIT),
      title: "Selected content",
    };
  }

  if (typeof input.fileId === "string") {
    const file = await getFileAssetById(ctx.workspaceId, input.fileId);
    if (!file) {
      throw new Error("Source file not found.");
    }

    const maps = await buildWorkspacePathMaps(ctx.workspaceId, ctx.userId);
    const title = maps.filePathById.get(file.id) ?? file.name;

    if (isMarkdownFile(file)) {
      return {
        content: (
          await fetchWorkspaceFileText(file, STUDY_SOURCE_CHAR_LIMIT)
        ).trim(),
        title,
      };
    }

    const summary = await getIngestionSummaryForFile(ctx.workspaceId, file.id);
    const content = summary.resources
      .flatMap((resource) => resource.chunks)
      .map((chunk) => chunk.content.trim())
      .filter(Boolean)
      .join("\n\n")
      .slice(0, STUDY_SOURCE_CHAR_LIMIT);

    if (!content) {
      throw new Error(
        "The selected file does not have ingested text available yet."
      );
    }

    return { content, title };
  }

  const query = input.query?.trim();
  if (!query) {
    throw new Error("A study source is required.");
  }

  const result = await retrieveWorkspaceChunks({
    workspaceId: ctx.workspaceId,
    query,
    limit: STUDY_QUERY_MATCH_LIMIT,
  });

  const content = result.results
    .map((match) => match.content.trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, STUDY_SOURCE_CHAR_LIMIT);

  if (!content) {
    throw new Error("No matching study material was found for that query.");
  }

  return {
    content,
    title: query,
  };
}

async function createStudySetWithCards(params: {
  cards: Array<{
    backMarkdown: string;
    frontMarkdown: string;
    kind: FlashcardCardKind;
    notesMarkdown?: string | null;
    payload?: Record<string, unknown>;
    source: Record<string, unknown>;
    tags?: string[];
  }>;
  chatSlug: string;
  title: string;
  userId: string;
  workspaceId: string;
}) {
  const set = await createFlashcardSetForUser({
    sourceChatSlug: params.chatSlug,
    sourceType: "ai-generated",
    title: params.title,
    userId: params.userId,
    workspaceId: params.workspaceId,
  });

  if (!set) {
    throw new Error("Unable to create the study set.");
  }

  for (const card of params.cards) {
    await createFlashcardCardForUser({
      backMarkdown: card.backMarkdown,
      frontMarkdown: card.frontMarkdown,
      kind: card.kind,
      notesMarkdown: card.notesMarkdown,
      payload: card.payload,
      setId: set.id,
      source: card.source,
      tags: card.tags,
      userId: params.userId,
      workspaceId: params.workspaceId,
    });
  }

  return set;
}

async function generateFlashcardsFromSource(
  ctx: ChatToolContext,
  input: z.infer<typeof chatToolSchemas.generate_flashcards.input>
) {
  const source = await resolveStudySource(ctx, input);
  const taxonomy = inferFlashcardTaxonomy({
    query: input.query,
    sourceText: source.content,
    title: input.title ?? source.title,
  });
  const result = await generateText({
    model: apollo.languageModel("apollo-core"),
    output: Output.object({ schema: flashcardGenerationSchema }),
    prompt: [
      "Create a clean flashcard deck from the study material.",
      "Write concise markdown front/back pairs.",
      `Return exactly ${Math.max(1, Math.min(input.count ?? 10, 24))} cards.`,
      "Avoid duplicate cards.",
      `Deck title hint: ${input.title ?? source.title}`,
      `Study material:\n${source.content}`,
    ].join("\n\n"),
  });

  const set = await createStudySetWithCards({
    cards: result.output.cards.map((card, index) => ({
      ...card,
      kind: "flashcard" as const,
      source: {
        ...taxonomy,
        sourceFileId: input.fileId ?? null,
        sourceIndex: index,
        sourceQuery: input.query ?? null,
      },
      tags: card.tags ?? input.tags ?? [],
    })),
    chatSlug: ctx.chatSlug,
    title: input.title ?? result.output.title,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });

  return {
    cards: result.output.cards,
    setId: set.id,
    title: set.title,
  };
}

async function generateQuizFromSource(
  ctx: ChatToolContext,
  input: z.infer<typeof chatToolSchemas.quiz_me.input>
) {
  const source = await resolveStudySource(ctx, input);
  const taxonomy = inferFlashcardTaxonomy({
    query: input.query,
    sourceText: source.content,
    title: input.title ?? source.title,
  });
  const result = await generateText({
    model: apollo.languageModel("apollo-core"),
    output: Output.object({ schema: quizGenerationSchema }),
    prompt: [
      "Create a multiple choice quiz from the study material.",
      "Each question must have 4 options when possible.",
      "Use frontMarkdown for the question stem and backMarkdown for the answer explanation.",
      `Return exactly ${Math.max(3, Math.min(input.count ?? 4, 5))} questions.`,
      `Quiz title hint: ${input.title ?? source.title}`,
      `Study material:\n${source.content}`,
    ].join("\n\n"),
  });

  const questions = result.output.questions.map((question, index) => ({
      ...question,
      explanation: question.explanation ?? null,
    }));

  const set = await createStudySetWithCards({
      cards: questions.map((question, index) => ({
        backMarkdown: question.backMarkdown,
        frontMarkdown: question.frontMarkdown,
        kind: "multiple_choice_quiz" as const,
        payload: {
          correctOptionIndex: question.correctOptionIndex,
          explanation: question.explanation ?? null,
          options: question.options,
        },
        source: {
          ...taxonomy,
          sourceFileId: input.fileId ?? null,
          sourceIndex: index,
          sourceQuery: input.query ?? null,
        },
      tags: question.tags ?? input.tags ?? [],
    })),
    chatSlug: ctx.chatSlug,
    title: input.title ?? result.output.title,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });

  return {
    questionCount: questions.length,
    questions,
    setId: set.id,
    title: set.title,
  };
}

export function createChatTools(ctx: ChatToolContext): ToolSet {
  return {
    search_materials: tool({
      description:
        "Semantic search over workspace materials with file citations. Use only when the user asks about their files/workspace or requests a workspace search.",
      inputSchema: chatToolSchemas.search_materials.input,
      outputSchema: chatToolSchemas.search_materials.output,
      execute: async (input) => {
        const { matches } = await resolveWorkspaceSearchMatches({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          query: input.query,
          limit: input.limit ?? DEFAULT_SEARCH_LIMIT,
          sourceType: input.sourceType,
        });

        return {
          citationMarkdown: buildCitationMarkdown(matches),
          matches,
          query: input.query,
          totalMatches: matches.length,
        };
      },
    }),
    avenire_agent: tool({
      description:
        "Run the Avenire retrieval agent to gather workspace context and return a consolidated summary. Use only when the user asks about their files/workspace or explicitly wants workspace context.",
      inputSchema: chatToolSchemas.avenire_agent.input,
      outputSchema: chatToolSchemas.avenire_agent.output,
      execute: async (input) => {
        const maxMatches = input.maxMatches ?? AGENT_DEFAULT_MATCH_LIMIT;
        const maxFiles = input.maxFiles ?? AGENT_DEFAULT_MAX_FILES;
        const activityActions: AgentActivityAction[] = [
          {
            kind: "search",
            pending: true,
            value: input.query,
            preview: { query: input.query, matches: [] },
          },
        ];

        emitAgentActivityUpdate(ctx, activityActions, "running");

        const { maps, matches } = await resolveWorkspaceSearchMatches({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          query: input.query,
          limit: maxMatches,
          sourceType: undefined,
        });

        const indexedMatches = matches.map((match, index) => ({
          index,
          fileId: match.fileId,
          snippet: match.snippet,
          sourceType: match.sourceType,
          workspacePath: match.workspacePath,
        }));

        const searchMatches = matches
          .map((match) => match.workspacePath)
          .filter(Boolean)
          .slice(0, 6);

        activityActions[0] = {
          kind: "search",
          pending: false,
          value: input.query,
          preview: { query: input.query, matches: searchMatches },
        };
        emitAgentActivityUpdate(ctx, activityActions, "running");

        let selectedFileIds: string[] = [];
        if (indexedMatches.length > 0) {
          const selection = await generateText({
            model: apollo.languageModel("apollo-agent"),
            output: Output.object({ schema: agentSelectionSchema }),
            prompt: buildAgentSelectionPrompt({
              query: input.query,
              matches: indexedMatches,
              maxFiles,
            }),
          });

          const selectedIndices = Array.from(
            new Set(
              selection.output.indices.filter(
                (index) =>
                  Number.isFinite(index) &&
                  index >= 0 &&
                  index < indexedMatches.length
              )
            )
          ).slice(0, maxFiles);

          selectedFileIds = selectedIndices
            .map((index) => indexedMatches[index]?.fileId)
            .filter((fileId): fileId is string => Boolean(fileId));
        }

        const readActionIndexByFileId = new Map<string, number>();
        for (const fileId of selectedFileIds) {
          const workspacePath =
            maps.filePathById.get(fileId) ?? "workspace file";
          readActionIndexByFileId.set(fileId, activityActions.length);
          activityActions.push({
            kind: "read",
            pending: true,
            value: workspacePath,
          });
        }

        if (selectedFileIds.length > 0) {
          emitAgentActivityUpdate(ctx, activityActions, "running");
        }

        const files: Array<{
          excerpt: string;
          fileId: string | null;
          workspacePath: string;
        }> = [];

        for (const fileId of selectedFileIds) {
          const preview = await resolveFileExcerpt({
            workspaceId: ctx.workspaceId,
            fileId,
            maxChars: AGENT_MAX_FILE_CHARS,
            maps,
          });
          if (preview) {
            files.push(preview);
            const actionIndex = readActionIndexByFileId.get(fileId);
            if (actionIndex !== undefined) {
              activityActions[actionIndex] = {
                kind: "read",
                pending: false,
                value: preview.workspacePath,
                preview: {
                  content: preview.excerpt,
                  path: preview.workspacePath,
                },
              };
              emitAgentActivityUpdate(ctx, activityActions, "running");
            }
          }
        }

        const contextBlocks =
          files.length > 0
            ? files.map(
                (file) => `File: ${file.workspacePath}\n${file.excerpt.trim()}`
              )
            : matches
                .slice(0, 6)
                .map(
                  (match) =>
                    `Match: ${match.workspacePath}\n${match.snippet.trim()}`
                );

        const context = contextBlocks.join("\n\n").trim();
        const summaryResult = await generateText({
          model: apollo.languageModel("apollo-agent"),
          prompt: [
            "Summarize the retrieved workspace context for the user's query.",
            "Use 2-4 concise sentences.",
            "If nothing relevant was found, say that clearly.",
            `Query: ${input.query}`,
            "Context:",
            context || "No relevant workspace content found.",
          ].join("\n\n"),
          maxOutputTokens: AGENT_MAX_OUTPUT_TOKENS,
          temperature: 0.3,
        });

        const summary =
          summaryResult.text.trim() || "No relevant context found.";
        emitAgentActivityUpdate(ctx, activityActions, "done");

        return {
          citationMarkdown: buildCitationMarkdown(matches),
          citations: matches.slice(0, maxMatches),
          context: context || "No relevant workspace content found.",
          files,
          query: input.query,
          summary,
        };
      },
    }),
    file_manager_agent: tool({
      description: `Inspect and manage workspace files and folders. Handles listing, reading, moving, deleting files, and creating/managing folders. Use when the user asks about their files, wants to organize their workspace, or needs file operations.

Internal capabilities:
- list_files: List files and folders
- read_workspace_file: Read file content
- get_file_summary: Get ingestion metadata
- move_file: Move file to folder
- delete_file: Move file to trash
- create_folder: Create new folder
- move_folder: Move folder
- delete_folder: Move folder to trash

The agent decides which operations to perform based on the task.`,
      inputSchema: chatToolSchemas.file_manager_agent.input,
      outputSchema: chatToolSchemas.file_manager_agent.output,
      execute: async (input) => {
        const maxFiles = input.maxFiles ?? FILE_MANAGER_DEFAULT_MAX_FILES;
        const activityActions: AgentActivityAction[] = [
          {
            kind: "list",
            pending: true,
            value: "workspace files",
          },
        ];

        emitAgentActivityUpdate(ctx, activityActions, "running");

        const [maps, files] = await Promise.all([
          buildWorkspacePathMaps(ctx.workspaceId, ctx.userId),
          listWorkspaceFiles(ctx.workspaceId, ctx.userId),
        ]);

        const candidateFiles = [...files]
          .sort(
            (left, right) =>
              Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
          )
          .slice(0, FILE_MANAGER_LIST_LIMIT)
          .map((file) => ({
            fileId: file.id,
            mimeType: file.mimeType ?? null,
            updatedAt: file.updatedAt,
            workspacePath: getWorkspacePathForFile(file, maps),
          }));

        activityActions[0] = {
          kind: "list",
          pending: false,
          value: "workspace files",
        };
        emitAgentActivityUpdate(ctx, activityActions, "running");

        let selectedFileIds: string[] = [];
        if (candidateFiles.length > 0) {
          const selection = await generateText({
            model: apollo.languageModel("apollo-agent"),
            output: Output.object({ schema: agentSelectionSchema }),
            prompt: buildFileManagerSelectionPrompt({
              files: candidateFiles,
              maxFiles,
              task: input.task,
            }),
          });

          selectedFileIds = Array.from(
            new Set(
              selection.output.indices
                .filter(
                  (index) =>
                    Number.isFinite(index) &&
                    index >= 0 &&
                    index < candidateFiles.length
                )
                .map((index) => candidateFiles[index]?.fileId)
                .filter((fileId): fileId is string => Boolean(fileId))
            )
          ).slice(0, maxFiles);
        }

        const readActionIndexByFileId = new Map<string, number>();
        for (const fileId of selectedFileIds) {
          const workspacePath =
            maps.filePathById.get(fileId) ?? "workspace file";
          readActionIndexByFileId.set(fileId, activityActions.length);
          activityActions.push({
            kind: "read",
            pending: true,
            value: workspacePath,
          });
        }

        if (selectedFileIds.length > 0) {
          emitAgentActivityUpdate(ctx, activityActions, "running");
        }

        const filesToInspect: Array<{
          excerpt: string;
          fileId: string | null;
          workspacePath: string;
        }> = [];

        for (const fileId of selectedFileIds) {
          const preview = await resolveFileExcerpt({
            workspaceId: ctx.workspaceId,
            fileId,
            maxChars: FILE_MANAGER_MAX_FILE_CHARS,
            maps,
          });

          if (!preview) {
            continue;
          }

          filesToInspect.push(preview);
          const actionIndex = readActionIndexByFileId.get(fileId);
          if (actionIndex !== undefined) {
            activityActions[actionIndex] = {
              kind: "read",
              pending: false,
              value: preview.workspacePath,
              preview: {
                content: preview.excerpt,
                path: preview.workspacePath,
              },
            };
            emitAgentActivityUpdate(ctx, activityActions, "running");
          }
        }

        const context =
          filesToInspect.length > 0
            ? filesToInspect
                .map(
                  (file) =>
                    `File: ${file.workspacePath}\n${file.excerpt.trim()}`
                )
                .join("\n\n")
            : candidateFiles
                .slice(0, Math.min(maxFiles, 8))
                .map(
                  (file) =>
                    `Path: ${file.workspacePath}\nMime: ${file.mimeType ?? "unknown"}\nUpdated: ${file.updatedAt}`
                )
                .join("\n\n");

        const summaryResult = await generateText({
          model: apollo.languageModel("apollo-agent"),
          prompt: [
            "You are a file manager agent.",
            "Summarize the relevant workspace files for the task.",
            "Do not claim that any files were moved or deleted unless that already happened outside this tool.",
            "If the task is ambiguous, say what still needs clarification.",
            `Task: ${input.task}`,
            "Context:",
            context || "No relevant files found.",
          ].join("\n\n"),
          maxOutputTokens: FILE_MANAGER_MAX_OUTPUT_TOKENS,
          temperature: 0.2,
        });

        emitAgentActivityUpdate(ctx, activityActions, "done");

        return {
          files: filesToInspect,
          summary: summaryResult.text.trim() || "No relevant files found.",
          task: input.task,
        };
      },
    }),
    note_agent: tool({
      description: `Manage markdown notes in the workspace. Handles creating, reading, and updating notes. Use when the user asks about their notes or wants to create/modify notes.

Internal capabilities:
- create_note: Create new markdown note
- read_note: Read existing note content
- update_note: Append or replace note content (append, replace_entire, replace_section)

The agent decides which operations to perform based on the task.`,
      inputSchema: chatToolSchemas.note_agent.input,
      outputSchema: chatToolSchemas.note_agent.output,
      execute: async (input) => {
        const maxNotes = input.maxNotes ?? 3;
        const task = input.task.toLowerCase();

        const maps = await buildWorkspacePathMaps(ctx.workspaceId, ctx.userId);
        const allFiles = await listWorkspaceFiles(ctx.workspaceId, ctx.userId);
        const noteFiles = allFiles.filter(isMarkdownFile);

        let operation: "created" | "read" | "updated" | "listed" = "listed";
        const notes: Array<{
          contentPreview: string;
          fileId: string;
          tags?: string[];
          title: string;
          updatedAt: string;
          wordCount: number;
          workspacePath: string;
        }> = [];

        if (
          task.includes("create") ||
          task.includes("new") ||
          task.includes("write")
        ) {
          operation = "created";
          const titleMatch = input.task.match(
            /(?:create|new|write)\s+(?:a\s+)?(?:note\s+)?(?:about\s+)?["']?([^"']+)["']?/i
          );
          const title = titleMatch?.[1]?.trim() || "New Note";

          const targetFolderId = (
            await ensureNotesFolder({
              rootFolderId: ctx.rootFolderId,
              userId: ctx.userId,
              workspaceId: ctx.workspaceId,
            })
          ).id;

          const canEdit = await userCanEditFolder({
            workspaceId: ctx.workspaceId,
            folderId: targetFolderId,
            userId: ctx.userId,
          });
          if (!canEdit) {
            throw new Error("The destination folder is read-only.");
          }

          const content = buildNoteContent({
            content: input.task,
            title,
          });
          const file = await createWorkspaceNoteFile({
            content,
            folderId: targetFolderId,
            metadata: { agentNote: true },
            name: toMarkdownFileName(title),
            userId: ctx.userId,
            workspaceId: ctx.workspaceId,
          });

          await publishTreeMutationEvents({
            folderId: targetFolderId,
            reason: "file.created",
            workspaceId: ctx.workspaceId,
          });
          await enqueueIngestionForFile({
            fileId: file.id,
            folderId: file.folderId,
            workspaceId: ctx.workspaceId,
          });

          const newMaps = await buildWorkspacePathMaps(
            ctx.workspaceId,
            ctx.userId
          );
          notes.push({
            contentPreview: input.task.slice(0, 500),
            fileId: file.id,
            title: file.name,
            updatedAt: file.updatedAt,
            wordCount: input.task.split(/\s+/).length,
            workspacePath: newMaps.filePathById.get(file.id) ?? file.name,
          });
        } else if (
          task.includes("read") ||
          task.includes("show") ||
          task.includes("what")
        ) {
          operation = "read";
          const relevantNotes = noteFiles.slice(0, maxNotes);
          for (const file of relevantNotes) {
            try {
              const content = await fetchWorkspaceFileText(file, 500);
              notes.push({
                contentPreview: content.slice(0, 500),
                fileId: file.id,
                title: file.name,
                updatedAt: file.updatedAt,
                wordCount: content.split(/\s+/).length,
                workspacePath: maps.filePathById.get(file.id) ?? file.name,
              });
            } catch {}
          }
        } else if (
          task.includes("update") ||
          task.includes("add") ||
          task.includes("append")
        ) {
          operation = "updated";
          const noteFile = noteFiles[0];
          if (noteFile) {
            const canEdit = await userCanEditFile({
              workspaceId: ctx.workspaceId,
              fileId: noteFile.id,
              userId: ctx.userId,
            });
            if (canEdit) {
              const currentContent = await fetchWorkspaceFileText(
                noteFile,
                50_000
              );
              const nextContent = applyNoteUpdate({
                content: input.task,
                currentContent,
                mode: "append",
              });
              const updated = await updateNoteContent({
                fileId: noteFile.id,
                userId: ctx.userId,
                content: nextContent,
              });
              if (updated) {
                await deleteIngestionDataForFile(ctx.workspaceId, noteFile.id);
                await publishTreeMutationEvents({
                  folderId: noteFile.folderId,
                  reason: "file.updated",
                  workspaceId: ctx.workspaceId,
                });
                await enqueueIngestionForFile({
                  fileId: noteFile.id,
                  folderId: noteFile.folderId,
                  workspaceId: ctx.workspaceId,
                });
                notes.push({
                  contentPreview: nextContent.slice(0, 500),
                  fileId: noteFile.id,
                  title: noteFile.name,
                  updatedAt: updated.updatedAt.toISOString(),
                  wordCount: nextContent.split(/\s+/).length,
                  workspacePath: maps.filePathById.get(noteFile.id) ?? noteFile.name,
                });
              }
            }
          }
        } else {
          operation = "listed";
          for (const file of noteFiles.slice(0, maxNotes)) {
            try {
              const content = await fetchWorkspaceFileText(file, 200);
              notes.push({
                contentPreview: content.slice(0, 200),
                fileId: file.id,
                title: file.name,
                updatedAt: file.updatedAt,
                wordCount: content.split(/\s+/).length,
                workspacePath: maps.filePathById.get(file.id) ?? file.name,
              });
            } catch {}
          }
        }

        return {
          notes,
          operation,
          summary: `${operation} ${notes.length} note(s)`,
          task: input.task,
        };
      },
    }),
    log_misconception: tool({
      description:
        "Record a misconception the user explicitly reports or the conversation establishes with high confidence. Use when the user is repeatedly confused about a concept and the response should retain that learning context.",
      inputSchema: chatToolSchemas.log_misconception.input,
      outputSchema: chatToolSchemas.log_misconception.output,
      execute: async (input) => {
        const result = await upsertMisconception({
          confidence: input.confidence,
          concept: input.concept,
          reason: input.reason,
          subject: input.subject,
          topic: input.topic,
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
        });

        return {
          activeMisconceptionsCount: result.activeCount,
          misconception: result.misconception,
          summary: `Stored misconception for ${result.misconception.concept}`,
        };
      },
    }),
    generate_flashcards: tool({
      description:
        "Generate a persisted flashcard deck from a file, search query, or provided source text. Use only when the user explicitly asks for flashcards or study cards.",
      inputSchema: chatToolSchemas.generate_flashcards.input,
      outputSchema: chatToolSchemas.generate_flashcards.output,
      execute: async (input) => generateFlashcardsFromSource(ctx, input),
    }),
    get_due_cards: tool({
      description:
        "Show how many study cards are due and preview the next due items. Use only when the user asks about due cards or study progress.",
      inputSchema: chatToolSchemas.get_due_cards.input,
      outputSchema: chatToolSchemas.get_due_cards.output,
      execute: async (input) => {
        const [dashboard, dueCards] = await Promise.all([
          getFlashcardDashboardForUser(ctx.userId, ctx.workspaceId),
          listDueFlashcardsForUser({
            limit: input.limit ?? DEFAULT_DUE_CARD_LIMIT,
            userId: ctx.userId,
            workspaceId: ctx.workspaceId,
          }),
        ]);

        return {
          dueCards: dueCards.map((entry) => ({
            cardId: entry.card.id,
            dueAt: entry.reviewState?.dueAt ?? null,
            frontMarkdown: entry.card.frontMarkdown,
            kind: entry.card.kind,
            remainingDueCount: entry.remainingDueCount,
            setId: entry.set.id,
            setTitle: entry.set.title,
          })),
          totalDueCount: dashboard?.dueCount ?? 0,
        };
      },
    }),
    quiz_me: tool({
      description:
        "Generate a persisted multiple choice quiz set from a file, query, or provided source text. Use only when the user explicitly asks for a quiz.",
      inputSchema: chatToolSchemas.quiz_me.input,
      outputSchema: chatToolSchemas.quiz_me.output,
      execute: async (input) => generateQuizFromSource(ctx, input),
    }),
    visualize_read_me: tool({
      description:
        "Load design guidelines for widget generation. Call this before generating widgets to get detailed instructions for interactive HTML/CSS/SVG fragments.",
      inputSchema: chatToolSchemas.visualize_read_me.input,
      outputSchema: chatToolSchemas.visualize_read_me.output,
      execute: async (input) => {
        const modules = input.modules.filter((moduleName) =>
          AVAILABLE_MODULES.includes(moduleName)
        );
        if (modules.length === 0) {
          throw new Error("No valid modules provided for visualize_read_me.");
        }
        return {
          content: getGuidelines(modules),
          modules,
        };
      },
    }),
    show_widget: tool({
      description:
        "Render an interactive HTML/CSS/JS widget in the chat. Use for visualizations, diagrams, charts, simulations, and interactive explainers.",
      inputSchema: chatToolSchemas.show_widget.input,
      outputSchema: chatToolSchemas.show_widget.output,
      execute: async (input) => {
        if (!input.i_have_seen_read_me) {
          throw new Error(
            "You must call visualize_read_me before show_widget."
          );
        }

        const isSVG = input.widget_code.trimStart().startsWith("<svg");
        const width = input.width ?? 800;
        const height = input.height ?? 600;

        return {
          success: true,
          details: {
            title: input.title,
            width,
            height,
            isSVG,
          },
          filePath: null,
        };
      },
    }),
  };
}
