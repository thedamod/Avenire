export type VectorSearchFilter = {
  sourceType?: 'pdf' | 'image' | 'video' | 'audio' | 'markdown' | 'link';
  provider?: string;
};

export type VectorSearchResult = {
  resourceId: string;
  fileId: string | null;
  sourceType: 'pdf' | 'image' | 'video' | 'audio' | 'markdown' | 'link';
  source: string;
  provider: string | null;
  title: string | null;
  chunkId: string;
  chunkIndex: number;
  page: number | null;
  startMs: number | null;
  endMs: number | null;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
};

export type CorpusStats = {
  resources: number;
  chunks: number;
  embeddings: number;
};

export interface VectorStore {
  search(
    queryEmbedding: number[],
    options: { limit: number; filter?: VectorSearchFilter },
  ): Promise<VectorSearchResult[]>;
  corpusStats(): Promise<CorpusStats>;
}
