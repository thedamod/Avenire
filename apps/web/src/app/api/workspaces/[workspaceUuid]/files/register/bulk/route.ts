import { NextResponse } from "next/server";
import { UTApi } from "@avenire/storage";
import { z } from "zod";
import { consumeUploadUnits } from "@/lib/billing";
import {
  getFileAssetByContentHash,
  getFileAssetByStorageKey,
  isSharedFilesVirtualFolderId,
  registerFileAsset,
  softDeleteFileAsset,
} from "@/lib/file-data";
import { publishFilesInvalidationEvent } from "@/lib/files-realtime-publisher";
import {
  enqueueIngestionJob,
  hasSuccessfulIngestionForFile,
} from "@/lib/ingestion-data";
import { listWorkspaceMembers } from "@/lib/file-data";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";

const fileSchema = z.object({
  clientUploadId: z.string().min(1).max(120),
  folderId: z.string().uuid(),
  storageKey: z.string().min(1),
  storageUrl: z.string().url(),
  name: z.string().min(1),
  mimeType: z.string().nullable().optional(),
  sizeBytes: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  contentHashSha256: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/)
    .optional(),
  hashComputedBy: z.enum(["client", "server"]).optional(),
});

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

async function deleteUploadThingFile(
  storageKey: string | null | undefined,
  context?: Record<string, unknown>
) {
  if (!(storageKey && process.env.UPLOADTHING_TOKEN)) {
    return;
  }

  try {
    const utapi = new UTApi({ token: process.env.UPLOADTHING_TOKEN });
    await utapi.deleteFiles([storageKey]);
  } catch (error) {
    console.warn("Failed to delete UploadThing file", {
      storageKey,
      ...context,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function normalizeSha256(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceUuid: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid } = await context.params;
  const canAccess = await ensureWorkspaceAccessForUser(user.id, workspaceUuid);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const members = await listWorkspaceMembers(workspaceUuid);
  const currentMember = members.find((member) => member.userId === user.id);
  if (!currentMember || !["owner", "admin"].includes(currentMember.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = requestSchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const results: RegisterResult[] = [];
  const dedupeMode = parsed.data.dedupeMode ?? "allow";

  for (const fileInput of parsed.data.files) {
    let file: Awaited<ReturnType<typeof registerFileAsset>> | null = null;
    try {
      if (isSharedFilesVirtualFolderId(fileInput.folderId, workspaceUuid)) {
        results.push({
          clientUploadId: fileInput.clientUploadId,
          status: "failed",
          error: "Cannot create items in Shared Files",
        });
        continue;
      }

      const normalizedHash = normalizeSha256(fileInput.contentHashSha256);
      if (dedupeMode !== "skip") {
        const existingByHash = normalizedHash
          ? await getFileAssetByContentHash(workspaceUuid, normalizedHash)
          : null;
        const verifiedExistingByHash =
          existingByHash?.hashVerificationStatus === "verified"
            ? existingByHash
            : null;
        const existing =
          verifiedExistingByHash ??
          (await getFileAssetByStorageKey(workspaceUuid, fileInput.storageKey));
        if (existing) {
          if (verifiedExistingByHash) {
            await deleteUploadThingFile(fileInput.storageKey, {
              workspaceUuid,
              existingFileId: existing.id,
              reason: "hash-dedupe",
            });
          }

          const hasSucceeded = await hasSuccessfulIngestionForFile(
            workspaceUuid,
            existing.id
          ).catch(() => false);
          const maybeJob = hasSucceeded
            ? null
            : await enqueueIngestionJob({
                workspaceId: workspaceUuid,
                fileId: existing.id,
              }).catch(() => null);

          results.push({
            clientUploadId: fileInput.clientUploadId,
            status: "ok",
            file: { id: existing.id },
            ingestionJob: maybeJob,
          });
          continue;
        }
      }

      file = await registerFileAsset(workspaceUuid, user.id, {
        folderId: fileInput.folderId,
        storageKey: fileInput.storageKey,
        storageUrl: fileInput.storageUrl,
        name: fileInput.name,
        mimeType: fileInput.mimeType,
        sizeBytes: fileInput.sizeBytes,
        metadata: fileInput.metadata,
        contentHashSha256: normalizedHash,
        hashComputedBy: normalizedHash
          ? (fileInput.hashComputedBy ?? "client")
          : null,
        hashVerificationStatus: normalizedHash ? "pending" : null,
      });

      const usage = await consumeUploadUnits(user.id, 1);
      if (!usage.ok) {
        await deleteUploadThingFile(fileInput.storageKey, {
          workspaceUuid,
          fileId: file.id,
          reason: "usage-limit",
        });
        await softDeleteFileAsset(workspaceUuid, file.id);
        file = null;

        results.push({
          clientUploadId: fileInput.clientUploadId,
          status: "failed",
          error: "Upload usage limit reached",
        });
        continue;
      }

      const hasSucceeded = await hasSuccessfulIngestionForFile(
        workspaceUuid,
        file.id
      ).catch(() => false);
      const ingestionJob = hasSucceeded
        ? null
        : await enqueueIngestionJob({
            workspaceId: workspaceUuid,
            fileId: file.id,
          }).catch(() => null);

      results.push({
        clientUploadId: fileInput.clientUploadId,
        status: "ok",
        file: { id: file.id },
        ingestionJob,
      });
    } catch (error) {
      if (file) {
        try {
          await deleteUploadThingFile(fileInput.storageKey, {
            workspaceUuid,
            fileId: file.id,
            reason: "registration-error",
          });
        } catch (cleanupError) {
          console.warn(
            "Failed to delete uploaded blob after registration error",
            {
              workspaceUuid,
              fileId: file.id,
              storageKey: fileInput.storageKey,
              error:
                cleanupError instanceof Error
                  ? cleanupError.message
                  : String(cleanupError),
            }
          );
        }

        try {
          await softDeleteFileAsset(workspaceUuid, file.id);
        } catch (cleanupError) {
          console.warn("Failed to soft-delete file after registration error", {
            workspaceUuid,
            fileId: file.id,
            storageKey: fileInput.storageKey,
            error:
              cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError),
          });
        }
      }

      results.push({
        clientUploadId: fileInput.clientUploadId,
        status: "failed",
        error: error instanceof Error ? error.message : "Registration failed",
      });
    }
  }

  const successfulRows = parsed.data.files.filter((item) =>
    results.some(
      (result) =>
        result.clientUploadId === item.clientUploadId && result.status === "ok"
    )
  );

  if (successfulRows.length > 0) {
    const folderIds = new Set(successfulRows.map((row) => row.folderId));
    await Promise.allSettled(
      Array.from(folderIds).map((folderId) =>
        publishFilesInvalidationEvent({
          workspaceUuid,
          folderId,
          reason: "file.created",
        }).catch((error) => {
          console.warn("Failed to publish folder file invalidation", {
            workspaceUuid,
            folderId,
            reason: "file.created",
            error: error instanceof Error ? error.message : String(error),
          });
        })
      )
    );
    await publishFilesInvalidationEvent({
      workspaceUuid,
      reason: "tree.changed",
    }).catch((error) => {
      console.warn("Failed to publish tree invalidation", {
        workspaceUuid,
        reason: "tree.changed",
        error: error instanceof Error ? error.message : String(error),
      });
    });
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
