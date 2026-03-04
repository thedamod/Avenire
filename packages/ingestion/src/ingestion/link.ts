import { tavily } from '@tavily/core';
import { config } from '../config';
import { assertSafeUrl } from '../utils/safety';
import { semanticChunkText } from './chunking';
import { extractFromSupportedProvider } from './provider-extractors';
import type { CanonicalResource } from './types';

const extractViaTavily = async (
  url: string,
): Promise<{ title: string | null; content: string }> => {
  if (!config.tavilyApiKey) {
    throw new Error('TAVILY_API_KEY is required for tavily link extraction.');
  }

  const client = tavily({ apiKey: config.tavilyApiKey });
  const payload = (await client.extract([url])) as {
    results?: Array<{
      title?: string;
      rawContent?: string;
      raw_content?: string;
      content?: string;
    }>;
    title?: string;
    rawContent?: string;
    raw_content?: string;
    content?: string;
  };

  const item = payload.results?.[0] ?? payload;
  const content = (item.rawContent ?? item.raw_content ?? item.content ?? '').trim();
  if (!content) {
    throw new Error(`Tavily returned empty content for ${url}`);
  }

  return {
    title: item.title ?? payload.title ?? null,
    content,
  };
};

const extractViaFirecrawl = async (
  url: string,
): Promise<{ title: string | null; content: string }> => {
  if (!config.firecrawlApiKey) {
    throw new Error('FIRECRAWL_API_KEY is required for firecrawl extraction.');
  }

  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.firecrawlApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: ['markdown'],
      onlyMainContent: true,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Firecrawl scrape failed (${response.status}): ${detail}`);
  }

  const json = (await response.json()) as {
    success: boolean;
    data?: { markdown?: string; metadata?: { title?: string } };
  };

  const content = json.data?.markdown?.trim() ?? '';
  if (!content) {
    throw new Error(`Firecrawl returned empty content for ${url}`);
  }

  return {
    title: json.data?.metadata?.title ?? null,
    content,
  };
};

const fallbackExtract = async (
  url: string,
): Promise<{ title: string | null; content: string }> => {
  if (config.linkExtractionProvider === 'firecrawl') {
    return extractViaFirecrawl(url);
  }
  return extractViaTavily(url);
};

export const ingestLink = async (inputUrl: string): Promise<CanonicalResource> => {
  const safeUrl = assertSafeUrl(inputUrl);
  const providerExtraction = await extractFromSupportedProvider(safeUrl.toString());

  if (providerExtraction) {
    const synthesized = [
      `Provider: ${providerExtraction.provider}`,
      `Original URL: ${safeUrl.toString()}`,
      providerExtraction.content,
      providerExtraction.mediaUrls.length
        ? `Media URLs:\n${providerExtraction.mediaUrls.map(value => `- ${value}`).join('\n')}`
        : 'No media URLs extracted.',
    ]
      .filter(Boolean)
      .join('\n\n');

    return {
      sourceType: 'link',
      source: safeUrl.toString(),
      provider: providerExtraction.provider,
      title: providerExtraction.title,
      metadata: {
        mediaUrls: providerExtraction.mediaUrls,
      },
      chunks: semanticChunkText({
        text: synthesized,
        sourceType: 'link',
        source: safeUrl.toString(),
        provider: providerExtraction.provider,
        baseMetadata: {
          route: 'local-provider-extractor',
          mediaCount: providerExtraction.mediaUrls.length,
        },
      }),
    };
  }

  const extracted = await fallbackExtract(safeUrl.toString());
  const content = [
    `Source URL: ${safeUrl.toString()}`,
    extracted.title ? `Title: ${extracted.title}` : '',
    extracted.content,
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    sourceType: 'link',
    source: safeUrl.toString(),
    title: extracted.title ?? undefined,
    chunks: semanticChunkText({
      text: content,
      sourceType: 'link',
      source: safeUrl.toString(),
      baseMetadata: {
        route: config.linkExtractionProvider,
      },
    }),
  };
};
