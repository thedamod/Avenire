# @avenire/web

Main Next.js web application for Avenire.

## What lives here

- App Router pages and API routes in `src/app`
- dashboard/chat/file UX in `src/components`
- frontend data helpers in `src/lib`
- state stores in `src/stores`

## Scripts

- `pnpm --filter @avenire/web dev`: run Next.js dev server on port 3000
- `pnpm --filter @avenire/web build`: production build
- `pnpm --filter @avenire/web start`: run production server
- `pnpm --filter @avenire/web check-types`: type check
- `pnpm --filter @avenire/web lint`: lint with Biome

## Key integrations

- `@avenire/ai` for model/stream orchestration
- `@avenire/auth` for auth flows
- `@avenire/ingestion` for ingestion + retrieval APIs
- `@avenire/ui` shared design system components
- `@avenire/storage` for uploads/storage helpers
