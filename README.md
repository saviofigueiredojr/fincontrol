# FinControl

[![CI](https://github.com/saviofigueiredojr/fincontrol/actions/workflows/ci.yml/badge.svg)](https://github.com/saviofigueiredojr/fincontrol/actions/workflows/ci.yml)

Workspace de planejamento financeiro familiar construido com Next.js, Prisma e NextAuth.

O projeto centraliza receitas, despesas, cartoes, metas, fechamento mensal e recebimentos PJ em uma unica interface. A proposta e combinar uma experiencia premium de uso com uma arquitetura pragmatica para um household pequeno, mantendo visibilidade compartilhada por padrao e privacidade seletiva quando necessario.

## Visao geral

Projeto pessoal em evolucao, publicado como portfolio tecnico e base de aprendizado.

- fluxo principal funcional para uso local
- preparado para PostgreSQL
- compativel com deploy privado na Vercel usando PostgreSQL hospedado
- CI de build e tipagem para pushes e PRs
- testes automatizados iniciais com Vitest em modulos de dominio
- repositorio publico, com app pensado para deploy privado

`package.json` continua com `"private": true` de proposito, para evitar publish acidental no npm.

## O que o app faz

- Dashboard mensal com receitas, despesas, saldo, categorias e projecao
- CRUD de lancamentos com titular individual ou conjunto
- Marcacao de transacoes secretas
- Importacao de faturas por CSV do Inter e OFX
- Controle de parcelas ativas
- Bot opcional no Telegram para lancamentos por comando e presets clicaveis
- Divisao de despesas em modo `50/50`, proporcional ou personalizado
- Metas financeiras com progresso e aportes
- Fechamento e reabertura de mes
- Gestão de faturamentos PJ em formato Kanban (Falta Emitir, Emitida, Pendente, Pago) com isolamento automático de receitas no Dashboard
- Isolamento por `household`, com nomes exibidos dinamicamente conforme o usuario logado

## Stack

- Next.js 14 + App Router
- React 18 + TypeScript
- Prisma ORM
- PostgreSQL
- NextAuth com `CredentialsProvider` e JWT
- Tailwind CSS + Radix UI
- Recharts

## Arquitetura

O projeto e um monolito web com frontend e backend no mesmo repositorio:

- `src/app/(app)`: telas autenticadas
- `src/app/api`: rotas HTTP via Route Handlers
- `src/lib`: auth, prisma, helpers e regras compartilhadas
- `src/modules`: contratos e servicos por dominio
- `prisma`: schema, migrations e seed

O isolamento de dados e feito por `Household`. Usuarios pertencem a uma casa, e as entidades compartilhadas do planejamento usam `householdId`. As transacoes continuam ligadas ao dono via `userId`, com regras de visibilidade baseadas em `ownership` e `isSecret`. Os recebimentos PJ possuem pipeline próprio (`PjReceipt`) e só impactam o fluxo de caixa real quando consolidados como pagos.

As rotas mais centrais seguem um padrao orientado a dominio:

- validacao de payload com `zod`
- route handlers mais finos
- servicos de dominio em `src/modules`
- validacao centralizada de ambiente
- fechamento mensal, recorrencia, PJ e importacao tratados como fluxos de dominio, nao apenas handlers HTTP

Para uma visao mais tecnica da organizacao do backend, veja [docs/architecture.md](./docs/architecture.md).

## Seguranca atual

O repositorio ja inclui uma base importante de seguranca:

- autenticacao com NextAuth
- senhas com bcrypt
- middleware protegendo rotas autenticadas
- tentativas de login persistidas em banco
- rate limit de login por email + IP
- comparacao dummy hash para reduzir enumeracao por timing
- scoping por `household` nas rotas mais importantes

Ainda assim, trate o projeto como software em evolucao. Antes de expor em producao para internet aberta, vale manter revisao de seguranca, observabilidade e regressao a cada mudanca importante.

Tambem existe uma politica inicial em [SECURITY.md](./SECURITY.md).
Se voce quiser receber contribuicoes externas, veja tambem [CONTRIBUTING.md](./CONTRIBUTING.md).

## Rodando localmente

### Pre-requisitos

- Node `22.x`
- PostgreSQL acessivel pela sua maquina

Se quiser usar a mesma versao de Node do projeto:

```bash
nvm use
```

### 1. Instale as dependencias

```bash
npm install
```

### 2. Configure o ambiente

Use o arquivo de exemplo:

```bash
cp .env.example .env
```

Variaveis esperadas:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:6543/postgres?pgbouncer=true&connection_limit=1&schema=public"
DIRECT_URL="postgresql://USER:PASSWORD@HOST:5432/postgres?schema=public"
NEXTAUTH_SECRET="replace-with-a-32-plus-character-secret-value"
NEXTAUTH_URL="http://localhost:3000"
# Necessário para habilitar /api/cron/pj-retainers com segurança
CRON_SECRET="replace-with-a-long-random-secret"

# Opcional: bot do Telegram
TELEGRAM_BOT_TOKEN=""
TELEGRAM_WEBHOOK_SECRET=""
TELEGRAM_ALLOWED_CHAT_IDS=""
TELEGRAM_CHAT_OWNERSHIP_MAP=""
TELEGRAM_ACTOR_EMAIL=""
```

Uso recomendado com Supabase:

- `DATABASE_URL`: Supavisor transaction mode (`6543`) para runtime em ambientes serverless
- `DIRECT_URL`: Supavisor session mode (`5432`) para `prisma migrate` e demais comandos do Prisma CLI

Se voce usar a conexao direta `db.<project-ref>.supabase.co:5432`, ela pode falhar em ambientes sem IPv6, como o build do Vercel.

Para gerar um secret forte:

```bash
openssl rand -base64 32
```

### 3. Gere o client do Prisma e suba o banco

Fluxo simples:

```bash
npm run generate
npm run db:push
npm run db:seed
```

Se quiser rodar local sem encostar na sua base atual, use outro schema no `.env`, por exemplo:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:6543/postgres?pgbouncer=true&connection_limit=1&schema=fincontrol_local"
DIRECT_URL="postgresql://USER:PASSWORD@HOST:5432/postgres?schema=fincontrol_local"
```

Se a URL ja tiver outros parametros, adicione o schema com `&schema=fincontrol_local`.

### 4. Inicie o app

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Credenciais do seed

O seed atual cria tres usuarios de desenvolvimento com dados demo:

- `usuario1@fincontrol.local` / `Seed@2026!`
- `usuario2@fincontrol.local` / `Seed@2026!`
- `isolado@fincontrol.local` / `Seed@2026!`

O terceiro usuario fica em outro `household` e serve para validar isolamento de dados localmente. O seed publico foi sanitizado para nao refletir dados pessoais ou financeiros reais.

## Scripts uteis

- `npm run dev`: sobe o app em desenvolvimento
- `npm run build`: gera build de producao
- `npm run start`: sobe a build
- `npm run lint`: roda o lint do Next.js
- `npm run typecheck`: valida tipos TypeScript
- `npm run generate`: gera o Prisma Client
- `npm run vercel-build`: gera client, aplica migrations e faz o build pensado para Vercel
- `npm run db:push`: sincroniza o schema com o banco
- `npm run db:seed`: popula o banco com dados de exemplo
- `npm run db:studio`: abre o Prisma Studio
- `npm run ci`: roda o conjunto minimo usado na CI
- `npm run telegram:sync`: registra comandos e webhook do bot do Telegram

## Telegram bot

O bot do Telegram pode ser usado em dois modos:

- comandos completos, como `/gasto 675,24 | Moradia | Condomínio`
- fluxo guiado com teclado clicavel, escolhendo um preset e digitando apenas o valor

O estado temporario do chat e as configuracoes sensiveis do bot ficam no backend em settings privados do household e nao sao expostos por `GET /api/settings`.

## Testes

O repositorio ja inclui uma base inicial de testes com Vitest para regras de dominio como:

- settle-up do fechamento mensal
- benchmark de reserva de emergencia
- automacoes PJ
- fallback/categorizacao de importacao

Ainda nao ha uma cobertura ampla de interface e integracao fim a fim.

## Rotas principais

- `/dashboard`
- `/lancamentos`
- `/cartoes`
- `/divisao`
- `/metas`
- `/fechar-mes`
- `/creditos`
- `/login`

## API em alto nivel

- `/api/auth/[...nextauth]`
- `/api/transactions`
- `/api/transactions/[id]`
- `/api/cards`
- `/api/cards/[id]`
- `/api/cards/[id]/transactions`
- `/api/cards/installments`
- `/api/import`
- `/api/dashboard`
- `/api/months`
- `/api/months/[competencia]/reopen`
- `/api/goals`
- `/api/settings`
- `/api/recurring`
- `/api/projection`
- `/api/creditos`
- `/api/creditos/[id]`
- `/api/household/context`
- `/api/telegram/webhook`
- `/api/cron/pj-retainers`

Referencia detalhada de metodos, payloads e respostas:

- [docs/api.md](./docs/api.md)
- runtime: `/api`
- especificacao OpenAPI: `/api/openapi`

## Estrutura resumida

```txt
fincontrol/
  .github/
    workflows/
  docs/
  prisma/
  src/
    app/
      (app)/
      api/
      login/
    components/
    lib/
    modules/
    types/
```

## Deploy

O projeto ja usa PostgreSQL no Prisma, entao o caminho mais direto para deploy e:

1. provisionar um banco PostgreSQL hospedado
2. configurar `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET` e `NEXTAUTH_URL`
3. importar o repositório no Vercel
4. deixar o projeto privado no dashboard do Vercel
5. usar o build configurado em `vercel.json`

Exemplo de passo de build:

```bash
npx prisma generate && npx prisma migrate deploy && next build
```

Guia detalhado: [docs/deploy-vercel.md](./docs/deploy-vercel.md).

## Limites atuais

- cobertura de testes ainda parcial
- autenticacao apenas por credenciais
- sem integracao com Open Banking
- produto ainda muito orientado ao caso de uso pessoal/familiar
- deploy publico nao e o objetivo; a recomendacao e manter a aplicacao privada
