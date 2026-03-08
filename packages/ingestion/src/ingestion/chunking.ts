import type { CanonicalChunk, ChunkKind, IngestSourceType } from './types';

const TOKENS_PER_WORD = 1.33;
const TARGET_CHUNK_TOKENS = 320;
const MAX_CHUNK_TOKENS = 420;
const OVERLAP_TOKENS = 48;

const wordsFromTokens = (tokens: number): number => {
  return Math.max(1, Math.floor(tokens / TOKENS_PER_WORD));
};

const TARGET_CHUNK_WORDS = wordsFromTokens(TARGET_CHUNK_TOKENS);
const MAX_CHUNK_WORDS = wordsFromTokens(MAX_CHUNK_TOKENS);
const OVERLAP_WORDS = wordsFromTokens(OVERLAP_TOKENS);

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const inferKind = (content: string): ChunkKind => {
  const text = content.toLowerCase();
  if (/\b(proof|qed|lemma|theorem|corollary)\b/.test(text)) return 'proof';
  if (/\b(example|for instance|e\.g\.)\b/.test(text)) return 'example';
  if (/\b(derive|derivation|therefore|hence)\b/.test(text)) return 'derivation';
  if (/\b(intuition|think of|imagine)\b/.test(text)) return 'intuition';
  if (/\b(common mistake|pitfall|misconception|wrong)\b/.test(text)) return 'mistake';
  if (/\b(figure|diagram|plot|visual)\b/.test(text)) return 'visualization';
  if (/^#{1,6}\s/.test(content) || /\b(definition|concept)\b/.test(text)) return 'concept';
  return 'generic';
};

export const semanticChunkText = (params: {
  text: string;
  sourceType: IngestSourceType;
  source: string;
  provider?: string;
  page?: number;
  startMs?: number;
  endMs?: number;
  baseMetadata?: Record<string, unknown>;
}): CanonicalChunk[] => {
  const text = params.text.trim();
  if (!text) return [];

  const paragraphs = text
    .split(/\n\s*\n+/)
    .map(segment => normalizeWhitespace(segment))
    .filter(Boolean);

  const chunks: CanonicalChunk[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(' ');
    if (words.length <= MAX_CHUNK_WORDS) {
      chunks.push({
        chunkIndex: chunks.length,
        content: paragraph,
        kind: inferKind(paragraph),
        metadata: {
          sourceType: params.sourceType,
          source: params.source,
          provider: params.provider,
          page: params.page,
          startMs: params.startMs,
          endMs: params.endMs,
          modality: 'text',
          extra: params.baseMetadata,
        },
      });
      continue;
    }

    let start = 0;
    while (start < words.length) {
      const end = Math.min(words.length, start + TARGET_CHUNK_WORDS);
      const window = words.slice(start, end).join(' ').trim();
      if (window) {
        chunks.push({
          chunkIndex: chunks.length,
          content: window,
          kind: inferKind(window),
          metadata: {
            sourceType: params.sourceType,
            source: params.source,
            provider: params.provider,
            page: params.page,
            startMs: params.startMs,
            endMs: params.endMs,
            modality: 'text',
            extra: params.baseMetadata,
          },
        });
      }

      if (end >= words.length) break;
      start = Math.max(start + 1, end - OVERLAP_WORDS);
    }
  }

  return chunks;
};
