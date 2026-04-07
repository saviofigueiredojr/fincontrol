# API Reference

## Conventions

- Base path: `/api`
- Authentication: all routes require a valid NextAuth session unless stated otherwise
- Format: JSON by default, except file upload endpoints that use `multipart/form-data`
- Multi-user scoping: household data is scoped server-side; clients do not send `householdId`
- Runtime index: `GET /api`
- OpenAPI spec: `GET /api/openapi`
- Common error shape:

```json
{ "error": "Mensagem de erro" }
```

## Authentication

### `GET|POST /api/auth/[...nextauth]`

NextAuth credential flow and session endpoints.

- Public route
- Used by the login screen and session management

## Telegram bot

### `POST /api/telegram/webhook`

Receives Telegram Bot API updates.

- Public route, but protected by the `x-telegram-bot-api-secret-token` header
- Does not use NextAuth session
- Processes command-driven flows for:
  - `/gasto`
  - `/receita`
  - `/recorrente`
  - `/cartoes`
  - `/whoami`
- Also supports reply-keyboard flows for preset-based expense and income creation

Configuration sources:

- Environment variables:
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_WEBHOOK_SECRET`
  - `TELEGRAM_ALLOWED_CHAT_IDS`
  - `TELEGRAM_CHAT_OWNERSHIP_MAP`
  - `TELEGRAM_ACTOR_EMAIL`
- Or household settings with the same keys, stored server-side

Notes:

- `GET /api/settings` intentionally omits these Telegram keys because they are treated as sensitive configuration
- Temporary chat workflow state is also stored under private `telegram_*` settings and is not returned by `GET /api/settings`
- If a chat is not authorized, the bot only returns pairing/help information and will not create transactions

## Household context

### `GET /api/household/context`

Returns the current household display context for the logged-in user.

Response shape:

```json
{
  "householdId": "string",
  "self": { "id": "string", "name": "string", "email": "string" },
  "partner": { "id": "string", "name": "string", "email": "string" } | null,
  "members": [{ "id": "string", "name": "string", "email": "string" }]
}
```

## Dashboard and planning

### `GET /api/dashboard?competencia=YYYY-MM`

Returns the monthly dashboard payload.

Includes:

- `receitas`, `despesas`, `saldo`
- `meta`
- `chartData` for recent months
- `topCategories` / `despesasPorCategoria`
- `topIncomeCategories` / `receitasPorCategoria`
- `activeInstallments`
- `budgetProgress`

### `GET /api/projection?months=6&competencia=YYYY-MM`

Returns projected cash flow for upcoming months.

Query params:

- `months`: positive integer, capped at `36`
- `competencia`: optional start month in `YYYY-MM`

Each item includes:

- `competencia`
- `projectedIncome`
- `projectedExpense`
- `projectedBalance`
- `knownInstallments`

### `GET /api/months?competencia=YYYY-MM`

Returns the consolidated month summary used by the month-closing flow.

### `POST /api/months`

Closes a month.

Body:

```json
{
  "competencia": "2026-03",
  "metaAllocation": 0
}
```

### `POST /api/months/[competencia]/reopen`

Reopens a previously closed month and rolls back related month-close effects.

## Transactions

### `GET /api/transactions`

Lists visible transactions for the current session.

Query params:

- `competencia=YYYY-MM`
- `ownership=mine|partner|joint`
- `type=income|expense|transfer`
- `category=<string>`
- `search=<string>`

### `POST /api/transactions`

Creates a transaction or an installment-expanded set of transactions.

Body:

```json
{
  "date": "2026-03-30",
  "competencia": "2026-03",
  "description": "Supermercado",
  "category": "Alimentacao",
  "amount": 120.5,
  "type": "expense",
  "ownership": "mine",
  "installmentCurrent": null,
  "installmentTotal": null,
  "isSecret": false,
  "cardId": null
}
```

Notes:

- `cardId` is allowed only for `expense`
- card-linked transactions are attached to the proper statement automatically

### `PUT /api/transactions/[id]`

Updates an existing transaction.

Supported fields include:

- `date`, `competencia`, `description`, `category`, `amount`
- `type`, `ownership`
- `installmentCurrent`, `installmentTotal`
- `isSecret`
- `cardId`, `cardStatementId`
- `isRecurring`, `recurringId`
- `applyToSeries`

### `DELETE /api/transactions/[id]`

Deletes a transaction.

Optional query param:

- `scope=series`: when the target transaction belongs to a recurring series, removes the full series instead of only one occurrence

## Recurring transactions

### `GET /api/recurring`

Lists recurring templates for the current household.

### `POST /api/recurring`

Creates a recurring template and materializes future occurrences.

Body:

```json
{
  "description": "Psicologo",
  "category": "Saude",
  "amount": 480,
  "type": "expense",
  "ownership": "partner",
  "dayOfMonth": 30,
  "startDate": "2026-03",
  "endDate": null,
  "interval": "monthly",
  "intervalCount": 1,
  "isVariable": false,
  "cardId": null
}
```

Rules:

- `startDate` and `endDate` use `YYYY-MM`
- `interval` supports `monthly` and `yearly`
- `cardId` is valid only for `expense`

### `PUT /api/recurring`

Updates a recurring template by `id`.

Body pattern:

```json
{
  "id": "template-id",
  "description": "Novo texto",
  "amount": 500
}
```

### `DELETE /api/recurring?id=<template-id>`

Soft-deactivates a recurring template.

## Credit cards and statements

### `GET /api/cards`

Lists credit cards owned by the logged-in user.

Each card includes:

- `id`, `name`, `bank`, `closingDay`, `dueDay`
- `linkedTransactionsCount`
- `activeInstallmentsCount`
- `statementsCount`
- `canDelete`

### `POST /api/cards`

Creates a new credit card.

Body:

```json
{
  "name": "Inter",
  "bank": "Inter",
  "closingDay": 10,
  "dueDay": 15
}
```

### `PUT /api/cards/[id]`

Updates a credit card.

### `DELETE /api/cards/[id]`

Deletes a credit card if there are no linked statements or transactions.

Conflict response (`409`) includes:

- `statementsCount`
- `linkedTransactionsCount`

### `GET /api/cards/[id]/transactions?competencia=YYYY-MM`

Lists transactions linked to one card, optionally filtered by month.

### `GET /api/cards/installments?competencia=YYYY-MM`

Returns grouped installment information for the current user cards.

Each item includes:

- `description`
- `currentInstallment`
- `totalInstallments`
- `monthlyAmount`
- `remainingMonths`
- `totalRemaining`

### `POST /api/import`

Imports a card statement file.

Content type:

- `multipart/form-data`

Fields:

- `file`: required `.csv` or `.ofx`
- `cardId`: required
- `competencia`: optional `YYYY-MM`

Current behavior:

- Inter CSV and OFX import are supported
- statement reimport replaces previously imported content for that card/month
- future installments derived from the imported statement are rebuilt

## Goals

### `GET /api/goals`

Lists household goals.

### `PUT /api/goals`

Updates one goal by `id`.

Body supports:

- `id`
- `name`
- `targetAmount`
- `currentAmount`
- `deadline`

## Settings

### `GET /api/settings`

Returns a flat key-value map of household settings.

### `PUT /api/settings`

Supports either a single setting or a batch.

Single:

```json
{ "key": "budget_moradia", "value": "3200" }
```

Batch:

```json
{
  "settings": [
    { "key": "primary_income", "value": "7000" },
    { "key": "partner_income", "value": "6500" }
  ]
}
```

## PJ credits

### `GET /api/creditos`

Lists PJ receipts visible to the current household.

Response shape:

```json
{ "credits": [...] }
```

### `POST /api/creditos`

Creates a PJ credit entry.

Body:

```json
{
  "clientName": "Cliente X",
  "description": "Projeto",
  "amount": 2500,
  "dueDate": "2026-04-10",
  "status": "unissued",
  "competencia": "2026-04"
}
```

Allowed statuses:

- `unissued`
- `issued`
- `pending`
- `paid`

### `PATCH /api/creditos/[id]`

Updates the PJ credit status.

Body:

```json
{ "status": "paid" }
```

When moving to `paid`, the route may automatically create:

- one income transaction for the receipt
- one expense transaction for tax provisioning, when applicable

### `DELETE /api/creditos/[id]`

Deletes a PJ credit and removes its linked transaction when present.

## Cron

### `GET /api/cron/pj-retainers`

Generates PJ receipts from active retainers.

Authentication:

- protected by `Authorization: Bearer <CRON_SECRET>`
- if `CRON_SECRET` is missing, the route stays disabled and returns `503`

Response shape:

```json
{ "success": true, "generated": 0 }
```
