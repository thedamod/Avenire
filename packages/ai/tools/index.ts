import { type InferUITools, tool } from "ai";
import { z } from "zod";

const sourceTypeSchema = z
  .enum(["pdf", "image", "video", "audio", "markdown", "link"])
  .optional();

const citationSchema = z.object({
  chunkId: z.string(),
  endMs: z.number().int().nullable().optional(),
  fileId: z.string().nullable(),
  page: z.number().int().nullable().optional(),
  score: z.number(),
  snippet: z.string(),
  sourceType: z.string(),
  startMs: z.number().int().nullable().optional(),
  title: z.string().nullable().optional(),
  workspacePath: z.string(),
});

const noteRecordSchema = z.object({
  fileId: z.string(),
  ingestionJobId: z.string().nullable().optional(),
  title: z.string(),
  updatedAt: z.string(),
  workspacePath: z.string(),
});

const fileRecordSchema = z.object({
  fileId: z.string(),
  folderId: z.string(),
  isIngested: z.boolean(),
  mimeType: z.string().nullable(),
  name: z.string(),
  sizeBytes: z.number().int(),
  updatedAt: z.string(),
  workspacePath: z.string(),
});

const ingestionChunkPreviewSchema = z.object({
  chunkId: z.string(),
  chunkIndex: z.number().int(),
  content: z.string(),
  endMs: z.number().int().nullable().optional(),
  kind: z.string(),
  page: z.number().int().nullable().optional(),
  startMs: z.number().int().nullable().optional(),
});

const dueCardSchema = z.object({
  cardId: z.string(),
  kind: z.enum(["flashcard", "multiple_choice_quiz"]),
  setId: z.string(),
  setTitle: z.string(),
  dueAt: z.string().nullable(),
  frontMarkdown: z.string(),
  remainingDueCount: z.number().int(),
});

const flashcardSchema = z.object({
  backMarkdown: z.string(),
  frontMarkdown: z.string(),
  notesMarkdown: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

const quizQuestionSchema = z.object({
  backMarkdown: z.string(),
  correctOptionIndex: z.number().int().nonnegative(),
  explanation: z.string().nullable().optional(),
  frontMarkdown: z.string(),
  options: z.array(z.string()).min(2).max(8),
  tags: z.array(z.string()).optional(),
});

const agentFilePreviewSchema = z.object({
  excerpt: z.string(),
  fileId: z.string().nullable(),
  workspacePath: z.string(),
});

const readWorkspaceFileResultSchema = z.object({
  content: z.string(),
  fileId: z.string(),
  mimeType: z.string().nullable(),
  name: z.string(),
  readMode: z.enum(["summary", "text"]),
  updatedAt: z.string(),
  workspacePath: z.string(),
});

const moveFileResultSchema = z.object({
  fileId: z.string(),
  folderId: z.string(),
  previousWorkspacePath: z.string(),
  title: z.string(),
  updatedAt: z.string(),
  workspacePath: z.string(),
});

const deleteFileResultSchema = z.object({
  deletedAt: z.string(),
  fileId: z.string(),
  title: z.string(),
  workspacePath: z.string(),
});

const folderRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  workspaceId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const createFolderResultSchema = folderRecordSchema;

const moveFolderResultSchema = z.object({
  folderId: z.string(),
  previousParentId: z.string().nullable(),
  title: z.string(),
  updatedAt: z.string(),
  workspacePath: z.string(),
});

const deleteFolderResultSchema = z.object({
  deletedAt: z.string(),
  folderId: z.string(),
  title: z.string(),
  workspacePath: z.string(),
});

export const chatToolSchemas = {
  create_note: {
    input: z.object({
      content: z.string().min(1),
      folderId: z.string().min(1).optional(),
      tags: z.array(z.string()).max(12).optional(),
      title: z.string().min(1),
    }),
    output: noteRecordSchema,
  },
  generate_flashcards: {
    input: z
      .object({
        count: z.number().int().min(1).max(24).optional(),
        fileId: z.string().min(1).optional(),
        query: z.string().min(1).optional(),
        sourceText: z.string().min(1).optional(),
        tags: z.array(z.string()).max(12).optional(),
        title: z.string().min(1).optional(),
      })
      .refine(
        (value) =>
          Number(Boolean(value.fileId)) +
            Number(Boolean(value.query)) +
            Number(Boolean(value.sourceText)) ===
          1,
        "Provide exactly one of fileId, query, or sourceText."
      ),
    output: z.object({
      cardCount: z.number().int(),
      setId: z.string(),
      title: z.string(),
    }),
  },
  get_due_cards: {
    input: z.object({
      limit: z.number().int().min(1).max(20).optional(),
    }),
    output: z.object({
      dueCards: z.array(dueCardSchema),
      totalDueCount: z.number().int(),
    }),
  },
  get_file_summary: {
    input: z.object({
      fileId: z.string().min(1),
    }),
    output: z.object({
      chunkCount: z.number().int(),
      chunks: z.array(ingestionChunkPreviewSchema),
      fileId: z.string(),
      hasIngestion: z.boolean(),
      mimeType: z.string().nullable(),
      name: z.string(),
      transcriptCueCount: z.number().int(),
      updatedAt: z.string(),
      workspacePath: z.string(),
    }),
  },
  list_files: {
    input: z.object({
      folderId: z.string().min(1).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }),
    output: z.object({
      files: z.array(fileRecordSchema),
      totalFiles: z.number().int(),
    }),
  },
  move_file: {
    input: z.object({
      fileId: z.string().min(1),
      targetFolderId: z.string().min(1),
      targetFolderPathHint: z.string().min(1).optional(),
      workspacePathHint: z.string().min(1).optional(),
    }),
    output: moveFileResultSchema,
  },
  quiz_me: {
    input: z
      .object({
        count: z.number().int().min(3).max(5).optional(),
        fileId: z.string().min(1).optional(),
        query: z.string().min(1).optional(),
        sourceText: z.string().min(1).optional(),
        tags: z.array(z.string()).max(12).optional(),
        title: z.string().min(1).optional(),
      })
      .refine(
        (value) =>
          Number(Boolean(value.fileId)) +
            Number(Boolean(value.query)) +
            Number(Boolean(value.sourceText)) ===
          1,
        "Provide exactly one of fileId, query, or sourceText."
      ),
    output: z.object({
      questionCount: z.number().int(),
      questions: z.array(quizQuestionSchema),
      setId: z.string(),
      title: z.string(),
    }),
  },
  read_note: {
    input: z.object({
      fileId: z.string().min(1),
      maxChars: z.number().int().min(250).max(50_000).optional(),
    }),
    output: z.object({
      content: z.string(),
      fileId: z.string(),
      title: z.string(),
      updatedAt: z.string(),
      workspacePath: z.string(),
    }),
  },
  read_workspace_file: {
    input: z.object({
      fileId: z.string().min(1),
      maxChars: z.number().int().min(250).max(50_000).optional(),
    }),
    output: readWorkspaceFileResultSchema,
  },
  render_graph: {
    input: z.object({
      caption: z.string().min(1).optional(),
      pythonCode: z.string().min(1),
      title: z.string().min(1),
    }),
    output: z.object({
      caption: z.string().nullable(),
      kind: z.literal("matplotlib"),
      pythonCode: z.string(),
      title: z.string(),
    }),
  },
  search_materials: {
    input: z.object({
      limit: z.number().int().min(1).max(20).optional(),
      query: z.string().min(1),
      sourceType: sourceTypeSchema,
    }),
    output: z.object({
      matches: z.array(citationSchema),
      query: z.string(),
      totalMatches: z.number().int(),
    }),
  },
  avenire_agent: {
    input: z.object({
      maxFiles: z.number().int().min(1).max(6).optional(),
      maxMatches: z.number().int().min(1).max(20).optional(),
      query: z.string().min(1),
    }),
    output: z.object({
      citations: z.array(citationSchema),
      context: z.string(),
      files: z.array(agentFilePreviewSchema),
      query: z.string(),
      summary: z.string(),
    }),
  },
  file_manager_agent: {
    input: z.object({
      maxFiles: z.number().int().min(1).max(8).optional(),
      task: z.string().min(1),
    }),
    output: z.object({
      files: z.array(agentFilePreviewSchema),
      summary: z.string(),
      task: z.string(),
    }),
  },
  delete_file: {
    input: z.object({
      fileId: z.string().min(1),
      workspacePathHint: z.string().min(1).optional(),
    }),
    output: deleteFileResultSchema,
  },
  create_folder: {
    input: z.object({
      name: z.string().min(1),
      parentId: z.string().min(1).optional(),
    }),
    output: createFolderResultSchema,
  },
  move_folder: {
    input: z.object({
      folderId: z.string().min(1),
      targetFolderId: z.string().min(1),
    }),
    output: moveFolderResultSchema,
  },
  delete_folder: {
    input: z.object({
      folderId: z.string().min(1),
    }),
    output: deleteFolderResultSchema,
  },
  update_note: {
    input: z.object({
      content: z.string().min(1),
      fileId: z.string().min(1),
      mode: z.enum(["append", "replace_entire", "replace_section"]),
      sectionHeading: z.string().min(1).optional(),
    }),
    output: noteRecordSchema,
  },
} as const;

export const chatTools = {
  search_materials: tool({
    inputSchema: chatToolSchemas.search_materials.input,
    outputSchema: chatToolSchemas.search_materials.output,
  }),
  avenire_agent: tool({
    inputSchema: chatToolSchemas.avenire_agent.input,
    outputSchema: chatToolSchemas.avenire_agent.output,
  }),
  file_manager_agent: tool({
    inputSchema: chatToolSchemas.file_manager_agent.input,
    outputSchema: chatToolSchemas.file_manager_agent.output,
  }),
  read_note: tool({
    inputSchema: chatToolSchemas.read_note.input,
    outputSchema: chatToolSchemas.read_note.output,
  }),
  read_workspace_file: tool({
    inputSchema: chatToolSchemas.read_workspace_file.input,
    outputSchema: chatToolSchemas.read_workspace_file.output,
  }),
  create_note: tool({
    inputSchema: chatToolSchemas.create_note.input,
    outputSchema: chatToolSchemas.create_note.output,
  }),
  update_note: tool({
    inputSchema: chatToolSchemas.update_note.input,
    outputSchema: chatToolSchemas.update_note.output,
  }),
  generate_flashcards: tool({
    inputSchema: chatToolSchemas.generate_flashcards.input,
    outputSchema: chatToolSchemas.generate_flashcards.output,
  }),
  render_graph: tool({
    inputSchema: chatToolSchemas.render_graph.input,
    outputSchema: chatToolSchemas.render_graph.output,
  }),
  list_files: tool({
    inputSchema: chatToolSchemas.list_files.input,
    outputSchema: chatToolSchemas.list_files.output,
  }),
  move_file: tool({
    inputSchema: chatToolSchemas.move_file.input,
    outputSchema: chatToolSchemas.move_file.output,
  }),
  delete_file: tool({
    inputSchema: chatToolSchemas.delete_file.input,
    outputSchema: chatToolSchemas.delete_file.output,
  }),
  create_folder: tool({
    inputSchema: chatToolSchemas.create_folder.input,
    outputSchema: chatToolSchemas.create_folder.output,
  }),
  move_folder: tool({
    inputSchema: chatToolSchemas.move_folder.input,
    outputSchema: chatToolSchemas.move_folder.output,
  }),
  delete_folder: tool({
    inputSchema: chatToolSchemas.delete_folder.input,
    outputSchema: chatToolSchemas.delete_folder.output,
  }),
  get_file_summary: tool({
    inputSchema: chatToolSchemas.get_file_summary.input,
    outputSchema: chatToolSchemas.get_file_summary.output,
  }),
  get_due_cards: tool({
    inputSchema: chatToolSchemas.get_due_cards.input,
    outputSchema: chatToolSchemas.get_due_cards.output,
  }),
  quiz_me: tool({
    inputSchema: chatToolSchemas.quiz_me.input,
    outputSchema: chatToolSchemas.quiz_me.output,
  }),
};

export type ChatUITools = InferUITools<typeof chatTools>;
