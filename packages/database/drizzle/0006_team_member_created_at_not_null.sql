UPDATE "team_member"
SET "created_at" = NOW()
WHERE "created_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "team_member"
ALTER COLUMN "created_at" SET NOT NULL;
