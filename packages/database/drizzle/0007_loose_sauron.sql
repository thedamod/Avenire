ALTER TABLE "team_member" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "file_asset" ADD COLUMN "optimized_storage_key" text;--> statement-breakpoint
ALTER TABLE "file_asset" ADD COLUMN "optimized_storage_url" text;--> statement-breakpoint
ALTER TABLE "file_asset" ADD COLUMN "optimized_name" text;--> statement-breakpoint
ALTER TABLE "file_asset" ADD COLUMN "optimized_mime_type" text;--> statement-breakpoint
ALTER TABLE "file_asset" ADD COLUMN "optimized_size_bytes" integer;