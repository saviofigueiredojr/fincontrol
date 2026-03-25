# FinControl

Sistema de controle financeiro para casais, construído com Next.js 14 e SQLite. Projetado para gerenciar finanças pessoais e conjuntas em um cenário de transição — mudança de cidade, unificação de rendas e planejamento de metas.

## Stack

- **Framework**: Next.js 14 (App Router)
- **UI**: Tailwind CSS + Radix UI
- **Banco de dados**: SQLite via Prisma ORM
- **Autenticação**: NextAuth.js (Credentials + JWT)
- **Gráficos**: Recharts
- **Import de faturas**: CSV (Inter) e OFX (universal)

## Funcionalidades

### Dashboard
Visão geral do mês: receitas, despesas, saldo, progresso da meta de reserva de emergência. Gráfico de barras (6 meses), pizza por categoria e orçamento por categoria com barras de progresso.

### Lançamentos
CRUD completo de transações com filtros por competência, titular (meu / dele / conjunto), tipo e categoria. Suporte a parcelas com geração automática de lançamentos futuros.

### Cartões de Crédito
Importação de faturas via CSV (formato Inter) e OFX. Deduplicação automática ao reimportar o mesmo mês. Detecção de parcelas (`Parcela X/Y`) com projeção dos meses seguintes. Resumo de parcelas ativas.

### Divisão de Despesas
Calculadora de divisão com toggle entre **50/50** e **proporcional à renda**. Mostra a parte de cada um nas despesas conjuntas e o saldo livre individual.

### Metas
Acompanhamento da reserva de emergência (R$ 45.000). Barra de progresso, projeção de conclusão e histórico de alocações mensais.

### Fechar Mês
Wizard de 3 etapas: revisar lançamentos, alocar valor para a meta, confirmar e rolar saldo para o próximo mês. Projeção de fluxo de caixa de 12 meses. Meses fechados podem ser reabertos para ajustes.

### Créditos PJ
Gestão de recebíveis de trabalhos extras/clientes. Status por crédito: Recebido, Pendente ou Futuro.

### Despesas Recorrentes
Cadastro de templates (aluguel, água, luz, internet etc.) que geram lançamentos automaticamente a cada mês.

## Regras de Visibilidade

- **Gastos individuais**: visíveis apenas para o dono
- **Gastos conjuntos**: visíveis para ambos os usuários
- **Edição/exclusão**: apenas o dono da transação ou o admin

## Segurança

- Autenticação com bcrypt (cost 10) e JWT
- Rate limiting no login: 5 tentativas → bloqueio de 30 min
- Prisma com queries parametrizadas (sem SQL injection)
- React escapa outputs por padrão (sem XSS)
- CSRF gerenciado automaticamente pelo NextAuth

## Instalação

```bash
# Instalar dependências
npm install

# Gerar o Prisma Client
npx prisma generate

# Criar o banco e aplicar o schema
npx prisma db push

# Popular com dados iniciais
npx tsx prisma/seed.ts

# Iniciar o servidor de desenvolvimento
npm run dev
```

Acesse: http://localhost:3000

## Variáveis de Ambiente

Copie `.env.example` para `.env` e ajuste:

```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="gere-com: openssl rand -base64 32"
NEXTAUTH_URL="http://localhost:3000"
```

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run start` | Servidor de produção |
| `npm run db:push` | Aplicar schema no banco |
| `npm run db:seed` | Popular banco com dados iniciais |
| `npm run db:studio` | Abrir Prisma Studio (GUI do banco) |

## Deploy (Vercel)

Para deploy na Vercel, será necessário trocar o SQLite por um banco hospedado (ex: PostgreSQL via [Neon](https://neon.tech) — free tier). Altere o `provider` no `prisma/schema.prisma` e a `DATABASE_URL` no `.env`.

## Estrutura do Projeto

```
src/
├── app/
│   ├── (app)/              # Páginas autenticadas
│   │   ├── dashboard/
│   │   ├── lancamentos/
│   │   ├── cartoes/
│   │   ├── divisao/
│   │   ├── metas/
│   │   ├── fechar-mes/
│   │   └── creditos/
│   ├── api/                # Rotas de API
│   │   ├── auth/
│   │   ├── transactions/
│   │   ├── cards/
│   │   ├── import/
│   │   ├── goals/
│   │   ├── months/
│   │   ├── settings/
│   │   ├── recurring/
│   │   ├── creditos/
│   │   ├── projection/
│   │   └── dashboard/
│   └── login/
├── components/
│   ├── ui/                 # Componentes base (Button, Card, Badge, Modal, Progress)
│   ├── sidebar.tsx
│   ├── theme-provider.tsx
│   └── providers.tsx
├── lib/
│   ├── prisma.ts
│   ├── auth-options.ts
│   └── utils.ts
└── middleware.ts
```
