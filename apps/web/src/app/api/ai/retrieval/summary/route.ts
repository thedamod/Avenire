import {
  type ApolloModelName,
  apollo,
  generateText,
  streamText,
} from "@avenire/ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getFileAssetById } from "@/lib/file-data";
import { normalizeMediaType } from "@/lib/media-type";
import { createApiLogger } from "@/lib/observability";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";

const summarySchema = z.object({
  matches: z
    .array(
      z.object({
        fileId: z.uuid("v4"),
        sourceType: z
          .enum(["pdf", "image", "video", "audio", "markdown", "link"])
          .optional(),
        snippet: z.string().min(1).optional(),
        title: z.string().min(1).optional(),
      }),
    )
    .max(24)
    .optional(),
  fileIds: z.array(z.uuid("v4")).max(10).optional(),
  workspaceUuid: z.uuid("v4"),
  query: z.string().min(1),
  stream: z.boolean().optional(),
});

const FALLBACK_SUMMARY =
  "I could not find a reliable answer in the matched files. Try narrowing your question or selecting a more specific file.";
const DEFAULT_ATTACHMENT_LIMIT = 3;
const DEFAULT_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_FETCH_TIMEOUT_MS = 20_000;
const DOCUMENT_SOURCE_TYPES = new Set(["markdown", "pdf", "link"]);

function summaryResponse(summary: string, stream?: boolean) {
  if (stream) {
    return new Response(summary, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
  return NextResponse.json({ summary });
}

function toPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  const apiLogger = createApiLogger({
    request,
    route: "/api/ai/retrieval/summary",
    feature: "retrieval",
    userId: user?.id ?? null,
  });
  void apiLogger.requestStarted();

  if (!user) {
    void apiLogger.requestFailed(401, "Unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = summarySchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    void apiLogger.requestFailed(400, "Invalid payload");
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const canAccess = await ensureWorkspaceAccessForUser(
    user.id,
    parsed.data.workspaceUuid,
  );
  if (!canAccess) {
    void apiLogger.requestFailed(403, "Forbidden", {
      workspaceUuid: parsed.data.workspaceUuid,
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const attachmentLimit = Math.min(
    6,
    toPositiveInt(
      process.env.RETRIEVAL_SUMMARY_ATTACHMENT_LIMIT,
      DEFAULT_ATTACHMENT_LIMIT,
    ),
  );
  const attachmentMaxBytes = Math.max(
    256_000,
    toPositiveInt(
      process.env.RETRIEVAL_SUMMARY_ATTACHMENT_MAX_BYTES,
      DEFAULT_ATTACHMENT_MAX_BYTES,
    ),
  );
  const fetchTimeoutMs = Math.max(
    2_000,
    toPositiveInt(
      process.env.RETRIEVAL_SUMMARY_FETCH_TIMEOUT_MS,
      DEFAULT_FETCH_TIMEOUT_MS,
    ),
  );
  
  const matches = parsed.data.matches ?? [];
  const matchedFileIds = matches.map((match) => match.fileId);
  const fallbackFileIds = parsed.data.fileIds ?? [];
  const fileIds = Array.from(
    new Set([...matchedFileIds, ...fallbackFileIds]),
  ).slice(0, 12);

  if (fileIds.length === 0 && matches.length === 0) {
    void apiLogger.requestSucceeded(200, {
      workspaceUuid: parsed.data.workspaceUuid,
      reason: "no-files",
    });
    return summaryResponse(FALLBACK_SUMMARY, parsed.data.stream);
  }

  try {
    const groupedMatches = new Map<
      string,
      {
        sourceType:
          | "pdf"
          | "image"
          | "video"
          | "audio"
          | "markdown"
          | "link"
          | null;
        title: string | null;
        snippets: string[];
      }
    >();
    for (const match of matches) {
      const group = groupedMatches.get(match.fileId) ?? {
        sourceType: match.sourceType ?? null,
        title: match.title?.trim() || null,
        snippets: [],
      };
      if (!group.sourceType && match.sourceType) {
        group.sourceType = match.sourceType;
      }
      if (!group.title && match.title?.trim()) {
        group.title = match.title.trim();
      }
      const snippet = match.snippet?.trim();
      if (snippet) {
        group.snippets.push(
          snippet.length > 650 ? `${snippet.slice(0, 650)}...` : snippet,
        );
      }
      groupedMatches.set(match.fileId, group);
    }

    const textualEvidence = Array.from(groupedMatches.entries())
      .filter(([, group]) => {
        const sourceType = group.sourceType ?? "";
        return (
          DOCUMENT_SOURCE_TYPES.has(sourceType) && group.snippets.length > 0
        );
      })
      .slice(0, 8)
      .map(([fileId, group]) => {
        const title = group.title ?? fileId;
        const topSnippets = group.snippets.slice(0, 3);
        return [
          `Document file: ${title} (${fileId})`,
          ...topSnippets.map(
            (snippet, index) => `Chunk ${index + 1}: ${snippet}`,
          ),
        ].join("\n");
      });

    const attachmentCandidateIds = Array.from(groupedMatches.entries())
      .filter(([, group]) => !DOCUMENT_SOURCE_TYPES.has(group.sourceType ?? ""))
      .map(([fileId]) => fileId);
    if (attachmentCandidateIds.length === 0) {
      attachmentCandidateIds.push(...fileIds);
    }

    const fileRecords = (
      await Promise.all(
        attachmentCandidateIds
          .slice(0, attachmentLimit * 2)
          .map(async (fileId) =>
            getFileAssetById(parsed.data.workspaceUuid, fileId),
          ),
      )
    ).filter((record): record is NonNullable<typeof record> => Boolean(record));

    if (fileRecords.length === 0 && textualEvidence.length === 0) {
      void apiLogger.requestSucceeded(200, {
        workspaceUuid: parsed.data.workspaceUuid,
        reason: "no-accessible-files",
      });
      return summaryResponse(FALLBACK_SUMMARY, parsed.data.stream);
    }

    const attachedFiles = (
      await Promise.all(
        fileRecords.map(async (file) => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);

          try {
            const response = await fetch(file.storageUrl, {
              cache: "no-store",
              signal: controller.signal,
            });
            if (!response.ok) {
              return null;
            }

            const downloadedType = normalizeMediaType(
              response.headers.get("content-type"),
            );
            const mediaType =
              normalizeMediaType(file.mimeType) === "application/octet-stream"
                ? downloadedType
                : normalizeMediaType(file.mimeType);

            const bytes = new Uint8Array(await response.arrayBuffer());
            if (
              bytes.byteLength === 0 ||
              bytes.byteLength > attachmentMaxBytes
            ) {
              return null;
            }

            return {
              type: "file" as const,
              mediaType,
              filename: file.name,
              data: bytes,
            };
          } catch {
            return null;
          } finally {
            clearTimeout(timeout);
          }
        }),
      )
    )
      .filter((part): part is NonNullable<typeof part> => Boolean(part))
      .slice(0, attachmentLimit);

    if (attachedFiles.length === 0 && textualEvidence.length === 0) {
      void apiLogger.requestSucceeded(200, {
        workspaceUuid: parsed.data.workspaceUuid,
        reason: "attachments-empty",
        attemptedFiles: fileRecords.length,
      });
      return summaryResponse(FALLBACK_SUMMARY, parsed.data.stream);
    }

    const summaryPrompt = [
      "Answer the user's question using only the provided retrieval evidence.",
      "For markdown/pdf/link files, use the provided retrieved chunks as the source of truth.",
      "For attached media files, inspect the file content directly.",
      "Provide short per-file descriptions in bullet points (1-2 lines each).",
      "Do not claim details that are not present in evidence.",
      "If evidence is insufficient, say what is missing.",
      `User question: ${parsed.data.query}`,
      textualEvidence.length > 0
        ? `Retrieved document chunks:\n\n${textualEvidence.join("\n\n")}`
        : "Retrieved document chunks: none",
    ].join("\n");

    if (parsed.data.stream) {
      const result = streamText({
        model: apollo.languageModel("apollo-sprint"),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: summaryPrompt,
              },
              ...attachedFiles,
            ],
          },
        ],
        temperature: 0.2,
        maxOutputTokens: 220,
      });

      void apiLogger.requestSucceeded(200, {
        workspaceUuid: parsed.data.workspaceUuid,
        modelName: "apollo-tiny",
        provider: "apollo",
        attachedFileCount: attachedFiles.length,
        textualEvidenceCount: textualEvidence.length,
        streaming: true,
      });

      return result.toTextStreamResponse({
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    const generationStartedAt = performance.now();
    const { text } = await generateText({
      model: apollo.languageModel("apollo-sprint"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: summaryPrompt,
            },
            ...attachedFiles,
          ],
        },
      ],
      temperature: 0.2,
      maxOutputTokens: 220,
    });
    const generationLatencyMs = Math.round(performance.now() - generationStartedAt);
    const summary = text.trim() || FALLBACK_SUMMARY;

    void apiLogger.requestSucceeded(200, {
      workspaceUuid: parsed.data.workspaceUuid,
      generationLatencyMs,
      modelName: "apollo-tiny",
      provider: "apollo",
      attachedFileCount: attachedFiles.length,
      textualEvidenceCount: textualEvidence.length,
    });

    return summaryResponse(summary, parsed.data.stream);
  } catch (error) {
    void apiLogger.warn("retrieval.attachment_summary.fallback", {
      workspaceUuid: parsed.data.workspaceUuid,
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : { message: "Unknown attachment summary error" },
      reason: "attachment-summary-error",
    });
    if (parsed.data.stream) {
      return summaryResponse(FALLBACK_SUMMARY, true);
    }
    return summaryResponse(FALLBACK_SUMMARY, false);
  }
}
