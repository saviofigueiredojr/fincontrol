# Contributing

Obrigado por considerar contribuir com o FinControl.

## Antes de abrir PR

- abra uma issue ou descreva claramente o problema que esta resolvendo
- evite misturar refactor, UI e regra de negocio na mesma PR
- nao inclua dados reais, extratos reais ou credenciais em commits

## Setup local

1. Instale dependencias com `npm install`
2. Copie `.env.example` para `.env`
3. Rode `npm run generate`
4. Rode `npm run db:push`
5. Rode `npm run db:seed`
6. Suba o app com `npm run dev`

## Padrao de mudanca

- prefira route handlers finos em `src/app/api`
- mova regra de negocio para `src/modules`
- valide payloads com `zod`
- preserve contratos de API existentes, a menos que a mudanca deixe isso explicito
- mantenha o isolamento por `household` em qualquer nova query sensivel

## Checklist minimo

- `npm run typecheck`
- `npm run build`
- atualizar documentacao quando a mudanca alterar setup, arquitetura ou comportamento

## Pull requests

PRs pequenas e focadas sao muito mais faceis de revisar.

Se a mudanca tocar autenticacao, autorizacao, importacao de arquivo ou visibilidade de dados, inclua no texto da PR:

- risco esperado
- como testar
- impacto no contrato de API
