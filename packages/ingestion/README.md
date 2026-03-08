# @avenire/ingestion

Ingestion and retrieval engine for Avenire.

## Capabilities

- content ingestion pipelines for files, links, audio/video, OCR, and markdown
- chunking + embedding generation
- retrieval and vector store interfaces
- shared ingestion/retrieval types

## Structure

- `src/ingestion/`: ingest pipeline stages
- `src/retrieval/`: retrieval + vector store logic
- `src/utils/`: process helpers (including ffmpeg safety/wrappers)
- `src/config.ts`: runtime config

## Scripts

- `pnpm --filter @avenire/ingestion build`
- `pnpm --filter @avenire/ingestion check-types`
- `pnpm --filter @avenire/ingestion lint`
