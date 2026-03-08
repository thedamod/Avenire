import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organization, user } from "./auth-schema";

const resolveEmbeddingDimensions = (): number => {
  const parsed = Number.parseInt(
    process.env.EMBEDDING_DIMENSIONS ??
      process.env.COHERE_EMBEDDING_DIMENSIONS ??
      process.env.VOYAGE_EMBEDDING_DIMENSIONS ??
      "1024",
    10
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1024;
};

export const ingestionEmbeddingDimensions = resolveEmbeddingDimensions();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const chatThread = pgTable(
  "chat_thread",
  {
    id: text("id").primaryKey(),
    workspaceId: uuid("workspace_id").references(() => workspace.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    branching: text("branching"),
    title: text("title").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
  },
  (table) => [
    index("chat_thread_workspace_last_message_idx").on(
      table.workspaceId,
      table.lastMessageAt
    ),
    index("chat_thread_user_id_idx").on(table.userId),
    index("chat_thread_branching_idx").on(table.branching),
    index("chat_thread_user_last_message_idx").on(
      table.userId,
      table.lastMessageAt
    ),
  ]
);

export const chatMessage = pgTable(
  "chat_message",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chatThread.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    role: text("role").notNull(),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("chat_message_chat_id_idx").on(table.chatId),
    index("chat_message_chat_position_idx").on(table.chatId, table.position),
  ]
);

export const chatArtifact = pgTable(
  "chat_artifact",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chatThread.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceMessageId: text("source_message_id"),
    toolName: text("tool_name").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("completed"),
    content: jsonb("content")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("chat_artifact_chat_created_idx").on(table.chatId, table.createdAt),
    index("chat_artifact_chat_kind_idx").on(table.chatId, table.kind),
    index("chat_artifact_source_message_idx").on(table.sourceMessageId),
    index("chat_artifact_user_id_idx").on(table.userId),
  ]
);

export const workspace = pgTable(
  "workspace",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("workspace_organization_id_uidx").on(table.organizationId),
  ]
);

export const fileFolder = pgTable(
  "file_folder",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    name: text("name").notNull(),
    bannerUrl: text("banner_url"),
    iconColor: text("icon_color"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("file_folder_workspace_parent_idx").on(
      table.workspaceId,
      table.parentId
    ),
    index("file_folder_workspace_name_idx").on(table.workspaceId, table.name),
  ]
);

export const fileAsset = pgTable(
  "file_asset",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id")
      .notNull()
      .references(() => fileFolder.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    storageUrl: text("storage_url").notNull(),
    optimizedStorageKey: text("optimized_storage_key"),
    optimizedStorageUrl: text("optimized_storage_url"),
    optimizedName: text("optimized_name"),
    optimizedMimeType: text("optimized_mime_type"),
    optimizedSizeBytes: integer("optimized_size_bytes"),
    name: text("name").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    contentHashSha256: text("content_hash_sha256"),
    hashComputedBy: text("hash_computed_by"),
    hashVerificationStatus: text("hash_verification_status"),
    hashVerifiedAt: timestamp("hash_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("file_asset_workspace_folder_idx").on(
      table.workspaceId,
      table.folderId
    ),
    uniqueIndex("file_asset_workspace_storage_key_uidx").on(
      table.workspaceId,
      table.storageKey
    ),
    index("file_asset_workspace_hash_idx").on(
      table.workspaceId,
      table.contentHashSha256
    ),
  ]
);

export const resourceShareGrant = pgTable(
  "resource_share_grant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    granteeUserId: text("grantee_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    permission: text("permission").notNull().default("viewer"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("resource_share_grant_unique").on(
      table.resourceType,
      table.resourceId,
      table.granteeUserId
    ),
    index("resource_share_grant_workspace_idx").on(table.workspaceId),
  ]
);

export const resourceShareLink = pgTable(
  "resource_share_link",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    permission: text("permission").notNull().default("viewer"),
    allowPublic: boolean("allow_public").notNull().default(true),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("resource_share_link_token_hash_uidx").on(table.tokenHash),
    index("resource_share_link_resource_idx").on(
      table.resourceType,
      table.resourceId
    ),
  ]
);

export const billingCustomer = pgTable(
  "billing_customer",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    polarCustomerId: text("polar_customer_id").notNull().unique(),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("billing_customer_polar_customer_idx").on(table.polarCustomerId),
  ]
);

export const billingSubscription = pgTable(
  "billing_subscription",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    plan: text("plan").notNull().default("access"),
    status: text("status").notNull().default("inactive"),
    polarSubscriptionId: text("polar_subscription_id"),
    polarProductId: text("polar_product_id"),
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
    }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("billing_subscription_polar_subscription_uidx").on(
      table.polarSubscriptionId
    ),
    index("billing_subscription_status_idx").on(table.status),
  ]
);

export const usageMeter = pgTable(
  "usage_meter",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    meter: text("meter").notNull(),
    fourHourCapacity: integer("four_hour_capacity").notNull(),
    fourHourBalance: integer("four_hour_balance").notNull(),
    fourHourRefillAt: timestamp("four_hour_refill_at", {
      withTimezone: true,
    }).notNull(),
    overageCapacity: integer("overage_capacity").notNull(),
    overageBalance: integer("overage_balance").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("usage_meter_user_meter_uidx").on(table.userId, table.meter),
    index("usage_meter_user_idx").on(table.userId),
  ]
);

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  emailReceipts: boolean("email_receipts").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const sudoChallenge = pgTable(
  "sudo_challenge",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("sudo_challenge_user_created_idx").on(table.userId, table.createdAt),
  ]
);

export const ingestionResource = pgTable(
  "ingestion_resource",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    fileId: uuid("file_id").references(() => fileAsset.id, {
      onDelete: "set null",
    }),
    sourceType: text("source_type").notNull(),
    source: text("source").notNull(),
    provider: text("provider"),
    title: text("title"),
    metadata: jsonb("metadata")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("ingestion_resource_workspace_source_uidx").on(
      table.workspaceId,
      table.sourceType,
      table.source
    ),
    index("ingestion_resource_workspace_idx").on(table.workspaceId),
    index("ingestion_resource_file_idx").on(table.fileId),
  ]
);

export const ingestionChunk = pgTable(
  "ingestion_chunk",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => ingestionResource.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    kind: text("kind").notNull().default("generic"),
    content: text("content").notNull(),
    page: integer("page"),
    startMs: integer("start_ms"),
    endMs: integer("end_ms"),
    metadata: jsonb("metadata")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("ingestion_chunk_resource_idx").on(table.resourceId),
    uniqueIndex("ingestion_chunk_resource_order_uidx").on(
      table.resourceId,
      table.chunkIndex
    ),
  ]
);

export const ingestionEmbedding = pgTable(
  "ingestion_embedding",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chunkId: uuid("chunk_id")
      .notNull()
      .references(() => ingestionChunk.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    embedding: vector("embedding", { dimensions: 1024 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("ingestion_embedding_chunk_idx").on(table.chunkId),
    index("ingestion_embedding_model_idx").on(table.model),
  ]
);

export const ingestionJob = pgTable(
  "ingestion_job",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => fileAsset.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"),
    sourceType: text("source_type"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("ingestion_job_workspace_idx").on(table.workspaceId),
    index("ingestion_job_file_idx").on(table.fileId),
    index("ingestion_job_status_idx").on(table.status),
    index("ingestion_job_status_created_idx").on(table.status, table.createdAt),
  ]
);

export const ingestionJobEvent = pgTable(
  "ingestion_job_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => ingestionJob.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("ingestion_job_event_job_idx").on(table.jobId),
    index("ingestion_job_event_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt
    ),
  ]
);

export const fileTranscriptCue = pgTable(
  "file_transcript_cue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => fileAsset.id, { onDelete: "cascade" }),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("file_transcript_cue_workspace_file_idx").on(
      table.workspaceId,
      table.fileId
    ),
    index("file_transcript_cue_file_time_idx").on(table.fileId, table.startMs),
  ]
);
