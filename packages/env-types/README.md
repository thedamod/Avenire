# @avenire/env-types

Generated environment variable typings shared across the monorepo.

## Files

- `index.d.ts`: generated global env type declarations
- `src/generate-env-types.mjs`: generation script

## Script

- `pnpm --filter @avenire/env-types generate`

## Usage

Run generation after updating `.env.example` so all packages/apps get updated type safety.
