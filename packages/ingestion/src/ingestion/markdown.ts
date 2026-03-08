import { config } from '../config';
import { semanticChunkText } from './chunking';
import type { CanonicalResource } from './types';

export const ingestMarkdown = (input: {
  markdown: string;
  source?: string;
  title?: string;
}): CanonicalResource => {
  const content = input.markdown.trim();
  if (!content) {
    throw new Error('Markdown payload is empty.');
  }

  if (content.length > config.maxMarkdownChars) {
    throw new Error(
      `Markdown payload exceeds limit (${content.length} > ${config.maxMarkdownChars} chars).`,
    );
  }

  const source = input.source ?? `markdown:inline:${crypto.randomUUID()}`;

  return {
    sourceType: 'markdown',
    source,
    title: input.title,
    chunks: semanticChunkText({
      text: content,
      sourceType: 'markdown',
      source,
      baseMetadata: {
        route: 'direct-markdown',
      },
    }),
  };
};
