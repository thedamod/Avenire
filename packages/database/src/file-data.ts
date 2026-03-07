import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
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

/**
 * Convert a database folder row into an ExplorerFolderRecord.
 *
 * @param row - The selected `fileFolder` row from the database
 * @returns An ExplorerFolderRecord with `createdAt` and `updatedAt` serialized as ISO strings
 */
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

/**
 * Convert a database `fileAsset` row into an `ExplorerFileRecord`.
 *
 * @param row - A selected `fileAsset` row from the database
 * @returns An `ExplorerFileRecord` with the same identifiers and storage fields; `mimeType` is `null` when not present and `createdAt`/`updatedAt` are ISO 8601 strings
 */
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

/**
 * Fetches organization IDs for which the specified user is a member.
 *
 * @param userId - The ID of the user
 * @returns An array of organization ID strings associated with `userId`
 */
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

/**
 * Ensure a workspace exists for the given organization, creating one if none exists.
 *
 * @param organizationId - The organization ID to find or create a workspace for
 * @returns The workspace record associated with `organizationId`
 */
export async function ensureWorkspaceForOrganization(organizationId: string) {
  const [existing] = await db
    .select()
    .from(workspace)
    .where(eq(workspace.organizationId, organizationId))
    .limit(1);

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(workspace)
    .values({ organizationId, createdAt: new Date(), updatedAt: new Date() })
    .returning();

  return created;
}

/**
 * Ensure a non-deleted root folder exists for the given workspace.
 *
 * If a root folder (no parent and not deleted) already exists it is returned;
 * otherwise a new root folder named "Workspace" is created with `userId` as creator and returned.
 *
 * @param workspaceId - ID of the workspace to ensure a root folder for
 * @param userId - ID of the user to record as the creator when creating a new root folder
 * @returns The root folder record for the workspace
 */
export async function ensureWorkspaceRootFolder(workspaceId: string, userId: string) {
  const [existing] = await db
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
  const [created] = await db
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

  return created;
}

/**
 * Resolve a workspace and its root folder for a user within a chosen organization, creating defaults when necessary.
 *
 * @param userId - The ID of the user to resolve workspace context for
 * @param preferredOrganizationId - Optional organization ID to prefer if the user is a member; ignored if the user is not a member of that organization
 * @returns An object with `workspaceId`, `organizationId`, and `rootFolderId` for the resolved workspace, or `null` if no workspace could be determined or created
 */
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

/**
 * List workspace summaries for all organizations the user belongs to.
 *
 * @param userId - The ID of the user whose workspaces to list
 * @returns An array of workspace summaries, each containing `workspaceId`, `organizationId`, `name` (organization name), and `rootFolderId`
 */
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

/**
 * Creates a new organization, assigns the user as owner, ensures a workspace and its root folder, and returns a summary of the created workspace.
 *
 * @param userId - The ID of the user who will own the new workspace
 * @param name - Desired workspace name; will be trimmed and normalized
 * @returns An object containing `workspaceId`, `organizationId`, `name`, and `rootFolderId`
 */
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

/**
 * Ensures the user has a default organization and returns its ID.
 *
 * If the user is already a member of an organization, that organization's ID is returned.
 * Otherwise a new organization is created for the user and the user is added as its owner.
 *
 * @param userId - The ID of the user to ensure a default organization for
 * @returns The organization ID that the user belongs to (existing or newly created)
 */
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

/**
 * Determine whether a user has access to a workspace by verifying membership in the workspace's organization.
 *
 * @returns `true` if the user is a member of the organization that owns the workspace, `false` otherwise.
 */
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

/**
 * Retrieve a folder and its ancestor chain within a workspace, ordered from root to the folder.
 *
 * @returns An object with `folder` and `ancestors` (array ordered from root to the folder) typed as ExplorerFolderRecord, or `null` if the folder does not exist or is deleted.
 */
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

/**
 * Retrieves non-deleted subfolders and files directly inside a folder for a workspace.
 *
 * @param workspaceId - ID of the workspace containing the folder
 * @param folderId - ID of the parent folder whose immediate contents to list
 * @returns An object with `folders` (subfolders ordered by name ascending) and `files` (files ordered by creation date descending)
 */
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

/**
 * List all non-deleted folders in a workspace, ordered by name.
 *
 * @param workspaceId - The workspace identifier to query
 * @returns An array of ExplorerFolderRecord for each folder in the workspace, ordered by name
 */
export async function listWorkspaceFolders(workspaceId: string) {
  const rows = await db
    .select()
    .from(fileFolder)
    .where(and(eq(fileFolder.workspaceId, workspaceId), isNull(fileFolder.deletedAt)))
    .orderBy(asc(fileFolder.name));

  return rows.map(mapFolder);
}

/**
 * Retrieves all non-deleted files for a workspace, ordered by name.
 *
 * @param workspaceId - The id of the workspace whose files to list
 * @returns An array of ExplorerFileRecord objects for the workspace's files, excluding deleted items, ordered by file name
 */
export async function listWorkspaceFiles(workspaceId: string) {
  const rows = await db
    .select()
    .from(fileAsset)
    .where(and(eq(fileAsset.workspaceId, workspaceId), isNull(fileAsset.deletedAt)))
    .orderBy(asc(fileAsset.name));

  return rows.map(mapFile);
}

/**
 * Creates a new folder inside a workspace under the specified parent and returns the created folder record.
 *
 * @param workspaceId - ID of the workspace to create the folder in
 * @param parentId - ID of the parent folder where the new folder will be placed
 * @param name - Desired folder name; it will be trimmed and truncated to 160 characters. If the resulting name is empty, the function returns `null`
 * @param userId - ID of the user creating the folder
 * @returns The created folder record mapped to ExplorerFolderRecord, or `null` if the provided name is empty after trimming
 */
export async function createFolder(
  workspaceId: string,
  parentId: string,
  name: string,
  userId: string,
) {
  const trimmedName = name.trim().slice(0, 160);
  if (trimmedName.length === 0) {
    return null;
  }

  const now = new Date();
  const [folder] = await db
    .insert(fileFolder)
    .values({
      workspaceId,
      parentId,
      name: trimmedName,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return mapFolder(folder);
}

/**
 * Update properties of a folder within a workspace.
 *
 * @param workspaceId - The workspace that contains the folder
 * @param folderId - The id of the folder to update
 * @param updates - Fields to update:
 *   - `name`: optional new folder name; input is trimmed, limited to 160 characters, and replaced with `"Untitled Folder"` if empty after trimming
 *   - `parentId`: new parent folder id; set to `null` to move the folder to the workspace root; omit (`undefined`) to leave unchanged
 * @returns The updated ExplorerFolderRecord, or `null` if the folder does not exist or has been deleted
 */
export async function updateFolder(
  workspaceId: string,
  folderId: string,
  updates: { name?: string; parentId?: string | null },
) {
  const [folder] = await db
    .update(fileFolder)
    .set({
      ...(typeof updates.name === "string"
        ? { name: updates.name.trim().slice(0, 160) || "Untitled Folder" }
        : {}),
      ...(typeof updates.parentId !== "undefined" ? { parentId: updates.parentId } : {}),
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

/**
 * Marks a folder and all its descendant folders and contained files as deleted by setting their `deletedAt` and `updatedAt` timestamps.
 *
 * @returns `true` if the folder and its descendants were marked deleted
 */
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

/**
 * Collects all descendant folder IDs under a root folder within a workspace.
 *
 * @param workspaceId - The workspace containing the folder tree
 * @param rootFolderId - The id of the root folder whose descendants will be collected
 * @returns An array of descendant folder IDs (excluding `rootFolderId`) discovered under the specified root, ordered by traversal depth (parents discovered before their children)
 */
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

/**
 * Creates and records a new file asset in a workspace and returns its public record.
 *
 * @param workspaceId - ID of the workspace where the file will be stored
 * @param userId - ID of the user uploading the file
 * @param input - Details for the file asset
 * @param input.folderId - ID of the folder that will contain the file
 * @param input.storageKey - Internal storage key for the file
 * @param input.storageUrl - External or signed URL for accessing the file
 * @param input.name - File name (will be truncated to 255 characters)
 * @param input.mimeType - Optional MIME type for the file; `null` if unknown
 * @param input.sizeBytes - Size of the file in bytes
 * @param input.metadata - Optional arbitrary metadata associated with the file
 * @returns The created file record in ExplorerFileRecord shape
 */
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

/**
 * Updates a file asset's folder and/or name within the given workspace.
 *
 * @param workspaceId - Workspace that owns the file
 * @param fileId - ID of the file asset to update
 * @param updates - Partial updates; supported fields are `folderId` and `name`
 * @returns The updated `ExplorerFileRecord`, or `null` if the file does not exist or is deleted
 */
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

/**
 * Fetches a non-deleted file asset by its ID within the specified workspace.
 *
 * @returns The file asset as an ExplorerFileRecord, or `null` if no matching non-deleted asset is found.
 */
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

/**
 * Marks a file asset as deleted within a workspace by setting its `deletedAt` and `updatedAt` timestamps.
 *
 * @returns `true` if the file asset was marked as deleted, `false` otherwise.
 */
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

/**
 * Creates or updates a resource share grant for a user identified by email.
 *
 * Looks up the user by the normalized email and inserts a grant linking the specified resource
 * to that user for the given permission; if a grant already exists it updates the permission.
 *
 * @param input.workspaceId - The workspace that owns the resource
 * @param input.resourceType - The type of resource being shared (`"chat" | "file" | "folder"`)
 * @param input.resourceId - The ID of the resource to grant access to
 * @param input.permission - The permission to grant (defaults to `"read"`)
 * @param input.email - The grantee's email address (case-insensitive); returns `null` if empty or no user matches
 * @param input.createdBy - The ID of the actor creating the grant
 * @returns An object with the created or updated grant `{ id, granteeUserId, email, permission }`, or `null` if the email is empty or no matching user was found
 */
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

/**
 * Compute the SHA-256 hex digest for a share token.
 *
 * @param rawToken - The plain-text share token to hash
 * @returns The SHA-256 hash of `rawToken` as a lowercase hexadecimal string
 */
function hashShareToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Creates and stores a shareable access link for a workspace resource and returns the plain token and link metadata.
 *
 * @param input - Parameters for the share link:
 *   - workspaceId: ID of the workspace that owns the resource
 *   - resourceType: type of the shared resource (`"chat" | "file" | "folder"`)
 *   - resourceId: ID of the resource to share
 *   - createdBy: ID of the user creating the link
 *   - allowPublic: whether the link can be used without authentication (defaults to `true`)
 *   - expiresInDays: lifetime of the link in days (defaults to `7`)
 * @returns An object with:
 *   - `id`: the persisted share link record ID
 *   - `token`: the plain (unhashed) token to distribute to consumers
 *   - `expiresAt`: expiration timestamp as an ISO 8601 string
 *   - `permission`: granted permission for the link (always `"read"`)
 */
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

/**
 * Resolves a persisted resource share link from a plain share token.
 *
 * @param rawToken - The raw share token to resolve
 * @returns The matching `resourceShareLink` record if the token exists, is not revoked, and has not expired; `null` otherwise
 */
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

/**
 * Check whether a resolved resource share link permits the requester to access the shared resource.
 *
 * Evaluates public access, workspace membership, and per-user grants to determine access.
 *
 * @param link - The resolved share link record to evaluate; pass `null` if the token did not resolve.
 * @param userId - Optional requester user ID; omit or pass `null` for anonymous requests.
 * @returns `true` if access is permitted (public link, requester has workspace access, or an explicit grant exists), `false` otherwise.
 */
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
