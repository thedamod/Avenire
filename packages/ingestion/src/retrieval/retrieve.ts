import { apollo } from "@avenire/ai";
import { rerank } from "ai";
import { config } from '../config';
import {
  embedMultimodal,
  rerankByCohereWithQueryEmbedding,
  textToMultimodalInput,
} from '../ingestion/embeddings';
import type { VectorStore } from './vector-store';
import type { VectorSearchResult } from './vector-store';

const dedupeByChunkId = (rows: VectorSearchResult[]): VectorSearchResult[] => {
  const seen = new Set<string>();
  const out: VectorSearchResult[] = [];
  for (const row of rows) {
    if (seen.has(row.chunkId)) continue;
    seen.add(row.chunkId);
    out.push(row);
  }
  return out;
};

const diversifyByResource = (
  rows: VectorSearchResult[],
  maxPerResource: number,
): VectorSearchResult[] => {
  const counts = new Map<string, number>();
  const out: VectorSearchResult[] = [];

  for (const row of rows) {
    const used = counts.get(row.resourceId) ?? 0;
    if (used >= maxPerResource) continue;
    counts.set(row.resourceId, used + 1);
    out.push(row);
  }

  return out;
};

const hasVisualIntent = (query: string): boolean => {
  return /\b(video|image|frame|scene|look|see|show|visual|picture|skyline|diagram|screen)\b/i.test(
    query,
  );
};

const hasAudioIntent = (query: string): boolean => {
  return /\b(audio|sound|voice|spoken|speech|podcast|music|transcript|listen|hear)\b/i.test(
    query,
  );
};

const hasDocumentIntent = (query: string): boolean => {
  return /\b(pdf|document|paper|chapter|page|citation|quote|paragraph|text)\b/i.test(
    query,
  );
};

const getPreferredSourceTypes = (intent: {
  visual: boolean;
  audio: boolean;
  document: boolean;
}): Set<'pdf' | 'image' | 'video' | 'audio' | 'markdown' | 'link'> | null => {
  const { visual, audio, document } = intent;

  if (visual && !audio && !document) {
    return new Set(['video', 'image']);
  }
  if (audio && !visual && !document) {
    return new Set(['audio', 'video']);
  }
  if (document && !visual && !audio) {
    return new Set(['pdf', 'markdown', 'link']);
  }

  return null;
};

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(token => token.length > 2);

const lexicalOverlapScore = (query: string, content: string): number => {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return 0;
  }

  const contentTokenSet = new Set(tokenize(content));
  const matched = queryTokens.filter(token => contentTokenSet.has(token)).length;
  return matched / queryTokens.length;
};

const exactPhraseScore = (query: string, content: string): number => {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length < 5) {
    return 0;
  }

  return content.toLowerCase().includes(normalizedQuery) ? 1 : 0;
};

const isLikelyNoisyText = (content: string): boolean => {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return true;
  }

  if (
    /(x264|mpeg-4|h\.264|cabac|deblock|bframes|keyint|qcomp|rc_lookahead|threads=)/i.test(
      normalized
    )
  ) {
    return true;
  }

  const printable = normalized.replace(/[^\x20-\x7E]/g, "");
  const printableRatio = printable.length / normalized.length;
  return printableRatio < 0.8;
};

export const retrieveRelevantChunks = async (
  vectorStore: VectorStore,
  query: string,
  options?: {
    limit?: number;
    sourceType?: 'pdf' | 'image' | 'video' | 'audio' | 'markdown' | 'link';
    provider?: string;
  },
): Promise<{
  latencyMs: number;
  corpus: Awaited<ReturnType<VectorStore['corpusStats']>>;
  results: Array<{
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
    rerankScore: number;
    metadata: Record<string, unknown>;
  }>;
}> => {
  const start = performance.now();
  const visualIntent = hasVisualIntent(query);
  const audioIntent = hasAudioIntent(query);
  const documentIntent = hasDocumentIntent(query);
  const preferredSourceTypes = getPreferredSourceTypes({
    visual: visualIntent,
    audio: audioIntent,
    document: documentIntent,
  });

  const limit = options?.limit ?? config.retrievalDefaultLimit;
  const candidateLimit = Math.max(
    limit,
    limit * config.retrievalCandidateMultiplier,
  );

  const { embeddings } = await embedMultimodal([textToMultimodalInput(query)], {
    inputType: 'search_query',
  });
  const queryEmbedding = embeddings[0];
  if (!queryEmbedding) {
    throw new Error('Failed to compute query embedding.');
  }

  const candidates = await vectorStore.search(queryEmbedding, {
    limit: candidateLimit,
    filter: {
      sourceType: options?.sourceType,
      provider: options?.provider,
    },
  });

  const modalityCandidates = (
    await Promise.all(
      options?.sourceType === undefined && preferredSourceTypes
        ? [...preferredSourceTypes].map(sourceType =>
            vectorStore.search(queryEmbedding, {
              limit: Math.max(4, Math.floor(candidateLimit / 2)),
              filter: { provider: options?.provider, sourceType },
            }),
          )
        : [],
    )
  ).flat();

  const mergedCandidates = diversifyByResource(
    dedupeByChunkId([...candidates, ...modalityCandidates]).sort(
      (a, b) => b.score - a.score,
    ),
    3,
  );

  const sortedCandidates = mergedCandidates
    .filter(candidate => candidate.score >= config.retrievalMinScore)
    .map(candidate => {
      const lexicalScore = lexicalOverlapScore(query, candidate.content);
      const exactPhrase = exactPhraseScore(query, candidate.content);
      const titleLexicalScore = candidate.title
        ? lexicalOverlapScore(query, candidate.title)
        : 0;
      const noisy = isLikelyNoisyText(candidate.content);
      let adjustedScore = candidate.score;

      adjustedScore += lexicalScore * 0.35;
      adjustedScore += exactPhrase * 0.28;

      if (visualIntent) {
        if (candidate.sourceType === "video" || candidate.sourceType === "image") {
          adjustedScore *= 1.85;
        } else if (
          candidate.sourceType === "pdf" ||
          candidate.sourceType === "markdown" ||
          candidate.sourceType === "link"
        ) {
          adjustedScore *= 0.42;
        }
      }

      if (audioIntent) {
        if (candidate.sourceType === "audio") {
          adjustedScore *= 2.0;
        } else if (candidate.sourceType === "video") {
          adjustedScore *= 1.35;
        } else if (
          candidate.sourceType === "pdf" ||
          candidate.sourceType === "markdown" ||
          candidate.sourceType === "link"
        ) {
          adjustedScore *= 0.35;
        }
      }

      if (documentIntent) {
        if (candidate.sourceType === "pdf" || candidate.sourceType === "markdown") {
          adjustedScore *= 1.4;
        }
      }

      if (
        options?.sourceType === undefined &&
        preferredSourceTypes &&
        !preferredSourceTypes.has(candidate.sourceType)
      ) {
        adjustedScore *= 0.15;
      }

      if (
        (candidate.sourceType === "pdf" || candidate.sourceType === "markdown") &&
        lexicalScore >= 0.25 &&
        !visualIntent &&
        !audioIntent
      ) {
        adjustedScore += 0.18;
      }

      if (noisy) {
        adjustedScore *= 0.3;
      }

      if (candidate.sourceType === "audio" && lexicalScore >= 0.16) {
        adjustedScore *= 1.2;
      }

      // Keep semantic retrieval primary; title acts as a weak tie-breaker only.
      if (titleLexicalScore > 0 && lexicalScore > 0.08) {
        adjustedScore += Math.min(0.08, titleLexicalScore * 0.08);
      }

      return {
        ...candidate,
        score: adjustedScore,
      };
    })
    .sort((a, b) => b.score - a.score);

  const sortedByModalityPreference =
    options?.sourceType === undefined && preferredSourceTypes
      ? [
          ...sortedCandidates.filter(candidate =>
            preferredSourceTypes.has(candidate.sourceType),
          ),
          ...sortedCandidates.filter(
            candidate => !preferredSourceTypes.has(candidate.sourceType),
          ),
        ]
      : sortedCandidates;

  const rerankCandidateCount = Math.max(
    limit * 2,
    Math.min(config.retrievalRerankCandidateLimit, candidateLimit),
  );
  const rerankCandidates = sortedByModalityPreference.slice(0, rerankCandidateCount);

  const reranked = await rerank({
    model: apollo.rerankingModel("apollo-reranking"),
    documents: rerankCandidates.map(candidate => candidate.content),
    query,
    topN: limit,
  })
    .then(({ ranking }) =>
      ranking.map(item => ({
        ...rerankCandidates[item.originalIndex],
        rerankScore: item.score,
      })),
    )
    .catch(async error => {
      // Keep retrieval available if provider reranking fails.
      const fallback = await rerankByCohereWithQueryEmbedding(
        queryEmbedding,
        rerankCandidates,
        limit,
      );
      return fallback;
    })
    .catch(error => {
    console.warn(
      JSON.stringify({
        event: 'retrieval_rerank_fallback',
        message: error instanceof Error ? error.message : 'Unknown rerank error',
      }),
    );

    return rerankCandidates.slice(0, limit).map(candidate => ({
      ...candidate,
      rerankScore: candidate.score,
    }));
  });
  const corpus = await vectorStore.corpusStats();

  const latencyMs = Math.round(performance.now() - start);
  console.log(
    JSON.stringify({
      event: 'retrieval',
      latencyMs,
      corpus,
      candidateCount: sortedCandidates.length,
      intent: {
        audio: audioIntent,
        document: documentIntent,
        visual: visualIntent,
      },
      sourceTypeBreakdown: sortedCandidates.reduce<Record<string, number>>(
        (acc, candidate) => {
          acc[candidate.sourceType] = (acc[candidate.sourceType] ?? 0) + 1;
          return acc;
        },
        {},
      ),
      rerankCandidateCount: rerankCandidates.length,
      resultCount: reranked.length,
    }),
  );

  return {
    latencyMs,
    corpus,
    results: reranked,
  };
};
