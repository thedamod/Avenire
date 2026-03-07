import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db } from "./client";
import { member, organization, user as authUser } from "./auth-schema";
import {
  chatThread,
  fileAsset,
  fileFolder,
  resourceShareGrant,
  resourceShareLink,
  workspace,
} from "./schema";

export type ShareResourceType = "chat" | "file" | "folder";

export interface ExplorerFolderRecord {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  isShared?: boolean;
  readOnly?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExplorerFileRecord {
  id: string;
  workspaceId: string;
  folderId: string;
  storageKey: string;
  storageUrl: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number;
  isShared?: boolean;
  readOnly?: boolean;
  sourceWorkspaceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShareRecipientSuggestion {
  email: string;
  name: string | null;
  count: number;
  lastSharedAt: string | null;
  source: "frequent" | "workspace-member";
}

const SHARED_FILES_FOLDER_PREFIX = "__shared_files__:";

function sharedFilesFolderId(workspaceId: string) {
  return `${SHARED_FILES_FOLDER_PREFIX}${workspaceId}`;
}

export function isSharedFilesVirtualFolderId(folderId: string, workspaceId: string) {
  return folderId === sharedFilesFolderId(workspaceId);
}

export interface WorkspaceMemberRecord {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
}

function mapFolder(row: typeof fileFolder.$inferSelect): ExplorerFolderRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    parentId: row.parentId,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapFile(row: typeof fileAsset.$inferSelect): ExplorerFileRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    folderId: row.folderId,
    storageKey: row.storageKey,
    storageUrl: row.storageUrl,
    name: row.name,
    mimeType: row.mimeType ?? null,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function listSharedFileRecordsForUser(userId: string) {
  const rows = await db
    .select({
      file: fileAsset,
      grantCreatedAt: resourceShareGrant.createdAt,
    })
    .from(resourceShareGrant)
    .innerJoin(
      fileAsset,
      and(
        eq(resourceShareGrant.resourceType, "file"),
        sql`${resourceShareGrant.resourceId} = ${fileAsset.id}::text`,
      ),
    )
    .where(
      and(
        eq(resourceShareGrant.granteeUserId, userId),
        eq(resourceShareGrant.resourceType, "file"),
        isNull(fileAsset.deletedAt),
      ),
    )
    .orderBy(desc(resourceShareGrant.createdAt));

  return rows.map((row) => ({
    ...mapFile(row.file),
    createdAt: row.grantCreatedAt.toISOString(),
    isShared: true,
    readOnly: true,
    sourceWorkspaceId: row.file.workspaceId,
  }));
}

export async function listUserOrganizationIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId));

  return rows.map((row) => row.organizationId);
}

export async function findAuthUserByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const [row] = await db
    .select({
      id: authUser.id,
      email: authUser.email,
      name: authUser.name,
    })
    .from(authUser)
    .where(eq(authUser.email, normalizedEmail))
    .limit(1);

  return row
    ? {
        id: row.id,
        email: row.email,
        name: row.name ?? null,
      }
    : null;
}

async function getWorkspaceOrganizationId(workspaceId: string) {
  const [ws] = await db
    .select({ organizationId: workspace.organizationId })
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1);
  return ws?.organizationId ?? null;
}

export async function listWorkspaceMembers(workspaceId: string) {
  const organizationId = await getWorkspaceOrganizationId(workspaceId);
  if (!organizationId) {
    return [];
  }

  const rows = await db
    .select({
      userId: authUser.id,
      email: authUser.email,
      name: authUser.name,
      role: member.role,
      createdAt: member.createdAt,
    })
    .from(member)
    .innerJoin(authUser, eq(authUser.id, member.userId))
    .where(eq(member.organizationId, organizationId))
    .orderBy(asc(authUser.email));

  return rows.map((row) => ({
    userId: row.userId,
    email: row.email,
    name: row.name ?? null,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function addWorkspaceMemberByEmail(input: {
  workspaceId: string;
  email: string;
  role?: "member" | "admin" | "owner";
}) {
  const organizationId = await getWorkspaceOrganizationId(input.workspaceId);
  if (!organizationId) {
    return { status: "workspace-not-found" as const };
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  if (!normalizedEmail) {
    return { status: "invalid-email" as const };
  }

  const [targetUser] = await db
    .select({
      id: authUser.id,
      email: authUser.email,
      name: authUser.name,
    })
    .from(authUser)
    .where(eq(authUser.email, normalizedEmail))
    .limit(1);

  if (!targetUser) {
    return { status: "user-not-found" as const };
  }

  const [existingMember] = await db
    .select({ id: member.id, role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, targetUser.id)))
    .limit(1);

  if (existingMember) {
    return {
      status: "already-member" as const,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        name: targetUser.name ?? null,
        role: existingMember.role,
      },
    };
  }

  const now = new Date();
  const [created] = await db
    .insert(member)
    .values({
      id: randomUUID(),
      organizationId,
      userId: targetUser.id,
      role: input.role ?? "member",
      createdAt: now,
    })
    .returning({ role: member.role });

  return {
    status: "added" as const,
    user: {
      id: targetUser.id,
      email: targetUser.email,
      name: targetUser.name ?? null,
      role: created.role,
    },
  };
}

export async function listWorkspaceShareSuggestions(input: {
  workspaceId: string;
  userId: string;
  userEmail?: string | null;
  query?: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(input.limit ?? 8, 20));
  const query = input.query?.trim().toLowerCase() ?? "";

  const [recentShares, members] = await Promise.all([
    db
      .select({
        email: authUser.email,
        name: authUser.name,
        createdAt: resourceShareGrant.createdAt,
      })
      .from(resourceShareGrant)
      .innerJoin(authUser, eq(authUser.id, resourceShareGrant.granteeUserId))
      .where(
        and(
          eq(resourceShareGrant.workspaceId, input.workspaceId),
          eq(resourceShareGrant.createdBy, input.userId),
        ),
      )
      .orderBy(desc(resourceShareGrant.createdAt))
      .limit(120),
    listWorkspaceMembers(input.workspaceId),
  ]);

  const byEmail = new Map<string, ShareRecipientSuggestion>();

  for (const row of recentShares) {
    const email = row.email.toLowerCase();
    if (!byEmail.has(email)) {
      byEmail.set(email, {
        email: row.email,
        name: row.name ?? null,
        count: 0,
        lastSharedAt: row.createdAt.toISOString(),
        source: "frequent",
      });
    }

    const entry = byEmail.get(email);
    if (!entry) {
      continue;
    }
    entry.count += 1;
    if (!entry.lastSharedAt || row.createdAt.getTime() > new Date(entry.lastSharedAt).getTime()) {
      entry.lastSharedAt = row.createdAt.toISOString();
    }
  }

  for (const row of members) {
    const email = row.email.toLowerCase();
    if (input.userEmail && email === input.userEmail.toLowerCase()) {
      continue;
    }
    if (!byEmail.has(email)) {
      byEmail.set(email, {
        email: row.email,
        name: row.name ?? null,
        count: 0,
        lastSharedAt: null,
        source: "workspace-member",
      });
      continue;
    }
    const existing = byEmail.get(email);
    if (!existing) {
      continue;
    }
    if (!existing.name && row.name) {
      existing.name = row.name;
    }
  }

  const scored = Array.from(byEmail.values())
    .filter((item) => {
      if (!query) {
        return true;
      }
      const name = item.name?.toLowerCase() ?? "";
      return item.email.toLowerCase().includes(query) || name.includes(query);
    })
    .sort((a, b) => {
      if (a.count !== b.count) {
        return b.count - a.count;
      }
      if (a.lastSharedAt && b.lastSharedAt) {
        return new Date(b.lastSharedAt).getTime() - new Date(a.lastSharedAt).getTime();
      }
      if (a.lastSharedAt && !b.lastSharedAt) {
        return -1;
      }
      if (!a.lastSharedAt && b.lastSharedAt) {
        return 1;
      }
      return a.email.localeCompare(b.email);
    });

  return scored.slice(0, limit);
}

export interface UserWorkspaceSummary {
  workspaceId: string;
  organizationId: string;
  name: string;
  rootFolderId: string;
}

export async function ensureWorkspaceForOrganization(organizationId: string) {
  return db.transaction(async (tx) => {
    const now = new Date();
    const [created] = await tx
      .insert(workspace)
      .values({ organizationId, createdAt: now, updatedAt: now })
      .onConflictDoNothing({ target: workspace.organizationId })
      .returning();

    if (created) {
      return created;
    }

    const [existing] = await tx
      .select()
      .from(workspace)
      .where(eq(workspace.organizationId, organizationId))
      .limit(1);

    if (!existing) {
      throw new Error("Failed to resolve workspace for organization");
    }

    return existing;
  });
}

export async function ensureWorkspaceRootFolder(workspaceId: string, userId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${workspaceId}))`);

    const [existing] = await tx
      .select()
      .from(fileFolder)
      .where(
        and(
          eq(fileFolder.workspaceId, workspaceId),
          isNull(fileFolder.parentId),
          isNull(fileFolder.deletedAt),
        ),
      )
      .orderBy(asc(fileFolder.createdAt))
      .limit(1);

    if (existing) {
      return existing;
    }

    const now = new Date();
    const [created] = await tx
      .insert(fileFolder)
      .values({
        workspaceId,
        parentId: null,
        name: "Workspace",
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (created) {
      return created;
    }

    const [fallback] = await tx
      .select()
      .from(fileFolder)
      .where(
        and(
          eq(fileFolder.workspaceId, workspaceId),
          isNull(fileFolder.parentId),
          isNull(fileFolder.deletedAt),
        ),
      )
      .orderBy(asc(fileFolder.createdAt))
      .limit(1);

    if (!fallback) {
      throw new Error("Failed to resolve workspace root folder");
    }

    return fallback;
  });
}

export async function resolveWorkspaceForUser(
  userId: string,
  preferredOrganizationId?: string | null,
) {
  let memberships = await listUserOrganizationIds(userId);
  if (memberships.length === 0) {
    const organizationId = await ensureDefaultOrganizationForUser(userId);
    memberships = [organizationId];
  }

  if (memberships.length === 0) {
    return null;
  }

  const organizationId =
    preferredOrganizationId && memberships.includes(preferredOrganizationId)
      ? preferredOrganizationId
      : memberships[0];

  const ws = await ensureWorkspaceForOrganization(organizationId);
  const rootFolder = await ensureWorkspaceRootFolder(ws.id, userId);

  return {
    workspaceId: ws.id,
    organizationId,
    rootFolderId: rootFolder.id,
  };
}

export async function listWorkspacesForUser(userId: string): Promise<UserWorkspaceSummary[]> {
  const memberships = await db
    .select({
      organizationId: member.organizationId,
      organizationName: organization.name,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId));

  if (memberships.length === 0) {
    return [];
  }

  return Promise.all(
    memberships.map(async (membership) => {
      const ws = await ensureWorkspaceForOrganization(membership.organizationId);
      const root = await ensureWorkspaceRootFolder(ws.id, userId);
      return {
        workspaceId: ws.id,
        organizationId: ws.organizationId,
        name: membership.organizationName,
        rootFolderId: root.id,
      };
    }),
  );
}

export async function createWorkspaceForUser(userId: string, name: string) {
  const trimmed = name.trim().slice(0, 80) || "New Workspace";
  const slugBase =
    trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 32) || "workspace";
  const orgId = randomUUID();
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(organization).values({
      id: orgId,
      name: trimmed,
      slug: `${slugBase}-${orgId.slice(0, 8)}`,
      createdAt: now,
      logo: null,
      metadata: null,
    });

    await tx.insert(member).values({
      id: randomUUID(),
      organizationId: orgId,
      userId,
      role: "owner",
      createdAt: now,
    });
  });

  const ws = await ensureWorkspaceForOrganization(orgId);
  const root = await ensureWorkspaceRootFolder(ws.id, userId);

  return {
    workspaceId: ws.id,
    organizationId: ws.organizationId,
    name: trimmed,
    rootFolderId: root.id,
  } satisfies UserWorkspaceSummary;
}

export async function deleteWorkspaceForUser(userId: string, workspaceId: string) {
  const [ws] = await db
    .select({ organizationId: workspace.organizationId })
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1);

  if (!ws) {
    return { status: "workspace-not-found" as const };
  }

  const [membership] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, ws.organizationId), eq(member.userId, userId)))
    .limit(1);

  if (!membership) {
    return { status: "forbidden" as const };
  }

  if (membership.role !== "owner") {
    return { status: "not-owner" as const };
  }

  const [deleted] = await db
    .delete(organization)
    .where(eq(organization.id, ws.organizationId))
    .returning({ id: organization.id });

  if (!deleted) {
    return { status: "workspace-not-found" as const };
  }

  return { status: "deleted" as const };
}

async function ensureDefaultOrganizationForUser(userId: string) {
  const [existingMembership] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .limit(1);

  if (existingMembership) {
    return existingMembership.organizationId;
  }

  const [userRecord] = await db
    .select({ email: authUser.email, name: authUser.name })
    .from(authUser)
    .where(eq(authUser.id, userId))
    .limit(1);

  const nameBase =
    userRecord?.name?.trim() ||
    userRecord?.email?.split("@")[0]?.trim() ||
    "workspace";
  const slugBase = nameBase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32) || "workspace";
  const orgId = randomUUID();
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(organization).values({
      id: orgId,
      name: `${nameBase}'s Workspace`,
      slug: `${slugBase}-${orgId.slice(0, 8)}`,
      createdAt: now,
      metadata: null,
      logo: null,
    });

    await tx.insert(member).values({
      id: randomUUID(),
      organizationId: orgId,
      userId,
      role: "owner",
      createdAt: now,
    });
  });

  return orgId;
}

export async function userCanAccessWorkspace(userId: string, workspaceId: string) {
  const [ws] = await db
    .select()
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1);

  if (!ws) {
    return false;
  }

  const [membership] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, ws.organizationId)))
    .limit(1);

  return Boolean(membership);
}

export async function getFolderWithAncestors(
  workspaceId: string,
  folderId: string,
  userId?: string,
) {
  if (userId && isSharedFilesVirtualFolderId(folderId, workspaceId)) {
    const sharedFiles = await listSharedFileRecordsForUser(userId);
    if (sharedFiles.length === 0) {
      return null;
    }

    const [root] = await db
      .select()
      .from(fileFolder)
      .where(
        and(
          eq(fileFolder.workspaceId, workspaceId),
          isNull(fileFolder.parentId),
          isNull(fileFolder.deletedAt),
        ),
      )
      .orderBy(asc(fileFolder.createdAt))
      .limit(1);

    if (!root) {
      return null;
    }

    const sharedFolder: ExplorerFolderRecord = {
      id: sharedFilesFolderId(workspaceId),
      workspaceId,
      parentId: root.id,
      name: "Shared Files",
      isShared: true,
      readOnly: true,
      createdAt: root.createdAt.toISOString(),
      updatedAt: root.updatedAt.toISOString(),
    };

    return {
      folder: sharedFolder,
      ancestors: [mapFolder(root), sharedFolder],
    };
  }
  const [folder] = await db
    .select()
    .from(fileFolder)
    .where(
      and(
        eq(fileFolder.id, folderId),
        eq(fileFolder.workspaceId, workspaceId),
        isNull(fileFolder.deletedAt),
      ),
    )
    .limit(1);

  if (!folder) {
    return null;
  }

  const ancestors: typeof fileFolder.$inferSelect[] = [];
  let cursor: typeof fileFolder.$inferSelect | undefined = folder;
  let depth = 0;
  const MAX_DEPTH = 1000;

  while (cursor) {
    if (depth++ >= MAX_DEPTH) {
      throw new Error(
        "Folder ancestry depth exceeded MAX_DEPTH (1000). Possible cycle; expected validateFolderParentId to prevent this.",
      );
    }
    ancestors.unshift(cursor);
    if (!cursor.parentId) {
      break;
    }

    const [parent] = await db
      .select()
      .from(fileFolder)
      .where(
        and(
          eq(fileFolder.id, cursor.parentId),
          eq(fileFolder.workspaceId, workspaceId),
          isNull(fileFolder.deletedAt),
        ),
      )
      .limit(1);

    if (!parent) {
      break;
    }

    cursor = parent;
  }

  return {
    folder: mapFolder(folder),
    ancestors: ancestors.map(mapFolder),
  };
}

export async function listFolderContents(workspaceId: string, folderId: string) {
  if (isSharedFilesVirtualFolderId(folderId, workspaceId)) {
    return {
      folders: [],
      files: [],
    };
  }

  const [folders, files] = await Promise.all([
    db
      .select()
      .from(fileFolder)
      .where(
        and(
          eq(fileFolder.workspaceId, workspaceId),
          eq(fileFolder.parentId, folderId),
          isNull(fileFolder.deletedAt),
        ),
      )
      .orderBy(asc(fileFolder.name)),
    db
      .select()
      .from(fileAsset)
      .where(
        and(
          eq(fileAsset.workspaceId, workspaceId),
          eq(fileAsset.folderId, folderId),
          isNull(fileAsset.deletedAt),
        ),
      )
      .orderBy(desc(fileAsset.createdAt)),
  ]);

  return {
    folders: folders.map(mapFolder),
    files: files.map(mapFile),
  };
}

export async function listFolderContentsForUser(
  workspaceId: string,
  folderId: string,
  userId: string,
) {
  if (isSharedFilesVirtualFolderId(folderId, workspaceId)) {
    const sharedFiles = await listSharedFileRecordsForUser(userId);
    return {
      folders: [],
      files: sharedFiles.map((file) => ({
        ...file,
        workspaceId,
        folderId: sharedFilesFolderId(workspaceId),
      })),
    };
  }

  const base = await listFolderContents(workspaceId, folderId);
  const [root] = await db
    .select()
    .from(fileFolder)
    .where(
      and(
        eq(fileFolder.workspaceId, workspaceId),
        isNull(fileFolder.parentId),
        isNull(fileFolder.deletedAt),
      ),
    )
    .orderBy(asc(fileFolder.createdAt))
    .limit(1);

  if (!root || root.id !== folderId) {
    return base;
  }

  const sharedFiles = await listSharedFileRecordsForUser(userId);
  if (sharedFiles.length === 0) {
    return base;
  }

  const sharedFolder: ExplorerFolderRecord = {
    id: sharedFilesFolderId(workspaceId),
    workspaceId,
    parentId: root.id,
    name: "Shared Files",
    isShared: true,
    readOnly: true,
    createdAt: root.createdAt.toISOString(),
    updatedAt: root.updatedAt.toISOString(),
  };

  return {
    folders: [...base.folders, sharedFolder].sort((a, b) => a.name.localeCompare(b.name)),
    files: base.files,
  };
}

export async function listWorkspaceFolders(workspaceId: string, userId?: string) {
  const rows = await db
    .select()
    .from(fileFolder)
    .where(and(eq(fileFolder.workspaceId, workspaceId), isNull(fileFolder.deletedAt)))
    .orderBy(asc(fileFolder.name));

  const folders = rows.map(mapFolder);
  if (!userId) {
    return folders;
  }

  const sharedFiles = await listSharedFileRecordsForUser(userId);
  if (sharedFiles.length === 0) {
    return folders;
  }

  const root = folders.find((folder) => folder.parentId === null);
  if (!root) {
    return folders;
  }

  return [
    ...folders,
    {
      id: sharedFilesFolderId(workspaceId),
      workspaceId,
      parentId: root.id,
      name: "Shared Files",
      isShared: true,
      readOnly: true,
      createdAt: root.createdAt,
      updatedAt: root.updatedAt,
    } satisfies ExplorerFolderRecord,
  ];
}

export async function listWorkspaceFiles(workspaceId: string, userId?: string) {
  const rows = await db
    .select()
    .from(fileAsset)
    .where(and(eq(fileAsset.workspaceId, workspaceId), isNull(fileAsset.deletedAt)))
    .orderBy(asc(fileAsset.name));

  const files = rows.map(mapFile);
  if (!userId) {
    return files;
  }

  const sharedFiles = await listSharedFileRecordsForUser(userId);
  if (sharedFiles.length === 0) {
    return files;
  }

  const sharedFolder = sharedFilesFolderId(workspaceId);
  return [
    ...files,
    ...sharedFiles.map((file) => ({
      ...file,
      workspaceId,
      folderId: sharedFolder,
    })),
  ];
}

type FolderParentValidationResult =
  | { status: "valid"; parentId: string | null }
  | { status: "invalid" };

async function validateFolderParentId(input: {
  workspaceId: string;
  parentId: string | null;
  currentFolderId?: string;
}): Promise<FolderParentValidationResult> {
  const { workspaceId, parentId, currentFolderId } = input;

  if (parentId === null) {
    const roots = await db
      .select({ id: fileFolder.id })
      .from(fileFolder)
      .where(
        and(
          eq(fileFolder.workspaceId, workspaceId),
          isNull(fileFolder.parentId),
          isNull(fileFolder.deletedAt),
        ),
      )
      .limit(2);

    const hasOtherRoot = roots.some((root) => root.id !== currentFolderId);
    if (hasOtherRoot) {
      return { status: "invalid" };
    }

    return { status: "valid", parentId };
  }

  if (parentId === workspaceId || parentId === currentFolderId) {
    return { status: "invalid" };
  }

  const [parentFolder] = await db
    .select({ id: fileFolder.id })
    .from(fileFolder)
    .where(
      and(
        eq(fileFolder.id, parentId),
        eq(fileFolder.workspaceId, workspaceId),
        isNull(fileFolder.deletedAt),
      ),
    )
    .limit(1);

  if (!parentFolder) {
    return { status: "invalid" };
  }

  if (currentFolderId) {
    const parentWithAncestors = await getFolderWithAncestors(workspaceId, parentId);
    if (!parentWithAncestors) {
      return { status: "invalid" };
    }

    const createsCycle = parentWithAncestors.ancestors.some(
      (ancestor) => ancestor.id === currentFolderId,
    );
    if (createsCycle) {
      return { status: "invalid" };
    }
  }

  return { status: "valid", parentId };
}

export async function createFolder(
  workspaceId: string,
  parentId: string | null,
  name: string,
  userId: string,
) {
  const trimmedName = name.trim().slice(0, 160);
  if (trimmedName.length === 0) {
    return null;
  }

  const parentValidation = await validateFolderParentId({
    workspaceId,
    parentId,
  });
  if (parentValidation.status !== "valid") {
    return null;
  }

  const now = new Date();
  const [folder] = await db
    .insert(fileFolder)
    .values({
      workspaceId,
      parentId: parentValidation.parentId,
      name: trimmedName,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return mapFolder(folder);
}

export async function updateFolder(
  workspaceId: string,
  folderId: string,
  updates: { name?: string; parentId?: string | null },
) {
  let nextParentId: string | null | undefined;
  if (typeof updates.parentId !== "undefined") {
    const parentValidation = await validateFolderParentId({
      workspaceId,
      parentId: updates.parentId,
      currentFolderId: folderId,
    });
    if (parentValidation.status !== "valid") {
      return null;
    }
    nextParentId = parentValidation.parentId;
  }

  const [folder] = await db
    .update(fileFolder)
    .set({
      ...(typeof updates.name === "string"
        ? { name: updates.name.trim().slice(0, 160) || "Untitled Folder" }
        : {}),
      ...(typeof nextParentId !== "undefined" ? { parentId: nextParentId } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(fileFolder.id, folderId),
        eq(fileFolder.workspaceId, workspaceId),
        isNull(fileFolder.deletedAt),
      ),
    )
    .returning();

  return folder ? mapFolder(folder) : null;
}

export async function softDeleteFolder(workspaceId: string, folderId: string) {
  const now = new Date();

  const descendants = await collectDescendantFolderIds(workspaceId, folderId);
  const folderIds = [folderId, ...descendants];

  await db
    .update(fileAsset)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(fileAsset.workspaceId, workspaceId), inArray(fileAsset.folderId, folderIds)));

  await db
    .update(fileFolder)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(fileFolder.workspaceId, workspaceId), inArray(fileFolder.id, folderIds)));

  return true;
}

async function collectDescendantFolderIds(workspaceId: string, rootFolderId: string) {
  const descendants: string[] = [];
  let frontier = [rootFolderId];
  let depth = 0;
  const MAX_DEPTH = 1000;

  while (frontier.length > 0) {
    if (depth++ >= MAX_DEPTH) {
      throw new Error(
        "Folder descendant walk exceeded MAX_DEPTH (1000). Possible cycle; expected validateFolderParentId to prevent this.",
      );
    }
    const children = await db
      .select({ id: fileFolder.id })
      .from(fileFolder)
      .where(
        and(
          eq(fileFolder.workspaceId, workspaceId),
          inArray(fileFolder.parentId, frontier),
          isNull(fileFolder.deletedAt),
        ),
      );

    const next = children.map((child) => child.id);
    descendants.push(...next);
    frontier = next;
  }

  return descendants;
}

export async function registerFileAsset(
  workspaceId: string,
  userId: string,
  input: {
    folderId: string;
    storageKey: string;
    storageUrl: string;
    name: string;
    mimeType?: string | null;
    sizeBytes: number;
    metadata?: Record<string, unknown>;
  },
) {
  const [folder] = await db
    .select({ id: fileFolder.id })
    .from(fileFolder)
    .where(
      and(
        eq(fileFolder.id, input.folderId),
        eq(fileFolder.workspaceId, workspaceId),
        isNull(fileFolder.deletedAt),
      ),
    )
    .limit(1);

  if (!folder) {
    throw new Error("Invalid folderId for workspace");
  }

  const now = new Date();
  const [record] = await db
    .insert(fileAsset)
    .values({
      workspaceId,
      folderId: input.folderId,
      storageKey: input.storageKey,
      storageUrl: input.storageUrl,
      name: input.name.slice(0, 255),
      mimeType: input.mimeType ?? null,
      sizeBytes: input.sizeBytes,
      uploadedBy: userId,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return mapFile(record);
}

export async function updateFileAsset(
  workspaceId: string,
  fileId: string,
  updates: { folderId?: string; name?: string },
) {
  if (updates.folderId) {
    const [folder] = await db
      .select({ id: fileFolder.id })
      .from(fileFolder)
      .where(
        and(
          eq(fileFolder.id, updates.folderId),
          eq(fileFolder.workspaceId, workspaceId),
          isNull(fileFolder.deletedAt),
        ),
      )
      .limit(1);

    if (!folder) {
      return null;
    }
  }

  const [record] = await db
    .update(fileAsset)
    .set({
      ...(updates.folderId ? { folderId: updates.folderId } : {}),
      ...(typeof updates.name === "string"
        ? { name: updates.name.trim().slice(0, 255) || "Untitled" }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(fileAsset.id, fileId),
        eq(fileAsset.workspaceId, workspaceId),
        isNull(fileAsset.deletedAt),
      ),
    )
    .returning();

  return record ? mapFile(record) : null;
}

export async function getFileAssetById(workspaceId: string, fileId: string) {
  const [record] = await db
    .select()
    .from(fileAsset)
    .where(
      and(
        eq(fileAsset.id, fileId),
        eq(fileAsset.workspaceId, workspaceId),
        isNull(fileAsset.deletedAt),
      ),
    )
    .limit(1);

  return record ? mapFile(record) : null;
}

export async function getFileAssetByStorageKey(workspaceId: string, storageKey: string) {
  const [record] = await db
    .select()
    .from(fileAsset)
    .where(
      and(
        eq(fileAsset.workspaceId, workspaceId),
        eq(fileAsset.storageKey, storageKey),
        isNull(fileAsset.deletedAt),
      ),
    )
    .limit(1);

  return record ? mapFile(record) : null;
}

export async function softDeleteFileAsset(workspaceId: string, fileId: string) {
  const [record] = await db
    .update(fileAsset)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(fileAsset.id, fileId),
        eq(fileAsset.workspaceId, workspaceId),
        isNull(fileAsset.deletedAt),
      ),
    )
    .returning();

  return Boolean(record);
}

export async function grantResourceToUserByEmail(input: {
  workspaceId: string;
  resourceType: ShareResourceType;
  resourceId: string;
  permission?: "read";
  email: string;
  createdBy: string;
}) {
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const [grantee] = await db
    .select({ id: authUser.id, email: authUser.email })
    .from(authUser)
    .where(eq(authUser.email, normalizedEmail))
    .limit(1);

  if (!grantee) {
    return null;
  }

  const [grant] = await db
    .insert(resourceShareGrant)
    .values({
      workspaceId: input.workspaceId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      granteeUserId: grantee.id,
      permission: input.permission ?? "read",
      createdBy: input.createdBy,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [resourceShareGrant.resourceType, resourceShareGrant.resourceId, resourceShareGrant.granteeUserId],
      set: { permission: input.permission ?? "read" },
    })
    .returning();

  return {
    id: grant.id,
    granteeUserId: grant.granteeUserId,
    email: grantee.email,
    permission: grant.permission,
  };
}

export async function grantResourceToUserId(input: {
  workspaceId: string;
  resourceType: ShareResourceType;
  resourceId: string;
  permission?: "read";
  granteeUserId: string;
  createdBy: string;
}) {
  const [grant] = await db
    .insert(resourceShareGrant)
    .values({
      workspaceId: input.workspaceId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      granteeUserId: input.granteeUserId,
      permission: input.permission ?? "read",
      createdBy: input.createdBy,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        resourceShareGrant.resourceType,
        resourceShareGrant.resourceId,
        resourceShareGrant.granteeUserId,
      ],
      set: { permission: input.permission ?? "read" },
    })
    .returning();

  return grant;
}

export async function grantAllChatsFromUserToUser(input: {
  workspaceId: string;
  ownerUserId: string;
  granteeUserId: string;
  createdBy: string;
}) {
  if (input.ownerUserId === input.granteeUserId) {
    return 0;
  }

  const [workspaceMembership] = await db
    .select({ organizationId: workspace.organizationId })
    .from(workspace)
    .innerJoin(member, eq(member.organizationId, workspace.organizationId))
    .where(
      and(
        eq(workspace.id, input.workspaceId),
        eq(member.userId, input.ownerUserId),
      ),
    )
    .limit(1);

  if (!workspaceMembership) {
    return 0;
  }

  // Chats are currently user-scoped (chat_thread has no workspace_id).
  // We scope by owner membership in the target workspace before fan-out.
  const chats = await db
    .select({ slug: chatThread.slug })
    .from(chatThread)
    .where(eq(chatThread.userId, input.ownerUserId));

  if (chats.length === 0) {
    return 0;
  }

  await Promise.all(
    chats.map((chat) =>
      grantResourceToUserId({
        workspaceId: input.workspaceId,
        resourceType: "chat",
        resourceId: chat.slug,
        granteeUserId: input.granteeUserId,
        createdBy: input.createdBy,
        permission: "read",
      }),
    ),
  );

  return chats.length;
}

function hashShareToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

export async function createResourceShareLink(input: {
  workspaceId: string;
  resourceType: ShareResourceType;
  resourceId: string;
  createdBy: string;
  allowPublic?: boolean;
  expiresInDays?: number;
}) {
  const rawToken = randomBytes(24).toString("base64url");
  const tokenHash = hashShareToken(rawToken);
  const now = Date.now();
  const expiresAt = new Date(now + (input.expiresInDays ?? 7) * 24 * 60 * 60 * 1000);
  const [existingGrant] = await db
    .select({ id: resourceShareGrant.id })
    .from(resourceShareGrant)
    .where(
      and(
        eq(resourceShareGrant.resourceType, input.resourceType),
        eq(resourceShareGrant.resourceId, input.resourceId),
      ),
    )
    .limit(1);
  const hasSpecificGrants = Boolean(existingGrant);
  const allowPublic = !hasSpecificGrants && (input.allowPublic ?? true);

  const [link] = await db
    .insert(resourceShareLink)
    .values({
      workspaceId: input.workspaceId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      tokenHash,
      permission: "read",
      allowPublic,
      expiresAt,
      createdBy: input.createdBy,
      createdAt: new Date(now),
    })
    .returning();

  return {
    id: link.id,
    token: rawToken,
    expiresAt: link.expiresAt.toISOString(),
    permission: link.permission,
  };
}

export async function resolveResourceShareLink(rawToken: string) {
  const tokenHash = hashShareToken(rawToken);
  const [link] = await db
    .select()
    .from(resourceShareLink)
    .where(eq(resourceShareLink.tokenHash, tokenHash))
    .limit(1);

  if (!link) {
    return null;
  }

  if (link.revokedAt || link.expiresAt.getTime() < Date.now()) {
    return null;
  }

  return link;
}

export async function canUserAccessSharedResource(input: {
  link: Awaited<ReturnType<typeof resolveResourceShareLink>>;
  userId?: string | null;
}) {
  const { link, userId } = input;
  if (!link) {
    return false;
  }

  const [existingGrant] = await db
    .select({ id: resourceShareGrant.id })
    .from(resourceShareGrant)
    .where(
      and(
        eq(resourceShareGrant.resourceType, link.resourceType),
        eq(resourceShareGrant.resourceId, link.resourceId),
      ),
    )
    .limit(1);
  const hasSpecificGrants = Boolean(existingGrant);

  if (!hasSpecificGrants && link.allowPublic) {
    return true;
  }

  if (!userId) {
    return false;
  }

  if (await userCanAccessWorkspace(userId, link.workspaceId)) {
    return true;
  }

  const [grant] = await db
    .select({ id: resourceShareGrant.id })
    .from(resourceShareGrant)
    .where(
      and(
        eq(resourceShareGrant.resourceType, link.resourceType),
        eq(resourceShareGrant.resourceId, link.resourceId),
        eq(resourceShareGrant.granteeUserId, userId),
      ),
    )
    .limit(1);

  return Boolean(grant);
}
