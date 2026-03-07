UPDATE "session" s
SET "active_team_id" = NULL
WHERE s."active_team_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "team" t
    WHERE t."id" = s."active_team_id"
  );
--> statement-breakpoint
UPDATE "invitation" i
SET "team_id" = NULL
WHERE i."team_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "team" t
    WHERE t."id" = i."team_id"
  );
--> statement-breakpoint
DELETE FROM "team_member" tm
USING (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "team_id", "user_id"
      ORDER BY "created_at" NULLS LAST, "id"
    ) AS rn
  FROM "team_member"
) d
WHERE tm."id" = d."id"
  AND d.rn > 1;
--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "active_team_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "invitation" ALTER COLUMN "team_id" DROP NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'session_active_team_id_team_id_fk'
  ) THEN
    ALTER TABLE "session" DROP CONSTRAINT "session_active_team_id_team_id_fk";
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "session"
ADD CONSTRAINT "session_active_team_id_team_id_fk"
FOREIGN KEY ("active_team_id")
REFERENCES "public"."team"("id")
ON DELETE set null
ON UPDATE no action;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invitation_team_id_team_id_fk'
  ) THEN
    ALTER TABLE "invitation" DROP CONSTRAINT "invitation_team_id_team_id_fk";
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "invitation"
ADD CONSTRAINT "invitation_team_id_team_id_fk"
FOREIGN KEY ("team_id")
REFERENCES "public"."team"("id")
ON DELETE set null
ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teamMember_teamId_userId_uidx"
ON "team_member" USING btree ("team_id", "user_id");
