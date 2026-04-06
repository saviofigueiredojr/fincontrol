type ApiParameter = {
  name: string;
  in: "path" | "query";
  required?: boolean;
  description: string;
  schema: Record<string, unknown>;
};

type ApiRequestBody = {
  description: string;
  required?: boolean;
  schema: Record<string, unknown>;
};

type ApiMethodDoc = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  summary: string;
  description: string;
  parameters?: ApiParameter[];
  requestBody?: ApiRequestBody;
  responses?: Record<string, string>;
};

type ApiEndpointDoc = {
  path: string;
  tag: string;
  auth: "public" | "session" | "cron";
  description: string;
  methods: ApiMethodDoc[];
};

const competenciaParam: ApiParameter = {
  name: "competencia",
  in: "query",
  required: false,
  description: "Competência no formato YYYY-MM.",
  schema: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
};

const monthPathParam: ApiParameter = {
  name: "competencia",
  in: "path",
  required: true,
  description: "Competência no formato YYYY-MM.",
  schema: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
};

const idPathParam: ApiParameter = {
  name: "id",
  in: "path",
  required: true,
  description: "Identificador do recurso.",
  schema: { type: "string" },
};

export const apiDocs: ApiEndpointDoc[] = [
  {
    path: "/api/auth/[...nextauth]",
    tag: "Auth",
    auth: "public",
    description: "Endpoints gerenciados pelo NextAuth para login, sessão e CSRF.",
    methods: [
      {
        method: "GET",
        summary: "Consultar sessão, providers e CSRF",
        description: "Usado pelo fluxo de autenticação baseado em credenciais.",
        responses: {
          "200": "Resposta do NextAuth para sessão ou metadados de autenticação.",
        },
      },
      {
        method: "POST",
        summary: "Efetuar login e callbacks de autenticação",
        description: "Recebe as submissões do fluxo de login do NextAuth.",
        responses: {
          "200": "Autenticação processada pelo NextAuth.",
          "401": "Credenciais inválidas ou usuário bloqueado temporariamente.",
        },
      },
    ],
  },
  {
    path: "/api/telegram/webhook",
    tag: "Telegram",
    auth: "public",
    description:
      "Webhook do bot do Telegram. Não usa sessão web; a autenticação ocorre pelo header secreto configurado no setWebhook.",
    methods: [
      {
        method: "POST",
        summary: "Receber mensagens do bot",
        description:
          "Processa comandos como /gasto, /receita, /recorrente, /cartoes e /whoami.",
        requestBody: {
          required: true,
          description: "Payload padrão do Telegram Bot API para updates de mensagem.",
          schema: {
            type: "object",
            properties: {
              update_id: { type: "integer" },
              message: {
                type: "object",
                properties: {
                  message_id: { type: "integer" },
                  text: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": "Update processado ou ignorado.",
          "401": "Secret token do webhook inválido.",
          "503": "Integração Telegram ainda não configurada.",
        },
      },
    ],
  },
  {
    path: "/api/household/context",
    tag: "Household",
    auth: "session",
    description: "Retorna o contexto de exibição do household do usuário logado.",
    methods: [
      {
        method: "GET",
        summary: "Obter contexto do household",
        description: "Fornece self, partner e members para personalização de UI.",
        responses: {
          "200": "Contexto do household e nomes dos membros.",
          "401": "Sessão inválida.",
        },
      },
    ],
  },
  {
    path: "/api/dashboard",
    tag: "Dashboard",
    auth: "session",
    description: "Agregados mensais de dashboard, categorias, meta e parcelas ativas.",
    methods: [
      {
        method: "GET",
        summary: "Consultar dashboard mensal",
        description: "Retorna receitas, despesas, saldo, gráficos, categorias e parcelas da competência.",
        parameters: [
          {
            ...competenciaParam,
            required: true,
            description: "Competência obrigatória no formato YYYY-MM.",
          },
        ],
        responses: {
          "200": "Payload completo do dashboard.",
          "400": "Competência ausente ou inválida.",
          "401": "Sessão inválida.",
        },
      },
    ],
  },
  {
    path: "/api/projection",
    tag: "Projection",
    auth: "session",
    description: "Projeção de fluxo de caixa baseada em recorrências, parcelas e recebíveis PJ.",
    methods: [
      {
        method: "GET",
        summary: "Projetar próximos meses",
        description: "Retorna meses futuros com projectedIncome, projectedExpense e projectedBalance.",
        parameters: [
          {
            name: "months",
            in: "query",
            required: false,
            description: "Quantidade de meses a projetar, com máximo de 36.",
            schema: { type: "integer", minimum: 1, maximum: 36 },
          },
          {
            ...competenciaParam,
            description: "Competência inicial opcional para a projeção.",
          },
        ],
        responses: {
          "200": "Lista de meses projetados.",
          "400": "Parâmetros inválidos.",
          "401": "Sessão inválida.",
        },
      },
    ],
  },
  {
    path: "/api/months",
    tag: "Months",
    auth: "session",
    description: "Resumo mensal consolidado e fechamento de mês.",
    methods: [
      {
        method: "GET",
        summary: "Consultar resumo do mês",
        description: "Retorna o resumo consolidado usado pela tela de fechamento.",
        parameters: [
          {
            ...competenciaParam,
            required: true,
            description: "Competência obrigatória no formato YYYY-MM.",
          },
        ],
        responses: {
          "200": "Resumo do mês.",
          "400": "Competência inválida.",
          "401": "Sessão inválida.",
        },
      },
      {
        method: "POST",
        summary: "Fechar mês",
        description: "Fecha a competência, calcula saldos e registra aporte na meta.",
        requestBody: {
          required: true,
          description: "Competência e alocação para a meta.",
          schema: {
            type: "object",
            required: ["competencia"],
            properties: {
              competencia: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
              metaAllocation: { type: "number", minimum: 0 },
            },
          },
        },
        responses: {
          "200": "Mês fechado com sucesso.",
          "400": "Payload inválido ou mês já fechado.",
          "401": "Sessão inválida.",
        },
      },
    ],
  },
  {
    path: "/api/months/[competencia]/reopen",
    tag: "Months",
    auth: "session",
    description: "Reabre uma competência previamente fechada.",
    methods: [
      {
        method: "POST",
        summary: "Reabrir mês",
        description: "Desfaz efeitos do fechamento e reabre a competência.",
        parameters: [monthPathParam],
        responses: {
          "200": "Mês reaberto com sucesso.",
          "400": "Competência inválida ou mês já aberto.",
          "401": "Sessão inválida.",
          "404": "Fechamento não encontrado.",
        },
      },
    ],
  },
  {
    path: "/api/transactions",
    tag: "Transactions",
    auth: "session",
    description: "Consulta e criação de lançamentos com suporte a parcelas e vínculo com cartão.",
    methods: [
      {
        method: "GET",
        summary: "Listar lançamentos",
        description: "Retorna transações visíveis ao usuário logado, com filtros opcionais.",
        parameters: [
          { ...competenciaParam, description: "Filtra por competência." },
          {
            name: "ownership",
            in: "query",
            required: false,
            description: "Filtra por ownership.",
            schema: { type: "string", enum: ["mine", "partner", "joint"] },
          },
          {
            name: "type",
            in: "query",
            required: false,
            description: "Filtra por tipo.",
            schema: { type: "string", enum: ["income", "expense", "transfer"] },
          },
          {
            name: "category",
            in: "query",
            required: false,
            description: "Filtra por categoria textual.",
            schema: { type: "string" },
          },
          {
            name: "search",
            in: "query",
            required: false,
            description: "Busca em descrição e nome do cartão.",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": "Lista de transações.",
          "400": "Parâmetros inválidos.",
          "401": "Sessão inválida.",
        },
      },
      {
        method: "POST",
        summary: "Criar lançamento",
        description: "Cria um lançamento individual ou expande parcelas quando informado.",
        requestBody: {
          required: true,
          description: "Payload do lançamento.",
          schema: {
            type: "object",
            required: ["date", "competencia", "description", "category", "amount", "type", "ownership"],
            properties: {
              date: { type: "string", format: "date" },
              competencia: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
              description: { type: "string" },
              category: { type: "string" },
              amount: { type: "number", minimum: 0.01 },
              type: { type: "string", enum: ["income", "expense", "transfer"] },
              ownership: { type: "string", enum: ["mine", "partner", "joint"] },
              installmentCurrent: { type: ["integer", "null"] },
              installmentTotal: { type: ["integer", "null"] },
              isSecret: { type: "boolean" },
              cardId: { type: ["string", "null"] },
            },
          },
        },
        responses: {
          "201": "Lançamento criado.",
          "400": "Payload inválido.",
          "401": "Sessão inválida.",
        },
      },
    ],
  },
  {
    path: "/api/transactions/[id]",
    tag: "Transactions",
    auth: "session",
    description: "Atualização e exclusão de um lançamento específico.",
    methods: [
      {
        method: "PUT",
        summary: "Atualizar lançamento",
        description: "Permite atualização pontual ou em série, quando aplicável.",
        parameters: [idPathParam],
        requestBody: {
          required: true,
          description: "Payload parcial do lançamento.",
          schema: {
            type: "object",
            properties: {
              date: { type: "string", format: "date" },
              competencia: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
              description: { type: "string" },
              category: { type: "string" },
              amount: { type: "number", minimum: 0.01 },
              type: { type: "string", enum: ["income", "expense", "transfer"] },
              ownership: { type: "string", enum: ["mine", "partner", "joint"] },
              isSecret: { type: "boolean" },
              cardId: { type: ["string", "null"] },
              applyToSeries: { type: "boolean" },
            },
          },
        },
        responses: {
          "200": "Lançamento atualizado.",
          "400": "Payload inválido.",
          "401": "Sessão inválida.",
          "404": "Lançamento não encontrado.",
        },
      },
      {
        method: "DELETE",
        summary: "Excluir lançamento",
        description: "Exclui um lançamento ou a série inteira, quando `scope=series`.",
        parameters: [
          idPathParam,
          {
            name: "scope",
            in: "query",
            required: false,
            description: "Usar `series` para excluir toda a recorrência.",
            schema: { type: "string", enum: ["single", "series"] },
          },
        ],
        responses: {
          "200": "Lançamento excluído.",
          "401": "Sessão inválida.",
          "404": "Lançamento não encontrado.",
        },
      },
    ],
  },
  {
    path: "/api/recurring",
    tag: "Recurring",
    auth: "session",
    description: "CRUD operacional de recorrências com materialização de ocorrências futuras.",
    methods: [
      {
        method: "GET",
        summary: "Listar recorrências",
        description: "Retorna templates recorrentes do household atual.",
        responses: {
          "200": "Lista de recorrências.",
          "401": "Sessão inválida.",
        },
      },
      {
        method: "POST",
        summary: "Criar recorrência",
        description: "Cria o template e gera as ocorrências futuras para o horizonte padrão.",
        requestBody: {
          required: true,
          description: "Configuração da recorrência.",
          schema: {
            type: "object",
            required: ["description", "category", "amount", "type", "ownership", "dayOfMonth", "startDate"],
            properties: {
              description: { type: "string" },
              category: { type: "string" },
              amount: { type: "number", minimum: 0.01 },
              type: { type: "string", enum: ["income", "expense"] },
              ownership: { type: "string", enum: ["mine", "partner", "joint"] },
              dayOfMonth: { type: "integer", minimum: 1, maximum: 31 },
              startDate: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
              endDate: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}$" },
              interval: { type: "string", enum: ["monthly", "yearly"] },
              intervalCount: { type: "integer", minimum: 1 },
              isVariable: { type: "boolean" },
              cardId: { type: ["string", "null"] },
            },
          },
        },
        responses: {
          "201": "Recorrência criada.",
          "400": "Payload inválido.",
          "401": "Sessão inválida.",
          "404": "Cartão não encontrado.",
        },
      },
      {
        method: "PUT",
        summary: "Atualizar recorrência",
        description: "Atualiza um template recorrente existente por `id`.",
        requestBody: {
          required: true,
          description: "Payload parcial com `id` obrigatório.",
          schema: {
            type: "object",
            required: ["id"],
            properties: {
              id: { type: "string" },
              description: { type: "string" },
              category: { type: "string" },
              amount: { type: "number", minimum: 0.01 },
              type: { type: "string", enum: ["income", "expense"] },
              ownership: { type: "string", enum: ["mine", "partner", "joint"] },
              dayOfMonth: { type: "integer", minimum: 1, maximum: 31 },
              startDate: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
              endDate: { type: ["string", "null"] },
              interval: { type: "string", enum: ["monthly", "yearly"] },
              intervalCount: { type: "integer", minimum: 1 },
              isVariable: { type: "boolean" },
              isActive: { type: "boolean" },
            },
          },
        },
        responses: {
          "200": "Recorrência atualizada.",
          "400": "Payload inválido.",
          "401": "Sessão inválida.",
          "404": "Template não encontrado.",
        },
      },
      {
        method: "DELETE",
        summary: "Desativar recorrência",
        description: "Desativa um template recorrente por query string `id`.",
        parameters: [
          {
            name: "id",
            in: "query",
            required: true,
            description: "Identificador do template recorrente.",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": "Recorrência desativada.",
          "400": "Parâmetro ausente ou inválido.",
          "401": "Sessão inválida.",
          "404": "Template não encontrado.",
        },
      },
    ],
  },
  {
    path: "/api/cards",
    tag: "Cards",
    auth: "session",
    description: "Cartões do usuário logado com estatísticas de uso.",
    methods: [
      {
        method: "GET",
        summary: "Listar cartões",
        description: "Retorna cartões com contadores de faturas, lançamentos e parcelas ativas.",
        responses: {
          "200": "Lista de cartões.",
          "401": "Sessão inválida.",
        },
      },
      {
        method: "POST",
        summary: "Criar cartão",
        description: "Cria um novo cartão de crédito para o usuário logado.",
        requestBody: {
          required: true,
          description: "Dados do cartão.",
          schema: {
            type: "object",
            required: ["name", "bank", "closingDay", "dueDay"],
            properties: {
              name: { type: "string" },
              bank: { type: "string" },
              closingDay: { type: "integer", minimum: 1, maximum: 31 },
              dueDay: { type: "integer", minimum: 1, maximum: 31 },
            },
          },
        },
        responses: {
          "201": "Cartão criado.",
          "400": "Payload inválido.",
          "401": "Sessão inválida.",
        },
      },
    ],
  },
  {
    path: "/api/cards/[id]",
    tag: "Cards",
    auth: "session",
    description: "Atualização e exclusão segura de cartões.",
    methods: [
      {
        method: "PUT",
        summary: "Atualizar cartão",
        description: "Atualiza os dados básicos do cartão.",
        parameters: [idPathParam],
        requestBody: {
          required: true,
          description: "Dados do cartão.",
          schema: {
            type: "object",
            required: ["name", "bank", "closingDay", "dueDay"],
            properties: {
              name: { type: "string" },
              bank: { type: "string" },
              closingDay: { type: "integer", minimum: 1, maximum: 31 },
              dueDay: { type: "integer", minimum: 1, maximum: 31 },
            },
          },
        },
        responses: {
          "200": "Cartão atualizado.",
          "400": "Payload inválido.",
          "401": "Sessão inválida.",
          "404": "Cartão não encontrado.",
        },
      },
      {
        method: "DELETE",
        summary: "Excluir cartão",
        description: "Exclui o cartão apenas se não houver faturas ou lançamentos vinculados.",
        parameters: [idPathParam],
        responses: {
          "200": "Cartão excluído.",
          "401": "Sessão inválida.",
          "404": "Cartão não encontrado.",
          "409": "Cartão em uso por faturas ou lançamentos.",
        },
      },
    ],
  },
  {
    path: "/api/cards/[id]/transactions",
    tag: "Cards",
    auth: "session",
    description: "Extrato transacional de um cartão específico.",
    methods: [
      {
        method: "GET",
        summary: "Listar transações de um cartão",
        description: "Retorna transações vinculadas ao cartão, opcionalmente filtradas por competência.",
        parameters: [idPathParam, competenciaParam],
        responses: {
          "200": "Lista de transações do cartão.",
          "400": "Parâmetros inválidos.",
          "401": "Sessão inválida.",
          "404": "Cartão não encontrado.",
        },
      },
    ],
  },
  {
    path: "/api/cards/installments",
    tag: "Cards",
    auth: "session",
    description: "Resumo agrupado de parcelas ativas por compra parcelada.",
    methods: [
      {
        method: "GET",
        summary: "Listar parcelas agrupadas",
        description: "Retorna parcelas agrupadas, meses restantes e saldo remanescente.",
        parameters: [competenciaParam],
        responses: {
          "200": "Lista de parcelas agrupadas.",
          "400": "Parâmetros inválidos.",
          "401": "Sessão inválida.",
        },
      },
    ],
  },
  {
    path: "/api/import",
    tag: "Import",
    auth: "session",
    description: "Importação de faturas por CSV ou OFX.",
    methods: [
      {
        method: "POST",
        summary: "Importar fatura",
        description: "Importa a fatura de um cartão e reconcilia os lançamentos derivados.",
        requestBody: {
          required: true,
          description: "Multipart com arquivo e identificação do cartão.",
          schema: {
            type: "object",
            required: ["file", "cardId"],
            properties: {
              file: { type: "string", format: "binary" },
              cardId: { type: "string" },
              competencia: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
            },
          },
        },
        responses: {
          "200": "Importação concluída.",
          "400": "Arquivo ou payload inválido.",
          "401": "Sessão inválida.",
          "404": "Cartão não encontrado.",
        },
      },
    ],
  },
  {
    path: "/api/goals",
    tag: "Goals",
    auth: "session",
    description: "Consulta e atualização de metas financeiras do household.",
    methods: [
      {
        method: "GET",
        summary: "Listar metas",
        description: "Retorna metas financeiras do household atual.",
        responses: {
          "200": "Lista de metas.",
          "401": "Sessão inválida.",
        },
      },
      {
        method: "PUT",
        summary: "Atualizar meta",
        description: "Atualiza uma meta existente por `id`.",
        requestBody: {
          required: true,
          description: "Payload parcial da meta.",
          schema: {
            type: "object",
            required: ["id"],
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              targetAmount: { type: "number", minimum: 0 },
              currentAmount: { type: "number", minimum: 0 },
              deadline: { type: ["string", "null"] },
            },
          },
        },
        responses: {
          "200": "Meta atualizada.",
          "400": "Payload inválido.",
          "401": "Sessão inválida.",
          "404": "Meta não encontrada.",
        },
      },
    ],
  },
  {
    path: "/api/settings",
    tag: "Settings",
    auth: "session",
    description: "Leitura e escrita de settings por household.",
    methods: [
      {
        method: "GET",
        summary: "Listar settings",
        description: "Retorna um mapa simples de chave e valor.",
        responses: {
          "200": "Objeto chave-valor.",
          "401": "Sessão inválida.",
        },
      },
      {
        method: "PUT",
        summary: "Atualizar settings",
        description: "Aceita atualização unitária ou em lote.",
        requestBody: {
          required: true,
          description: "Single setting ou batch de settings.",
          schema: {
            oneOf: [
              {
                type: "object",
                required: ["key", "value"],
                properties: {
                  key: { type: "string" },
                  value: { type: "string" },
                },
              },
              {
                type: "object",
                required: ["settings"],
                properties: {
                  settings: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["key", "value"],
                      properties: {
                        key: { type: "string" },
                        value: { type: "string" },
                      },
                    },
                  },
                },
              },
            ],
          },
        },
        responses: {
          "200": "Setting salvo ou batch salvo.",
          "400": "Payload inválido.",
          "401": "Sessão inválida.",
        },
      },
    ],
  },
  {
    path: "/api/creditos",
    tag: "Credits",
    auth: "session",
    description: "Pipeline de recebimentos PJ do household.",
    methods: [
      {
        method: "GET",
        summary: "Listar créditos PJ",
        description: "Retorna o conjunto de recebíveis PJ visíveis ao household.",
        responses: {
          "200": "Lista de créditos em `credits`.",
          "401": "Sessão inválida.",
        },
      },
      {
        method: "POST",
        summary: "Criar crédito PJ",
        description: "Cria um novo recebível PJ.",
        requestBody: {
          required: true,
          description: "Dados do recebível.",
          schema: {
            type: "object",
            required: ["clientName", "amount", "dueDate"],
            properties: {
              clientName: { type: "string" },
              description: { type: "string" },
              amount: { type: "number", minimum: 0.01 },
              dueDate: { type: "string", format: "date-time" },
              status: { type: "string", enum: ["unissued", "issued", "pending", "paid"] },
              competencia: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
            },
          },
        },
        responses: {
          "201": "Crédito criado.",
          "400": "Payload inválido.",
          "401": "Sessão inválida.",
        },
      },
    ],
  },
  {
    path: "/api/creditos/[id]",
    tag: "Credits",
    auth: "session",
    description: "Mudança de status e exclusão de recebíveis PJ.",
    methods: [
      {
        method: "PATCH",
        summary: "Atualizar status do crédito PJ",
        description: "Ao marcar como `paid`, pode criar transações de entrada e provisão de imposto.",
        parameters: [idPathParam],
        requestBody: {
          required: true,
          description: "Novo status do recebível.",
          schema: {
            type: "object",
            required: ["status"],
            properties: {
              status: { type: "string", enum: ["unissued", "issued", "pending", "paid"] },
            },
          },
        },
        responses: {
          "200": "Crédito atualizado.",
          "400": "Status inválido.",
          "401": "Sessão inválida.",
          "404": "Crédito não encontrado.",
        },
      },
      {
        method: "DELETE",
        summary: "Excluir crédito PJ",
        description: "Exclui o crédito e remove sua transação vinculada, se existir.",
        parameters: [idPathParam],
        responses: {
          "200": "Crédito excluído.",
          "401": "Sessão inválida.",
          "404": "Crédito não encontrado.",
        },
      },
    ],
  },
  {
    path: "/api/cron/pj-retainers",
    tag: "Cron",
    auth: "cron",
    description: "Gera recebíveis PJ com base em retainers ativos.",
    methods: [
      {
        method: "GET",
        summary: "Executar geração automática de PJ",
        description: "Aceita `Authorization: Bearer <CRON_SECRET>` quando `CRON_SECRET` estiver configurado.",
        responses: {
          "200": "Processamento executado com sucesso.",
          "401": "Token de cron ausente ou inválido.",
          "500": "Erro interno ao processar os retainers.",
        },
      },
    ],
  },
];

function getAuthDescription(auth: ApiEndpointDoc["auth"]) {
  if (auth === "public") return "Public";
  if (auth === "cron") return "Cron bearer token";
  return "Session cookie";
}

function createOperationId(method: string, path: string) {
  return `${method.toLowerCase()}_${path.replace(/[^a-zA-Z0-9]+/g, "_")}`.replace(/^_+|_+$/g, "");
}

export function getOpenApiSpec(baseUrl: string) {
  const paths = apiDocs.reduce<Record<string, Record<string, unknown>>>((acc, endpoint) => {
    const pathKey = endpoint.path.replace(/\[\.{3}[^\]]+\]/g, "{path}").replace(/\[([^\]]+)\]/g, "{$1}");

    acc[pathKey] = endpoint.methods.reduce<Record<string, unknown>>((methods, methodDoc) => {
      methods[methodDoc.method.toLowerCase()] = {
        tags: [endpoint.tag],
        summary: methodDoc.summary,
        description: methodDoc.description,
        operationId: createOperationId(methodDoc.method, endpoint.path),
        security:
          endpoint.auth === "public"
            ? []
            : endpoint.auth === "cron"
              ? [{ bearerAuth: [] }]
              : [{ sessionAuth: [] }],
        parameters: methodDoc.parameters,
        requestBody: methodDoc.requestBody
          ? {
              required: methodDoc.requestBody.required ?? false,
              content: {
                "application/json": {
                  schema: methodDoc.requestBody.schema,
                },
                ...(endpoint.path === "/api/import"
                  ? {
                      "multipart/form-data": {
                        schema: methodDoc.requestBody.schema,
                      },
                    }
                  : {}),
              },
              description: methodDoc.requestBody.description,
            }
          : undefined,
        responses: Object.fromEntries(
          Object.entries(methodDoc.responses ?? { "200": "Success" }).map(([status, description]) => [
            status,
            {
              description,
              content: {
                "application/json": {
                  schema:
                    status === "204"
                      ? undefined
                      : {
                          oneOf: [
                            { $ref: "#/components/schemas/GenericObject" },
                            { $ref: "#/components/schemas/ErrorResponse" },
                            { type: "array", items: { $ref: "#/components/schemas/GenericObject" } },
                          ],
                        },
                },
              },
            },
          ])
        ),
      };

      return methods;
    }, {});

    return acc;
  }, {});

  return {
    openapi: "3.1.0",
    info: {
      title: "FinControl API",
      version: "1.0.0",
      description:
        "API interna do FinControl para dashboard financeiro familiar, cartões, recorrências, metas, fechamento mensal e recebíveis PJ.",
    },
    servers: [{ url: baseUrl }],
    tags: Array.from(new Set(apiDocs.map((endpoint) => endpoint.tag))).map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        sessionAuth: {
          type: "apiKey",
          in: "cookie",
          name: "next-auth.session-token",
          description: "Sessão do NextAuth.",
        },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "token",
          description: "Token bearer usado para o endpoint de cron.",
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            error: { type: "string" },
          },
        },
        GenericObject: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
  };
}

export function getApiIndex(baseUrl: string) {
  return {
    name: "FinControl API",
    version: "1.0.0",
    description:
      "API privada-first para planejamento financeiro familiar, publicada com documentação consultável em runtime.",
    docs: {
      openapi: `${baseUrl}/api/openapi`,
    },
    endpoints: apiDocs.map((endpoint) => ({
      path: endpoint.path,
      tag: endpoint.tag,
      auth: getAuthDescription(endpoint.auth),
      description: endpoint.description,
      methods: endpoint.methods.map((methodDoc) => ({
        method: methodDoc.method,
        summary: methodDoc.summary,
      })),
    })),
  };
}
