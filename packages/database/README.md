# @avenire/database

Drizzle-based database layer and schema for Avenire.

## What it includes

- schema definitions in `src/`
- shared DB client exports in `src/index.ts`
- SQL migrations in `drizzle/`
- migration metadata in `drizzle/meta/`

## Scripts

- `pnpm --filter @avenire/database db:generate`: generate migration files
- `pnpm --filter @avenire/database db:migrate`: apply migrations
- `pnpm --filter @avenire/database check-types`
- `pnpm --filter @avenire/database lint`

## Notes

Use this package from backend/server code only.
