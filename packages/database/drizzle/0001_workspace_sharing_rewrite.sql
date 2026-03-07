ALTER TABLE "chat_thread" ADD COLUMN "workspace_id" uuid;
--> statement-breakpoint
ALTER TABLE "chat_thread" ADD CONSTRAINT "chat_thread_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "chat_thread_workspace_last_message_idx" ON "chat_thread" USING btree ("workspace_id","last_message_at");
--> statement-breakpoint
UPDATE "chat_thread" AS ct
SET "workspace_id" = COALESCE(
  (
    SELECT w."id"
    FROM "session" s
    INNER JOIN "workspace" w ON w."organization_id" = s."active_organization_id"
    WHERE s."user_id" = ct."user_id"
      AND s."active_organization_id" IS NOT NULL
    ORDER BY s."updated_at" DESC NULLS LAST, s."created_at" DESC
    LIMIT 1
  ),
  (
    SELECT w."id"
    FROM "member" m
    INNER JOIN "workspace" w ON w."organization_id" = m."organization_id"
    WHERE m."user_id" = ct."user_id"
    ORDER BY m."created_at" ASC
    LIMIT 1
  )
);
--> statement-breakpoint
DELETE FROM "resource_share_link";
--> statement-breakpoint
DELETE FROM "resource_share_grant";
--> statement-breakpoint
UPDATE "resource_share_grant" SET "permission" = 'viewer' WHERE "permission" <> 'editor';
--> statement-breakpoint
UPDATE "resource_share_link" SET "permission" = 'viewer' WHERE "permission" <> 'editor';
--> statement-breakpoint
ALTER TABLE "resource_share_grant" ALTER COLUMN "permission" SET DEFAULT 'viewer';
--> statement-breakpoint
ALTER TABLE "resource_share_link" ALTER COLUMN "permission" SET DEFAULT 'viewer';
