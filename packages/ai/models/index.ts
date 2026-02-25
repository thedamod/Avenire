import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { customProvider } from "ai";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY
});

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY
});

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY
});

export const fermion = customProvider({
  languageModels: {
    "fermion-sprint": google("gemini-2.5-flash"),
    "fermion-core": google("gemini-2.5-pro"),
    "fermion-apex": groq("openai/gpt-oss-120b"),
    "fermion-reasoning": openrouter.languageModel("deepseek/deepseek-r1"),
    "fermion-reasoning-lite": openrouter.languageModel("deepseek/deepseek-r1-0528-qwen3-8b")
  },
  fallbackProvider: google
});

export type FermionModelName =
  | "fermion-sprint"
  | "fermion-core"
  | "fermion-apex"
  | "fermion-reasoning"
  | "fermion-reasoning-lite";
