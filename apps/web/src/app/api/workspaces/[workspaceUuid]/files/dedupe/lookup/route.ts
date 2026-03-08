import { NextResponse } from "next/server";
import { z } from "zod";
import { getFileAssetByContentHash } from "@/lib/file-data";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";

const itemSchema = z.object({
  clientUploadId: z.string().min(1).max(120),
  folderId: z.string().uuid(),
  hashSha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
  mimeType: z.string().nullable().optional(),
  name: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
});

const requestSchema = z.object({
  files: z.array(itemSchema).min(1).max(200),
});

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

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const results = await Promise.all(
    parsed.data.files.map(async (item) => {
      const hash = item.hashSha256.trim().toLowerCase();
      const existing = await getFileAssetByContentHash(workspaceUuid, hash);
      if (!existing) {
        return {
          clientUploadId: item.clientUploadId,
          deduped: false,
        };
      }

      return {
        clientUploadId: item.clientUploadId,
        deduped: true,
        file: {
          id: existing.id,
          folderId: existing.folderId,
          name: existing.name,
          storageUrl: existing.storageUrl,
          mimeType: existing.mimeType ?? null,
          sizeBytes: existing.sizeBytes,
        },
      };
    })
  );

  return NextResponse.json({ ok: true, results });
}
