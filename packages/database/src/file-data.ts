import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  sql,
} from "drizzle-orm";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db } from "./client";
import {
  invitation,
  member,
  organization,
  user as authUser,
} from "./auth-schema";
import {
  chatThread,
  fileAsset,
  fileFolder,
  noteContent,
  resourceShareGrant,
  resourceShareLink,
  workspace,
} from "./schema";

export type ShareResourceType = "chat" | "file" | "folder";
export type SharePermission = "viewer" | "editor";

export interface ExplorerFolderRecord {
  bannerUrl?: string | null;
  id: string;
  iconColor?: string | null;
  workspaceId: string;
  parentId: string | null;
  name: string;
  isShared?: boolean;
  readOnly?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExplorerFileRecord {
  contentHashSha256?: string | null;
  isIngested?: boolean;
  isNote?: boolean;
  id: string;
  workspaceId: string;
  folderId: string;
  storageKey: string;
  storageUrl: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number;
  uploadedBy: string;
  updatedBy: string | null;
  hashComputedBy?: string | null;
  hashVerificationStatus?: string | null;
  hashVerifiedAt?: string | null;
  isShared?: boolean;
  readOnly?: boolean;
  sourceWorkspaceId?: string;
  videoDelivery?: VideoDeliveryRecord | null;
  createdAt: string;
  updatedAt: string;
}

export type VideoDeliveryStatus = "failed" | "pending" | "ready";
export type VideoDeliveryStrategy = "hybrid" | "mux" | "progressive";

export interface VideoDeliveryAnalysisRecord {
  bitrateKbps?: number | null;
  durationSeconds?: number | null;
  height?: number | null;
  width?: number | null;
}

export interface VideoDeliveryProgressiveRecord {
  mimeType?: string | null;
  sizeBytes?: number | null;
  storageKey?: string | null;
  url: string;
}

export interface VideoDeliveryPosterRecord {
  mimeType?: string | null;
  storageKey?: string | null;
  url: string;
}

export interface VideoDeliveryHlsVariantRecord {
  bitrateKbps?: number | null;
  height?: number | null;
  playlistStorageKey?: string | null;
  playlistUrl: string;
  width?: number | null;
}

export interface VideoDeliveryHlsRecord {
  manifestStorageKey?: string | null;
  manifestUrl: string;
  segmentDurationSeconds?: number | null;
  segmentStorageKeys?: string[] | null;
  variants?: VideoDeliveryHlsVariantRecord[] | null;
}

export interface VideoDeliveryMuxPlaybackRecord {
  id: string;
  policy: "drm" | "public" | "signed";
}

export interface VideoDeliveryMuxRecord {
  aspectRatio?: string | null;
  assetId: string;
  createdAt?: string | null;
  maxStoredResolution?: string | null;
  playbackId?: string | null;
  playbackIds?: VideoDeliveryMuxPlaybackRecord[] | null;
  resolutionTier?: string | null;
  status: string;
}

export interface VideoDeliveryRecord {
  analysis?: VideoDeliveryAnalysisRecord | null;
  error?: string | null;
  hls?: VideoDeliveryHlsRecord | null;
  mux?: VideoDeliveryMuxRecord | null;
  poster?: VideoDeliveryPosterRecord | null;
  progressive?: VideoDeliveryProgressiveRecord | null;
  status: VideoDeliveryStatus;
  strategy: VideoDeliveryStrategy;
  updatedAt: string;
  version: number;
}

export interface TrashItemRecord {
  id: string;
  kind: "file" | "folder";
  name: string;
  workspaceId: string;
  folderId: string | null;
  sizeBytes: number | null;
  deletedAt: string;
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

export interface WorkspaceInvitationRecord {
  id: string;
  organizationId: string;
  organizationName: string;
  inviterName: string | null;
  inviterEmail: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

const SHARED_FILES_FOLDER_PREFIX = "__shared_files__:";
const TRUSTED_STORAGE_HOST_SUFFIXES = [
  ".utfs.io",
  ".ufs.sh",
  ".uploadthing.com",
  ".uploadthing.dev",
];
const TRUSTED_STORAGE_HOSTS = new Set(
  (process.env.TRUSTED_STORAGE_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
);

function sharedFilesFolderId(workspaceId: string) {
  return `${SHARED_FILES_FOLDER_PREFIX}${workspaceId}`;
}

export function isSharedFilesVirtualFolderId(
  folderId: string,
  workspaceId: string
) {
  return folderId === sharedFilesFolderId(workspaceId);
}

function isTrustedStorageHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (TRUSTED_STORAGE_HOSTS.has(normalized)) {
    return true;
  }
  return TRUSTED_STORAGE_HOST_SUFFIXES.some(
    (suffix) => normalized === suffix.slice(1) || normalized.endsWith(suffix)
  );
}

export function normalizeTrustedStorageUrl(storageUrl: string) {
  const parsed = new URL(storageUrl);
  if (parsed.protocol !== "https:") {
    throw new Error("Storage URL must use HTTPS");
  }
  if (!isTrustedStorageHostname(parsed.hostname)) {
    throw new Error("Storage URL host is not allowed");
  }
  parsed.hash = "";
  return parsed.toString();
}

export function isTrustedStorageUrl(storageUrl: string) {
  try {
    normalizeTrustedStorageUrl(storageUrl);
    return true;
  } catch {
    return false;
  }
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
    bannerUrl: row.bannerUrl ?? null,
    id: row.id,
    iconColor: row.iconColor ?? null,
    workspaceId: row.workspaceId,
    parentId: row.parentId,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!(value && typeof value === "object" && !Array.isArray(value))) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNullableFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const items = value.filter(
    (entry): entry is string =>
      typeof entry === "string" && entry.trim().length > 0
  );
  return items.length > 0 ? items : null;
}

function mapVideoDeliveryAnalysis(
  value: unknown
): VideoDeliveryAnalysisRecord | null {
  const record = asObjectRecord(value);
  if (!record) {
    return null;
  }

  return {
    bitrateKbps: asNullableFiniteNumber(record.bitrateKbps),
    durationSeconds: asNullableFiniteNumber(record.durationSeconds),
    height: asNullableFiniteNumber(record.height),
    width: asNullableFiniteNumber(record.width),
  };
}

function mapVideoDeliveryProgressive(
  value: unknown
): VideoDeliveryProgressiveRecord | null {
  const record = asObjectRecord(value);
  const url = asNullableString(record?.url);
  if (!record || !url) {
    return null;
  }

  return {
    mimeType: asNullableString(record.mimeType),
    sizeBytes: asNullableFiniteNumber(record.sizeBytes),
    storageKey: asNullableString(record.storageKey),
    url,
  };
}

function mapVideoDeliveryPoster(
  value: unknown
): VideoDeliveryPosterRecord | null {
  const record = asObjectRecord(value);
  const url = asNullableString(record?.url);
  if (!record || !url) {
    return null;
  }

  return {
    mimeType: asNullableString(record.mimeType),
    storageKey: asNullableString(record.storageKey),
    url,
  };
}

function mapVideoDeliveryHlsVariant(
  value: unknown
): VideoDeliveryHlsVariantRecord | null {
  const record = asObjectRecord(value);
  const playlistUrl = asNullableString(record?.playlistUrl);
  if (!record || !playlistUrl) {
    return null;
  }

  return {
    bitrateKbps: asNullableFiniteNumber(record.bitrateKbps),
    height: asNullableFiniteNumber(record.height),
    playlistStorageKey: asNullableString(record.playlistStorageKey),
    playlistUrl,
    width: asNullableFiniteNumber(record.width),
  };
}

function mapVideoDeliveryHls(value: unknown): VideoDeliveryHlsRecord | null {
  const record = asObjectRecord(value);
  const manifestUrl = asNullableString(record?.manifestUrl);
  if (!record || !manifestUrl) {
    return null;
  }

  const variants = Array.isArray(record.variants)
    ? record.variants
        .map((entry) => mapVideoDeliveryHlsVariant(entry))
        .filter((entry): entry is VideoDeliveryHlsVariantRecord =>
          Boolean(entry)
        )
    : null;

  return {
    manifestStorageKey: asNullableString(record.manifestStorageKey),
    manifestUrl,
    segmentDurationSeconds: asNullableFiniteNumber(
      record.segmentDurationSeconds
    ),
    segmentStorageKeys: asStringArray(record.segmentStorageKeys),
    variants: variants && variants.length > 0 ? variants : null,
  };
}

function mapVideoDeliveryMuxPlayback(
  value: unknown
): VideoDeliveryMuxPlaybackRecord | null {
  const record = asObjectRecord(value);
  const id = asNullableString(record?.id);
  const policy = asNullableString(record?.policy);
  if (
    !id ||
    !(policy === "public" || policy === "signed" || policy === "drm")
  ) {
    return null;
  }

  return {
    id,
    policy,
  };
}

function mapVideoDeliveryMux(value: unknown): VideoDeliveryMuxRecord | null {
  const record = asObjectRecord(value);
  const assetId = asNullableString(record?.assetId);
  const status = asNullableString(record?.status);
  if (!record || !assetId || !status) {
    return null;
  }

  const playbackIds = Array.isArray(record.playbackIds)
    ? record.playbackIds
        .map((entry) => mapVideoDeliveryMuxPlayback(entry))
        .filter((entry): entry is VideoDeliveryMuxPlaybackRecord =>
          Boolean(entry)
        )
    : null;

  return {
    aspectRatio: asNullableString(record.aspectRatio),
    assetId,
    createdAt: asNullableString(record.createdAt),
    maxStoredResolution: asNullableString(record.maxStoredResolution),
    playbackId: asNullableString(record.playbackId),
    playbackIds: playbackIds && playbackIds.length > 0 ? playbackIds : null,
    resolutionTier: asNullableString(record.resolutionTier),
    status,
  };
}

export function mapVideoDeliveryRecord(
  value: unknown
): VideoDeliveryRecord | null {
  const record = asObjectRecord(value);
  if (!record) {
    return null;
  }

  const status = asNullableString(record.status);
  const strategy = asNullableString(record.strategy);
  const updatedAt = asNullableString(record.updatedAt);
  const version = asNullableFiniteNumber(record.version);

  if (
    !(status === "pending" || status === "ready" || status === "failed") ||
    !(
      strategy === "progressive" ||
      strategy === "hybrid" ||
      strategy === "mux"
    ) ||
    !updatedAt ||
    version === null
  ) {
    return null;
  }

  return {
    analysis: mapVideoDeliveryAnalysis(record.analysis),
    error: asNullableString(record.error),
    hls: mapVideoDeliveryHls(record.hls),
    mux: mapVideoDeliveryMux(record.mux),
    poster: mapVideoDeliveryPoster(record.poster),
    progressive: mapVideoDeliveryProgressive(record.progressive),
    status,
    strategy,
    updatedAt,
    version,
  };
}

export function listVideoDeliveryStorageKeys(
  videoDelivery: VideoDeliveryRecord | null | undefined
) {
  if (!videoDelivery) {
    return [];
  }

  return Array.from(
    new Set(
      [
        videoDelivery.progressive?.storageKey ?? null,
        videoDelivery.poster?.storageKey ?? null,
        videoDelivery.hls?.manifestStorageKey ?? null,
        ...(videoDelivery.hls?.segmentStorageKeys ?? []),
        ...(videoDelivery.hls?.variants?.map(
          (variant) => variant.playlistStorageKey ?? null
        ) ?? []),
      ].filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0
      )
    )
  );
}

function mapFile(row: typeof fileAsset.$inferSelect): ExplorerFileRecord {
  const storageKey = row.optimizedStorageKey ?? row.storageKey;
  const storageUrl = row.optimizedStorageUrl ?? row.storageUrl;
  const mimeType = row.optimizedMimeType ?? row.mimeType ?? null;
  const sizeBytes = row.optimizedSizeBytes ?? row.sizeBytes;
  const metadata = asObjectRecord(row.metadata);
  const isNote =
    typeof metadata?.type === "string" &&
    metadata.type.toLowerCase() === "note";

  return {
    contentHashSha256: row.contentHashSha256 ?? null,
    isNote,
    id: row.id,
    workspaceId: row.workspaceId,
    folderId: row.folderId,
    storageKey,
    storageUrl,
    name: row.name,
    mimeType,
    sizeBytes,
    uploadedBy: row.uploadedBy,
    updatedBy: row.updatedBy ?? null,
    videoDelivery: mapVideoDeliveryRecord(metadata?.videoDelivery),
    hashComputedBy: row.hashComputedBy ?? null,
    hashVerificationStatus: row.hashVerificationStatus ?? null,
    hashVerifiedAt: row.hashVerifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getWorkspaceIdForFile(fileId: string) {
  const [row] = await db
    .select({ workspaceId: fileAsset.workspaceId })
    .from(fileAsset)
    .where(and(eq(fileAsset.id, fileId), isNull(fileAsset.deletedAt)))
    .limit(1);

  return row?.workspaceId ?? null;
}

export async function getNoteContent(fileId: string) {
  const [row] = await db
    .select({
      content: noteContent.content,
      needsReindex: noteContent.needsReindex,
      updatedAt: noteContent.updatedAt,
    })
    .from(noteContent)
    .where(eq(noteContent.fileId, fileId))
    .limit(1);

  return row ?? null;
}

export async function updateNoteContent(input: {
  fileId: string;
  userId: string;
  content: string;
}) {
  const now = new Date();
  const trimmed = input.content ?? "";
  const shouldReindex = trimmed.trim().length > 0;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(noteContent)
      .values({
        fileId: input.fileId,
        content: trimmed,
        needsReindex: shouldReindex,
        updatedBy: input.userId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: noteContent.fileId,
        set: {
          content: trimmed,
          needsReindex: shouldReindex,
          updatedBy: input.userId,
          updatedAt: now,
        },
      })
      .returning({
        fileId: noteContent.fileId,
        updatedAt: noteContent.updatedAt,
      });

    await tx
      .update(fileAsset)
      .set({ updatedAt: now, updatedBy: input.userId })
      .where(and(eq(fileAsset.id, input.fileId), isNull(fileAsset.deletedAt)));

    return row ?? null;
  });
}

export async function listNotesNeedingReindex(input: { limit: number }) {
  const limit = Math.max(1, Math.min(200, Math.trunc(input.limit)));
  const rows = await db
    .select({
      fileId: fileAsset.id,
      workspaceId: fileAsset.workspaceId,
      updatedAt: noteContent.updatedAt,
    })
    .from(noteContent)
    .innerJoin(fileAsset, eq(fileAsset.id, noteContent.fileId))
    .where(
      and(
        eq(noteContent.needsReindex, true),
        isNull(fileAsset.deletedAt)
      )
    )
    .orderBy(asc(noteContent.updatedAt))
    .limit(limit);

  return rows.map((row) => ({
    fileId: row.fileId,
    workspaceId: row.workspaceId,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function markNoteReindexed(fileId: string) {
  const [row] = await db
    .update(noteContent)
    .set({
      needsReindex: false,
      lastIndexedAt: new Date(),
    })
    .where(eq(noteContent.fileId, fileId))
    .returning({ fileId: noteContent.fileId });

  return row?.fileId ?? null;
}

async function listSharedFileRecordsForUser(userId: string) {
  const rows = await db
    .select({
      file: fileAsset,
      grantCreatedAt: resourceShareGrant.createdAt,
      permission: resourceShareGrant.permission,
    })
    .from(resourceShareGrant)
    .innerJoin(
      fileAsset,
      and(
        eq(resourceShareGrant.resourceType, "file"),
        sql`${resourceShareGrant.resourceId} = ${fileAsset.id}::text`
      )
    )
    .where(
      and(
        eq(resourceShareGrant.granteeUserId, userId),
        eq(resourceShareGrant.resourceType, "file"),
        isNull(fileAsset.deletedAt)
      )
    )
    .orderBy(desc(resourceShareGrant.createdAt));

  return rows.map((row) => ({
    ...mapFile(row.file),
    createdAt: row.grantCreatedAt.toISOString(),
    isShared: true,
    readOnly: row.permission !== "editor",
    sourceWorkspaceId: row.file.workspaceId,
  }));
}

export async function listUserOrganizationIds(
  userId: string
): Promise<string[]> {
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

export async function listPendingInvitationsForEmail(
  email: string
): Promise<WorkspaceInvitationRecord[]> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return [];
  }

  const rows = await db
    .select({
      id: invitation.id,
      organizationId: invitation.organizationId,
      organizationName: organization.name,
      inviterName: authUser.name,
      inviterEmail: authUser.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .innerJoin(authUser, eq(authUser.id, invitation.inviterId))
    .where(
      and(
        eq(invitation.email, normalizedEmail),
        eq(invitation.status, "pending"),
        sql`${invitation.expiresAt} > now()`
      )
    )
    .orderBy(desc(invitation.createdAt));

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    inviterName: row.inviterName ?? null,
    inviterEmail: row.inviterEmail,
    role: row.role ?? "member",
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function respondToInvitationForUser(input: {
  invitationId: string;
  userId: string;
  userEmail: string;
  action: "accept" | "decline";
}) {
  const normalizedEmail = input.userEmail.trim().toLowerCase();
  const [invite] = await db
    .select()
    .from(invitation)
    .where(
      and(
        eq(invitation.id, input.invitationId),
        eq(invitation.email, normalizedEmail)
      )
    )
    .limit(1);

  if (!invite) {
    return { ok: false as const, error: "Invitation not found" };
  }

  if (invite.status !== "pending") {
    return { ok: false as const, error: "Invitation is no longer pending" };
  }

  if (input.action === "decline") {
    await db
      .update(invitation)
      .set({ status: "declined" })
      .where(eq(invitation.id, invite.id));
    return {
      ok: true as const,
      action: "declined" as const,
      organizationId: invite.organizationId,
    };
  }

  if (invite.expiresAt.getTime() <= Date.now()) {
    await db
      .update(invitation)
      .set({ status: "expired" })
      .where(eq(invitation.id, invite.id));
    return { ok: false as const, error: "Invitation expired" };
  }

  const [existingMembership] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.organizationId, invite.organizationId),
        eq(member.userId, input.userId)
      )
    )
    .limit(1);

  if (!existingMembership) {
    await db.insert(member).values({
      id: randomUUID(),
      organizationId: invite.organizationId,
      userId: input.userId,
      role: invite.role ?? "member",
      createdAt: new Date(),
    });
  }

  await db
    .update(invitation)
    .set({ status: "accepted" })
    .where(eq(invitation.id, invite.id));
  const ws = await ensureWorkspaceForOrganization(invite.organizationId);

  return {
    ok: true as const,
    action: "accepted" as const,
    organizationId: invite.organizationId,
    workspaceId: ws.id,
  };
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
    .where(
      and(
        eq(member.organizationId, organizationId),
        eq(member.userId, targetUser.id)
      )
    )
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

export async function createWorkspaceInvitationByEmail(input: {
  workspaceId: string;
  email: string;
  inviterUserId: string;
  role?: "member" | "admin" | "owner";
  expiresInDays?: number;
}) {
  const organizationId = await getWorkspaceOrganizationId(input.workspaceId);
  if (!organizationId) {
    return { status: "workspace-not-found" as const };
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  if (!normalizedEmail) {
    return { status: "invalid-email" as const };
  }

  const [existingMember] = await db
    .select({ id: member.id })
    .from(member)
    .innerJoin(authUser, eq(authUser.id, member.userId))
    .where(
      and(
        eq(member.organizationId, organizationId),
        eq(authUser.email, normalizedEmail)
      )
    )
    .limit(1);

  if (existingMember) {
    return { status: "already-member" as const };
  }

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + (input.expiresInDays ?? 7) * 24 * 60 * 60 * 1000
  );

  const [existingInvite] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, organizationId),
        eq(invitation.email, normalizedEmail),
        eq(invitation.status, "pending")
      )
    )
    .orderBy(desc(invitation.createdAt))
    .limit(1);

  if (existingInvite) {
    await db
      .update(invitation)
      .set({
        inviterId: input.inviterUserId,
        role: input.role ?? "member",
        expiresAt,
      })
      .where(eq(invitation.id, existingInvite.id));
    return { status: "invited" as const, invitationId: existingInvite.id };
  }

  const invitationId = randomUUID();
  await db.insert(invitation).values({
    id: invitationId,
    organizationId,
    email: normalizedEmail,
    role: input.role ?? "member",
    status: "pending",
    expiresAt,
    createdAt: now,
    inviterId: input.inviterUserId,
  });

  return { status: "invited" as const, invitationId };
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
          eq(resourceShareGrant.createdBy, input.userId)
        )
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
    if (
      !entry.lastSharedAt ||
      row.createdAt.getTime() > new Date(entry.lastSharedAt).getTime()
    ) {
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
        return (
          new Date(b.lastSharedAt).getTime() -
          new Date(a.lastSharedAt).getTime()
        );
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

export async function ensureWorkspaceRootFolder(
  workspaceId: string,
  userId: string
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${workspaceId}))`
    );

    const [existing] = await tx
      .select()
      .from(fileFolder)
      .where(
        and(
          eq(fileFolder.workspaceId, workspaceId),
          isNull(fileFolder.parentId),
          isNull(fileFolder.deletedAt)
        )
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
          isNull(fileFolder.deletedAt)
        )
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
  preferredOrganizationId?: string | null
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

export async function listWorkspacesForUser(
  userId: string
): Promise<UserWorkspaceSummary[]> {
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
      const ws = await ensureWorkspaceForOrganization(
        membership.organizationId
      );
      const root = await ensureWorkspaceRootFolder(ws.id, userId);
      return {
        workspaceId: ws.id,
        organizationId: ws.organizationId,
        name: membership.organizationName,
        rootFolderId: root.id,
      };
    })
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

export async function deleteWorkspaceForUser(
  userId: string,
  workspaceId: string
) {
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
    .where(
      and(
        eq(member.organizationId, ws.organizationId),
        eq(member.userId, userId)
      )
    )
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
  const slugBase =
    nameBase
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

export async function userCanAccessWorkspace(
  userId: string,
  workspaceId: string
) {
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
    .where(
      and(
        eq(member.userId, userId),
        eq(member.organizationId, ws.organizationId)
      )
    )
    .limit(1);

  return Boolean(membership);
}

export async function getFolderWithAncestors(
  workspaceId: string,
  folderId: string,
  userId?: string
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
          isNull(fileFolder.deletedAt)
        )
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
        isNull(fileFolder.deletedAt)
      )
    )
    .limit(1);

  if (!folder) {
    return null;
  }

  const ancestors: (typeof fileFolder.$inferSelect)[] = [];
  let cursor: typeof fileFolder.$inferSelect | undefined = folder;
  let depth = 0;
  const MAX_DEPTH = 1000;

  while (cursor) {
    if (depth++ >= MAX_DEPTH) {
      throw new Error(
        "Folder ancestry depth exceeded MAX_DEPTH (1000). Possible cycle; expected validateFolderParentId to prevent this."
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
          isNull(fileFolder.deletedAt)
        )
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

export async function listFolderContents(
  workspaceId: string,
  folderId: string
) {
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
          isNull(fileFolder.deletedAt)
        )
      )
      .orderBy(asc(fileFolder.name)),
    db
      .select()
      .from(fileAsset)
      .where(
        and(
          eq(fileAsset.workspaceId, workspaceId),
          eq(fileAsset.folderId, folderId),
          isNull(fileAsset.deletedAt)
        )
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
  userId: string
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
        isNull(fileFolder.deletedAt)
      )
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
    folders: [...base.folders, sharedFolder].sort((a, b) =>
      a.name.localeCompare(b.name)
    ),
    files: base.files,
  };
}

export async function listWorkspaceFolders(
  workspaceId: string,
  userId?: string
) {
  const rows = await db
    .select()
    .from(fileFolder)
    .where(
      and(eq(fileFolder.workspaceId, workspaceId), isNull(fileFolder.deletedAt))
    )
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
    .where(
      and(eq(fileAsset.workspaceId, workspaceId), isNull(fileAsset.deletedAt))
    )
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
          isNull(fileFolder.deletedAt)
        )
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
        isNull(fileFolder.deletedAt)
      )
    )
    .limit(1);

  if (!parentFolder) {
    return { status: "invalid" };
  }

  if (currentFolderId) {
    const parentWithAncestors = await getFolderWithAncestors(
      workspaceId,
      parentId
    );
    if (!parentWithAncestors) {
      return { status: "invalid" };
    }

    const createsCycle = parentWithAncestors.ancestors.some(
      (ancestor) => ancestor.id === currentFolderId
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
  userId: string
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
  const normalizedParentId = parentValidation.parentId;

  const [existing] = await db
    .select()
    .from(fileFolder)
    .where(
      and(
        eq(fileFolder.workspaceId, workspaceId),
        normalizedParentId === null
          ? isNull(fileFolder.parentId)
          : eq(fileFolder.parentId, normalizedParentId),
        isNull(fileFolder.deletedAt),
        sql`LOWER(${fileFolder.name}) = ${trimmedName.toLowerCase()}`
      )
    )
    .limit(1);
  if (existing) {
    return mapFolder(existing);
  }

  const now = new Date();
  const [folder] = await db
    .insert(fileFolder)
    .values({
      workspaceId,
      parentId: normalizedParentId,
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
  actorUserId: string,
  updates: {
    bannerUrl?: string | null;
    iconColor?: string | null;
    name?: string;
    parentId?: string | null;
  }
) {
  const normalizedIconColor =
    typeof updates.iconColor === "string"
      ? normalizeHexColor(updates.iconColor)
      : updates.iconColor === null
        ? null
        : undefined;
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
      ...(typeof updates.bannerUrl === "string"
        ? { bannerUrl: updates.bannerUrl.trim() || null }
        : {}),
      ...(updates.bannerUrl === null ? { bannerUrl: null } : {}),
      ...(typeof normalizedIconColor === "string"
        ? { iconColor: normalizedIconColor }
        : {}),
      ...(normalizedIconColor === null ? { iconColor: null } : {}),
      ...(typeof updates.name === "string"
        ? { name: updates.name.trim().slice(0, 160) || "Untitled Folder" }
        : {}),
      ...(typeof nextParentId !== "undefined"
        ? { parentId: nextParentId }
        : {}),
      updatedBy: actorUserId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(fileFolder.id, folderId),
        eq(fileFolder.workspaceId, workspaceId),
        isNull(fileFolder.deletedAt)
      )
    )
    .returning();

  return folder ? mapFolder(folder) : null;
}

function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (/^#([0-9a-f]{6})$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export async function softDeleteFolder(workspaceId: string, folderId: string) {
  const now = new Date();

  const descendants = await collectDescendantFolderIds(workspaceId, folderId);
  const folderIds = [folderId, ...descendants];

  await db
    .update(fileAsset)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(fileAsset.workspaceId, workspaceId),
        inArray(fileAsset.folderId, folderIds),
        isNull(fileAsset.deletedAt)
      )
    );

  const folders = await db
    .update(fileFolder)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(fileFolder.workspaceId, workspaceId),
        inArray(fileFolder.id, folderIds),
        isNull(fileFolder.deletedAt)
      )
    )
    .returning();

  const rootFolder = folders.find((folder) => folder.id === folderId);
  return rootFolder ? mapFolder(rootFolder) : null;
}

async function collectDescendantFolderIds(
  workspaceId: string,
  rootFolderId: string
) {
  const descendants: string[] = [];
  let frontier = [rootFolderId];
  let depth = 0;
  const MAX_DEPTH = 1000;

  while (frontier.length > 0) {
    if (depth++ >= MAX_DEPTH) {
      throw new Error(
        "Folder descendant walk exceeded MAX_DEPTH (1000). Possible cycle; expected validateFolderParentId to prevent this."
      );
    }
    const children = await db
      .select({ id: fileFolder.id })
      .from(fileFolder)
      .where(
        and(
          eq(fileFolder.workspaceId, workspaceId),
          inArray(fileFolder.parentId, frontier),
          isNull(fileFolder.deletedAt)
        )
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
    contentHashSha256?: string | null;
    folderId: string;
    hashComputedBy?: "client" | "server" | null;
    hashVerificationStatus?: "failed" | "pending" | "verified" | null;
    storageKey: string;
    storageUrl: string;
    name: string;
    mimeType?: string | null;
    sizeBytes: number;
    metadata?: Record<string, unknown>;
  }
) {
  const [folder] = await db
    .select({ id: fileFolder.id })
    .from(fileFolder)
    .where(
      and(
        eq(fileFolder.id, input.folderId),
        eq(fileFolder.workspaceId, workspaceId),
        isNull(fileFolder.deletedAt)
      )
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
      storageUrl: normalizeTrustedStorageUrl(input.storageUrl),
      name: input.name.slice(0, 255),
      mimeType: input.mimeType ?? null,
      sizeBytes: input.sizeBytes,
      uploadedBy: userId,
      updatedBy: userId,
      metadata: input.metadata ?? {},
      contentHashSha256: input.contentHashSha256 ?? null,
      hashComputedBy: input.hashComputedBy ?? null,
      hashVerificationStatus: input.hashVerificationStatus ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return mapFile(record);
}

export async function updateFileAsset(
  workspaceId: string,
  fileId: string,
  userId: string,
  updates: { folderId?: string; name?: string }
) {
  if (updates.folderId) {
    const [folder] = await db
      .select({ id: fileFolder.id })
      .from(fileFolder)
      .where(
        and(
          eq(fileFolder.id, updates.folderId),
          eq(fileFolder.workspaceId, workspaceId),
          isNull(fileFolder.deletedAt)
        )
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
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(fileAsset.id, fileId),
        eq(fileAsset.workspaceId, workspaceId),
        isNull(fileAsset.deletedAt)
      )
    )
    .returning();

  return record ? mapFile(record) : null;
}

export async function updateFileAssetStorageMetadata(
  workspaceId: string,
  fileId: string,
  userId: string,
  updates: {
    optimizedStorageKey?: string;
    optimizedStorageUrl?: string;
    optimizedName?: string;
    optimizedMimeType?: string | null;
    optimizedSizeBytes?: number;
    videoDelivery?: VideoDeliveryRecord | null;
  }
) {
  const [existing] = await db
    .select({ metadata: fileAsset.metadata })
    .from(fileAsset)
    .where(
      and(
        eq(fileAsset.id, fileId),
        eq(fileAsset.workspaceId, workspaceId),
        isNull(fileAsset.deletedAt)
      )
    )
    .limit(1);

  if (!existing) {
    return null;
  }

  const nextMetadata = {
    ...(asObjectRecord(existing.metadata) ?? {}),
    ...(typeof updates.videoDelivery !== "undefined"
      ? { videoDelivery: updates.videoDelivery }
      : {}),
  };

  const [record] = await db
    .update(fileAsset)
    .set({
      metadata: nextMetadata,
      ...(typeof updates.optimizedStorageKey === "string"
        ? { optimizedStorageKey: updates.optimizedStorageKey }
        : {}),
      ...(typeof updates.optimizedStorageUrl === "string"
        ? {
            optimizedStorageUrl: normalizeTrustedStorageUrl(
              updates.optimizedStorageUrl
            ),
          }
        : {}),
      ...(typeof updates.optimizedName === "string"
        ? {
            optimizedName:
              updates.optimizedName.trim().slice(0, 255) || "Untitled",
          }
        : {}),
      ...(typeof updates.optimizedMimeType !== "undefined"
        ? { optimizedMimeType: updates.optimizedMimeType }
        : {}),
      ...(typeof updates.optimizedSizeBytes === "number"
        ? { optimizedSizeBytes: updates.optimizedSizeBytes }
        : {}),
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(fileAsset.id, fileId),
        eq(fileAsset.workspaceId, workspaceId),
        isNull(fileAsset.deletedAt)
      )
    )
    .returning();

  return record ? mapFile(record) : null;
}

export async function replaceFileAssetContent(
  workspaceId: string,
  fileId: string,
  userId: string,
  updates: {
    contentHashSha256?: string | null;
    hashComputedBy?: "client" | "server" | null;
    hashVerificationStatus?: "failed" | "pending" | "verified" | null;
    metadata?: Record<string, unknown>;
    mimeType?: string | null;
    sizeBytes: number;
    storageKey: string;
    storageUrl: string;
  }
) {
  const [existing] = await db
    .select({
      metadata: fileAsset.metadata,
      storageKey: fileAsset.storageKey,
      storageUrl: fileAsset.storageUrl,
    })
    .from(fileAsset)
    .where(
      and(
        eq(fileAsset.id, fileId),
        eq(fileAsset.workspaceId, workspaceId),
        isNull(fileAsset.deletedAt)
      )
    )
    .limit(1);

  if (!existing) {
    return null;
  }

  const nextMetadata = {
    ...(asObjectRecord(existing.metadata) ?? {}),
    ...(updates.metadata ?? {}),
  };

  const [record] = await db
    .update(fileAsset)
    .set({
      contentHashSha256: updates.contentHashSha256 ?? null,
      hashComputedBy: updates.hashComputedBy ?? null,
      hashVerificationStatus: updates.hashVerificationStatus ?? null,
      metadata: nextMetadata,
      mimeType: updates.mimeType ?? null,
      optimizedMimeType: null,
      optimizedName: null,
      optimizedSizeBytes: null,
      optimizedStorageKey: null,
      optimizedStorageUrl: null,
      sizeBytes: updates.sizeBytes,
      storageKey: updates.storageKey,
      storageUrl: normalizeTrustedStorageUrl(updates.storageUrl),
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(
      and(
        eq(fileAsset.id, fileId),
        eq(fileAsset.workspaceId, workspaceId),
        isNull(fileAsset.deletedAt)
      )
    )
    .returning();

  if (!record) {
    return null;
  }

  return {
    file: mapFile(record),
    previousStorageKey: existing.storageKey,
    previousStorageUrl: existing.storageUrl,
  };
}

export async function getFileAssetById(workspaceId: string, fileId: string) {
  const [record] = await db
    .select()
    .from(fileAsset)
    .where(
      and(
        eq(fileAsset.id, fileId),
        eq(fileAsset.workspaceId, workspaceId),
        isNull(fileAsset.deletedAt)
      )
    )
    .limit(1);

  return record ? mapFile(record) : null;
}

export async function getFileAssetByStorageKey(
  workspaceId: string,
  storageKey: string
) {
  const [record] = await db
    .select()
    .from(fileAsset)
    .where(
      and(
        eq(fileAsset.workspaceId, workspaceId),
        eq(fileAsset.storageKey, storageKey),
        isNull(fileAsset.deletedAt)
      )
    )
    .limit(1);

  return record ? mapFile(record) : null;
}

export async function getFileAssetByContentHash(
  workspaceId: string,
  contentHashSha256: string
) {
  const normalizedHash = contentHashSha256.trim().toLowerCase();
  if (!normalizedHash) {
    return null;
  }

  const [record] = await db
    .select()
    .from(fileAsset)
    .where(
      and(
        eq(fileAsset.workspaceId, workspaceId),
        eq(fileAsset.contentHashSha256, normalizedHash),
        isNull(fileAsset.deletedAt)
      )
    )
    .orderBy(desc(fileAsset.updatedAt))
    .limit(1);

  return record ? mapFile(record) : null;
}

export async function softDeleteFileAsset(workspaceId: string, fileId: string) {
  const now = new Date();
  const [record] = await db
    .update(fileAsset)
    .set({
      deletedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(fileAsset.id, fileId),
        eq(fileAsset.workspaceId, workspaceId),
        isNull(fileAsset.deletedAt)
      )
    )
    .returning();

  return record ? mapFile(record) : null;
}

export async function listTrashedItems(
  workspaceId: string
): Promise<TrashItemRecord[]> {
  const [folders, files] = await Promise.all([
    db
      .select()
      .from(fileFolder)
      .where(
        and(
          eq(fileFolder.workspaceId, workspaceId),
          isNotNull(fileFolder.deletedAt)
        )
      )
      .orderBy(desc(fileFolder.deletedAt)),
    db
      .select()
      .from(fileAsset)
      .where(
        and(
          eq(fileAsset.workspaceId, workspaceId),
          isNotNull(fileAsset.deletedAt)
        )
      )
      .orderBy(desc(fileAsset.deletedAt)),
  ]);

  const folderItems: TrashItemRecord[] = folders
    .filter((row) => row.deletedAt)
    .map((row) => ({
      id: row.id,
      kind: "folder",
      name: row.name,
      workspaceId: row.workspaceId,
      folderId: row.parentId,
      sizeBytes: null,
      deletedAt: row.deletedAt!.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));

  const fileItems: TrashItemRecord[] = files
    .filter((row) => row.deletedAt)
    .map((row) => ({
      id: row.id,
      kind: "file",
      name: row.name,
      workspaceId: row.workspaceId,
      folderId: row.folderId,
      sizeBytes: row.sizeBytes,
      deletedAt: row.deletedAt!.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));

  return [...folderItems, ...fileItems].sort(
    (a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime()
  );
}

async function getWorkspaceRootFolderId(
  workspaceId: string
): Promise<string | null> {
  const [root] = await db
    .select({ id: fileFolder.id })
    .from(fileFolder)
    .where(
      and(
        eq(fileFolder.workspaceId, workspaceId),
        isNull(fileFolder.parentId),
        isNull(fileFolder.deletedAt)
      )
    )
    .limit(1);
  return root?.id ?? null;
}

export async function restoreFileAsset(workspaceId: string, fileId: string) {
  const [row] = await db
    .select({
      id: fileAsset.id,
      folderId: fileAsset.folderId,
    })
    .from(fileAsset)
    .where(
      and(
        eq(fileAsset.id, fileId),
        eq(fileAsset.workspaceId, workspaceId),
        isNotNull(fileAsset.deletedAt)
      )
    )
    .limit(1);

  if (!row) {
    return false;
  }

  const [folder] = await db
    .select({ id: fileFolder.id })
    .from(fileFolder)
    .where(
      and(
        eq(fileFolder.id, row.folderId),
        eq(fileFolder.workspaceId, workspaceId),
        isNull(fileFolder.deletedAt)
      )
    )
    .limit(1);

  const fallbackFolderId =
    folder?.id ?? (await getWorkspaceRootFolderId(workspaceId));
  if (!fallbackFolderId) {
    return false;
  }

  const [restored] = await db
    .update(fileAsset)
    .set({ deletedAt: null, folderId: fallbackFolderId, updatedAt: new Date() })
    .where(
      and(
        eq(fileAsset.id, fileId),
        eq(fileAsset.workspaceId, workspaceId),
        isNotNull(fileAsset.deletedAt)
      )
    )
    .returning({ id: fileAsset.id });

  return Boolean(restored);
}

async function collectDescendantFolderIdsIncludingDeleted(
  workspaceId: string,
  rootFolderId: string
) {
  const descendants: string[] = [];
  let frontier = [rootFolderId];

  while (frontier.length > 0) {
    const children = await db
      .select({ id: fileFolder.id })
      .from(fileFolder)
      .where(
        and(
          eq(fileFolder.workspaceId, workspaceId),
          inArray(fileFolder.parentId, frontier)
        )
      );

    const next = children.map((child) => child.id);
    descendants.push(...next);
    frontier = next;
  }

  return descendants;
}

export async function restoreFolder(workspaceId: string, folderId: string) {
  const [row] = await db
    .select({
      id: fileFolder.id,
      parentId: fileFolder.parentId,
    })
    .from(fileFolder)
    .where(
      and(
        eq(fileFolder.id, folderId),
        eq(fileFolder.workspaceId, workspaceId),
        isNotNull(fileFolder.deletedAt)
      )
    )
    .limit(1);

  if (!row) {
    return false;
  }

  const descendants = await collectDescendantFolderIdsIncludingDeleted(
    workspaceId,
    folderId
  );
  const folderIds = [folderId, ...descendants];
  const now = new Date();

  let nextParentId = row.parentId;
  if (row.parentId) {
    const [parent] = await db
      .select({
        id: fileFolder.id,
      })
      .from(fileFolder)
      .where(
        and(
          eq(fileFolder.id, row.parentId),
          eq(fileFolder.workspaceId, workspaceId),
          isNull(fileFolder.deletedAt)
        )
      )
      .limit(1);
    if (!parent) {
      nextParentId = null;
    }
  }

  await db
    .update(fileFolder)
    .set({ deletedAt: null, updatedAt: now })
    .where(
      and(
        eq(fileFolder.workspaceId, workspaceId),
        inArray(fileFolder.id, folderIds)
      )
    );

  await db
    .update(fileFolder)
    .set({ parentId: nextParentId, updatedAt: now })
    .where(
      and(eq(fileFolder.workspaceId, workspaceId), eq(fileFolder.id, folderId))
    );

  await db
    .update(fileAsset)
    .set({ deletedAt: null, updatedAt: now })
    .where(
      and(
        eq(fileAsset.workspaceId, workspaceId),
        inArray(fileAsset.folderId, folderIds)
      )
    );

  return true;
}

export async function permanentlyDeleteFileAsset(
  workspaceId: string,
  fileId: string
) {
  const [record] = await db
    .delete(fileAsset)
    .where(
      and(
        eq(fileAsset.id, fileId),
        eq(fileAsset.workspaceId, workspaceId),
        isNotNull(fileAsset.deletedAt)
      )
    )
    .returning({
      id: fileAsset.id,
      metadata: fileAsset.metadata,
      optimizedStorageKey: fileAsset.optimizedStorageKey,
      storageKey: fileAsset.storageKey,
    });

  if (!record) {
    return null;
  }

  return {
    id: record.id,
    storageKeys: Array.from(
      new Set(
        [
          record.storageKey,
          record.optimizedStorageKey ?? null,
          ...listVideoDeliveryStorageKeys(
            mapVideoDeliveryRecord(
              asObjectRecord(record.metadata)?.videoDelivery
            )
          ),
        ].filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0
        )
      )
    ),
  };
}

export async function permanentlyDeleteFolder(
  workspaceId: string,
  folderId: string
) {
  const [folder] = await db
    .select({ id: fileFolder.id })
    .from(fileFolder)
    .where(
      and(
        eq(fileFolder.id, folderId),
        eq(fileFolder.workspaceId, workspaceId),
        isNotNull(fileFolder.deletedAt)
      )
    )
    .limit(1);
  if (!folder) {
    return [];
  }

  const descendants = await collectDescendantFolderIdsIncludingDeleted(
    workspaceId,
    folderId
  );
  const folderIds = [folderId, ...descendants];

  const files = await db
    .select({
      metadata: fileAsset.metadata,
      optimizedStorageKey: fileAsset.optimizedStorageKey,
      storageKey: fileAsset.storageKey,
    })
    .from(fileAsset)
    .where(
      and(
        eq(fileAsset.workspaceId, workspaceId),
        inArray(fileAsset.folderId, folderIds)
      )
    );

  await db
    .delete(fileAsset)
    .where(
      and(
        eq(fileAsset.workspaceId, workspaceId),
        inArray(fileAsset.folderId, folderIds)
      )
    );
  await db
    .delete(fileFolder)
    .where(
      and(
        eq(fileFolder.workspaceId, workspaceId),
        inArray(fileFolder.id, folderIds)
      )
    );

  return Array.from(
    new Set(
      files.flatMap((row) =>
        [
          row.storageKey,
          row.optimizedStorageKey ?? null,
          ...listVideoDeliveryStorageKeys(
            mapVideoDeliveryRecord(asObjectRecord(row.metadata)?.videoDelivery)
          ),
        ].filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0
        )
      )
    )
  );
}

export async function purgeTrashOlderThan(cutoff: Date) {
  const staleFiles = await db
    .select({
      id: fileAsset.id,
      metadata: fileAsset.metadata,
      optimizedStorageKey: fileAsset.optimizedStorageKey,
      storageKey: fileAsset.storageKey,
    })
    .from(fileAsset)
    .where(
      and(isNotNull(fileAsset.deletedAt), lte(fileAsset.deletedAt, cutoff))
    );

  if (staleFiles.length > 0) {
    await db.delete(fileAsset).where(
      inArray(
        fileAsset.id,
        staleFiles.map((row) => row.id)
      )
    );
  }

  const staleFolders = await db
    .select({ id: fileFolder.id })
    .from(fileFolder)
    .where(
      and(isNotNull(fileFolder.deletedAt), lte(fileFolder.deletedAt, cutoff))
    );

  if (staleFolders.length > 0) {
    await db.delete(fileFolder).where(
      inArray(
        fileFolder.id,
        staleFolders.map((row) => row.id)
      )
    );
  }

  return {
    fileCount: staleFiles.length,
    folderCount: staleFolders.length,
    storageKeys: Array.from(
      new Set(
        staleFiles.flatMap((row) =>
          [
            row.storageKey,
            row.optimizedStorageKey ?? null,
            ...listVideoDeliveryStorageKeys(
              mapVideoDeliveryRecord(
                asObjectRecord(row.metadata)?.videoDelivery
              )
            ),
          ].filter(
            (value): value is string =>
              typeof value === "string" && value.trim().length > 0
          )
        )
      )
    ),
  };
}

export async function grantResourceToUserByEmail(input: {
  workspaceId: string;
  resourceType: ShareResourceType;
  resourceId: string;
  permission?: SharePermission;
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
      permission:
        input.resourceType === "chat"
          ? "viewer"
          : (input.permission ?? "viewer"),
      createdBy: input.createdBy,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        resourceShareGrant.resourceType,
        resourceShareGrant.resourceId,
        resourceShareGrant.granteeUserId,
      ],
      set: {
        permission:
          input.resourceType === "chat"
            ? "viewer"
            : (input.permission ?? "viewer"),
      },
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
  permission?: SharePermission;
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
      permission:
        input.resourceType === "chat"
          ? "viewer"
          : (input.permission ?? "viewer"),
      createdBy: input.createdBy,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        resourceShareGrant.resourceType,
        resourceShareGrant.resourceId,
        resourceShareGrant.granteeUserId,
      ],
      set: {
        permission:
          input.resourceType === "chat"
            ? "viewer"
            : (input.permission ?? "viewer"),
      },
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
        eq(member.userId, input.ownerUserId)
      )
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
    .where(
      and(
        eq(chatThread.userId, input.ownerUserId),
        eq(chatThread.workspaceId, input.workspaceId)
      )
    );

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
        permission: "viewer",
      })
    )
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
  const expiresAt = new Date(
    now + (input.expiresInDays ?? 7) * 24 * 60 * 60 * 1000
  );
  const [existingGrant] = await db
    .select({ id: resourceShareGrant.id })
    .from(resourceShareGrant)
    .where(
      and(
        eq(resourceShareGrant.resourceType, input.resourceType),
        eq(resourceShareGrant.resourceId, input.resourceId)
      )
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
      permission: "viewer",
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
        eq(resourceShareGrant.resourceId, link.resourceId)
      )
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
        eq(resourceShareGrant.granteeUserId, userId)
      )
    )
    .limit(1);

  return Boolean(grant);
}

async function hasEditorGrantForFolder(input: {
  workspaceId: string;
  folderId: string;
  userId: string;
}) {
  const folders = await db
    .select({ id: fileFolder.id, parentId: fileFolder.parentId })
    .from(fileFolder)
    .where(
      and(
        eq(fileFolder.workspaceId, input.workspaceId),
        isNull(fileFolder.deletedAt)
      )
    );

  const parentById = new Map(
    folders.map((folder) => [folder.id, folder.parentId])
  );
  const folderLineage = new Set<string>();
  let cursor: string | null = input.folderId;
  while (cursor) {
    folderLineage.add(cursor);
    cursor = parentById.get(cursor) ?? null;
  }

  if (folderLineage.size === 0) {
    return false;
  }

  const grants = await db
    .select({ resourceId: resourceShareGrant.resourceId })
    .from(resourceShareGrant)
    .where(
      and(
        eq(resourceShareGrant.workspaceId, input.workspaceId),
        eq(resourceShareGrant.resourceType, "folder"),
        eq(resourceShareGrant.granteeUserId, input.userId),
        eq(resourceShareGrant.permission, "editor")
      )
    );

  return grants.some((grant) => folderLineage.has(grant.resourceId));
}

export async function userCanEditFile(input: {
  workspaceId: string;
  fileId: string;
  userId: string;
}) {
  if (await userCanAccessWorkspace(input.userId, input.workspaceId)) {
    return true;
  }

  const [directGrant] = await db
    .select({ id: resourceShareGrant.id })
    .from(resourceShareGrant)
    .where(
      and(
        eq(resourceShareGrant.workspaceId, input.workspaceId),
        eq(resourceShareGrant.resourceType, "file"),
        eq(resourceShareGrant.resourceId, input.fileId),
        eq(resourceShareGrant.granteeUserId, input.userId),
        eq(resourceShareGrant.permission, "editor")
      )
    )
    .limit(1);

  if (directGrant) {
    return true;
  }

  const [file] = await db
    .select({ folderId: fileAsset.folderId })
    .from(fileAsset)
    .where(
      and(
        eq(fileAsset.workspaceId, input.workspaceId),
        eq(fileAsset.id, input.fileId),
        isNull(fileAsset.deletedAt)
      )
    )
    .limit(1);

  if (!file) {
    return false;
  }

  return hasEditorGrantForFolder({
    workspaceId: input.workspaceId,
    folderId: file.folderId,
    userId: input.userId,
  });
}

export async function userCanEditFolder(input: {
  workspaceId: string;
  folderId: string;
  userId: string;
}) {
  if (await userCanAccessWorkspace(input.userId, input.workspaceId)) {
    return true;
  }

  return hasEditorGrantForFolder({
    workspaceId: input.workspaceId,
    folderId: input.folderId,
    userId: input.userId,
  });
}

export async function userCanViewFolder(input: {
  workspaceId: string;
  folderId: string;
  userId: string;
}) {
  if (await userCanAccessWorkspace(input.userId, input.workspaceId)) {
    return true;
  }

  const [directGrant] = await db
    .select({ id: resourceShareGrant.id })
    .from(resourceShareGrant)
    .where(
      and(
        eq(resourceShareGrant.workspaceId, input.workspaceId),
        eq(resourceShareGrant.resourceType, "folder"),
        eq(resourceShareGrant.resourceId, input.folderId),
        eq(resourceShareGrant.granteeUserId, input.userId)
      )
    )
    .limit(1);

  if (directGrant) {
    return true;
  }

  return hasEditorGrantForFolder({
    workspaceId: input.workspaceId,
    folderId: input.folderId,
    userId: input.userId,
  });
}
