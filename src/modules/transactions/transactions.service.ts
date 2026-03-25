import { Transaction } from "@prisma/client";
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

function buildSecretFilter(userId: string) {
  return {
    OR: [
      { isSecret: false },
      { isSecret: true, userId },
    ],
  };
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
    where.userId = actor.userId;
    where.ownership = { not: "joint" };
  } else if (filters.ownership === "partner") {
    where.userId = { in: actor.memberIds.filter((memberId) => memberId !== actor.userId) };
    where.ownership = { not: "joint" };
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
    where.description = { contains: filters.search };
  }

  return prisma.transaction.findMany({
    where,
    orderBy: { date: "desc" },
    include: {
      cardStatement: {
        include: { card: { select: { name: true, bank: true } } },
      },
    },
  });
}

export async function createTransactionWithInstallments(
  userId: string,
  input: CreateTransactionInput
) {
  return prisma.$transaction(async (transactionClient) => {
    const parsedDate = new Date(input.date);

    const mainTransaction = await transactionClient.transaction.create({
      data: {
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
        userId,
      },
    });

    const createdTransactions = [mainTransaction];

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

        const installment = await transactionClient.transaction.create({
          data: {
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
            parentId: mainTransaction.id,
            source: input.source,
            userId,
          },
        });

        createdTransactions.push(installment);
      }
    }

    return createdTransactions;
  });
}

async function getScopedTransaction(actor: TransactionActor, transactionId: string) {
  return prisma.transaction.findFirst({
    where: {
      id: transactionId,
      userId: { in: actor.memberIds },
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

  const data: Record<string, unknown> = { ...input };
  if (data.date) {
    data.date = new Date(data.date as string);
  }

  const updated = await prisma.transaction.update({
    where: { id: transactionId },
    data,
  });

  return { kind: "ok" as const, transaction: updated };
}

export async function deleteScopedTransaction(actor: TransactionActor, transactionId: string) {
  const existing = await getScopedTransaction(actor, transactionId);

  if (!existing) {
    return { kind: "not_found" as const };
  }

  if (!canMutateTransaction(actor, existing)) {
    return { kind: "forbidden" as const };
  }

  await prisma.$transaction(async (transactionClient) => {
    await transactionClient.transaction.deleteMany({
      where: { parentId: transactionId },
    });

    await transactionClient.transaction.delete({
      where: { id: transactionId },
    });
  });

  return { kind: "ok" as const };
}
