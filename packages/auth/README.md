# @avenire/auth

Authentication package built around Better Auth.

## Exports

- server/client auth entry points
- auth UI components (`login`, `register`, icons)
- middleware and shared auth types

## Scripts

- `pnpm --filter @avenire/auth auth:generate`: regenerate Better Auth DB schema
- `pnpm --filter @avenire/auth check-types`
- `pnpm --filter @avenire/auth lint`

## Dependencies

- `@avenire/database` for auth tables and persistence
- `@avenire/emailer` for auth-related emails
- `@avenire/ui` for shared UI primitives
