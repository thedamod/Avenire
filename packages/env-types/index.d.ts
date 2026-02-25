declare namespace NodeJS {
  interface ProcessEnv {
    AUTH_GITHUB_ID?: string;
    AUTH_GITHUB_SECRET?: string;
    AUTH_GOOGLE_ID?: string;
    AUTH_GOOGLE_SECRET?: string;
    AXIOM_DATASET?: string;
    AXIOM_TOKEN?: string;
    BETTER_AUTH_SECRET?: string;
    BETTER_AUTH_URL?: string;
    DATABASE_URL?: string;
    EMAIL_FROM?: string;
    GEMINI_API_KEY?: string;
    GROQ_API_KEY?: string;
    NEXT_PUBLIC_APP_URL?: string;
    NODE_ENV?: string;
    OPENROUTER_API_KEY?: string;
    POLAR_ACCESS_TOKEN?: string;
    POLAR_ORGANIZATION_ID?: string;
    POLAR_WEBHOOK_SECRET?: string;
    RESEND_API_KEY?: string;
    UPLOADTHING_TOKEN?: string;
  }
  interface Process {
    env: ProcessEnv;
  }
}

declare const process: NodeJS.Process;
