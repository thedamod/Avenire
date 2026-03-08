import { createBaseten } from "@ai-sdk/baseten";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { customProvider } from "ai";

const mistral = createMistral({
  apiKey: process.env.MISTRAL_API_KEY
});
const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY
});
const baseten = createBaseten({
  apiKey: process.env.BASETEN_API_KEY
});
export const gemini = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const LIGHTWEIGHT_MISTRAL_MODEL =
  process.env.FERMION_LIGHTWEIGHT_MISTRAL_MODEL ?? "mistral-small-latest";
const LIGHTWEIGHT_GROQ_MODEL =
  process.env.FERMION_LIGHTWEIGHT_GROQ_MODEL ?? "llama-3.1-8b-instant";
const BASETEN_AGENT_MODEL =
  process.env.FERMION_BASETEN_AGENT_MODEL ?? "z-ai/glm-5";
const BASETEN_REASONING_MODEL =
  process.env.FERMION_BASETEN_REASONING_MODEL ?? "moonshotai/kimi-a2.5";

export const fermion = customProvider({
  languageModels: {
    "fermion-sprint": mistral(LIGHTWEIGHT_MISTRAL_MODEL),
    "fermion-core": mistral("mistral-medium-latest"),
    "fermion-apex": baseten(BASETEN_AGENT_MODEL),
    "fermion-reasoning": baseten(BASETEN_REASONING_MODEL),
    "fermion-reasoning-lite": groq(LIGHTWEIGHT_GROQ_MODEL),
    "fermion-agent": baseten(BASETEN_AGENT_MODEL),
    "fermion-agent-reasoning": baseten(BASETEN_REASONING_MODEL),
  },
  fallbackProvider: mistral
});

export type FermionModelName =
  | "fermion-sprint"
  | "fermion-core"
  | "fermion-apex"
  | "fermion-reasoning"
  | "fermion-reasoning-lite"
  | "fermion-agent"
  | "fermion-agent-reasoning";
