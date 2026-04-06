import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getHouseholdContextForUser, getHouseholdForUser } from "@/lib/household";
import { getHouseholdSettingsMap } from "@/lib/settings";
import { formatCurrency, getCurrentCompetencia, normalizeCategoryKey } from "@/lib/utils";
import { createTransactionWithInstallments } from "@/modules/transactions/transactions.service";
import { createRecurringSchema } from "@/modules/recurring/recurring.schemas";
import { createRecurringTemplate } from "@/modules/recurring/recurring.service";

const KNOWN_CATEGORIES = [
  "Moradia",
  "Alimentação",
  "Transporte",
  "Lazer",
  "Saúde",
  "Educação",
  "Comunicação",
  "Cartão de Crédito",
  "Salário",
  "Benefício",
  "Receita Extra",
  "Outros",
];

const OWNERSHIP_ALIASES: Record<string, "mine" | "partner" | "joint"> = {
  mine: "mine",
  meu: "mine",
  minha: "mine",
  eu: "mine",
  partner: "partner",
  parceiro: "partner",
  parceira: "partner",
  dele: "partner",
  dela: "partner",
  joint: "joint",
  conjunto: "joint",
  conjunta: "joint",
  casal: "joint",
};

const TYPE_ALIASES: Record<string, "income" | "expense"> = {
  gasto: "expense",
  despesa: "expense",
  expense: "expense",
  receita: "income",
  income: "income",
};

const INTERVAL_ALIASES: Record<string, "monthly" | "yearly"> = {
  mensal: "monthly",
  monthly: "monthly",
  anual: "yearly",
  yearly: "yearly",
};

interface TelegramUser {
  id?: number;
  first_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: string;
}

interface TelegramMessage {
  message_id: number;
  text?: string;
  chat: TelegramChat;
  from?: TelegramUser;
}

export interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
}

interface TelegramRuntimeConfig {
  botToken: string;
  webhookSecret: string | null;
  allowedChatIds: Set<string>;
  chatOwnershipMap: Map<string, "mine" | "partner" | "joint">;
  actorUserId: string;
  actorName: string;
  householdId: string;
  memberIds: string[];
}

type ParsedCommand =
  | { kind: "help" }
  | { kind: "whoami" }
  | { kind: "cards" }
  | {
      kind: "transaction";
      type: "income" | "expense";
      amount: number;
      category: string;
      description: string;
      ownership?: "mine" | "partner" | "joint";
      date?: string;
      cardName?: string;
      isSecret?: boolean;
    }
  | {
      kind: "recurring";
      type: "income" | "expense";
      amount: number;
      category: string;
      description: string;
      ownership?: "mine" | "partner" | "joint";
      dayOfMonth?: number;
      startDate?: string;
      endDate?: string;
      interval?: "monthly" | "yearly";
      intervalCount?: number;
      cardName?: string;
      isVariable?: boolean;
    }
  | { kind: "unknown"; error: string };

function parseCsvList(value?: string | null) {
  if (!value) {
    return [];
  }

  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseChatOwnershipMap(value?: string | null) {
  const map = new Map<string, "mine" | "partner" | "joint">();

  for (const entry of parseCsvList(value)) {
    const [chatId, rawOwnership] = entry.split(/[=:]/).map((part) => part.trim());
    const ownership = rawOwnership ? OWNERSHIP_ALIASES[normalizeCategoryKey(rawOwnership)] : null;
    if (!chatId || !ownership) {
      continue;
    }
    map.set(chatId, ownership);
  }

  return map;
}

function getTodayIsoDate() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date());
}

function getCurrentDayOfMonth() {
  return Number(getTodayIsoDate().split("-")[2]);
}

function parseAmount(rawValue: string) {
  const cleaned = rawValue.replace(/R\$/gi, "").trim();
  if (!cleaned) {
    return null;
  }

  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const amount = Number(normalized);

  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function canonicalizeCategory(rawCategory: string) {
  const normalized = normalizeCategoryKey(rawCategory);
  const exactMatch = KNOWN_CATEGORIES.find(
    (category) => normalizeCategoryKey(category) === normalized
  );

  if (exactMatch) {
    return exactMatch;
  }

  return rawCategory.trim();
}

function normalizeOwnership(rawOwnership?: string | null) {
  if (!rawOwnership) {
    return null;
  }

  return OWNERSHIP_ALIASES[normalizeCategoryKey(rawOwnership)] ?? null;
}

function normalizeRecurringType(rawType?: string | null) {
  if (!rawType) {
    return null;
  }

  return TYPE_ALIASES[normalizeCategoryKey(rawType)] ?? null;
}

function normalizeRecurringInterval(rawInterval?: string | null) {
  if (!rawInterval) {
    return null;
  }

  return INTERVAL_ALIASES[normalizeCategoryKey(rawInterval)] ?? null;
}

function normalizeBoolean(rawValue?: string | null) {
  if (!rawValue) {
    return null;
  }

  const normalized = normalizeCategoryKey(rawValue);
  if (["sim", "s", "true", "1", "yes"].includes(normalized)) {
    return true;
  }

  if (["nao", "não", "n", "false", "0", "no"].includes(normalized)) {
    return false;
  }

  return null;
}

function splitSegments(input: string) {
  return input
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function parseExtraSegments(segments: string[]) {
  const keyValues = new Map<string, string>();
  const positional: string[] = [];

  for (const segment of segments) {
    const match = segment.match(/^([a-zA-ZÀ-ÿ_]+)\s*[=:]\s*(.+)$/);
    if (match) {
      keyValues.set(normalizeCategoryKey(match[1]), match[2].trim());
      continue;
    }

    positional.push(segment);
  }

  return { keyValues, positional };
}

function parseCommand(text: string): ParsedCommand {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return { kind: "unknown", error: "Use /ajuda para ver os comandos disponíveis." };
  }

  const firstSpaceIndex = trimmed.indexOf(" ");
  const commandToken = firstSpaceIndex === -1 ? trimmed : trimmed.slice(0, firstSpaceIndex);
  const remainder = firstSpaceIndex === -1 ? "" : trimmed.slice(firstSpaceIndex + 1).trim();
  const command = commandToken.slice(1).split("@")[0].toLowerCase();

  if (["start", "help", "ajuda"].includes(command)) {
    return { kind: "help" };
  }

  if (command === "whoami") {
    return { kind: "whoami" };
  }

  if (command === "cartoes" || command === "cartões") {
    return { kind: "cards" };
  }

  if (command === "gasto" || command === "receita") {
    const segments = splitSegments(remainder);
    if (segments.length < 3) {
      return {
        kind: "unknown",
        error:
          "Formato: /gasto valor | categoria | descrição [| ownership] [| YYYY-MM-DD] [| cartao=Inter] [| secreto=sim]",
      };
    }

    const amount = parseAmount(segments[0]);
    if (!amount) {
      return { kind: "unknown", error: "Não consegui entender o valor informado." };
    }

    const { keyValues, positional } = parseExtraSegments(segments.slice(3));
    const positionalOwnership = positional.find((segment) => normalizeOwnership(segment));
    const positionalDate = positional.find((segment) => /^\d{4}-\d{2}-\d{2}$/.test(segment));

    return {
      kind: "transaction",
      type: command === "gasto" ? "expense" : "income",
      amount,
      category: canonicalizeCategory(segments[1]),
      description: segments[2],
      ownership:
        normalizeOwnership(keyValues.get("ownership") ?? keyValues.get("de") ?? positionalOwnership) ??
        undefined,
      date: keyValues.get("data") ?? keyValues.get("date") ?? positionalDate ?? undefined,
      cardName: keyValues.get("cartao") ?? keyValues.get("cartão") ?? keyValues.get("card") ?? undefined,
      isSecret: normalizeBoolean(keyValues.get("secreto") ?? keyValues.get("secret")) ?? undefined,
    };
  }

  if (command === "recorrente") {
    const segments = splitSegments(remainder);
    if (segments.length < 4) {
      return {
        kind: "unknown",
        error:
          "Formato: /recorrente gasto|receita | valor | categoria | descrição | dia=30 [| ownership=joint] [| inicio=YYYY-MM] [| cartao=Inter]",
      };
    }

    const type = normalizeRecurringType(segments[0]);
    if (!type) {
      return {
        kind: "unknown",
        error: "O primeiro campo deve ser gasto ou receita.",
      };
    }

    const amount = parseAmount(segments[1]);
    if (!amount) {
      return { kind: "unknown", error: "Não consegui entender o valor informado." };
    }

    const { keyValues, positional } = parseExtraSegments(segments.slice(4));
    const positionalOwnership = positional.find((segment) => normalizeOwnership(segment));

    return {
      kind: "recurring",
      type,
      amount,
      category: canonicalizeCategory(segments[2]),
      description: segments[3],
      ownership:
        normalizeOwnership(keyValues.get("ownership") ?? keyValues.get("de") ?? positionalOwnership) ??
        undefined,
      dayOfMonth: keyValues.get("dia") ? Number(keyValues.get("dia")) : undefined,
      startDate: keyValues.get("inicio") ?? keyValues.get("start") ?? undefined,
      endDate: keyValues.get("fim") ?? keyValues.get("end") ?? undefined,
      interval:
        normalizeRecurringInterval(keyValues.get("intervalo") ?? keyValues.get("interval")) ?? undefined,
      intervalCount: keyValues.get("cada") ? Number(keyValues.get("cada")) : undefined,
      cardName: keyValues.get("cartao") ?? keyValues.get("cartão") ?? keyValues.get("card") ?? undefined,
      isVariable: normalizeBoolean(keyValues.get("variavel") ?? keyValues.get("variável")) ?? undefined,
    };
  }

  return { kind: "unknown", error: "Comando não reconhecido. Use /ajuda." };
}

async function resolveTelegramRuntimeConfig(): Promise<TelegramRuntimeConfig | null> {
  const preferredActorEmail = env.TELEGRAM_ACTOR_EMAIL ?? null;
  const actorUser = preferredActorEmail
    ? await prisma.user.findUnique({
        where: { email: preferredActorEmail },
        select: { id: true, name: true },
      })
    : await prisma.user.findFirst({
        where: { role: "admin" },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true },
      });

  const fallbackActor = actorUser
    ? actorUser
    : await prisma.user.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true },
      });

  if (!fallbackActor) {
    return null;
  }

  const { householdId, memberIds } = await getHouseholdForUser(fallbackActor.id);
  const settings = await getHouseholdSettingsMap(householdId);

  const botToken = env.TELEGRAM_BOT_TOKEN ?? settings.get("telegram_bot_token") ?? null;
  if (!botToken) {
    return null;
  }

  return {
    botToken,
    webhookSecret:
      env.TELEGRAM_WEBHOOK_SECRET ?? settings.get("telegram_webhook_secret") ?? null,
    allowedChatIds: new Set(
      parseCsvList(env.TELEGRAM_ALLOWED_CHAT_IDS ?? settings.get("telegram_allowed_chat_ids"))
    ),
    chatOwnershipMap: parseChatOwnershipMap(
      env.TELEGRAM_CHAT_OWNERSHIP_MAP ?? settings.get("telegram_chat_ownership_map")
    ),
    actorUserId: fallbackActor.id,
    actorName: fallbackActor.name,
    householdId,
    memberIds,
  };
}

async function callTelegramApi<TPayload extends Record<string, unknown>>(
  botToken: string,
  method: string,
  payload: TPayload
) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API ${method} failed: ${response.status} ${body}`);
  }

  return response.json();
}

async function sendTelegramMessage(botToken: string, chatId: string, text: string) {
  await callTelegramApi(botToken, "sendMessage", {
    chat_id: Number(chatId),
    text,
    disable_web_page_preview: true,
  });
}

async function listAvailableCards(memberIds: string[]) {
  return prisma.creditCard.findMany({
    where: { userId: { in: memberIds } },
    orderBy: [{ name: "asc" }, { bank: "asc" }],
    select: {
      id: true,
      name: true,
      bank: true,
      dueDay: true,
      closingDay: true,
      user: {
        select: {
          name: true,
        },
      },
    },
  });
}

async function findCardByName(memberIds: string[], rawCardName: string) {
  const normalizedName = normalizeCategoryKey(rawCardName);
  const cards = await listAvailableCards(memberIds);
  const matches = cards.filter(
    (card) =>
      normalizeCategoryKey(card.name) === normalizedName ||
      normalizeCategoryKey(`${card.bank} ${card.name}`) === normalizedName ||
      normalizeCategoryKey(card.bank) === normalizedName
  );

  if (matches.length === 1) {
    return { kind: "ok" as const, card: matches[0] };
  }

  if (matches.length > 1) {
    return {
      kind: "ambiguous" as const,
      message: `Encontrei mais de um cartão com esse nome: ${matches.map((card) => `${card.name} (${card.bank})`).join(", ")}. Tente usar algo como cartao=Banco Nome.`,
    };
  }

  return {
    kind: "not_found" as const,
    message: `Não encontrei cartão com o nome “${rawCardName}”. Use /cartoes para listar os disponíveis.`,
  };
}

function getHelpText(defaultOwnership: "mine" | "partner" | "joint") {
  return [
    "Fincontrol no Telegram",
    "",
    `Ownership padrão deste chat: ${defaultOwnership}`,
    "",
    "Comandos:",
    "/gasto 675,24 | Moradia | Condomínio",
    "/gasto 120 | Alimentação | Mercado | joint | 2026-04-04 | cartao=Inter",
    "/receita 6871,58 | Salário | Renda líquida PJ",
    "/recorrente gasto | 480 | Saúde | Psicólogo | dia=30 | ownership=partner | inicio=2026-04",
    "/cartoes",
    "/whoami",
    "",
    "Observações:",
    "- Se ownership não for enviado, o bot usa o padrão deste chat.",
    "- Para cartão, use cartao=Nome do cartão.",
    "- Datas usam YYYY-MM-DD e recorrência usa inicio/fim em YYYY-MM.",
  ].join("\n");
}

function getUnauthorizedText(chatId: string, fromId?: number) {
  return [
    "Este chat ainda não está autorizado para criar lançamentos.",
    "",
    `chat_id: ${chatId}`,
    fromId ? `user_id: ${fromId}` : null,
    "",
    "Me envie esse chat_id para eu vincular o bot com segurança.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function handleTransactionCommand(
  config: TelegramRuntimeConfig,
  chatId: string,
  parsedCommand: Extract<ParsedCommand, { kind: "transaction" }>,
  defaultOwnership: "mine" | "partner" | "joint"
) {
  const date = parsedCommand.date ?? getTodayIsoDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    await sendTelegramMessage(
      config.botToken,
      chatId,
      "A data precisa estar no formato YYYY-MM-DD."
    );
    return;
  }

  if (parsedCommand.type !== "expense" && parsedCommand.cardName) {
    await sendTelegramMessage(
      config.botToken,
      chatId,
      "Somente despesas podem ser vinculadas a cartão de crédito."
    );
    return;
  }

  let cardId: string | null = null;
  if (parsedCommand.cardName) {
    const cardResolution = await findCardByName(config.memberIds, parsedCommand.cardName);
    if (cardResolution.kind !== "ok") {
      await sendTelegramMessage(config.botToken, chatId, cardResolution.message);
      return;
    }
    cardId = cardResolution.card.id;
  }

  const createdTransactions = await createTransactionWithInstallments(
    {
      userId: config.actorUserId,
      memberIds: config.memberIds,
    },
    {
      date,
      competencia: date.slice(0, 7),
      description: parsedCommand.description,
      category: parsedCommand.category,
      amount: parsedCommand.amount,
      type: parsedCommand.type,
      ownership: parsedCommand.ownership ?? defaultOwnership,
      isSecret: parsedCommand.isSecret ?? false,
      source: "telegram",
      cardId,
    }
  );

  await sendTelegramMessage(
    config.botToken,
    chatId,
    [
      "Lançamento criado com sucesso.",
      `${parsedCommand.type === "expense" ? "Despesa" : "Receita"}: ${parsedCommand.description}`,
      `Valor: ${formatCurrency(parsedCommand.amount)}`,
      `Categoria: ${parsedCommand.category}`,
      `Competência: ${date.slice(0, 7)}`,
      `Ocorrências criadas: ${createdTransactions.length}`,
    ].join("\n")
  );
}

async function handleRecurringCommand(
  config: TelegramRuntimeConfig,
  chatId: string,
  parsedCommand: Extract<ParsedCommand, { kind: "recurring" }>,
  defaultOwnership: "mine" | "partner" | "joint"
) {
  let cardId: string | null = null;
  if (parsedCommand.cardName) {
    const cardResolution = await findCardByName(config.memberIds, parsedCommand.cardName);
    if (cardResolution.kind !== "ok") {
      await sendTelegramMessage(config.botToken, chatId, cardResolution.message);
      return;
    }
    cardId = cardResolution.card.id;
  }

  const recurringInput = createRecurringSchema.safeParse({
    description: parsedCommand.description,
    category: parsedCommand.category,
    amount: parsedCommand.amount,
    type: parsedCommand.type,
    ownership: parsedCommand.ownership ?? defaultOwnership,
    dayOfMonth: parsedCommand.dayOfMonth ?? getCurrentDayOfMonth(),
    startDate: parsedCommand.startDate ?? getCurrentCompetencia(),
    endDate: parsedCommand.endDate ?? null,
    interval: parsedCommand.interval ?? "monthly",
    intervalCount: parsedCommand.intervalCount ?? 1,
    isVariable: parsedCommand.isVariable ?? false,
    cardId,
  });

  if (!recurringInput.success) {
    await sendTelegramMessage(
      config.botToken,
      chatId,
      recurringInput.error.issues[0]?.message ?? "Não consegui validar a recorrência enviada."
    );
    return;
  }

  const template = await createRecurringTemplate(
    {
      userId: config.actorUserId,
      householdId: config.householdId,
      memberIds: config.memberIds,
    },
    recurringInput.data
  );

  await sendTelegramMessage(
    config.botToken,
    chatId,
    [
      "Recorrência criada com sucesso.",
      `${parsedCommand.type === "expense" ? "Despesa" : "Receita"}: ${template.description}`,
      `Valor: ${formatCurrency(template.amount)}`,
      `Categoria: ${template.category}`,
      `Início: ${template.startDate}`,
      `Dia do mês: ${template.dayOfMonth}`,
    ].join("\n")
  );
}

async function handleCardsCommand(config: TelegramRuntimeConfig, chatId: string) {
  const cards = await listAvailableCards(config.memberIds);
  if (cards.length === 0) {
    await sendTelegramMessage(config.botToken, chatId, "Nenhum cartão cadastrado no household.");
    return;
  }

  await sendTelegramMessage(
    config.botToken,
    chatId,
    [
      "Cartões disponíveis:",
      ...cards.map(
        (card) =>
          `- ${card.name} (${card.bank}) · fechamento ${card.closingDay} · vencimento ${card.dueDay} · dono ${card.user.name}`
      ),
    ].join("\n")
  );
}

export async function handleTelegramUpdate(
  update: TelegramUpdate,
  providedSecret: string | null
) {
  const config = await resolveTelegramRuntimeConfig();
  if (!config) {
    return { status: 503 as const, body: { error: "Telegram not configured" } };
  }

  if (config.webhookSecret && providedSecret !== config.webhookSecret) {
    return { status: 401 as const, body: { error: "Invalid Telegram webhook secret" } };
  }

  const message = update.message;
  if (!message?.text || !message.chat) {
    return { status: 200 as const, body: { ok: true, ignored: true } };
  }

  if (message.chat.type !== "private") {
    await sendTelegramMessage(
      config.botToken,
      String(message.chat.id),
      "Por enquanto eu respondo apenas em conversas privadas."
    );
    return { status: 200 as const, body: { ok: true } };
  }

  const parsedCommand = parseCommand(message.text);
  const chatId = String(message.chat.id);
  const defaultOwnership = config.chatOwnershipMap.get(chatId) ?? "mine";
  const isAuthorizedChat = config.allowedChatIds.has(chatId);

  if (parsedCommand.kind === "help") {
    await sendTelegramMessage(config.botToken, chatId, getHelpText(defaultOwnership));
    return { status: 200 as const, body: { ok: true } };
  }

  if (parsedCommand.kind === "whoami") {
    const householdContext = await getHouseholdContextForUser(config.actorUserId);
    await sendTelegramMessage(
      config.botToken,
      chatId,
      [
        `chat_id: ${chatId}`,
        message.from?.id ? `user_id: ${message.from.id}` : null,
        `autorizado: ${isAuthorizedChat ? "sim" : "não"}`,
        `ownership padrão: ${defaultOwnership}`,
        `ator do household: ${householdContext.self.name}`,
      ]
        .filter(Boolean)
        .join("\n")
    );
    return { status: 200 as const, body: { ok: true } };
  }

  if (!isAuthorizedChat) {
    await sendTelegramMessage(
      config.botToken,
      chatId,
      getUnauthorizedText(chatId, message.from?.id)
    );
    return { status: 200 as const, body: { ok: true } };
  }

  if (parsedCommand.kind === "cards") {
    await handleCardsCommand(config, chatId);
    return { status: 200 as const, body: { ok: true } };
  }

  if (parsedCommand.kind === "transaction") {
    await handleTransactionCommand(config, chatId, parsedCommand, defaultOwnership);
    return { status: 200 as const, body: { ok: true } };
  }

  if (parsedCommand.kind === "recurring") {
    await handleRecurringCommand(config, chatId, parsedCommand, defaultOwnership);
    return { status: 200 as const, body: { ok: true } };
  }

  await sendTelegramMessage(config.botToken, chatId, parsedCommand.error);
  return { status: 200 as const, body: { ok: true } };
}
