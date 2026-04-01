import { randomUUID } from "crypto";
import { Prisma, Transaction } from "@prisma/client";
import { getOrCreateCardStatement, getScopedCreditCard } from "@/lib/card-statements";
import { prisma } from "@/lib/prisma";
import {
  CreateTransactionInput,
  ListTransactionsQuery,
  UpdateTransactionInput,
} from "./transactions.schemas";

export interface TransactionActor {
  userId: string;
  userRole: string;
  memberIds: string[];
}

export type TransactionDeleteScope = "single" | "series";

function getPartnerUserId(actor: TransactionActor) {
  return actor.memberIds.find((memberId) => memberId !== actor.userId) ?? actor.userId;
}

function resolveTransactionUserId(
  actor: TransactionActor,
  currentUserId: string,
  ownership: UpdateTransactionInput["ownership"] | Transaction["ownership"]
) {
  if (ownership === "mine") {
    return actor.userId;
  }

  if (ownership === "partner") {
    return getPartnerUserId(actor);
  }

  return currentUserId;
}

function getDateForCompetencia(competencia: string, desiredDay: number) {
  const [year, month] = competencia.split("-").map(Number);
  const maxDay = new Date(year, month, 0).getDate();
  const safeDay = Math.min(desiredDay, maxDay);

  return new Date(year, month - 1, safeDay);
}

function getRequestedDayOfMonth(input: UpdateTransactionInput) {
  if (!input.date) {
    return null;
  }

  const parsedDate = new Date(input.date);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.getDate();
}

function buildTransactionUpdateData(
  actor: TransactionActor,
  currentUserId: string,
  input: UpdateTransactionInput,
  competenciaOverride?: string
) {
  const {
    applyToSeries: _applyToSeries,
    date,
    competencia,
    ownership,
    cardId: _cardId,
    ...rest
  } = input;

  const data: Record<string, unknown> = { ...rest };

  if (ownership !== undefined) {
    data.ownership = ownership;
    data.userId = resolveTransactionUserId(actor, currentUserId, ownership);
  }

  if (!competenciaOverride && competencia !== undefined) {
    data.competencia = competencia;
  }

  if (date) {
    if (competenciaOverride) {
      const desiredDay = getRequestedDayOfMonth(input);
      if (desiredDay) {
        data.date = getDateForCompetencia(competenciaOverride, desiredDay);
      }
    } else {
      data.date = new Date(date);
    }
  }

  return data;
}

function buildRecurringTemplateUpdateData(input: UpdateTransactionInput) {
  const data: Record<string, unknown> = {};

  if (input.description !== undefined) data.description = input.description;
  if (input.category !== undefined) data.category = input.category;
  if (input.amount !== undefined) data.amount = input.amount;
  if (input.type !== undefined) data.type = input.type;
  if (input.ownership !== undefined) data.ownership = input.ownership;

  const desiredDay = getRequestedDayOfMonth(input);
  if (desiredDay) {
    data.dayOfMonth = desiredDay;
  }

  return data;
}

function buildSecretFilter(userId: string) {
  return {
    OR: [
      { isSecret: false },
      { isSecret: true, userId },
    ],
  };
}

async function resolveCardStatementId(
  actor: Pick<TransactionActor, "memberIds">,
  cardId: string,
  competencia: string
) {
  const card = await getScopedCreditCard(prisma, cardId, actor.memberIds);

  if (!card) {
    throw new Error("Cartão selecionado não foi encontrado");
  }

  const statement = await getOrCreateCardStatement(prisma, card.id, competencia);
  return statement.id;
}

export async function listVisibleTransactions(
  actor: Pick<TransactionActor, "userId" | "memberIds">,
  filters: ListTransactionsQuery
) {
  const where: Record<string, unknown> = {
    userId: { in: actor.memberIds },
  };

  if (filters.competencia) {
    where.competencia = filters.competencia;
  }

  if (filters.ownership === "joint") {
    where.ownership = "joint";
    where.AND = [buildSecretFilter(actor.userId)];
  } else if (filters.ownership === "mine") {
    where.ownership = "mine";
  } else if (filters.ownership === "partner") {
    where.ownership = "partner";
    where.AND = [buildSecretFilter(actor.userId)];
  } else {
    where.AND = [buildSecretFilter(actor.userId)];
  }

  if (filters.type) {
    where.type = filters.type;
  }

  if (filters.category) {
    where.category = filters.category;
  }

  if (filters.search) {
    where.OR = [
      { description: { contains: filters.search, mode: "insensitive" } },
      {
        cardStatement: {
          is: {
            card: {
              is: {
                name: { contains: filters.search, mode: "insensitive" },
              },
            },
          },
        },
      },
    ];
  }

  return prisma.transaction.findMany({
    where,
    orderBy: { date: "desc" },
    include: {
      cardStatement: {
        include: { card: { select: { id: true, name: true, bank: true } } },
      },
    },
  });
}

export async function createTransactionWithInstallments(
  actor: Pick<TransactionActor, "userId" | "memberIds">,
  input: CreateTransactionInput
) {
  const parsedDate = new Date(input.date);
  const ownerUserId =
    input.ownership === "partner"
      ? actor.memberIds.find((memberId) => memberId !== actor.userId) ?? actor.userId
      : actor.userId;
  const selectedCard = input.cardId
    ? await getScopedCreditCard(prisma, input.cardId, actor.memberIds)
    : null;

  if (input.cardId && !selectedCard) {
    throw new Error("Cartão selecionado não foi encontrado");
  }

  const mainTransactionId = randomUUID();
  const transactionsToCreate: Array<{
    id: string;
    date: Date;
    competencia: string;
    description: string;
    category: string;
    amount: number;
    type: CreateTransactionInput["type"];
    ownership: CreateTransactionInput["ownership"];
    installmentCurrent: number | null;
    installmentTotal: number | null;
    isSecret: boolean;
    parentId?: string;
    source?: string;
    userId: string;
    cardStatementId: string | null;
  }> = [
    {
      id: mainTransactionId,
      date: parsedDate,
      competencia: input.competencia,
      description: input.description,
      category: input.category,
      amount: input.amount,
      type: input.type,
      ownership: input.ownership,
      installmentCurrent:
        input.installmentTotal && input.installmentTotal > 1
          ? 1
          : input.installmentCurrent ?? null,
      installmentTotal: input.installmentTotal ?? null,
      isSecret: input.isSecret,
      source: input.source,
      userId: ownerUserId,
      cardStatementId: null,
    },
  ];

  if (input.installmentTotal && input.installmentTotal > 1) {
    const [compYear, compMonth] = input.competencia.split("-").map(Number);

    for (
      let installmentIndex = 2;
      installmentIndex <= input.installmentTotal;
      installmentIndex += 1
    ) {
      const futureDate = new Date(parsedDate);
      futureDate.setMonth(futureDate.getMonth() + (installmentIndex - 1));

      const futureComp = new Date(compYear, compMonth - 1 + (installmentIndex - 1), 1);
      const futureCompetencia = `${futureComp.getFullYear()}-${String(
        futureComp.getMonth() + 1
      ).padStart(2, "0")}`;

      transactionsToCreate.push({
        id: randomUUID(),
        date: futureDate,
        competencia: futureCompetencia,
        description: `${input.description} (${installmentIndex}/${input.installmentTotal})`,
        category: input.category,
        amount: input.amount,
        type: input.type,
        ownership: input.ownership,
        installmentCurrent: installmentIndex,
        installmentTotal: input.installmentTotal,
        isSecret: input.isSecret,
        parentId: mainTransactionId,
        source: input.source,
        userId: ownerUserId,
        cardStatementId: null,
      });
    }
  }

  if (selectedCard) {
    const competencias = Array.from(
      new Set(transactionsToCreate.map((transaction) => transaction.competencia))
    );
    const statements = await Promise.all(
      competencias.map((competencia) =>
        getOrCreateCardStatement(prisma, selectedCard.id, competencia)
      )
    );
    const statementIdsByCompetencia = new Map(
      statements.map((statement) => [statement.competencia, statement.id])
    );

    for (const transaction of transactionsToCreate) {
      transaction.cardStatementId =
        statementIdsByCompetencia.get(transaction.competencia) ?? null;
    }
  }

  return prisma.$transaction(
    transactionsToCreate.map((transaction) =>
      prisma.transaction.create({
        data: transaction,
      })
    )
  );
}

async function getScopedTransaction(actor: TransactionActor, transactionId: string) {
  return prisma.transaction.findFirst({
    where: {
      id: transactionId,
      userId: { in: actor.memberIds },
    },
    include: {
      cardStatement: {
        select: {
          cardId: true,
        },
      },
    },
  });
}

function canMutateTransaction(actor: TransactionActor, transaction: Transaction) {
  return transaction.userId === actor.userId || actor.userRole === "admin";
}

export async function updateScopedTransaction(
  actor: TransactionActor,
  transactionId: string,
  input: UpdateTransactionInput
) {
  const existing = await getScopedTransaction(actor, transactionId);

  if (!existing) {
    return { kind: "not_found" as const };
  }

  if (!canMutateTransaction(actor, existing)) {
    return { kind: "forbidden" as const };
  }

  const selectedCard = input.cardId
    ? await getScopedCreditCard(prisma, input.cardId, actor.memberIds)
    : null;

  if (input.cardId && !selectedCard) {
    throw new Error("Cartão selecionado não foi encontrado");
  }

  if (!input.applyToSeries || !existing.isRecurring || !existing.recurringId) {
    const data = buildTransactionUpdateData(actor, existing.userId, input);
    const effectiveCompetencia =
      typeof data.competencia === "string"
        ? data.competencia
        : existing.competencia;
    const requestedCardId =
      input.cardId !== undefined ? input.cardId : existing.cardStatement?.cardId;

    if (input.cardId !== undefined || (requestedCardId && input.competencia !== undefined)) {
      data.cardStatementId = requestedCardId
        ? await resolveCardStatementId(actor, requestedCardId, effectiveCompetencia)
        : null;
    }

    const updated = await prisma.transaction.update({
      where: { id: transactionId },
      data,
    });

    return { kind: "ok" as const, transaction: updated };
  }

  const recurringId = existing.recurringId;
  const futureTransactions = await prisma.transaction.findMany({
    where: {
      recurringId,
      id: { not: transactionId },
      userId: { in: actor.memberIds },
      competencia: { gte: existing.competencia },
    },
    orderBy: { date: "asc" },
    select: {
      id: true,
      competencia: true,
      userId: true,
    },
  });

  const currentUpdateData = buildTransactionUpdateData(actor, existing.userId, input);
  const currentCompetencia =
    typeof currentUpdateData.competencia === "string"
      ? currentUpdateData.competencia
      : existing.competencia;
  const requestedCardId =
    input.cardId !== undefined ? input.cardId : existing.cardStatement?.cardId;
  const resolvedCardId = selectedCard?.id ?? requestedCardId ?? null;

  const needsCurrentStatement =
    input.cardId !== undefined || (requestedCardId && input.competencia !== undefined);
  const needsFutureStatements = input.cardId !== undefined || Boolean(requestedCardId);

  const statementIdsByCompetencia = new Map<string, string>();
  if (resolvedCardId) {
    const statementCompetencias = new Set<string>();

    if (needsCurrentStatement) {
      statementCompetencias.add(currentCompetencia);
    }

    if (needsFutureStatements) {
      for (const futureTransaction of futureTransactions) {
        statementCompetencias.add(futureTransaction.competencia);
      }
    }

    if (statementCompetencias.size > 0) {
      const statements = await Promise.all(
        Array.from(statementCompetencias).map((competencia) =>
          getOrCreateCardStatement(prisma, resolvedCardId, competencia)
        )
      );

      for (const statement of statements) {
        statementIdsByCompetencia.set(statement.competencia, statement.id);
      }
    }
  }

  if (needsCurrentStatement) {
    currentUpdateData.cardStatementId = resolvedCardId
      ? statementIdsByCompetencia.get(currentCompetencia) ?? null
      : null;
  }

  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.transaction.update({
      where: { id: transactionId },
      data: currentUpdateData,
    }),
  ];

  for (const futureTransaction of futureTransactions) {
    const futureUpdateData = buildTransactionUpdateData(
      actor,
      futureTransaction.userId,
      input,
      futureTransaction.competencia
    );

    if (needsFutureStatements) {
      futureUpdateData.cardStatementId = resolvedCardId
        ? statementIdsByCompetencia.get(futureTransaction.competencia) ?? null
        : null;
    }

    operations.push(
      prisma.transaction.update({
        where: { id: futureTransaction.id },
        data: futureUpdateData,
      })
    );
  }

  const templateUpdateData = buildRecurringTemplateUpdateData(input);
  if (Object.keys(templateUpdateData).length > 0) {
    operations.push(
      prisma.recurringTemplate.update({
        where: { id: recurringId },
        data: templateUpdateData,
      })
    );
  }

  const [updated] = await prisma.$transaction(operations);

  return { kind: "ok" as const, transaction: updated };
}

export async function deleteScopedTransaction(
  actor: TransactionActor,
  transactionId: string,
  scope: TransactionDeleteScope = "single"
) {
  const existing = await getScopedTransaction(actor, transactionId);

  if (!existing) {
    return { kind: "not_found" as const };
  }

  if (!canMutateTransaction(actor, existing)) {
    return { kind: "forbidden" as const };
  }

  if (scope === "series" && existing.isRecurring && existing.recurringId) {
    await prisma.$transaction([
      prisma.transaction.deleteMany({
        where: {
          recurringId: existing.recurringId,
          userId: { in: actor.memberIds },
        },
      }),
      prisma.recurringTemplate.deleteMany({
        where: { id: existing.recurringId },
      }),
    ]);

    return { kind: "ok" as const };
  }

  await prisma.$transaction([
    prisma.transaction.deleteMany({
      where: { parentId: transactionId },
    }),
    prisma.transaction.delete({
      where: { id: transactionId },
    }),
  ]);

  return { kind: "ok" as const };
}
