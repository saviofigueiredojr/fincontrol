# Vercel Deploy

## Objetivo

Este repositório pode ser publico, enquanto o projeto publicado no Vercel permanece privado.

## Antes de importar

- tenha um banco PostgreSQL externo pronto
- confirme que `prisma/migrations` esta versionado
- gere um `NEXTAUTH_SECRET` com pelo menos 32 caracteres

## Variaveis obrigatorias

```env
DATABASE_URL=
DIRECT_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
```

`NEXTAUTH_URL` deve apontar para a URL final do projeto no Vercel.

## Supabase + Vercel

Se estiver usando Supabase, prefira este arranjo:

- `DATABASE_URL`: Supavisor transaction mode (`6543`) para o app em runtime
- `DIRECT_URL`: Supavisor session mode (`5432`) para `prisma migrate deploy`

Exemplo:

```env
DATABASE_URL="postgresql://USER:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&schema=public"
DIRECT_URL="postgresql://USER:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?schema=public"
NEXTAUTH_SECRET="um-secret-com-32-ou-mais-caracteres"
NEXTAUTH_URL="https://seu-projeto.vercel.app"
```

Evite usar a conexao direta `db.<project-ref>.supabase.co:5432` no Vercel quando seu projeto nao tiver suporte a IPv6.

## Fluxo recomendado

1. Importe o repositório no Vercel
2. Marque o projeto como privado no dashboard do Vercel
3. Configure as variaveis de ambiente de producao e preview
4. Garanta acesso de rede entre Vercel e o PostgreSQL
5. Faça o primeiro deploy

## Como o build esta preparado

- `postinstall` executa `prisma generate`
- `vercel.json` aponta o build para `npm run vercel-build`
- `vercel-build` executa:
  - `prisma generate`
  - `prisma migrate deploy`
  - `next build`

## Checklist rapido

- sem `.env` commitado
- banco de producao separado do banco local
- `NEXTAUTH_SECRET` forte
- seed nunca rodado em producao
- primeiros logins testados apos o deploy
