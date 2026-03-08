import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  serverExternalPackages: [
    "@ai-sdk/baseten",
    "@basetenlabs/performance-client"
  ],
  transpilePackages: [
    "@avenire/ui",
    "@avenire/auth",
    "@avenire/ai",
    "@avenire/storage",
    "@avenire/payments",
    "@avenire/database",
    "@avenire/emailer",
    "@avenire/ingestion"
  ]
};

export default nextConfig;
