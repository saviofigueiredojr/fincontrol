# Architecture

## Overview

FinControl is organized as a Next.js monolith with clear boundaries between:

- UI pages in `src/app/(app)`
- HTTP entrypoints in `src/app/api`
- infrastructure helpers in `src/lib`
- domain-oriented modules in `src/modules`
- persistence schema and seed data in `prisma`

## Current domain boundaries

### `src/modules/auth`

Owns credential authorization concerns:

- client IP extraction
- persistent login attempt tracking
- brute-force protection
- timing-safe authentication flow

`src/lib/auth-options.ts` stays as the NextAuth integration layer, while the module owns the business rules.

### `src/modules/months`

Owns month lifecycle and closing rules:

- month query and closing validation
- closing balance calculation
- goal allocation during month close
- opening balance rollover to the next competencia
- reopen flow

### `src/modules/transactions`

Owns transaction contracts and mutation logic:

- query/body validation with `zod`
- visibility filtering
- installment expansion
- scoped update and delete authorization

The route handlers are intentionally thin and delegate to this module.

### `src/modules/goals`

Owns goal retrieval and update rules:

- household-scoped goal listing
- payload validation for updates
- safe deadline parsing

### `src/modules/import`

Owns credit card import flows:

- form-data validation
- CSV Inter parsing
- OFX parsing
- scoped card ownership checks
- statement reconciliation and total refresh

## Infrastructure

### `src/lib/env.ts`

Central environment validation. The repository should fail fast on invalid configuration instead of producing hidden runtime errors later.

### `src/lib/prisma.ts`

Single Prisma client entrypoint with development-safe reuse.

### `src/lib/session-user.ts`

Shared route helper for authenticated session extraction.

## Public repo posture

This repository is meant to be public, but the deployed app can remain private. That leads to a few principles:

- no real credentials in seed data
- environment variables always injected externally
- architecture and security decisions documented in the repository
- CI validates buildability on every push
- Vercel deploy configuration lives in the repo, but production secrets do not

## Next architectural moves

The next natural modules to extract are:

1. `projection`
2. `recurring`
3. `settings`
4. `credit-cards`

That would complete the move from route-centric logic to domain-centric services.
