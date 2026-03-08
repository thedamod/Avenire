import { Mistral } from '@mistralai/mistralai';
import { config } from '../config';
import { assertSafeUrl } from '../utils/safety';
import { semanticChunkText } from './chunking';
import type { CanonicalResource } from './types';

type OcrPage = {
  index: number;
  markdown: string;
  tables?: Array<{ id: string; content: string }>;
  images?: Array<{ id: string; imageAnnotation?: string | null }>;
};

type OcrResponse = {
  model: string;
  pages: OcrPage[];
};

type OcrDocument =
  | { type: 'document_url'; documentUrl: string }
  | { type: 'file'; fileId: string };

const client = new Mistral({ apiKey: config.mistralApiKey });

const withTablesAndImages = (page: OcrPage): string => {
  const tableById = new Map((page.tables ?? []).map(t => [t.id, t.content]));
  const imageById = new Map((page.images ?? []).map(i => [i.id, i.imageAnnotation ?? '']));

  const withTables = page.markdown.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (full, label, href) => {
      const normalizedHref = decodeURIComponent(String(href))
        .replace(/^\.?\//, '')
        .replace(/\.html$/i, '');
      return tableById.get(String(label)) ?? tableById.get(normalizedHref) ?? full;
    },
  );

  return withTables.replace(/!\[([^\]]*)\]\(([^)]*)\)/g, (_full, alt, href) => {
    const key = String(alt || href || '').replace(/^\.?\//, '');
    const annotation = imageById.get(key);
    return annotation ? `[Figure] ${annotation}` : '';
  });
};

const normalizePdfPageText = (text: string): string => {
  const lines = text
    .replace(/\r/g, '\n')
    .replace(/-\n(?=[a-z])/g, '')
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim());

  const out: string[] = [];
  for (const line of lines) {
    if (!line) {
      if (out[out.length - 1] !== '') {
        out.push('');
      }
      continue;
    }

    const looksStructural =
      /^#{1,6}\s/.test(line) ||
      /^(\*|-|\d+\.)\s+/.test(line) ||
      /^\$.*\$$/.test(line) ||
      /^(figure|table|chapter|section)\b/i.test(line);

    if (looksStructural) {
      out.push(line);
      continue;
    }

    const prev = out[out.length - 1];
    if (prev && prev !== '') {
      out[out.length - 1] = `${prev} ${line}`;
    } else {
      out.push(line);
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

const mergeShortChunks = (
  chunks: CanonicalResource['chunks'],
): CanonicalResource['chunks'] => {
  const minChars = 140;
  const merged: CanonicalResource['chunks'] = [];

  for (const chunk of chunks) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.metadata.page === chunk.metadata.page &&
      (prev.content.length < minChars || chunk.content.length < minChars)
    ) {
      prev.content = `${prev.content}\n${chunk.content}`.trim();
      continue;
    }
    merged.push({ ...chunk });
  }

  merged.forEach((chunk, index) => {
    chunk.chunkIndex = index;
  });

  return merged;
};

const ocrSingleDocument = async (
  document: OcrDocument,
  includeImageBase64 = false,
): Promise<OcrResponse> => {
  const ocr = await client.ocr.process({
    model: config.mistralOcrModel,
    document,
    tableFormat: 'html',
    includeImageBase64,
    extractHeader: false,
    extractFooter: false,
  });

  return {
    model: ocr.model,
    pages: ocr.pages,
  };
};

const sleep = async (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

const streamToText = async (stream: ReadableStream<Uint8Array>): Promise<string> => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const merged = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
  return merged.toString('utf-8');
};

const parseBatchOutputLines = (
  jsonl: string,
): Array<{ customId: string; body: OcrResponse }> => {
  const rows: Array<{ customId: string; body: OcrResponse }> = [];

  for (const line of jsonl
    .split('\n')
    .map(v => v.trim())
    .filter(Boolean)) {
    try {
      const parsed = JSON.parse(line) as Record<string, any>;
      const customId =
        parsed.custom_id ??
        parsed.customId ??
        parsed.request?.custom_id ??
        parsed.request?.customId ??
        parsed.id;

      const body =
        parsed.response?.body ?? parsed.body ?? parsed.output ?? parsed.result;
      if (!customId || !body?.pages || !Array.isArray(body.pages)) {
        continue;
      }

      rows.push({ customId: String(customId), body });
    } catch {
      // Ignore malformed lines and continue.
    }
  }

  return rows;
};

const ocrBatchDocuments = async (
  documents: OcrDocument[],
  includeImageBase64 = false,
): Promise<Map<string, OcrResponse>> => {
  const requests = documents.map((document, index) => ({
    customId: `pdf-${index}`,
    body: {
      model: config.mistralOcrModel,
      document,
      tableFormat: 'html',
      includeImageBase64,
      extractHeader: false,
      extractFooter: false,
    },
  }));

  const job = await client.batch.jobs.create({
    endpoint: '/v1/ocr',
    requests,
    metadata: { pipeline: 'avenire-ingestion', mode: 'pdf-batch-ocr' },
    timeoutHours: 24,
  });

  const timeoutAt = Date.now() + config.batchPollTimeoutMs;
  let current = job;
  while (Date.now() < timeoutAt) {
    current = await client.batch.jobs.get({ jobId: job.id, inline: true });
    if (current.status === 'SUCCESS') break;
    if (
      current.status === 'FAILED' ||
      current.status === 'CANCELLED' ||
      current.status === 'TIMEOUT_EXCEEDED'
    ) {
      throw new Error(
        `Mistral batch OCR failed with status=${current.status} (jobId=${current.id})`,
      );
    }
    await sleep(config.batchPollIntervalMs);
  }

  if (current.status !== 'SUCCESS') {
    throw new Error(`Mistral batch OCR timed out (jobId=${job.id})`);
  }

  const result = new Map<string, OcrResponse>();

  if (Array.isArray(current.outputs) && current.outputs.length > 0) {
    for (const output of current.outputs) {
      const customId = String(output.custom_id ?? output.customId ?? output.id ?? '');
      const body = output.response?.body ?? output.body ?? output.result ?? output.output;
      if (!customId || !body?.pages || !Array.isArray(body.pages)) continue;
      result.set(customId, body as OcrResponse);
    }
  }

  if (result.size < documents.length && current.outputFile) {
    const stream = await client.files.download({ fileId: current.outputFile });
    const jsonl = await streamToText(stream);
    const rows = parseBatchOutputLines(jsonl);
    for (const row of rows) {
      result.set(row.customId, row.body);
    }
  }

  if (result.size < documents.length) {
    throw new Error(
      `Batch OCR produced ${result.size}/${documents.length} results. Missing outputs from Mistral batch job ${job.id}.`,
    );
  }

  return result;
};

const toCanonicalResource = (
  source: string,
  ocr: OcrResponse,
  includeImageBase64: boolean,
): CanonicalResource => {
  const rawChunks = ocr.pages.flatMap(page => {
    const pageText = normalizePdfPageText(withTablesAndImages(page));
    return semanticChunkText({
      text: pageText,
      sourceType: 'pdf',
      source,
      page: page.index + 1,
      baseMetadata: {
        ocrModel: ocr.model,
        includeImageBase64,
      },
    });
  });
  const chunks = mergeShortChunks(rawChunks);

  return {
    sourceType: 'pdf',
    source,
    metadata: {
      pages: ocr.pages.length,
      ocrModel: ocr.model,
    },
    chunks,
  };
};

export const ingestPdfs = async (
  urls: string[],
  includeImageBase64 = false,
): Promise<CanonicalResource[]> => {
  const safeUrls = await Promise.all(
    urls.map(async (url) => (await assertSafeUrl(url)).toString())
  );
  const docs: OcrDocument[] = safeUrls.map(documentUrl => ({
    type: 'document_url',
    documentUrl,
  }));

  let batchResults: Map<string, OcrResponse> | null = null;
  if (safeUrls.length > 1) {
    batchResults = await ocrBatchDocuments(docs, includeImageBase64);
  }

  const resources: CanonicalResource[] = [];

  for (let index = 0; index < safeUrls.length; index += 1) {
    const source = safeUrls[index] as string;
    const ocr =
      batchResults?.get(`pdf-${index}`) ??
      (await ocrSingleDocument(docs[index] as OcrDocument, includeImageBase64));

    resources.push(toCanonicalResource(source, ocr, includeImageBase64));
  }

  return resources;
};

export const ingestPdfFiles = async (
  files: Array<{ name: string; bytes: Uint8Array }>,
  includeImageBase64 = false,
): Promise<CanonicalResource[]> => {
  if (files.length === 0) {
    return [];
  }

  const uploaded = await Promise.all(
    files.map(async file => {
      const arrayBuffer = file.bytes.buffer.slice(
        file.bytes.byteOffset,
        file.bytes.byteOffset + file.bytes.byteLength,
      ) as ArrayBuffer;
      const out = await client.files.upload({
        purpose: 'ocr',
        file: new File([arrayBuffer], file.name || 'document.pdf', {
          type: 'application/pdf',
        }),
      });

      return {
        fileId: out.id,
        source: `pdf:file:${file.name || out.id}`,
      };
    }),
  );

  const docs: OcrDocument[] = uploaded.map(item => ({ type: 'file', fileId: item.fileId }));

  let batchResults: Map<string, OcrResponse> | null = null;
  if (docs.length > 1) {
    batchResults = await ocrBatchDocuments(docs, includeImageBase64);
  }

  const resources: CanonicalResource[] = [];

  for (let index = 0; index < docs.length; index += 1) {
    const ocr =
      batchResults?.get(`pdf-${index}`) ??
      (await ocrSingleDocument(docs[index] as OcrDocument, includeImageBase64));

    resources.push(
      toCanonicalResource(uploaded[index]?.source ?? `pdf:file:${index}`, ocr, includeImageBase64),
    );
  }

  return resources;
};
