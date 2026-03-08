# @avenire/backend

Backend services for Avenire. This app currently hosts:

- the primary HTTP server (`src/server.ts`)
- the ingestion worker process (`src/ingestion-worker.ts`)

## Scripts

- `pnpm --filter @avenire/backend dev`: run API server in watch mode
- `pnpm --filter @avenire/backend dev:ingestion`: run ingestion worker in watch mode
- `pnpm --filter @avenire/backend start`: run API server once
- `pnpm --filter @avenire/backend start:ingestion`: run ingestion worker once
- `pnpm --filter @avenire/backend check-types`: type check
- `pnpm --filter @avenire/backend lint`: lint with Biome

## Dependencies

- `@avenire/database` for DB access
- `@avenire/ingestion` for ingestion pipeline logic
- `hono` + `@hono/node-server` for HTTP runtime
- `redis` for queue/state coordination

## Environment

Uses the shared root `.env` file and generated env types from `@avenire/env-types`.
