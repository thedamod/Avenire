import { NextResponse } from "next/server";
import { UTApi } from "@avenire/storage";
import {
  listTrashedItems,
  permanentlyDeleteFileAsset,
  permanentlyDeleteFolder,
  restoreFileAsset,
  restoreFolder,
} from "@/lib/file-data";
import { publishFilesInvalidationEvent } from "@/lib/files-realtime-publisher";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";

type TrashMutationBody = {
  operation?: "restore" | "delete";
  items?: Array<{
    id: string;
    kind: "file" | "folder";
  }>;
};

async function deleteUploadThingFiles(storageKeys: string[]) {
  const deletableKeys = storageKeys.filter(
    (storageKey) => storageKey && !storageKey.startsWith("virtual:duplicate:")
  );

  if (deletableKeys.length === 0 || !process.env.UPLOADTHING_TOKEN) {
    return;
  }

  try {
    const utapi = new UTApi({ token: process.env.UPLOADTHING_TOKEN });
    await utapi.deleteFiles(deletableKeys);
  } catch {
    // Best effort cleanup.
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceUuid: string }> },
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

  const items = await listTrashedItems(workspaceUuid);
  return NextResponse.json({ items });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceUuid: string }> },
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

  const body = (await request.json().catch(() => ({}))) as TrashMutationBody;
  if (body.operation !== "restore" || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const results: Array<{ id: string; kind: "file" | "folder"; ok: boolean }> = [];

  for (const item of body.items) {
    if (item.kind === "file") {
      const ok = await restoreFileAsset(workspaceUuid, item.id);
      results.push({ id: item.id, kind: item.kind, ok });
      continue;
    }

    const ok = await restoreFolder(workspaceUuid, item.id);
    results.push({ id: item.id, kind: item.kind, ok });
  }

  if (results.some((entry) => entry.ok)) {
    await publishFilesInvalidationEvent({ workspaceUuid, reason: "tree.changed" });
  }

  return NextResponse.json({ ok: true, results });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ workspaceUuid: string }> },
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

  const body = (await request.json().catch(() => ({}))) as TrashMutationBody;
  if (body.operation !== "delete" || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const results: Array<{ id: string; kind: "file" | "folder"; ok: boolean }> = [];
  const storageKeys: string[] = [];

  for (const item of body.items) {
    if (item.kind === "file") {
      const deleted = await permanentlyDeleteFileAsset(workspaceUuid, item.id);
      if (deleted?.storageKeys?.length) {
        storageKeys.push(...deleted.storageKeys);
      }
      results.push({ id: item.id, kind: item.kind, ok: Boolean(deleted) });
      continue;
    }

    const keys = await permanentlyDeleteFolder(workspaceUuid, item.id);
    storageKeys.push(...keys);
    results.push({ id: item.id, kind: item.kind, ok: true });
  }

  await deleteUploadThingFiles(Array.from(new Set(storageKeys)));

  if (results.some((entry) => entry.ok)) {
    await publishFilesInvalidationEvent({ workspaceUuid, reason: "tree.changed" });
  }

  return NextResponse.json({ ok: true, results });
}
