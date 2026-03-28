import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isSharedFilesVirtualFolderId,
  userCanEditFolder,
} from "@/lib/file-data";
import {
  registerWorkspaceMarkdownNote,
  registerWorkspaceUploadedFile,
} from "@/lib/upload-registration";
import { scheduleAsyncVideoDeliveryOptimization } from "@/lib/video-delivery";
import { getSessionUser } from "@/lib/workspace";

const baseFileSchema = z.object({
  clientUploadId: z.string().min(1).max(120),
  folderId: z.string().uuid(),
  name: z.string().min(1),
  mimeType: z.string().nullable().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  contentHashSha256: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/)
    .optional(),
  hashComputedBy: z.enum(["client", "server"]).optional(),
});

const uploadedFileSchema = baseFileSchema.extend({
  content: z.undefined().optional(),
  sizeBytes: z.number().int().nonnegative(),
  storageKey: z.string().min(1),
  storageUrl: z.string().url(),
});

const noteFileSchema = baseFileSchema.extend({
  content: z.string(),
  storageKey: z.undefined().optional(),
  storageUrl: z.undefined().optional(),
});

const fileSchema = z.union([uploadedFileSchema, noteFileSchema]);

const requestSchema = z.object({
  dedupeMode: z.enum(["allow", "skip"]).optional(),
  files: z.array(fileSchema).min(1).max(200),
});

type RegisterResult = {
  clientUploadId: string;
  status: "ok" | "failed";
  error?: string;
  file?: {
    id: string;
  };
  ingestionJob?: {
    id?: string;
  } | null;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceUuid: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid } = await context.params;

  const parsed = requestSchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const results: RegisterResult[] = [];
  const dedupeMode = parsed.data.dedupeMode ?? "allow";
  const canEditByFolderId = new Map<string, boolean>();
  await Promise.all(
    [...new Set(parsed.data.files.map((fileInput) => fileInput.folderId))].map(
      async (folderId) => {
        const canEdit = await userCanEditFolder({
          workspaceId: workspaceUuid,
          folderId,
          userId: user.id,
        });
        canEditByFolderId.set(folderId, canEdit);
      }
    )
  );

  for (const fileInput of parsed.data.files) {
    try {
      if (isSharedFilesVirtualFolderId(fileInput.folderId, workspaceUuid)) {
        results.push({
          clientUploadId: fileInput.clientUploadId,
          status: "failed",
          error: "Cannot create items in Shared Files",
        });
        continue;
      }
      const canEdit = canEditByFolderId.get(fileInput.folderId) ?? false;
      if (!canEdit) {
        results.push({
          clientUploadId: fileInput.clientUploadId,
          status: "failed",
          error: "Read-only folder",
        });
        continue;
      }

      const result =
        typeof fileInput.content === "string"
          ? await registerWorkspaceMarkdownNote({
              content: fileInput.content,
              dedupeMode,
              folderId: fileInput.folderId,
              metadata: fileInput.metadata,
              name: fileInput.name,
              userId: user.id,
              workspaceUuid,
            })
          : await registerWorkspaceUploadedFile({
              workspaceUuid,
              userId: user.id,
              folderId: fileInput.folderId,
              storageKey: fileInput.storageKey,
              storageUrl: fileInput.storageUrl,
              name: fileInput.name,
              mimeType: fileInput.mimeType,
              sizeBytes: fileInput.sizeBytes,
              metadata: fileInput.metadata,
              contentHashSha256: fileInput.contentHashSha256,
              hashComputedBy: fileInput.hashComputedBy,
              dedupeMode,
            });

      results.push({
        clientUploadId: fileInput.clientUploadId,
        status: "ok",
        file: { id: result.file.id },
        ingestionJob: result.ingestionJob,
      });

      if (
        result.status === "created" &&
        result.file.mimeType?.startsWith("video/")
      ) {
        scheduleAsyncVideoDeliveryOptimization({
          file: result.file,
          userId: user.id,
          workspaceUuid,
        });
      }
    } catch (error) {
      const isRateLimit =
        (error as { code?: string } | null | undefined)?.code ===
        "UPLOAD_RATE_LIMIT";
      results.push({
        clientUploadId: fileInput.clientUploadId,
        status: "failed",
        error: isRateLimit
          ? "Upload usage limit reached"
          : error instanceof Error
            ? error.message
            : "Registration failed",
      });
    }
  }

  const succeeded = results.filter((entry) => entry.status === "ok").length;
  return NextResponse.json({
    ok: true,
    summary: {
      total: results.length,
      succeeded,
      failed: results.length - succeeded,
    },
    results,
  });
}
