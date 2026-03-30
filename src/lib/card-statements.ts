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
