CREATE TABLE "billing_customer" (
	"user_id" text PRIMARY KEY NOT NULL,
	"polar_customer_id" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_customer_polar_customer_id_unique" UNIQUE("polar_customer_id")
);
--> statement-breakpoint
CREATE TABLE "billing_subscription" (
		"user_id" text PRIMARY KEY NOT NULL,
		"plan" text DEFAULT 'access' NOT NULL,
		"status" text DEFAULT 'inactive' NOT NULL,
		"polar_subscription_id" text,
		"polar_product_id" text,
		-- Nullable to support lifetime/indefinite access records and pre-activation rows.
		"current_period_start" timestamp with time zone,
		-- Nullable to support lifetime/indefinite access records and pre-activation rows.
		"current_period_end" timestamp with time zone,
		"created_at" timestamp with time zone DEFAULT now() NOT NULL,
		"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_message" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"position" integer NOT NULL,
	"role" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_thread" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"slug" text NOT NULL,
	"branching" text,
	"title" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_thread_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "file_asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"folder_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"storage_url" text NOT NULL,
	"name" text NOT NULL,
	"mime_type" text,
	"size_bytes" integer NOT NULL,
	"uploaded_by" text NOT NULL,
	"updated_by" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_hash_sha256" text,
	"hash_computed_by" text,
	"hash_verification_status" text,
	"hash_verified_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "file_folder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "file_transcript_cue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_chunk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"kind" text DEFAULT 'generic' NOT NULL,
	"content" text NOT NULL,
	"page" integer,
	"start_ms" integer,
	"end_ms" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_embedding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chunk_id" uuid NOT NULL,
	"model" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"source_type" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_job_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_resource" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"file_id" uuid,
	"source_type" text NOT NULL,
	"source" text NOT NULL,
	"provider" text,
	"title" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_share_grant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"grantee_user_id" text NOT NULL,
	"permission" text DEFAULT 'read' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_share_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"permission" text DEFAULT 'read' NOT NULL,
	"allow_public" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sudo_challenge" (
		"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
		"user_id" text NOT NULL,
		"code_hash" text NOT NULL,
		"attempts" integer DEFAULT 0 NOT NULL,
		"expires_at" timestamp with time zone NOT NULL,
		"used_at" timestamp with time zone,
		"created_at" timestamp with time zone DEFAULT now() NOT NULL,
		CONSTRAINT "sudo_challenge_attempts_nonnegative" CHECK ("attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "usage_meter" (
		"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
		"user_id" text NOT NULL,
		"meter" text NOT NULL,
		"four_hour_capacity" integer NOT NULL,
		"four_hour_balance" integer NOT NULL,
		"four_hour_refill_at" timestamp with time zone NOT NULL,
		"overage_capacity" integer NOT NULL,
		"overage_balance" integer NOT NULL,
		"created_at" timestamp with time zone DEFAULT now() NOT NULL,
		"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
		CONSTRAINT "usage_meter_four_hour_capacity_nonnegative" CHECK ("four_hour_capacity" >= 0),
		CONSTRAINT "usage_meter_four_hour_balance_nonnegative" CHECK ("four_hour_balance" >= 0),
		CONSTRAINT "usage_meter_overage_capacity_nonnegative" CHECK ("overage_capacity" >= 0),
		CONSTRAINT "usage_meter_overage_balance_nonnegative" CHECK ("overage_balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email_receipts" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"team_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" text,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp,
	"aaguid" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	"active_team_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "team_member" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"username" text,
	"display_username" text,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_customer" ADD CONSTRAINT "billing_customer_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscription" ADD CONSTRAINT "billing_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_chat_id_chat_thread_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_thread" ADD CONSTRAINT "chat_thread_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_asset" ADD CONSTRAINT "file_asset_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_asset" ADD CONSTRAINT "file_asset_folder_id_file_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."file_folder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_asset" ADD CONSTRAINT "file_asset_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_asset" ADD CONSTRAINT "file_asset_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_folder" ADD CONSTRAINT "file_folder_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_folder" ADD CONSTRAINT "file_folder_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_folder" ADD CONSTRAINT "file_folder_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_transcript_cue" ADD CONSTRAINT "file_transcript_cue_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_transcript_cue" ADD CONSTRAINT "file_transcript_cue_file_id_file_asset_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file_asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_chunk" ADD CONSTRAINT "ingestion_chunk_resource_id_ingestion_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."ingestion_resource"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_embedding" ADD CONSTRAINT "ingestion_embedding_chunk_id_ingestion_chunk_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."ingestion_chunk"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_job" ADD CONSTRAINT "ingestion_job_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_job" ADD CONSTRAINT "ingestion_job_file_id_file_asset_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file_asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_job_event" ADD CONSTRAINT "ingestion_job_event_job_id_ingestion_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ingestion_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_job_event" ADD CONSTRAINT "ingestion_job_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_resource" ADD CONSTRAINT "ingestion_resource_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_resource" ADD CONSTRAINT "ingestion_resource_file_id_file_asset_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_share_grant" ADD CONSTRAINT "resource_share_grant_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_share_grant" ADD CONSTRAINT "resource_share_grant_grantee_user_id_user_id_fk" FOREIGN KEY ("grantee_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_share_grant" ADD CONSTRAINT "resource_share_grant_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_share_link" ADD CONSTRAINT "resource_share_link_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_share_link" ADD CONSTRAINT "resource_share_link_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sudo_challenge" ADD CONSTRAINT "sudo_challenge_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_meter" ADD CONSTRAINT "usage_meter_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_active_team_id_team_id_fk" FOREIGN KEY ("active_team_id") REFERENCES "public"."team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_customer_polar_customer_idx" ON "billing_customer" USING btree ("polar_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_subscription_polar_subscription_uidx" ON "billing_subscription" USING btree ("polar_subscription_id");--> statement-breakpoint
CREATE INDEX "billing_subscription_status_idx" ON "billing_subscription" USING btree ("status");--> statement-breakpoint
CREATE INDEX "chat_message_chat_id_idx" ON "chat_message" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "chat_message_chat_position_idx" ON "chat_message" USING btree ("chat_id","position");--> statement-breakpoint
CREATE INDEX "chat_thread_user_id_idx" ON "chat_thread" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_thread_branching_idx" ON "chat_thread" USING btree ("branching");--> statement-breakpoint
CREATE INDEX "chat_thread_user_last_message_idx" ON "chat_thread" USING btree ("user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "file_asset_workspace_folder_idx" ON "file_asset" USING btree ("workspace_id","folder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "file_asset_workspace_storage_key_uidx" ON "file_asset" USING btree ("workspace_id","storage_key");--> statement-breakpoint
CREATE INDEX "file_asset_workspace_hash_idx" ON "file_asset" USING btree ("workspace_id","content_hash_sha256");--> statement-breakpoint
CREATE INDEX "file_folder_workspace_parent_idx" ON "file_folder" USING btree ("workspace_id","parent_id");--> statement-breakpoint
CREATE INDEX "file_folder_workspace_name_idx" ON "file_folder" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "file_transcript_cue_workspace_file_idx" ON "file_transcript_cue" USING btree ("workspace_id","file_id");--> statement-breakpoint
CREATE INDEX "file_transcript_cue_file_time_idx" ON "file_transcript_cue" USING btree ("file_id","start_ms");--> statement-breakpoint
CREATE INDEX "ingestion_chunk_resource_idx" ON "ingestion_chunk" USING btree ("resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_chunk_resource_order_uidx" ON "ingestion_chunk" USING btree ("resource_id","chunk_index");--> statement-breakpoint
CREATE INDEX "ingestion_embedding_chunk_idx" ON "ingestion_embedding" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "ingestion_embedding_model_idx" ON "ingestion_embedding" USING btree ("model");--> statement-breakpoint
CREATE INDEX "ingestion_job_workspace_idx" ON "ingestion_job" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "ingestion_job_file_idx" ON "ingestion_job" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "ingestion_job_status_idx" ON "ingestion_job" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ingestion_job_status_created_idx" ON "ingestion_job" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "ingestion_job_event_job_idx" ON "ingestion_job_event" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "ingestion_job_event_workspace_created_idx" ON "ingestion_job_event" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_resource_workspace_source_uidx" ON "ingestion_resource" USING btree ("workspace_id","source_type","source");--> statement-breakpoint
CREATE INDEX "ingestion_resource_workspace_idx" ON "ingestion_resource" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "ingestion_resource_file_idx" ON "ingestion_resource" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_share_grant_unique" ON "resource_share_grant" USING btree ("resource_type","resource_id","grantee_user_id");--> statement-breakpoint
CREATE INDEX "resource_share_grant_workspace_idx" ON "resource_share_grant" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_share_link_token_hash_uidx" ON "resource_share_link" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "resource_share_link_resource_idx" ON "resource_share_link" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "sudo_challenge_user_created_idx" ON "sudo_challenge" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_meter_user_meter_uidx" ON "usage_meter" USING btree ("user_id","meter");--> statement-breakpoint
CREATE INDEX "usage_meter_user_idx" ON "usage_meter" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_organization_id_uidx" ON "workspace" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_organizationId_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_organizationId_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_userId_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_slug_uidx" ON "organization" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "passkey_userId_idx" ON "passkey" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkey_credentialID_idx" ON "passkey" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_organizationId_idx" ON "team" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "teamMember_teamId_idx" ON "team_member" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "teamMember_userId_idx" ON "team_member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teamMember_teamId_userId_uidx" ON "team_member" USING btree ("team_id","user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");
