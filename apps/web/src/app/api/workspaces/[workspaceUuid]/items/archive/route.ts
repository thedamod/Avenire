import {
  getFileAssetById,
  getFolderWithAncestors,
  listWorkspaceFiles,
  listWorkspaceFolders,
  userCanAccessWorkspace,
} from "@/lib/file-data";
import { auth } from "@avenire/auth/server";
import { zipSync } from "fflate";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

type ArchiveBody = {
  id?: string;
  kind?: "file" | "folder";
};

function sanitizeArchiveSegment(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-").trim() || "untitled";
}

async function fetchFileBytes(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to fetch file payload: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceUuid: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceUuid } = await context.params;
  const canAccess = await userCanAccessWorkspace(session.user.id, workspaceUuid);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as ArchiveBody;
  if (!(body.id && body.kind)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const archiveEntries: Record<string, Uint8Array> = {};
  let archiveName = "archive";

  if (body.kind === "file") {
    const file = await getFileAssetById(workspaceUuid, body.id);
    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    archiveName = sanitizeArchiveSegment(file.name.replace(/\.[^.]+$/, "")) || "file";
    archiveEntries[sanitizeArchiveSegment(file.name)] = await fetchFileBytes(
      file.storageUrl,
    );
  } else {
    const folderTree = await getFolderWithAncestors(
      workspaceUuid,
      body.id,
      session.user.id,
    );
    if (!folderTree?.folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const [workspaceFolders, workspaceFiles] = await Promise.all([
      listWorkspaceFolders(workspaceUuid, session.user.id),
      listWorkspaceFiles(workspaceUuid, session.user.id),
    ]);

    const sourceFolder = workspaceFolders.find((folder) => folder.id === body.id);
    if (!sourceFolder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    archiveName = sanitizeArchiveSegment(sourceFolder.name);

    const folderById = new Map(workspaceFolders.map((folder) => [folder.id, folder]));
    const sourceFolderIds = new Set<string>([sourceFolder.id]);

    for (const folder of workspaceFolders) {
      let cursor = folder.parentId;
      while (cursor) {
        if (cursor === sourceFolder.id) {
          sourceFolderIds.add(folder.id);
          break;
        }
        cursor = folderById.get(cursor)?.parentId ?? null;
      }
    }

    for (const file of workspaceFiles.filter((entry) => sourceFolderIds.has(entry.folderId))) {
      const pathSegments = [sanitizeArchiveSegment(sourceFolder.name)];
      let cursor: string | null = file.folderId;
      const folderSegments: string[] = [];
      while (cursor && cursor !== sourceFolder.id) {
        const folder = folderById.get(cursor);
        if (!folder) {
          break;
        }
        folderSegments.unshift(sanitizeArchiveSegment(folder.name));
        cursor = folder.parentId;
      }
      pathSegments.push(...folderSegments, sanitizeArchiveSegment(file.name));
      archiveEntries[pathSegments.join("/")] = await fetchFileBytes(file.storageUrl);
    }
  }

  const zipBytes = zipSync(archiveEntries, { level: 0 });
  const archiveFileName = `${archiveName}.zip`;
  const escapedArchiveFileName = archiveFileName.replace(/"/g, '\\"');
  const encodedArchiveFileName = encodeURIComponent(archiveFileName);
  return new NextResponse(Buffer.from(zipBytes), {
    headers: {
      "Content-Disposition": `attachment; filename="${escapedArchiveFileName}"; filename*=UTF-8''${encodedArchiveFileName}`,
      "Content-Type": "application/zip",
    },
  });
}
