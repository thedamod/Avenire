# @avenire/emails

React Email templates used by the Avenire email delivery layer.

## Scripts

- `pnpm --filter @avenire/emails dev`: local template preview (`react-email`)
- `pnpm --filter @avenire/emails build`: build templates/types
- `pnpm --filter @avenire/emails check-types`: type check
- `pnpm --filter @avenire/emails lint`: lint with Biome

## Structure

- `src/`: email template components and exports

## Notes

This package is consumed by `@avenire/emailer`, which handles sending.
