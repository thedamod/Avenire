import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db } from "./client";
import { member, organization, user as authUser } from "./auth-schema";
import {
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
  createdAt: string;
  updatedAt: string;
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

export async function listUserOrganizationIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId));

  return rows.map((row) => row.organizationId);
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

  const summaries: UserWorkspaceSummary[] = [];
  for (const membership of memberships) {
    const ws = await ensureWorkspaceForOrganization(membership.organizationId);
    const root = await ensureWorkspaceRootFolder(ws.id, userId);
    summaries.push({
      workspaceId: ws.id,
      organizationId: ws.organizationId,
      name: membership.organizationName,
      rootFolderId: root.id,
    });
  }

  return summaries;
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

  await db.insert(organization).values({
    id: orgId,
    name: trimmed,
    slug: `${slugBase}-${orgId.slice(0, 8)}`,
    createdAt: now,
    logo: null,
    metadata: null,
  });

  await db.insert(member).values({
    id: randomUUID(),
    organizationId: orgId,
    userId,
    role: "owner",
    createdAt: now,
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

  await db.insert(organization).values({
    id: orgId,
    name: `${nameBase}'s Workspace`,
    slug: `${slugBase}-${orgId.slice(0, 8)}`,
    createdAt: now,
    metadata: null,
    logo: null,
  });

  await db.insert(member).values({
    id: randomUUID(),
    organizationId: orgId,
    userId,
    role: "owner",
    createdAt: now,
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

export async function listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberRecord[]> {
  const [ws] = await db
    .select({ organizationId: workspace.organizationId })
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1);

  if (!ws) {
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
    .where(eq(member.organizationId, ws.organizationId))
    .orderBy(asc(authUser.email));

  return rows.map((row) => ({
    userId: row.userId,
    email: row.email,
    name: row.name ?? null,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getFolderWithAncestors(workspaceId: string, folderId: string) {
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

  while (cursor) {
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

export async function listWorkspaceFolders(workspaceId: string) {
  const rows = await db
    .select()
    .from(fileFolder)
    .where(and(eq(fileFolder.workspaceId, workspaceId), isNull(fileFolder.deletedAt)))
    .orderBy(asc(fileFolder.name));

  return rows.map(mapFolder);
}

export async function listWorkspaceFiles(workspaceId: string) {
  const rows = await db
    .select()
    .from(fileAsset)
    .where(and(eq(fileAsset.workspaceId, workspaceId), isNull(fileAsset.deletedAt)))
    .orderBy(asc(fileAsset.name));

  return rows.map(mapFile);
}

async function validateFolderParentId(input: {
  workspaceId: string;
  parentId: string | null;
  currentFolderId?: string;
}) {
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
      return null;
    }

    return parentId;
  }

  if (parentId === workspaceId || parentId === currentFolderId) {
    return null;
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
    return null;
  }

  if (currentFolderId) {
    const parentWithAncestors = await getFolderWithAncestors(workspaceId, parentId);
    if (!parentWithAncestors) {
      return null;
    }

    const createsCycle = parentWithAncestors.ancestors.some(
      (ancestor) => ancestor.id === currentFolderId,
    );
    if (createsCycle) {
      return null;
    }
  }

  return parentId;
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

  const validParentId = await validateFolderParentId({
    workspaceId,
    parentId,
  });
  if (validParentId === null) {
    return null;
  }

  const now = new Date();
  const [folder] = await db
    .insert(fileFolder)
    .values({
      workspaceId,
      parentId: validParentId,
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
    const validParentId = await validateFolderParentId({
      workspaceId,
      parentId: updates.parentId,
      currentFolderId: folderId,
    });
    if (validParentId === null) {
      return null;
    }
    nextParentId = validParentId;
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

  while (frontier.length > 0) {
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

  const [link] = await db
    .insert(resourceShareLink)
    .values({
      workspaceId: input.workspaceId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      tokenHash,
      permission: "read",
      allowPublic: input.allowPublic ?? true,
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

  if (link.allowPublic) {
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
