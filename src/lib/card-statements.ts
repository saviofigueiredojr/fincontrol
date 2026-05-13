import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type DatabaseClient = typeof prisma | Prisma.TransactionClient;

export async function getScopedCreditCard(
  db: DatabaseClient,
  cardId: string,
  memberIds: string[]
) {
  return db.creditCard.findFirst({
    where: {
      id: cardId,
      userId: { in: memberIds },
    },
    select: {
      id: true,
      name: true,
      bank: true,
      userId: true,
    },
  });
}

export async function getOrCreateCardStatement(
  db: DatabaseClient,
  cardId: string,
  competencia: string
) {
  const existing = await db.cardStatement.findUnique({
    where: {
      cardId_competencia: {
        cardId,
        competencia,
      },
    },
  });

  if (existing) {
    return existing;
  }

  return db.cardStatement.create({
    data: {
      cardId,
      competencia,
      totalAmount: 0,
      status: "open",
    },
  });
}

export async function refreshCardStatementTotals(
  db: DatabaseClient,
  statementIds: Array<string | null | undefined>
) {
  const uniqueIds = Array.from(
    new Set(statementIds.filter((id): id is string => Boolean(id)))
  );

  await Promise.all(
    uniqueIds.map(async (statementId) => {
      const transactions = await db.transaction.findMany({
        where: { cardStatementId: statementId },
        select: { amount: true },
      });

      const totalAmount = transactions.reduce(
        (sum, transaction) => sum + transaction.amount,
        0
      );

      await db.cardStatement.update({
        where: { id: statementId },
        data: { totalAmount },
      });
    })
  );
}
