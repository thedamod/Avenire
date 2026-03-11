import { createBaseten } from "@ai-sdk/baseten";
import { createCohere } from "@ai-sdk/cohere";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { customProvider } from "ai";
import { createOllama } from "ai-sdk-ollama";

const APOLLO_MODEL_SPRINT = "apollo-sprint";
const APOLLO_MODEL_CORE = "apollo-core";
const APOLLO_MODEL_APEX = "apollo-apex";
const APOLLO_MODEL_AGENT = "apollo-agent";
const APOLLO_MODEL_TINY = "apollo-tiny";
const APOLLO_RERANKING_MODEL = "apollo-reranking";
const APOLLO_TRANSCRIPTION_MODEL = "apollo-transcript";

export const APOLLO_INGESTION_MISTRAL_OCR_MODEL = "mistral-ocr-latest";
export const APOLLO_INGESTION_MISTRAL_IMAGE_DESCRIPTION_MODEL =
  "pixtral-large-latest";
export const APOLLO_INGESTION_GROQ_TRANSCRIPTION_MODEL =
  "whisper-large-v3-turbo";
export const APOLLO_INGESTION_COHERE_EMBED_MODEL = "embed-v4.0";

export type ApolloModelName =
  | typeof APOLLO_MODEL_SPRINT
  | typeof APOLLO_MODEL_CORE
  | typeof APOLLO_MODEL_APEX
  | typeof APOLLO_MODEL_AGENT
  | typeof APOLLO_MODEL_TINY;

const mistral = createMistral({
  apiKey: process.env.MISTRAL_API_KEY,
});
const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});
const baseten = createBaseten({
  apiKey: process.env.BASETEN_API_KEY,
});
export const gemini = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});
const cohere = createCohere({
  apiKey: process.env.COHERE_API_KEY,
});

const ollama = createOllama({
  baseURL: "https://ollama.com/api",
  headers:{
    "Authorization": `Bearer ${process.env.OLLAMA_API_KEY}`
  }
});

export const apollo = customProvider({
  languageModels: {
    "apollo-sprint": ollama("qwen3.5"),
    "apollo-apex": baseten("moonshotai/Kimi-K2.5"),
    "apollo-core": gemini("gemini-3-flash-preview"),
    "apollo-agent": baseten("zai-org/GLM-5"),
    "apollo-tiny": mistral("pixtral-large-latest"),
  },
  embeddingModels: {},
  rerankingModels: {
    "apollo-reranking": cohere.reranking("rerank-v3.5"),
  },
  transcriptionModels: {
    "apollo-transcript": groq.transcription(
      APOLLO_INGESTION_GROQ_TRANSCRIPTION_MODEL
    ),
  },
  fallbackProvider: mistral,
});
