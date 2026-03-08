import {
  APOLLO_INGESTION_COHERE_EMBED_MODEL,
  APOLLO_INGESTION_GROQ_TRANSCRIPTION_MODEL,
  APOLLO_INGESTION_MISTRAL_IMAGE_DESCRIPTION_MODEL,
  APOLLO_INGESTION_MISTRAL_OCR_MODEL,
} from "@avenire/ai";

export const config = {
  mistralApiKey: process.env.MISTRAL_API_KEY ?? "",
  mistralOcrModel: APOLLO_INGESTION_MISTRAL_OCR_MODEL,
  mistralImageDescriptionModel: APOLLO_INGESTION_MISTRAL_IMAGE_DESCRIPTION_MODEL,
  groqApiKey: process.env.GROQ_API_KEY ?? "",
  groqTranscriptionModel: APOLLO_INGESTION_GROQ_TRANSCRIPTION_MODEL,
  cohereApiKey: process.env.COHERE_API_KEY ?? "",
  cohereEmbedModel: APOLLO_INGESTION_COHERE_EMBED_MODEL,
  cohereRpmLimit: Number.parseInt(
    process.env.COHERE_RPM_LIMIT ?? "12",
    10,
  ),
  cohereTpmLimit: Number.parseInt(
    process.env.COHERE_TPM_LIMIT ?? "200000",
    10,
  ),
  cohereImageTokenEstimate: Number.parseInt(
    process.env.COHERE_IMAGE_TOKEN_ESTIMATE ?? "1200",
    10,
  ),
  cohereRetryMaxAttempts: Number.parseInt(
    process.env.COHERE_RETRY_MAX_ATTEMPTS ?? "4",
    10,
  ),
  cohereRetryBaseDelayMs: Number.parseInt(
    process.env.COHERE_RETRY_BASE_DELAY_MS ?? "1200",
    10,
  ),
  cohereTestSafeMode:
    (
      process.env.COHERE_TEST_SAFE_MODE ??
      (process.env.NODE_ENV === "production" ? "false" : "true")
    ).toLowerCase() === "true",
  cohereTestTpmTargetRatio: Number.parseFloat(
    process.env.COHERE_TEST_TPM_TARGET_RATIO ?? "0.75",
  ),
  cohereTestAdaptiveMode:
    (process.env.COHERE_TEST_ADAPTIVE_MODE ?? "true").toLowerCase() === "true",
  cohereTestTpmMinCap: Number.parseInt(
    process.env.COHERE_TEST_TPM_MIN_CAP ?? "50000",
    10,
  ),
  cohereTestTpmStepUp: Number.parseInt(
    process.env.COHERE_TEST_TPM_STEP_UP ?? "10000",
    10,
  ),
  cohereTestTpmStepDownRatio: Number.parseFloat(
    process.env.COHERE_TEST_TPM_STEP_DOWN_RATIO ?? "0.5",
  ),
  cohereTestRpmGuardEnabled:
    (process.env.COHERE_TEST_RPM_GUARD_ENABLED ?? "true").toLowerCase() ===
    "true",
  cohereTestTpmHardCap: Number.parseInt(
    process.env.COHERE_TEST_TPM_HARD_CAP ?? "100000",
    10,
  ),
  cohereTokenEstimateSafetyFactor: Number.parseFloat(
    process.env.COHERE_TOKEN_ESTIMATE_SAFETY_FACTOR ??
      ((
        process.env.COHERE_TEST_SAFE_MODE ??
        (process.env.NODE_ENV === "production" ? "false" : "true")
      ).toLowerCase() === "true"
        ? "1.4"
        : "1.0"),
  ),
  embeddingDimensions: Number.parseInt(
    process.env.EMBEDDING_DIMENSIONS ??
      process.env.COHERE_EMBEDDING_DIMENSIONS ??
      "1024",
    10,
  ),
  ingestionEmbedBatchSize: Number.parseInt(
    process.env.INGESTION_EMBED_BATCH_SIZE ?? "64",
    10,
  ),
  ingestionEmbedConcurrency: Number.parseInt(
    process.env.INGESTION_EMBED_CONCURRENCY ??
      ((
        process.env.COHERE_TEST_SAFE_MODE ??
        (process.env.NODE_ENV === "production" ? "false" : "true")
      ).toLowerCase() === "true"
        ? "1"
        : "2"),
    10,
  ),
  ingestionDbBatchSize: Number.parseInt(
    process.env.INGESTION_DB_BATCH_SIZE ?? "200",
    10,
  ),
  ingestionStageTimingLog:
    (process.env.INGESTION_STAGE_TIMING_LOG ?? "true").toLowerCase() !==
    "false",
  linkExtractionProvider: "tavily" as const,
  tavilyApiKey: process.env.TAVILY_API_KEY ?? "",
  maxInlineBytes: Number.parseInt(
    process.env.INGESTION_MAX_INLINE_BYTES ?? "10485760",
    10,
  ),
  remoteFetchTimeoutMs: Number.parseInt(
    process.env.INGESTION_REMOTE_FETCH_TIMEOUT_MS ?? "15000",
    10,
  ),
  remoteFetchMaxAttempts: Number.parseInt(
    process.env.INGESTION_REMOTE_FETCH_MAX_ATTEMPTS ?? "3",
    10,
  ),
  imageEnrichmentEnabled:
    (process.env.IMAGE_ENRICHMENT_ENABLED ?? "true").toLowerCase() !== "false",
  imageDescriptionMaxChars: Number.parseInt(
    process.env.IMAGE_DESCRIPTION_MAX_CHARS ?? "900",
    10,
  ),
  maxMarkdownChars: Number.parseInt(
    process.env.INGESTION_MAX_MARKDOWN_CHARS ?? "500000",
    10,
  ),
  maxUrlsPerBatch: Number.parseInt(
    process.env.INGESTION_MAX_URLS_PER_BATCH ?? "32",
    10,
  ),
  retrievalDefaultLimit: Number.parseInt(
    process.env.RETRIEVAL_DEFAULT_LIMIT ?? "8",
    10,
  ),
  retrievalCandidateMultiplier: Number.parseInt(
    process.env.RETRIEVAL_CANDIDATE_MULTIPLIER ?? "5",
    10,
  ),
  retrievalRerankCandidateLimit: Number.parseInt(
    process.env.RETRIEVAL_RERANK_CANDIDATE_LIMIT ?? "12",
    10,
  ),
  retrievalMinScore: Number.parseFloat(
    process.env.RETRIEVAL_MIN_SCORE ?? "0.18",
  ),
  videoKeyframeIntervalSeconds: Number.parseInt(
    process.env.VIDEO_KEYFRAME_INTERVAL_SECONDS ?? "12",
    10,
  ),
  videoKeyframeMaxFrames: Number.parseInt(
    process.env.VIDEO_KEYFRAME_MAX_FRAMES ?? "16",
    10,
  ),
  batchPollIntervalMs: Number.parseInt(
    process.env.MISTRAL_BATCH_POLL_MS ?? "2500",
    10,
  ),
  batchPollTimeoutMs: Number.parseInt(
    process.env.MISTRAL_BATCH_TIMEOUT_MS ?? "1800000",
    10,
  ),
  pdfFastPathEnabled:
    (process.env.INGESTION_PDF_FAST_PATH_ENABLED ?? "true").toLowerCase() !==
    "false",
  pdfFastPathMinChars: Number.parseInt(
    process.env.INGESTION_PDF_FAST_PATH_MIN_CHARS ?? "900",
    10,
  ),
  pdfFastPathMaxPages: Number.parseInt(
    process.env.INGESTION_PDF_FAST_PATH_MAX_PAGES ?? "120",
    10,
  ),
  pdfFetchTimeoutMs: Number.parseInt(
    process.env.INGESTION_PDF_FETCH_TIMEOUT_MS ?? "20000",
    10,
  ),
};

export const assertRequiredSecrets = (): void => {
  const missing: string[] = [];

  if (!config.mistralApiKey) {
    missing.push("MISTRAL_API_KEY");
  }
  if (!config.groqApiKey) {
    missing.push("GROQ_API_KEY");
  }
  if (!config.cohereApiKey) {
    missing.push("COHERE_API_KEY");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
};
