import { cosineSimilarity } from 'ai';
import { config } from '../config';

export type MultimodalInput = {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: string }
    | { type: 'image_base64'; image_base64: string; mimeType?: string }
  >;
};

type CohereEmbedInputType = 'search_document' | 'search_query';

const COHERE_EMBED_URL = 'https://api.cohere.com/v2/embed';
const ONE_MINUTE_MS = 60_000;

const sleep = async (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

const estimateInputTokens = (value: MultimodalInput): number => {
  let total = 0;

  for (const part of value.content) {
    if (part.type === 'text') {
      total += Math.ceil(part.text.length / 4);
      continue;
    }

    total += config.cohereImageTokenEstimate;
  }

  const safetyFactor = Number.isFinite(config.cohereTokenEstimateSafetyFactor)
    ? Math.max(1, config.cohereTokenEstimateSafetyFactor)
    : 1;
  return Math.max(1, Math.ceil(total * safetyFactor));
};

let cohereWindowStartedAt = Date.now();
let cohereWindowTokensUsed = 0;
let cohereRequestWindowStartedAt = Date.now();
let cohereRequestsUsed = 0;
let adaptiveTpmLimit = 0;

const getHardCapAppliedLimit = (): number =>
  config.cohereTestSafeMode && config.cohereTestTpmHardCap > 0
    ? Math.min(config.cohereTpmLimit, config.cohereTestTpmHardCap)
    : config.cohereTpmLimit;

const getPerRequestTokenBudget = (): number => {
  const hardCapAppliedLimit = getHardCapAppliedLimit();
  const effectiveTpmLimit =
    config.cohereTestSafeMode &&
    config.cohereTestAdaptiveMode &&
    adaptiveTpmLimit > 0
      ? Math.min(adaptiveTpmLimit, hardCapAppliedLimit)
      : hardCapAppliedLimit;

  if (effectiveTpmLimit <= 0) {
    return Number.MAX_SAFE_INTEGER;
  }

  const ratio = Number.isFinite(config.cohereTestTpmTargetRatio)
    ? Math.min(1, Math.max(0.1, config.cohereTestTpmTargetRatio))
    : 0.75;
  return Math.max(1, Math.floor(effectiveTpmLimit * ratio));
};

const getEffectiveTpmLimit = (): number => {
  const hardCapAppliedLimit = getHardCapAppliedLimit();

  if (hardCapAppliedLimit <= 0) {
    return Number.MAX_SAFE_INTEGER;
  }

  if (
    config.cohereTestSafeMode &&
    config.cohereTestAdaptiveMode &&
    adaptiveTpmLimit > 0
  ) {
    return Math.min(adaptiveTpmLimit, hardCapAppliedLimit);
  }

  return hardCapAppliedLimit;
};

const maybeInitializeAdaptiveTpmLimit = (): void => {
  if (!(config.cohereTestSafeMode && config.cohereTestAdaptiveMode)) {
    return;
  }

  if (adaptiveTpmLimit > 0) {
    return;
  }

  const initial = getEffectiveTpmLimit();
  const minCap = Math.max(1, config.cohereTestTpmMinCap);
  adaptiveTpmLimit = Math.max(minCap, initial);
};

const reserveCohereTokens = async (requestTokens: number): Promise<void> => {
  maybeInitializeAdaptiveTpmLimit();
  const effectiveTpmLimit = getEffectiveTpmLimit();

  if (!config.cohereTestSafeMode || effectiveTpmLimit <= 0) {
    return;
  }

  while (true) {
    const now = Date.now();
    const elapsed = now - cohereWindowStartedAt;

    if (elapsed >= ONE_MINUTE_MS) {
      cohereWindowStartedAt = now;
      cohereWindowTokensUsed = 0;
    }

    if (cohereWindowTokensUsed + requestTokens <= effectiveTpmLimit) {
      cohereWindowTokensUsed += requestTokens;
      return;
    }

    await sleep(Math.max(250, ONE_MINUTE_MS - elapsed));
  }
};

const reserveCohereRequest = async (): Promise<void> => {
  if (
    !config.cohereTestSafeMode ||
    !config.cohereTestRpmGuardEnabled ||
    config.cohereRpmLimit <= 0
  ) {
    return;
  }

  while (true) {
    const now = Date.now();
    const elapsed = now - cohereRequestWindowStartedAt;

    if (elapsed >= ONE_MINUTE_MS) {
      cohereRequestWindowStartedAt = now;
      cohereRequestsUsed = 0;
    }

    if (cohereRequestsUsed < config.cohereRpmLimit) {
      cohereRequestsUsed += 1;
      return;
    }

    await sleep(Math.max(250, ONE_MINUTE_MS - elapsed));
  }
};

const splitByTokenBudget = (
  values: MultimodalInput[],
  tokenBudget: number,
): MultimodalInput[][] => {
  const out: MultimodalInput[][] = [];
  let current: MultimodalInput[] = [];
  let currentTokens = 0;

  for (const value of values) {
    const valueTokens = estimateInputTokens(value);
    if (current.length > 0 && currentTokens + valueTokens > tokenBudget) {
      out.push(current);
      current = [];
      currentTokens = 0;
    }

    current.push(value);
    currentTokens += valueTokens;
  }

  if (current.length > 0) {
    out.push(current);
  }

  return out;
};

const parseRetryAfterMs = (value: string | null): number | null => {
  if (!value) return null;

  const seconds = Number.parseFloat(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.floor(seconds * 1000);
  }

  const timestampMs = Date.parse(value);
  if (!Number.isNaN(timestampMs)) {
    return Math.max(0, timestampMs - Date.now());
  }

  return null;
};

const isTrialTokenRateLimit = (detail: string): boolean =>
  /trial token rate limit exceeded|tokens per minute/i.test(detail);

const toCohereContent = (
  input: MultimodalInput,
): Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> => {
  return input.content.map(part => {
    if (part.type === 'text') {
      return { type: 'text', text: part.text };
    }

    if (part.type === 'image_url') {
      return { type: 'image_url', image_url: { url: part.image_url } };
    }

    return {
      type: 'image_url',
      image_url: {
        url: `data:${part.mimeType || 'image/jpeg'};base64,${part.image_base64}`,
      },
    };
  });
};

const batchHasImageContent = (values: MultimodalInput[]): boolean =>
  values.some(value =>
    value.content.some(
      part => part.type === 'image_base64' || part.type === 'image_url',
    ),
  );

const toTextOnlyInput = (value: MultimodalInput): MultimodalInput => {
  const text = value.content
    .filter(
      (
        part,
      ): part is {
        type: 'text';
        text: string;
      } => part.type === 'text',
    )
    .map(part => part.text.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();

  return {
    content: [{ type: 'text', text: text || 'Image content' }],
  };
};

const extractEmbeddingsFromResponse = (json: any): number[][] => {
  if (Array.isArray(json?.embeddings)) {
    if (json.embeddings.length === 0) return [];

    if (Array.isArray(json.embeddings[0])) {
      return json.embeddings as number[][];
    }

    if (Array.isArray(json.embeddings[0]?.embedding)) {
      return json.embeddings.map((item: any) => item.embedding as number[]);
    }
  }

  if (Array.isArray(json?.embeddings?.float)) {
    return json.embeddings.float as number[][];
  }

  if (Array.isArray(json?.data)) {
    return [...json.data]
      .sort((a: any, b: any) => (a?.index ?? 0) - (b?.index ?? 0))
      .map((item: any) => item?.embedding ?? item?.embeddings?.float)
      .filter((value: unknown): value is number[] => Array.isArray(value));
  }

  return [];
};

const fetchCohereEmbeddings = async (params: {
  values: MultimodalInput[];
  inputType: CohereEmbedInputType;
}): Promise<Response> => {
  const requestTokens = params.values.reduce(
    (sum, item) => sum + estimateInputTokens(item),
    0,
  );
  const requestTokenBudget = getPerRequestTokenBudget();

  if (requestTokens > requestTokenBudget) {
    throw new Error(
      `Single cohere request token estimate (${requestTokens}) exceeds budget (${requestTokenBudget}).`,
    );
  }

  await reserveCohereTokens(requestTokens);

  let trialRateLimitRetries = 0;
  for (let attempt = 1; ; attempt += 1) {
    await reserveCohereRequest();
    const response = await fetch(COHERE_EMBED_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.cohereApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.cohereEmbedModel,
        input_type: params.inputType,
        embedding_types: ['float'],
        output_dimension: config.embeddingDimensions,
        inputs: params.values.map(value => ({
          content: toCohereContent(value),
        })),
      }),
    });

    if (response.status !== 429) {
      if (config.cohereTestSafeMode && config.cohereTestAdaptiveMode) {
        const hardMax = getHardCapAppliedLimit();
        const step = Math.max(1, config.cohereTestTpmStepUp);
        adaptiveTpmLimit = Math.min(
          hardMax,
          Math.max(adaptiveTpmLimit, config.cohereTestTpmMinCap) + step
        );
      }
      return response;
    }

    const detail = await response.text().catch(() => '');
    const isTrial429 = isTrialTokenRateLimit(detail);
    if (isTrial429 && config.cohereTestSafeMode && config.cohereTestAdaptiveMode) {
      const downRatio = Number.isFinite(config.cohereTestTpmStepDownRatio)
        ? Math.min(0.9, Math.max(0.1, config.cohereTestTpmStepDownRatio))
        : 0.5;
      adaptiveTpmLimit = Math.max(
        Math.max(1, config.cohereTestTpmMinCap),
        Math.floor(Math.max(adaptiveTpmLimit, config.cohereTestTpmMinCap) * downRatio)
      );
    }
    const maxAttemptsReached = attempt >= config.cohereRetryMaxAttempts;

    if (maxAttemptsReached && !(config.cohereTestSafeMode && isTrial429)) {
      return new Response(detail, {
        status: response.status,
        headers: response.headers,
      });
    }

    if (config.cohereTestSafeMode && isTrial429) {
      trialRateLimitRetries += 1;
      if (trialRateLimitRetries > 8) {
        return new Response(detail, {
          status: response.status,
          headers: response.headers,
        });
      }
    }

    const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
    const fallbackDelay = config.cohereRetryBaseDelayMs * Math.pow(2, attempt - 1);
    const trialDelay = isTrialTokenRateLimit(detail) ? ONE_MINUTE_MS : 0;
    await sleep(Math.max(retryAfterMs ?? 0, fallbackDelay, trialDelay));
  }
};

export const embedMultimodal = async (
  values: MultimodalInput[],
  options?: { inputType?: CohereEmbedInputType },
): Promise<{ model: string; embeddings: number[][] }> => {
  if (values.length === 0) {
    return {
      model: config.cohereEmbedModel,
      embeddings: [],
    };
  }

  const inputType = options?.inputType ?? 'search_document';
  const batches = splitByTokenBudget(values, getPerRequestTokenBudget());
  const embeddings: number[][] = [];

  for (const batch of batches) {
    let response = await fetchCohereEmbeddings({
      values: batch,
      inputType,
    });

    if (!response.ok) {
      const detail = await response.text();
      const shouldFallbackToText =
        batchHasImageContent(batch) &&
        [400, 401, 403, 404, 415, 422, 429].includes(response.status);

      if (!shouldFallbackToText) {
        throw new Error(
          `Cohere embeddings request failed (${response.status}): ${detail}`,
        );
      }

      console.warn(
        `Cohere multimodal embedding failed (${response.status}): ${detail.slice(0, 800)}; retrying batch with text-only fallback.`,
      );

      response = await fetchCohereEmbeddings({
        values: batch.map(toTextOnlyInput),
        inputType,
      });

      if (!response.ok) {
        const fallbackDetail = await response.text();
        throw new Error(
          `Cohere embeddings request failed after text-only fallback (${response.status}): ${fallbackDetail}`,
        );
      }
    }

    const json = await response.json();
    const batchEmbeddings = extractEmbeddingsFromResponse(json);

    if (batchEmbeddings.length !== batch.length) {
      throw new Error(
        `Cohere embeddings length mismatch: expected ${batch.length}, received ${batchEmbeddings.length}.`,
      );
    }

    embeddings.push(...batchEmbeddings);
  }

  return {
    model: config.cohereEmbedModel,
    embeddings,
  };
};

export const textToMultimodalInput = (text: string): MultimodalInput => ({
  content: [{ type: 'text', text }],
});

export const rerankByCohereWithQueryEmbedding = async <T extends { content: string }>(
  queryEmbedding: number[],
  candidates: T[],
  topN: number,
): Promise<Array<T & { rerankScore: number }>> => {
  if (candidates.length === 0) {
    return [];
  }

  const { embeddings } = await embedMultimodal(
    candidates.map(candidate => textToMultimodalInput(candidate.content)),
    { inputType: 'search_document' },
  );

  return candidates
    .map((candidate, index) => {
      const candidateEmbedding = embeddings[index];
      if (!candidateEmbedding) {
        throw new Error(`Missing candidate embedding in rerank at index ${index}.`);
      }

      return {
        ...candidate,
        rerankScore: cosineSimilarity(queryEmbedding, candidateEmbedding),
      };
    })
    .sort((a, b) => b.rerankScore - a.rerankScore)
    .slice(0, topN);
};
