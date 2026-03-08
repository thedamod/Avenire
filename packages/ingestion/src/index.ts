import { ingestStoredFile } from "./ingestion/pipeline";
import { PostgresVectorStore } from "./retrieval/postgres-vector-store";
import { retrieveRelevantChunks } from "./retrieval/retrieve";

export { assertRequiredSecrets } from "./config";

export { ingestStoredFile };

export async function retrieveWorkspaceChunks(input: {
  workspaceId: string;
  query: string;
  limit?: number;
  sourceType?: "pdf" | "image" | "video" | "audio" | "markdown" | "link";
  provider?: string;
}) {
  const vectorStore = new PostgresVectorStore(input.workspaceId);
  return retrieveRelevantChunks(vectorStore, input.query, {
    limit: input.limit,
    sourceType: input.sourceType,
    provider: input.provider,
  });
}

export * from "./ingestion/types";
