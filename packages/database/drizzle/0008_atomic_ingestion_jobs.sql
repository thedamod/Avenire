CREATE UNIQUE INDEX IF NOT EXISTS "ingestion_job_workspace_file_active_uidx"
ON "ingestion_job" ("workspace_id", "file_id")
WHERE "status" IN ('queued', 'running');--> statement-breakpoint

DO $$
DECLARE
  embedding_dims integer := COALESCE(
    NULLIF(current_setting('app.embedding_dimensions', true), '')::integer,
    1024
  );
BEGIN
  EXECUTE format(
    'ALTER TABLE "ingestion_embedding" ALTER COLUMN "embedding" TYPE vector(%s)',
    embedding_dims
  );
END $$;
