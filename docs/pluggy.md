# Integração Pluggy / Meu Pluggy

Integração privada para sincronizar dados do internet banking via Pluggy e revisar antes de importar para o orçamento.

## Variáveis de ambiente

- `PLUGGY_CLIENT_ID`: client id da área de API do Pluggy / Meu Pluggy.
- `PLUGGY_CLIENT_SECRET`: client secret da área de API do Pluggy / Meu Pluggy.
- `PLUGGY_ENV`: `sandbox` ou `production`, usado apenas como metadado de configuração.
- `PLUGGY_BASE_URL`: opcional; padrão `https://api.pluggy.ai`.
- `PLUGGY_ITEM_IDS`: opcional; lista separada por vírgula de `itemId` para bootstrap automático.
- `PLUGGY_WEBHOOK_SECRET`: opcional; se definido, protege `/api/pluggy/webhook`.

## Fluxo

1. Criar/conectar a instituição no Meu Pluggy.
2. Copiar o `itemId` e cadastrar em `/integracoes/pluggy`, ou preencher `PLUGGY_ITEM_IDS`.
3. Rodar sincronização.
4. Vincular contas Pluggy do tipo `CREDIT` aos cartões existentes no FinControl.
5. Revisar a fila de importação.
6. Importar ou ignorar transações selecionadas.

## Escopo atual

- A sincronização grava em tabelas `Pluggy*` de staging.
- Nenhuma transação entra no orçamento sem ação manual.
- A importação usa deduplicação por `pluggyTransactionId` e sinaliza possível duplicidade por data, valor e descrição.
- Contas de cartão importam para faturas do cartão vinculado.
- A competência de cartão usa heurística inicial: compras após dia 20 entram na competência seguinte.
- Webhook apenas recebe e registra o evento; sync automático por webhook pode ser evoluído depois com mapeamento de usuário/household.
