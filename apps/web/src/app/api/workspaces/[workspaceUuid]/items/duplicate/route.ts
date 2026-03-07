import {
  getFileAssetById,
  getFolderWithAncestors,
  listWorkspaceFiles,
  listWorkspaceFolders,
  registerFileAsset,
  createFolder,
} from "@/lib/file-data";
import { publishFilesInvalidationEvent } from "@/lib/files-realtime-publisher";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

type DuplicateBody = {
  id?: string;
  kind?: "file" | "folder";
  parentId?: string | null;
};

function resolveDuplicateName(existingNames: string[], requestedName: string) {
  const existingNameSet = new Set(existingNames.map((name) => name.toLowerCase()));

  const dotIndex = requestedName.lastIndexOf(".");
  const hasExtension = dotIndex > 0 && dotIndex < requestedName.length - 1;
  const baseName = hasExtension ? requestedName.slice(0, dotIndex) : requestedName;
  const extension = hasExtension ? requestedName.slice(dotIndex) : "";
  const safeBaseName = baseName || "Untitled";

  if (!existingNameSet.has(requestedName.toLowerCase())) {
    return requestedName;
  }

  let copyIndex = 1;
  while (copyIndex < 10_000) {
    const suffix = ` (${copyIndex})`;
    const maxBaseLength = Math.max(1, 255 - extension.length - suffix.length);
    const candidateBase = safeBaseName.slice(0, maxBaseLength);
    const candidate = `${candidateBase}${suffix}${extension}`;
    if (!existingNameSet.has(candidate.toLowerCase())) {
      return candidate;
    }
    copyIndex += 1;
  }

  return `${safeBaseName}-${randomUUID().slice(0, 8)}${extension}`;
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

  const body = (await request.json().catch(() => ({}))) as DuplicateBody;
  if (!(body.id && body.kind)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (body.kind === "file") {
    const source = await getFileAssetById(workspaceUuid, body.id);
    if (!source) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const targetFolderId = body.parentId ?? source.folderId;
    const workspaceFiles = await listWorkspaceFiles(workspaceUuid, user.id);
    const siblingNames = workspaceFiles
      .filter((file) => file.folderId === targetFolderId)
      .map((file) => file.name);
    const duplicateName = resolveDuplicateName(siblingNames, source.name);

    const file = await registerFileAsset(workspaceUuid, user.id, {
      contentHashSha256: source.contentHashSha256 ?? null,
      folderId: targetFolderId,
      hashComputedBy: source.hashComputedBy as "client" | "server" | null | undefined,
      hashVerificationStatus:
        source.hashVerificationStatus as "failed" | "pending" | "verified" | null | undefined,
      storageKey: `virtual:duplicate:${source.id}:${randomUUID()}`,
      storageUrl: source.storageUrl,
      name: duplicateName,
      mimeType: source.mimeType,
      sizeBytes: source.sizeBytes,
    });

    await publishFilesInvalidationEvent({ workspaceUuid, reason: "file.created" });
    await publishFilesInvalidationEvent({ workspaceUuid, reason: "tree.changed" });

    return NextResponse.json({ file }, { status: 201 });
  }

  const sourceTree = await getFolderWithAncestors(workspaceUuid, body.id, user.id);
  if (!sourceTree?.folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const [workspaceFolders, workspaceFiles] = await Promise.all([
    listWorkspaceFolders(workspaceUuid, user.id),
    listWorkspaceFiles(workspaceUuid, user.id),
  ]);

  const sourceFolder = workspaceFolders.find((folder) => folder.id === body.id);
  if (!sourceFolder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const targetParentId = body.parentId ?? sourceFolder.parentId;
  const siblingNames = workspaceFolders
    .filter((folder) => folder.parentId === targetParentId)
    .map((folder) => folder.name);
  const duplicateRootName = resolveDuplicateName(siblingNames, sourceFolder.name);
  const rootFolder = await createFolder(
    workspaceUuid,
    targetParentId ?? sourceFolder.parentId ?? sourceFolder.id,
    duplicateRootName,
    user.id,
  );

  if (!rootFolder) {
    return NextResponse.json({ error: "Unable to duplicate folder" }, { status: 500 });
  }

  const descendants = workspaceFolders.filter((folder) => {
    let cursor = folder.parentId;
    while (cursor) {
      if (cursor === sourceFolder.id) {
        return true;
      }
      cursor =
        workspaceFolders.find((candidate) => candidate.id === cursor)?.parentId ??
        null;
    }
    return false;
  });

  const createdFolderBySourceId = new Map<string, string>([[sourceFolder.id, rootFolder.id]]);
  const descendantsByDepth = descendants.sort((left, right) => {
    const depth = (folderId: string) => {
      let value = 0;
      let cursor =
        workspaceFolders.find((folder) => folder.id === folderId)?.parentId ?? null;
      while (cursor) {
        value += 1;
        cursor =
          workspaceFolders.find((folder) => folder.id === cursor)?.parentId ?? null;
      }
      return value;
    };
    return depth(left.id) - depth(right.id);
  });

  for (const folder of descendantsByDepth) {
    const clonedParentId = createdFolderBySourceId.get(folder.parentId ?? "");
    if (!clonedParentId) {
      continue;
    }
    const folderSiblingNames = workspaceFolders
      .filter((candidate) => candidate.parentId === clonedParentId)
      .map((candidate) => candidate.name);
    const createdFolder = await createFolder(
      workspaceUuid,
      clonedParentId,
      resolveDuplicateName(folderSiblingNames, folder.name),
      user.id,
    );
    if (createdFolder) {
      createdFolderBySourceId.set(folder.id, createdFolder.id);
    }
  }

  const sourceFolderIds = new Set<string>([
    sourceFolder.id,
    ...descendants.map((folder) => folder.id),
  ]);

  for (const file of workspaceFiles.filter((entry) => sourceFolderIds.has(entry.folderId))) {
    const clonedFolderId = createdFolderBySourceId.get(file.folderId);
    if (!clonedFolderId) {
      continue;
    }
    const siblingFileNames = workspaceFiles
      .filter((entry) => entry.folderId === clonedFolderId)
      .map((entry) => entry.name);
    await registerFileAsset(workspaceUuid, user.id, {
      contentHashSha256: file.contentHashSha256 ?? null,
      folderId: clonedFolderId,
      hashComputedBy: file.hashComputedBy as "client" | "server" | null | undefined,
      hashVerificationStatus:
        file.hashVerificationStatus as "failed" | "pending" | "verified" | null | undefined,
      storageKey: `virtual:duplicate:${file.id}:${randomUUID()}`,
      storageUrl: file.storageUrl,
      name: resolveDuplicateName(siblingFileNames, file.name),
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    });
  }

  await publishFilesInvalidationEvent({ workspaceUuid, reason: "folder.created" });
  await publishFilesInvalidationEvent({ workspaceUuid, reason: "tree.changed" });

  return NextResponse.json({ folder: rootFolder }, { status: 201 });
}
