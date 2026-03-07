export type IngestSourceType = 'pdf' | 'image' | 'video' | 'audio' | 'markdown' | 'link';

export type ChunkKind =
  | 'concept'
  | 'intuition'
  | 'derivation'
  | 'proof'
  | 'example'
  | 'mistake'
  | 'visualization'
  | 'generic';

export type CanonicalChunk = {
  chunkIndex: number;
  content: string;
  kind: ChunkKind;
  embeddingInput?:
    | { type: 'text'; text: string }
    | {
        type: 'multimodal';
        content: Array<
          | { type: 'text'; text: string }
          | { type: 'image_url'; image_url: string }
          | { type: 'image_base64'; image_base64: string; mimeType?: string }
        >;
      };
  metadata: {
    page?: number;
    startMs?: number;
    endMs?: number;
    sourceType: IngestSourceType;
    source: string;
    provider?: string;
    topic?: string;
    difficulty?: 'beginner' | 'intermediate' | 'advanced';
    prerequisites?: string[];
    modality?: 'text' | 'image' | 'video' | 'mixed';
    extra?: Record<string, unknown>;
  };
};

export type CanonicalResource = {
  sourceType: IngestSourceType;
  source: string;
  provider?: string;
  title?: string;
  metadata?: Record<string, unknown>;
  chunks: CanonicalChunk[];
};

export type IngestPdfInput = {
  type: 'pdf';
  urls: string[];
  includeImageBase64?: boolean;
};

export type IngestImageInput = {
  type: 'image';
  url?: string;
  base64?: string;
  title?: string;
  contextText?: string;
};

export type IngestVideoInput = {
  type: 'video';
  url?: string;
  transcript?: string;
  title?: string;
  keyframes?: Array<{
    timestampMs: number;
    imageBase64?: string;
    imageMimeType?: string;
    labels?: string[];
    ocrText?: string;
    caption?: string;
  }>;
};

export type IngestMarkdownInput = {
  type: 'markdown';
  markdown: string;
  source?: string;
  title?: string;
};

export type IngestLinkInput = {
  type: 'link';
  url: string;
};

export type IngestInput =
  | IngestPdfInput
  | IngestImageInput
  | IngestVideoInput
  | IngestMarkdownInput
  | IngestLinkInput;

export type IngestResponse = {
  resources: Array<{
    resourceId: string;
    sourceType: IngestSourceType;
    source: string;
    provider?: string;
    chunks: number;
  }>;
};
