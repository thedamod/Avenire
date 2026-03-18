import { type InferUITools, tool } from "ai";
import { z } from "zod";
import { AVAILABLE_MODULES } from "../generative-ui/guidelines";

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

const notePreviewSchema = z.object({
  contentPreview: z.string(),
  fileId: z.string(),
  tags: z.array(z.string()).optional(),
  title: z.string(),
  updatedAt: z.string(),
  wordCount: z.number().int(),
  workspacePath: z.string(),
});

const misconceptionSchema = z.object({
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

export const chatToolSchemas = {
  search_materials: {
    input: z.object({
      limit: z.number().int().min(1).max(20).optional(),
      query: z.string().min(1),
      sourceType: sourceTypeSchema,
    }),
    output: z.object({
      citationMarkdown: z.string(),
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
      citationMarkdown: z.string(),
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
  note_agent: {
    input: z.object({
      maxNotes: z.number().int().min(1).max(6).optional(),
      task: z.string().min(1),
    }),
    output: z.object({
      notes: z.array(notePreviewSchema),
      operation: z.enum(["created", "read", "updated", "listed"]),
      summary: z.string(),
      task: z.string(),
    }),
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
      cards: z.array(flashcardSchema),
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
  visualize_read_me: {
    input: z.object({
      modules: z
        .array(z.enum(AVAILABLE_MODULES as [string, ...string[]]))
        .min(1),
    }),
    output: z.object({
      content: z.string(),
      modules: z.array(z.string()),
    }),
  },
  log_misconception: {
    input: z.object({
      confidence: z.number().min(0).max(1),
      concept: z.string().min(1),
      reason: z.string().min(1),
      subject: z.string().min(1),
      topic: z.string().min(1),
    }),
    output: z.object({
      activeMisconceptionsCount: z.number().int(),
      misconception: misconceptionSchema,
      summary: z.string(),
    }),
  },
  show_widget: {
    input: z
      .object({
        i_have_seen_read_me: z.boolean(),
        title: z.string(),
        widget_code: z.string(),
        width: z.number().optional(),
        height: z.number().optional(),
        filename: z.string().optional(),
      })
      .passthrough(),
    output: z.object({
      success: z.boolean(),
      details: z
        .object({
          title: z.string(),
          width: z.number(),
          height: z.number(),
          isSVG: z.boolean(),
        })
        .optional(),
      filePath: z.string().nullable().optional(),
    }),
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
  note_agent: tool({
    inputSchema: chatToolSchemas.note_agent.input,
    outputSchema: chatToolSchemas.note_agent.output,
  }),
  generate_flashcards: tool({
    inputSchema: chatToolSchemas.generate_flashcards.input,
    outputSchema: chatToolSchemas.generate_flashcards.output,
  }),
  get_due_cards: tool({
    inputSchema: chatToolSchemas.get_due_cards.input,
    outputSchema: chatToolSchemas.get_due_cards.output,
  }),
  quiz_me: tool({
    inputSchema: chatToolSchemas.quiz_me.input,
    outputSchema: chatToolSchemas.quiz_me.output,
  }),
  visualize_read_me: tool({
    inputSchema: chatToolSchemas.visualize_read_me.input,
    outputSchema: chatToolSchemas.visualize_read_me.output,
  }),
  log_misconception: tool({
    inputSchema: chatToolSchemas.log_misconception.input,
    outputSchema: chatToolSchemas.log_misconception.output,
  }),
  show_widget: tool({
    inputSchema: chatToolSchemas.show_widget.input,
    outputSchema: chatToolSchemas.show_widget.output,
  }),
};

export type ChatUITools = InferUITools<typeof chatTools>;
