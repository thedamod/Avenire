declare namespace NodeJS {
  interface ProcessEnv {
    AUTH_GITHUB_ID?: string;
    AUTH_GITHUB_SECRET?: string;
    AUTH_GOOGLE_ID?: string;
    AUTH_GOOGLE_SECRET?: string;
    AXIOM_DATASET?: string;
    AXIOM_TOKEN?: string;
    BETTER_AUTH_SECRET?: string;
    BETTER_AUTH_TRUSTED_ORIGINS?: string;
    BETTER_AUTH_URL?: string;
    BASETEN_API_KEY?: string;
    COHERE_API_KEY?: string;
    DATABASE_URL?: string;
    EMAIL_FROM?: string;
    GEMINI_API_KEY?: string;
    GROQ_API_KEY?: string;
    NEXT_PUBLIC_APP_URL?: string;
    NODE_ENV?: string;
    BASETEN_API_KEY?: string;
    COHERE_API_KEY?: string;
    MISTRAL_API_KEY?: string;
    OLLAMA_API_KEY?: string;
    OLLAMA_BASE_URL?: string;
    OBSERVABILITY_ENABLED?: string;
    OBSERVABILITY_SAMPLE_RATE?: string;
    OBSERVABILITY_SERVICE?: string;
    OLLAMA_API_KEY?: string;
    OLLAMA_BASE_URL?: string;
    OPENROUTER_API_KEY?: string;
    POLAR_ACCESS_TOKEN?: string;
    POLAR_ORGANIZATION_ID?: string;
    POLAR_PRODUCT_ID_CORE_MONTHLY?: string;
    POLAR_PRODUCT_ID_CORE_YEARLY?: string;
    POLAR_PRODUCT_ID_SCHOLAR_MONTHLY?: string;
    POLAR_PRODUCT_ID_SCHOLAR_YEARLY?: string;
    POLAR_SERVER?: string;
    POLAR_WEBHOOK_SECRET?: string;
    RESEND_API_KEY?: string;
    REDIS_URL?: string;
    SSE_TOKEN_SECRET?: string;
    UPLOADTHING_TOKEN?: string;
  }
  interface Process {
    env: ProcessEnv;
  }
}

declare const process: NodeJS.Process;
