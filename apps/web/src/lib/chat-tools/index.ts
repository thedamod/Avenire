import { createHash } from "node:crypto";
import { generateText, Output, type ToolSet, tool } from "@avenire/ai";
import type {
  AgentActivityAction,
  AgentActivityData,
} from "@avenire/ai/message-types";
import { apollo } from "@avenire/ai/models";
import { chatToolSchemas } from "@avenire/ai/tools";
import { retrieveWorkspaceChunks } from "@avenire/ingestion";
import { scheduleIngestionJob } from "@avenire/ingestion/queue";
import { UTApi, UTFile } from "@avenire/storage";
import { z } from "zod";
import {
  createFolder,
  getFileAssetById,
  getFolderWithAncestors,
  isSharedFilesVirtualFolderId,
  listFolderContentsForUser,
  listWorkspaceFiles,
  listWorkspaceFolders,
  registerFileAsset,
  replaceFileAssetContent,
  softDeleteFileAsset,
  softDeleteFolder,
  updateFileAsset,
  updateFolder,
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
  getIngestionFlagsByFileIds,
  getIngestionSummaryForFile,
} from "@/lib/ingestion-data";
import { deleteUploadThingFile } from "@/lib/upload-registration";
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

async function uploadTextAsMarkdownFile(params: {
  content: string;
  fileName: string;
}) {
  const token = process.env.UPLOADTHING_TOKEN?.trim();
  if (!token) {
    throw new Error("UPLOADTHING_TOKEN is required to create or update notes.");
  }

  const buffer = Buffer.from(params.content, "utf8");
  const utapi = new UTApi({ token });
  const uploadResult = await utapi.uploadFiles(
    new UTFile([buffer], params.fileName, { type: "text/markdown" })
  );
  const result = Array.isArray(uploadResult) ? uploadResult[0] : uploadResult;
  const uploaded = result?.data;

  if (
    !uploaded ||
    typeof uploaded.key !== "string" ||
    typeof uploaded.ufsUrl !== "string"
  ) {
    throw new Error(
      "UploadThing did not return a storage key for the markdown file."
    );
  }

  return {
    buffer,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    sizeBytes: buffer.byteLength,
    storageKey: uploaded.key,
    storageUrl: uploaded.ufsUrl,
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
    source?: Record<string, unknown>;
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
    cardCount: result.output.cards.length,
    setId: set.id,
    title: set.title,
  };
}

async function generateQuizFromSource(
  ctx: ChatToolContext,
  input: z.infer<typeof chatToolSchemas.quiz_me.input>
) {
  const source = await resolveStudySource(ctx, input);
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
          citations: matches.slice(0, maxMatches),
          context: context || "No relevant workspace content found.",
          files,
          query: input.query,
          summary,
        };
      },
    }),
    file_manager_agent: tool({
      description:
        "Inspect workspace files before file operations such as reading, moving, or deleting. Only use when a file operation is requested or a specific workspace file is mentioned.",
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
    read_note: tool({
      description:
        "Load the full content of a markdown or text note from the workspace. Use only when the user asks to read a note or references a specific workspace file.",
      inputSchema: chatToolSchemas.read_note.input,
      outputSchema: chatToolSchemas.read_note.output,
      execute: async (input) => {
        const file = await getFileAssetById(ctx.workspaceId, input.fileId);
        if (!file) {
          throw new Error("Note not found.");
        }

        const maps = await buildWorkspacePathMaps(ctx.workspaceId, ctx.userId);
        return {
          content: await fetchWorkspaceFileText(
            file,
            input.maxChars ?? DEFAULT_NOTE_MAX_CHARS
          ),
          fileId: file.id,
          title: file.name,
          updatedAt: file.updatedAt,
          workspacePath: maps.filePathById.get(file.id) ?? file.name,
        };
      },
    }),
    read_workspace_file: tool({
      description:
        "Read a workspace file. Text files return full text, other files return indexed content summaries when available. Use only when the user asks to read a file or references specific workspace content.",
      inputSchema: chatToolSchemas.read_workspace_file.input,
      outputSchema: chatToolSchemas.read_workspace_file.output,
      execute: async (input) => {
        const file = await getFileAssetById(ctx.workspaceId, input.fileId);
        if (!file) {
          throw new Error("File not found.");
        }

        const maps = await buildWorkspacePathMaps(ctx.workspaceId, ctx.userId);
        return readWorkspaceFileContent({
          workspaceId: ctx.workspaceId,
          file,
          maps,
          maxChars: input.maxChars,
        });
      },
    }),
    create_note: tool({
      description:
        "Create a markdown note directly inside the active workspace.",
      inputSchema: chatToolSchemas.create_note.input,
      outputSchema: chatToolSchemas.create_note.output,
      execute: async (input) => {
        const targetFolderId =
          input.folderId ??
          (
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
          content: input.content,
          tags: input.tags,
          title: input.title,
        });
        const upload = await uploadTextAsMarkdownFile({
          content,
          fileName: toMarkdownFileName(input.title),
        });
        const file = await registerFileAsset(ctx.workspaceId, ctx.userId, {
          contentHashSha256: upload.sha256,
          folderId: targetFolderId,
          hashComputedBy: "server",
          hashVerificationStatus: "verified",
          metadata: {
            agentNote: true,
            tags: input.tags ?? [],
          },
          mimeType: "text/markdown",
          name: toMarkdownFileName(input.title),
          sizeBytes: upload.sizeBytes,
          storageKey: upload.storageKey,
          storageUrl: upload.storageUrl,
        });

        await publishTreeMutationEvents({
          folderId: targetFolderId,
          reason: "file.created",
          workspaceId: ctx.workspaceId,
        });
        const ingestionJob = await enqueueIngestionForFile({
          fileId: file.id,
          folderId: file.folderId,
          workspaceId: ctx.workspaceId,
        });
        const maps = await buildWorkspacePathMaps(ctx.workspaceId, ctx.userId);

        return {
          fileId: file.id,
          ingestionJobId: ingestionJob?.id ?? null,
          title: file.name,
          updatedAt: file.updatedAt,
          workspacePath: maps.filePathById.get(file.id) ?? file.name,
        };
      },
    }),
    update_note: tool({
      description:
        "Append or edit a markdown note already stored in the workspace.",
      inputSchema: chatToolSchemas.update_note.input,
      outputSchema: chatToolSchemas.update_note.output,
      execute: async (input) => {
        const canEdit = await userCanEditFile({
          workspaceId: ctx.workspaceId,
          fileId: input.fileId,
          userId: ctx.userId,
        });
        if (!canEdit) {
          throw new Error("The note is read-only.");
        }

        const file = await getFileAssetById(ctx.workspaceId, input.fileId);
        if (!file) {
          throw new Error("Note not found.");
        }

        const nextContent = applyNoteUpdate({
          content: input.content,
          currentContent: await fetchWorkspaceFileText(file, 50_000),
          mode: input.mode,
          sectionHeading: input.sectionHeading,
        });
        const upload = await uploadTextAsMarkdownFile({
          content: nextContent,
          fileName: file.name,
        });
        const replaced = await replaceFileAssetContent(
          ctx.workspaceId,
          file.id,
          ctx.userId,
          {
            contentHashSha256: upload.sha256,
            hashComputedBy: "server",
            hashVerificationStatus: "verified",
            metadata: {
              agentNote: true,
            },
            mimeType: "text/markdown",
            sizeBytes: upload.sizeBytes,
            storageKey: upload.storageKey,
            storageUrl: upload.storageUrl,
          }
        );

        if (!replaced) {
          throw new Error("Unable to replace the note content.");
        }

        await deleteIngestionDataForFile(ctx.workspaceId, file.id);
        await publishTreeMutationEvents({
          folderId: file.folderId,
          reason: "file.updated",
          workspaceId: ctx.workspaceId,
        });
        const ingestionJob = await enqueueIngestionForFile({
          fileId: file.id,
          folderId: file.folderId,
          workspaceId: ctx.workspaceId,
        });
        if (
          replaced.previousStorageKey &&
          replaced.previousStorageKey !== upload.storageKey
        ) {
          void deleteUploadThingFile(replaced.previousStorageKey);
        }

        const maps = await buildWorkspacePathMaps(ctx.workspaceId, ctx.userId);
        return {
          fileId: replaced.file.id,
          ingestionJobId: ingestionJob?.id ?? null,
          title: replaced.file.name,
          updatedAt: replaced.file.updatedAt,
          workspacePath:
            maps.filePathById.get(replaced.file.id) ?? replaced.file.name,
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
    render_graph: tool({
      description:
        "Return a matplotlib graph specification for client-side rendering.",
      inputSchema: chatToolSchemas.render_graph.input,
      outputSchema: chatToolSchemas.render_graph.output,
      execute: async (input) => ({
        caption: input.caption ?? null,
        kind: "matplotlib" as const,
        pythonCode: input.pythonCode,
        title: input.title,
      }),
    }),
    list_files: tool({
      description:
        "List files available in the active workspace. Use only when the user asks about workspace contents or a file operation requires it.",
      inputSchema: chatToolSchemas.list_files.input,
      outputSchema: chatToolSchemas.list_files.output,
      execute: async (input) => {
        const files = input.folderId
          ? (
              await listFolderContentsForUser(
                ctx.workspaceId,
                input.folderId,
                ctx.userId
              )
            ).files
          : await listWorkspaceFiles(ctx.workspaceId, ctx.userId);
        const limit = input.limit ?? DEFAULT_FILE_LIST_LIMIT;
        const maps = await buildWorkspacePathMaps(ctx.workspaceId, ctx.userId);
        const visibleFiles = files.slice(0, limit);
        const ingestionFlags = await getIngestionFlagsByFileIds(
          ctx.workspaceId,
          visibleFiles.map((file) => file.id)
        );

        return {
          files: visibleFiles.map((file) => ({
            fileId: file.id,
            folderId: file.folderId,
            isIngested: ingestionFlags[file.id] ?? false,
            mimeType: file.mimeType ?? null,
            name: file.name,
            sizeBytes: file.sizeBytes,
            updatedAt: file.updatedAt,
            workspacePath: maps.filePathById.get(file.id) ?? file.name,
          })),
          totalFiles: files.length,
        };
      },
    }),
    move_file: tool({
      description: "Move a file to another folder in the workspace.",
      inputSchema: chatToolSchemas.move_file.input,
      outputSchema: chatToolSchemas.move_file.output,
      execute: async (input) => {
        const canEditFile = await userCanEditFile({
          workspaceId: ctx.workspaceId,
          fileId: input.fileId,
          userId: ctx.userId,
        });
        if (!canEditFile) {
          throw new Error("The file is read-only.");
        }

        await ensureWritableTargetFolder(ctx, input.targetFolderId);

        const file = await getFileAssetById(ctx.workspaceId, input.fileId);
        if (!file) {
          throw new Error("File not found.");
        }

        const maps = await buildWorkspacePathMaps(ctx.workspaceId, ctx.userId);
        const previousWorkspacePath = getWorkspacePathForFile(file, maps);
        const updated = await updateFileAsset(
          ctx.workspaceId,
          input.fileId,
          ctx.userId,
          {
            folderId: input.targetFolderId,
          }
        );

        if (!updated) {
          throw new Error("Unable to move the file.");
        }

        const nextMaps =
          input.targetFolderId === file.folderId
            ? maps
            : await buildWorkspacePathMaps(ctx.workspaceId, ctx.userId);

        await publishTreeMutationEvents({
          folderId: updated.folderId,
          reason: "file.updated",
          workspaceId: ctx.workspaceId,
        });

        return {
          fileId: updated.id,
          folderId: updated.folderId,
          previousWorkspacePath,
          title: updated.name,
          updatedAt: updated.updatedAt,
          workspacePath: getWorkspacePathForFile(updated, nextMaps),
        };
      },
    }),
    delete_file: tool({
      description: "Move a workspace file to trash.",
      inputSchema: chatToolSchemas.delete_file.input,
      outputSchema: chatToolSchemas.delete_file.output,
      execute: async (input) => {
        const canEdit = await userCanEditFile({
          workspaceId: ctx.workspaceId,
          fileId: input.fileId,
          userId: ctx.userId,
        });
        if (!canEdit) {
          throw new Error("The file is read-only.");
        }

        const file = await getFileAssetById(ctx.workspaceId, input.fileId);
        if (!file) {
          throw new Error("File not found.");
        }

        const maps = await buildWorkspacePathMaps(ctx.workspaceId, ctx.userId);
        const workspacePath = getWorkspacePathForFile(file, maps);
        const deleted = await softDeleteFileAsset(
          ctx.workspaceId,
          input.fileId
        );

        if (!deleted) {
          throw new Error("Unable to delete the file.");
        }

        await publishTreeMutationEvents({
          folderId: file.folderId,
          reason: "file.deleted",
          workspaceId: ctx.workspaceId,
        });

        return {
          deletedAt: new Date().toISOString(),
          fileId: file.id,
          title: file.name,
          workspacePath,
        };
      },
    }),
    create_folder: tool({
      description: "Create a new folder in the workspace.",
      inputSchema: chatToolSchemas.create_folder.input,
      outputSchema: chatToolSchemas.create_folder.output,
      execute: async (input) => {
        const targetFolderId = input.parentId ?? ctx.rootFolderId;

        const canEdit = await userCanEditFolder({
          workspaceId: ctx.workspaceId,
          folderId: targetFolderId,
          userId: ctx.userId,
        });
        if (!canEdit) {
          throw new Error("The destination folder is read-only.");
        }

        const folder = await createFolder(
          ctx.workspaceId,
          input.parentId ?? ctx.rootFolderId,
          input.name,
          ctx.userId
        );

        if (!folder) {
          throw new Error("Unable to create the folder.");
        }

        await publishTreeMutationEvents({
          folderId: folder.parentId,
          reason: "file.created",
          workspaceId: ctx.workspaceId,
        });

        return {
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId,
          workspaceId: folder.workspaceId,
          createdAt: folder.createdAt,
          updatedAt: folder.updatedAt,
        };
      },
    }),
    move_folder: tool({
      description: "Move a folder to another parent folder in the workspace.",
      inputSchema: chatToolSchemas.move_folder.input,
      outputSchema: chatToolSchemas.move_folder.output,
      execute: async (input) => {
        if (input.folderId === input.targetFolderId) {
          throw new Error("Cannot move a folder into itself.");
        }

        const canEditSource = await userCanEditFolder({
          workspaceId: ctx.workspaceId,
          folderId: input.folderId,
          userId: ctx.userId,
        });
        if (!canEditSource) {
          throw new Error("The source folder is read-only.");
        }

        const canEditTarget = await userCanEditFolder({
          workspaceId: ctx.workspaceId,
          folderId: input.targetFolderId,
          userId: ctx.userId,
        });
        if (!canEditTarget) {
          throw new Error("The destination folder is read-only.");
        }

        const folderResult = await getFolderWithAncestors(
          ctx.workspaceId,
          input.folderId
        );
        if (!folderResult) {
          throw new Error("Folder not found.");
        }

        const folder = folderResult.folder;
        const previousParentId = folder.parentId;

        const updated = await updateFolder(
          ctx.workspaceId,
          input.folderId,
          ctx.userId,
          { parentId: input.targetFolderId }
        );

        if (!updated) {
          throw new Error("Unable to move the folder.");
        }

        const maps = await buildWorkspacePathMaps(ctx.workspaceId, ctx.userId);

        await publishTreeMutationEvents({
          folderId: updated.parentId,
          reason: "file.updated",
          workspaceId: ctx.workspaceId,
        });

        return {
          folderId: updated.id,
          previousParentId,
          title: updated.name,
          updatedAt: updated.updatedAt,
          workspacePath: maps.folderPathById?.get(updated.id) ?? updated.name,
        };
      },
    }),
    delete_folder: tool({
      description: "Move a workspace folder and its contents to trash.",
      inputSchema: chatToolSchemas.delete_folder.input,
      outputSchema: chatToolSchemas.delete_folder.output,
      execute: async (input) => {
        const canEdit = await userCanEditFolder({
          workspaceId: ctx.workspaceId,
          folderId: input.folderId,
          userId: ctx.userId,
        });
        if (!canEdit) {
          throw new Error("The folder is read-only.");
        }

        const folderResult = await getFolderWithAncestors(
          ctx.workspaceId,
          input.folderId
        );
        if (!folderResult) {
          throw new Error("Folder not found.");
        }

        const folder = folderResult.folder;
        const maps = await buildWorkspacePathMaps(ctx.workspaceId, ctx.userId);
        const workspacePath =
          maps.folderPathById?.get(folder.id) ?? folder.name;

        const deleted = await softDeleteFolder(ctx.workspaceId, input.folderId);

        if (!deleted) {
          throw new Error("Unable to delete the folder.");
        }

        await publishTreeMutationEvents({
          folderId: folder.parentId,
          reason: "file.deleted",
          workspaceId: ctx.workspaceId,
        });

        return {
          deletedAt: new Date().toISOString(),
          folderId: folder.id,
          title: folder.name,
          workspacePath,
        };
      },
    }),
    get_file_summary: tool({
      description:
        "Return ingestion metadata and leading chunk previews for a specific file.",
      inputSchema: chatToolSchemas.get_file_summary.input,
      outputSchema: chatToolSchemas.get_file_summary.output,
      execute: async (input) => {
        const file = await getFileAssetById(ctx.workspaceId, input.fileId);
        if (!file) {
          throw new Error("File not found.");
        }

        const maps = await buildWorkspacePathMaps(ctx.workspaceId, ctx.userId);
        const summary = await getIngestionSummaryForFile(
          ctx.workspaceId,
          file.id
        );
        const chunks = summary.resources
          .flatMap((resource) => resource.chunks)
          .slice(0, 5)
          .map((chunk) => ({
            chunkId: chunk.chunkId,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            endMs: chunk.endMs ?? null,
            kind: chunk.kind,
            page: chunk.page ?? null,
            startMs: chunk.startMs ?? null,
          }));

        return {
          chunkCount: summary.chunkCount,
          chunks,
          fileId: file.id,
          hasIngestion: summary.chunkCount > 0,
          mimeType: file.mimeType ?? null,
          name: file.name,
          transcriptCueCount: summary.transcriptCues.length,
          updatedAt: file.updatedAt,
          workspacePath: maps.filePathById.get(file.id) ?? file.name,
        };
      },
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
  };
}
