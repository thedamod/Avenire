import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  transpilePackages: [
    "@avenire/ui",
    "@avenire/auth",
    "@avenire/ai",
    "@avenire/storage",
    "@avenire/payments",
    "@avenire/database",
    "@avenire/emailer"
  ]
};

export default nextConfig;
