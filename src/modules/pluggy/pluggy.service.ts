import { Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { getOrCreateCardStatement, getScopedCreditCard, refreshCardStatementTotals } from "@/lib/card-statements";
import { prisma } from "@/lib/prisma";
import { shiftCompetencia } from "@/lib/utils";
import type { TransactionActor } from "@/modules/transactions/transactions.service";
import {
  getPluggyItem,
  isPluggyConfigured,
  listPluggyAccounts,
  listPluggyBills,
  listPluggyTransactions,
  type PluggyAccountResponse,
  type PluggyBillResponse,
  type PluggyItemResponse,
  type PluggyTransactionResponse,
} from "./pluggy.client";
import type {
  ImportPluggyTransactionsInput,
  IgnorePluggyTransactionsInput,
  UpdatePluggyAccountInput,
} from "./pluggy.schemas";

export interface PluggyActor extends Pick<TransactionActor, "userId" | "memberIds"> {
  householdId: string;
}

export function getConfiguredPluggyItemIds() {
  return (env.PLUGGY_ITEM_IDS ?? "")
    .split(",")
    .map((itemId) => itemId.trim())
    .filter(Boolean);
}

export function inferTransactionType(transaction: Pick<PluggyTransactionResponse, "amount" | "type">) {
  const rawType = String(transaction.type ?? "").toUpperCase();

  if (["CREDIT", "INFLOW"].includes(rawType)) {
    return "income" as const;
  }

  if (["DEBIT", "OUTFLOW"].includes(rawType)) {
    return "expense" as const;
  }

  return transaction.amount >= 0 ? ("income" as const) : ("expense" as const);
}

export function getCategoryLabel(category: PluggyTransactionResponse["category"]) {
  if (!category) return null;
  if (typeof category === "string") return category;
  return category.description ?? category.name ?? category.id ?? null;
}

export function mapPluggyCategory(category: PluggyTransactionResponse["category"]) {
  const label = getCategoryLabel(category)?.toLowerCase() ?? "";

  if (/salary|sal[aá]rio|income|renda|pix recebido|transfer/i.test(label)) return "Receita Extra";
  if (/food|meal|restaurant|mercado|supermarket|grocery|aliment/i.test(label)) return "Alimentação";
  if (/transport|uber|99|taxi|fuel|gas|metro|bus|transporte/i.test(label)) return "Transporte";
  if (/health|pharmacy|doctor|medical|sa[uú]de|drogaria|farm[aá]cia/i.test(label)) return "Saúde";
  if (/education|school|course|educa/i.test(label)) return "Educação";
  if (/phone|internet|software|subscription|comunica/i.test(label)) return "Comunicação";
  if (/travel|hotel|airline|flight|viagem|companhia a[eé]rea/i.test(label)) return "Lazer";

  return "Outros";
}

export function dateToCompetencia(date: Date | string) {
  const parsed = typeof date === "string" ? new Date(`${date}T00:00:00`) : date;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

function toDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toJson(value: unknown) {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function getConnectorId(item: PluggyItemResponse) {
  return item.connector?.id ?? item.connectorId ?? null;
}

function getConnectorName(item: PluggyItemResponse) {
  return item.connector?.name ?? item.connectorName ?? null;
}

function getCreditLimit(account: PluggyAccountResponse) {
  return account.creditData?.creditLimit ?? null;
}

function getBillAmount(bill: PluggyBillResponse) {
  return bill.totalAmount ?? null;
}

function transactionDescription(transaction: PluggyTransactionResponse) {
  return transaction.description?.trim() || transaction.merchant?.name || transaction.merchantName || "Transação Pluggy";
}

async function detectDuplicate(
  db: typeof prisma | Prisma.TransactionClient,
  actor: PluggyActor,
  transaction: PluggyTransactionResponse,
  suggestedType: "income" | "expense"
) {
  const parsedDate = new Date(`${transaction.date}T00:00:00`);
  const amount = Math.abs(transaction.amount);
  const description = transactionDescription(transaction).slice(0, 24);

  const existing = await db.transaction.findFirst({
    where: {
      userId: { in: actor.memberIds },
      type: suggestedType,
      amount: { gte: amount - 0.01, lte: amount + 0.01 },
      date: {
        gte: new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate() - 1),
        lte: new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate() + 1, 23, 59, 59),
      },
      description: { contains: description, mode: "insensitive" },
    },
    select: { id: true, description: true },
  });

  return existing ? `Possível duplicidade: ${existing.description}` : null;
}

async function upsertPluggyItem(actor: PluggyActor, item: PluggyItemResponse) {
  return prisma.pluggyItem.upsert({
    where: { pluggyItemId: item.id },
    create: {
      pluggyItemId: item.id,
      connectorId: getConnectorId(item),
      connectorName: getConnectorName(item),
      status: item.status ?? null,
      executionStatus: item.executionStatus ?? null,
      errorCode: item.error?.code ?? null,
      errorMessage: item.error?.message ?? null,
      lastUpdatedAt: toDate(item.lastUpdatedAt ?? item.updatedAt ?? item.createdAt),
      raw: toJson(item),
      householdId: actor.householdId,
      userId: actor.userId,
    },
    update: {
      connectorId: getConnectorId(item),
      connectorName: getConnectorName(item),
      status: item.status ?? null,
      executionStatus: item.executionStatus ?? null,
      errorCode: item.error?.code ?? null,
      errorMessage: item.error?.message ?? null,
      lastUpdatedAt: toDate(item.lastUpdatedAt ?? item.updatedAt ?? item.createdAt),
      raw: toJson(item),
      householdId: actor.householdId,
      userId: actor.userId,
    },
  });
}

async function upsertAccount(itemId: string, account: PluggyAccountResponse) {
  const existing = await prisma.pluggyAccount.findUnique({
    where: { pluggyAccountId: account.id },
    select: { id: true },
  });

  const data = {
    pluggyItemId: itemId,
    type: account.type,
    subtype: account.subtype ?? null,
    name: account.name ?? account.marketingName ?? "Conta Pluggy",
    marketingName: account.marketingName ?? null,
    number: account.number ?? null,
    owner: account.owner ?? null,
    currencyCode: account.currencyCode ?? null,
    balance: account.balance ?? null,
    creditLimit: getCreditLimit(account),
    raw: toJson(account),
  };

  await prisma.pluggyAccount.upsert({
    where: { pluggyAccountId: account.id },
    create: { pluggyAccountId: account.id, ...data },
    update: data,
  });

  return existing ? "updated" : "created";
}

async function upsertBill(accountId: string, bill: PluggyBillResponse) {
  const existing = await prisma.pluggyBill.findUnique({
    where: { pluggyBillId: bill.id },
    select: { id: true },
  });

  await prisma.pluggyBill.upsert({
    where: { pluggyBillId: bill.id },
    create: {
      pluggyBillId: bill.id,
      pluggyAccountId: accountId,
      dueDate: toDate(bill.dueDate),
      closeDate: toDate(bill.closeDate),
      totalAmount: getBillAmount(bill),
      minimumPayment: bill.minimumPayment ?? null,
      status: bill.status ?? null,
      raw: toJson(bill),
    },
    update: {
      dueDate: toDate(bill.dueDate),
      closeDate: toDate(bill.closeDate),
      totalAmount: getBillAmount(bill),
      minimumPayment: bill.minimumPayment ?? null,
      status: bill.status ?? null,
      raw: toJson(bill),
    },
  });

  return existing ? "updated" : "created";
}

async function upsertStagedTransaction(actor: PluggyActor, accountId: string, transaction: PluggyTransactionResponse) {
  const existing = await prisma.pluggyTransaction.findUnique({
    where: { pluggyTransactionId: transaction.id },
    select: { id: true, importedTransactionId: true, ignoredAt: true },
  });

  const suggestedType = inferTransactionType(transaction);
  const category = getCategoryLabel(transaction.category);
  const duplicateReason = existing?.importedTransactionId
    ? null
    : await detectDuplicate(prisma, actor, transaction, suggestedType);

  const data = {
    pluggyAccountId: accountId,
    date: new Date(`${transaction.date}T00:00:00`),
    description: transactionDescription(transaction),
    amount: Math.abs(transaction.amount),
    type: transaction.type ?? null,
    status: transaction.status ?? null,
    category,
    categoryId: transaction.categoryId ?? (typeof transaction.category === "object" ? transaction.category?.id ?? null : null),
    merchantName: transaction.merchant?.name ?? transaction.merchantName ?? null,
    paymentData: toJson(transaction.paymentData),
    creditCardMetadata: toJson(transaction.creditCardMetadata),
    raw: toJson(transaction),
    suggestedType,
    suggestedCategory: suggestedType === "income" ? "Receita Extra" : mapPluggyCategory(transaction.category),
    suggestedCompetencia: dateToCompetencia(transaction.date),
    duplicateReason,
  };

  await prisma.pluggyTransaction.upsert({
    where: { pluggyTransactionId: transaction.id },
    create: { pluggyTransactionId: transaction.id, ...data },
    update: data,
  });

  return existing ? "updated" : "created";
}

export async function registerPluggyItem(actor: PluggyActor, itemId: string) {
  if (!isPluggyConfigured()) {
    throw new Error("Credenciais Pluggy não configuradas");
  }

  const item = await getPluggyItem(itemId);
  return upsertPluggyItem(actor, item);
}

export async function bootstrapConfiguredPluggyItems(actor: PluggyActor) {
  const ids = getConfiguredPluggyItemIds();

  for (const itemId of ids) {
    const existing = await prisma.pluggyItem.findFirst({
      where: { pluggyItemId: itemId, householdId: actor.householdId },
      select: { id: true },
    });

    if (!existing) {
      await registerPluggyItem(actor, itemId);
    }
  }
}

export async function syncPluggyItem(actor: PluggyActor, itemId: string) {
  await registerPluggyItem(actor, itemId);

  const log = await prisma.pluggySyncLog.create({
    data: {
      pluggyItemId: itemId,
      status: "running",
      message: "Sincronização iniciada",
    },
  });

  let createdAccounts = 0;
  let createdBills = 0;
  let createdTxs = 0;
  let updatedTxs = 0;

  try {
    const accounts = await listPluggyAccounts(itemId);

    for (const account of accounts) {
      const accountResult = await upsertAccount(itemId, account);
      if (accountResult === "created") createdAccounts += 1;

      if (account.type?.toUpperCase() === "CREDIT") {
        try {
          const bills = await listPluggyBills(account.id);
          for (const bill of bills) {
            const billResult = await upsertBill(account.id, bill);
            if (billResult === "created") createdBills += 1;
          }
        } catch (error) {
          console.warn("Pluggy bills sync skipped:", error);
        }
      }

      const transactions = await listPluggyTransactions(account.id);
      for (const transaction of transactions) {
        const transactionResult = await upsertStagedTransaction(actor, account.id, transaction);
        if (transactionResult === "created") createdTxs += 1;
        else updatedTxs += 1;
      }
    }

    const refreshedItem = await getPluggyItem(itemId);
    await upsertPluggyItem(actor, refreshedItem);

    const updatedLog = await prisma.pluggySyncLog.update({
      where: { id: log.id },
      data: {
        status: "success",
        message: "Sincronização concluída",
        finishedAt: new Date(),
        createdAccounts,
        createdBills,
        createdTxs,
        updatedTxs,
      },
    });

    await prisma.pluggyItem.update({
      where: { pluggyItemId: itemId },
      data: { lastSyncedAt: new Date() },
    });

    return updatedLog;
  } catch (error) {
    await prisma.pluggySyncLog.update({
      where: { id: log.id },
      data: {
        status: "error",
        message: error instanceof Error ? error.message : "Erro desconhecido na sincronização",
        finishedAt: new Date(),
        createdAccounts,
        createdBills,
        createdTxs,
        updatedTxs,
      },
    });

    throw error;
  }
}

export async function syncAllPluggyItems(actor: PluggyActor) {
  await bootstrapConfiguredPluggyItems(actor);

  const items = await prisma.pluggyItem.findMany({
    where: { householdId: actor.householdId },
    select: { pluggyItemId: true },
  });

  const logs = [];
  for (const item of items) {
    logs.push(await syncPluggyItem(actor, item.pluggyItemId));
  }

  return logs;
}

export async function listPluggyOverview(actor: PluggyActor) {
  if (isPluggyConfigured()) {
    await bootstrapConfiguredPluggyItems(actor);
  }

  const [items, accounts, pendingCount, importedCount, ignoredCount, logs] = await Promise.all([
    prisma.pluggyItem.findMany({
      where: { householdId: actor.householdId },
      include: { accounts: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.pluggyAccount.findMany({
      where: { item: { householdId: actor.householdId } },
      include: { linkedCreditCard: { select: { id: true, name: true, bank: true } } },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
    prisma.pluggyTransaction.count({
      where: {
        account: { item: { householdId: actor.householdId } },
        importedTransactionId: null,
        ignoredAt: null,
      },
    }),
    prisma.pluggyTransaction.count({
      where: {
        account: { item: { householdId: actor.householdId } },
        importedTransactionId: { not: null },
      },
    }),
    prisma.pluggyTransaction.count({
      where: {
        account: { item: { householdId: actor.householdId } },
        ignoredAt: { not: null },
      },
    }),
    prisma.pluggySyncLog.findMany({
      where: { item: { householdId: actor.householdId } },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
  ]);

  return {
    configured: isPluggyConfigured(),
    configuredItemIds: getConfiguredPluggyItemIds(),
    items,
    accounts,
    counts: { pending: pendingCount, imported: importedCount, ignored: ignoredCount },
    logs,
  };
}

export async function linkPluggyAccountToCard(actor: PluggyActor, input: UpdatePluggyAccountInput) {
  const account = await prisma.pluggyAccount.findFirst({
    where: {
      pluggyAccountId: input.pluggyAccountId,
      item: { householdId: actor.householdId },
    },
    select: { id: true },
  });

  if (!account) {
    return { kind: "not_found" as const };
  }

  if (input.linkedCreditCardId) {
    const card = await getScopedCreditCard(prisma, input.linkedCreditCardId, actor.memberIds);
    if (!card) {
      return { kind: "card_not_found" as const };
    }
  }

  const updated = await prisma.pluggyAccount.update({
    where: { pluggyAccountId: input.pluggyAccountId },
    data: { linkedCreditCardId: input.linkedCreditCardId ?? null },
    include: { linkedCreditCard: { select: { id: true, name: true, bank: true } } },
  });

  return { kind: "ok" as const, account: updated };
}

export async function listImportCandidates(
  actor: PluggyActor,
  filters: { accountId?: string; status?: "pending" | "imported" | "ignored" | "all"; limit?: number }
) {
  const where: Prisma.PluggyTransactionWhereInput = {
    account: { item: { householdId: actor.householdId } },
  };

  if (filters.accountId) {
    where.pluggyAccountId = filters.accountId;
  }

  if (filters.status === "pending" || !filters.status) {
    where.importedTransactionId = null;
    where.ignoredAt = null;
  } else if (filters.status === "imported") {
    where.importedTransactionId = { not: null };
  } else if (filters.status === "ignored") {
    where.ignoredAt = { not: null };
  }

  return prisma.pluggyTransaction.findMany({
    where,
    include: {
      account: {
        include: { linkedCreditCard: { select: { id: true, name: true, bank: true } } },
      },
      importedTransaction: { select: { id: true, description: true, competencia: true } },
    },
    orderBy: { date: "desc" },
    take: filters.limit ?? 80,
  });
}

function getOwnerUserId(actor: PluggyActor, ownership: ImportPluggyTransactionsInput["ownership"]) {
  if (ownership === "partner") {
    return actor.memberIds.find((memberId) => memberId !== actor.userId) ?? actor.userId;
  }

  return actor.userId;
}

async function resolveStatementForImportedTransaction(
  db: Prisma.TransactionClient,
  pluggyTransaction: {
    date: Date;
    suggestedCompetencia: string | null;
    account: {
      type: string;
      linkedCreditCardId: string | null;
    };
  }
) {
  const accountType = pluggyTransaction.account.type?.toUpperCase();
  const linkedCreditCardId = pluggyTransaction.account.linkedCreditCardId;

  if (accountType !== "CREDIT" || !linkedCreditCardId) {
    return null;
  }

  const linkedCard = await db.creditCard.findUnique({
    where: { id: linkedCreditCardId },
    select: { closingDay: true },
  });

  const baseCompetencia = pluggyTransaction.suggestedCompetencia ?? dateToCompetencia(pluggyTransaction.date);
  const closingDay = linkedCard?.closingDay ?? 20;
  const competencia = pluggyTransaction.date.getDate() > closingDay ? shiftCompetencia(baseCompetencia, 1) : baseCompetencia;
  const statement = await getOrCreateCardStatement(db, linkedCreditCardId, competencia);

  return { statementId: statement.id, competencia };
}

export async function importPluggyTransactions(actor: PluggyActor, input: ImportPluggyTransactionsInput) {
  const stagedTransactions = await prisma.pluggyTransaction.findMany({
    where: {
      id: { in: input.ids },
      importedTransactionId: null,
      ignoredAt: null,
      account: { item: { householdId: actor.householdId } },
    },
    include: { account: true },
    orderBy: { date: "asc" },
  });

  if (stagedTransactions.length !== input.ids.length) {
    throw new Error("Uma ou mais transações não estão disponíveis para importação");
  }

  const ownerUserId = getOwnerUserId(actor, input.ownership);

  return prisma.$transaction(async (db) => {
    const imported = [];
    const affectedStatementIds: Array<string | null | undefined> = [];

    for (const staged of stagedTransactions) {
      const statement = await resolveStatementForImportedTransaction(db, staged);
      const competencia = statement?.competencia ?? staged.suggestedCompetencia ?? dateToCompetencia(staged.date);

      const created = await db.transaction.create({
        data: {
          date: staged.date,
          competencia,
          description: staged.description,
          category: staged.suggestedCategory ?? "Outros",
          amount: staged.amount,
          type: staged.suggestedType ?? "expense",
          ownership: input.ownership,
          isSecret: false,
          source: "pluggy",
          userId: ownerUserId,
          cardStatementId: statement?.statementId ?? null,
        },
      });

      await db.pluggyTransaction.update({
        where: { id: staged.id },
        data: { importedTransactionId: created.id },
      });

      affectedStatementIds.push(created.cardStatementId);
      imported.push(created);
    }

    await refreshCardStatementTotals(db, affectedStatementIds);

    return imported;
  });
}

export async function setPluggyTransactionsIgnored(actor: PluggyActor, input: IgnorePluggyTransactionsInput) {
  const result = await prisma.pluggyTransaction.updateMany({
    where: {
      id: { in: input.ids },
      importedTransactionId: null,
      account: { item: { householdId: actor.householdId } },
    },
    data: { ignoredAt: input.ignored ? new Date() : null },
  });

  return result;
}
