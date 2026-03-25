import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CloseMonthInput } from "./months.schemas";
import { SettleUpService } from "../closing/settleup.service";

type DatabaseClient = typeof prisma | Prisma.TransactionClient;

export interface MonthActor {
  userId: string;
  householdId: string;
  memberIds: string[];
}

function getPreviousCompetencia(competencia: string) {
  const [year, month] = competencia.split("-").map(Number);
  const previousMonthDate = new Date(year, month - 2, 1);

  return `${previousMonthDate.getFullYear()}-${String(
    previousMonthDate.getMonth() + 1
  ).padStart(2, "0")}`;
}

function getNextCompetencia(competencia: string) {
  const [year, month] = competencia.split("-").map(Number);
  const nextMonthDate = new Date(year, month, 1);

  return `${nextMonthDate.getFullYear()}-${String(
    nextMonthDate.getMonth() + 1
  ).padStart(2, "0")}`;
}

function getCompetenciaStartDate(competencia: string) {
  const [year, month] = competencia.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

async function getMonthClose(
  db: DatabaseClient,
  householdId: string,
  competencia: string
) {
  return db.monthClose.findUnique({
    where: { householdId_competencia: { householdId, competencia } },
  });
}

async function getTransactionTotals(
  db: DatabaseClient,
  memberIds: string[],
  competencia: string
) {
  const transactions = await db.transaction.findMany({
    where: {
      userId: { in: memberIds },
      competencia,
    },
    select: {
      amount: true,
      type: true,
    },
  });

  const totalIncome = transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const totalExpense = transactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  return { totalIncome, totalExpense };
}

async function getOpeningBalance(
  db: DatabaseClient,
  householdId: string,
  competencia: string
) {
  const previousMonth = await getMonthClose(
    db,
    householdId,
    getPreviousCompetencia(competencia)
  );

  return previousMonth?.closingBalance ?? 0;
}

async function allocateGoals(
  db: DatabaseClient,
  householdId: string,
  metaAllocation: number
) {
  if (metaAllocation <= 0) {
    return;
  }

  const goals = await db.goal.findMany({
    where: { householdId },
    orderBy: { createdAt: "asc" },
  });

  if (goals.length === 0) {
    return;
  }

  const perGoal = metaAllocation / goals.length;

  await Promise.all(
    goals.map((goal) =>
      db.goal.update({
        where: { id: goal.id },
        data: {
          currentAmount: Math.min(goal.currentAmount + perGoal, goal.targetAmount),
        },
      })
    )
  );
}

async function refreshOpeningBalanceTransaction(
  db: DatabaseClient,
  actor: MonthActor,
  competencia: string,
  closingBalance: number
) {
  const nextCompetencia = getNextCompetencia(competencia);
  const nextMonthDate = getCompetenciaStartDate(nextCompetencia);

  await db.transaction.deleteMany({
    where: {
      userId: { in: actor.memberIds },
      competencia: nextCompetencia,
      source: "opening_balance",
    },
  });

  if (closingBalance === 0) {
    return;
  }

  await db.transaction.create({
    data: {
      date: nextMonthDate,
      competencia: nextCompetencia,
      description: `Saldo inicial (fechamento ${competencia})`,
      category: "Saldo Anterior",
      amount: Math.abs(closingBalance),
      type: closingBalance >= 0 ? "income" : "expense",
      ownership: "joint",
      source: "opening_balance",
      userId: actor.userId,
    },
  });
}

async function rollbackGoalAllocation(
  db: DatabaseClient,
  householdId: string,
  metaAllocation: number
) {
  if (metaAllocation <= 0) {
    return;
  }

  const goals = await db.goal.findMany({
    where: { householdId },
    orderBy: { createdAt: "asc" },
  });

  if (goals.length === 0) {
    return;
  }

  const perGoal = metaAllocation / goals.length;

  await Promise.all(
    goals.map((goal) =>
      db.goal.update({
        where: { id: goal.id },
        data: {
          currentAmount: Math.max(goal.currentAmount - perGoal, 0),
        },
      })
    )
  );
}

export async function getMonthSummary(actor: MonthActor, competencia: string) {
  const existingMonthClose = await getMonthClose(
    prisma,
    actor.householdId,
    competencia
  );

  if (existingMonthClose) {
    return existingMonthClose;
  }

  const [{ totalIncome, totalExpense }, openingBalance, transactions] = await Promise.all([
    getTransactionTotals(prisma, actor.memberIds, competencia),
    getOpeningBalance(prisma, actor.householdId, competencia),
    prisma.transaction.findMany({
      where: { userId: { in: actor.memberIds }, competencia },
      select: { userId: true, amount: true, type: true, ownership: true },
    })
  ]);

  const contributions = actor.memberIds.map(userId => {
    const userTxs = transactions.filter(t => t.userId === userId);
    return {
      userId,
      totalIncome: userTxs.filter(t => t.type === "income").reduce((acc, t) => acc + t.amount, 0),
      totalJointExpensesPaid: userTxs.filter(t => t.type === "expense" && t.ownership === "joint").reduce((acc, t) => acc + t.amount, 0),
    };
  });

  const settleUp = SettleUpService.calculateSettlement(contributions, "proportional");

  return {
    competencia,
    openingBalance,
    totalIncome,
    totalExpense,
    metaAllocation: 0,
    closingBalance: openingBalance + totalIncome - totalExpense,
    status: "open",
    closedAt: null,
    settleUp
  };
}

export async function closeMonth(actor: MonthActor, input: CloseMonthInput) {
  return prisma.$transaction(async (db) => {
    const existingMonthClose = await getMonthClose(
      db,
      actor.householdId,
      input.competencia
    );

    if (existingMonthClose?.status === "closed") {
      return { kind: "already_closed" as const };
    }

    const [{ totalIncome, totalExpense }, openingBalance, transactions] = await Promise.all([
      getTransactionTotals(db, actor.memberIds, input.competencia),
      getOpeningBalance(db, actor.householdId, input.competencia),
      db.transaction.findMany({
        where: { userId: { in: actor.memberIds }, competencia: input.competencia },
        select: { userId: true, amount: true, type: true, ownership: true },
      })
    ]);

    const contributions = actor.memberIds.map(userId => {
      const userTxs = transactions.filter(t => t.userId === userId);
      return {
        userId,
        totalIncome: userTxs.filter(t => t.type === "income").reduce((acc, t) => acc + t.amount, 0),
        totalJointExpensesPaid: userTxs.filter(t => t.type === "expense" && t.ownership === "joint").reduce((acc, t) => acc + t.amount, 0),
      };
    });

    // Automatic Debt transaction creation for the next month
    const settleUp = SettleUpService.calculateSettlement(contributions, "proportional");

    // We intentionally do NOT create formal transactions right away as it's better kept as a recommendation for now.
    // However, if the user requested it, we could insert a pending "Transferência" here.

    const closingBalance = openingBalance + totalIncome - totalExpense;

    const monthClose = await db.monthClose.upsert({
      where: {
        householdId_competencia: {
          householdId: actor.householdId,
          competencia: input.competencia,
        },
      },
      create: {
        householdId: actor.householdId,
        competencia: input.competencia,
        openingBalance,
        totalIncome,
        totalExpense,
        metaAllocation: input.metaAllocation,
        closingBalance,
        status: "closed",
        closedAt: new Date(),
      },
      update: {
        openingBalance,
        totalIncome,
        totalExpense,
        metaAllocation: input.metaAllocation,
        closingBalance,
        status: "closed",
        closedAt: new Date(),
      },
    });

    await allocateGoals(db, actor.householdId, input.metaAllocation);
    await refreshOpeningBalanceTransaction(
      db,
      actor,
      input.competencia,
      closingBalance
    );

    return { kind: "ok" as const, monthClose };
  });
}

export async function reopenMonth(householdId: string, competencia: string) {
  const existingMonthClose = await getMonthClose(prisma, householdId, competencia);

  if (!existingMonthClose) {
    return { kind: "not_found" as const };
  }

  if (existingMonthClose.status === "open") {
    return { kind: "already_open" as const };
  }

  const monthClose = await prisma.$transaction(async (db) => {
    await rollbackGoalAllocation(
      db,
      householdId,
      existingMonthClose.metaAllocation
    );

    const householdMembers = await db.user.findMany({
      where: { householdId },
      select: { id: true },
    });

    await db.transaction.deleteMany({
      where: {
        userId: { in: householdMembers.map((member) => member.id) },
        competencia: getNextCompetencia(competencia),
        source: "opening_balance",
      },
    });

    return db.monthClose.update({
      where: { householdId_competencia: { householdId, competencia } },
      data: {
        status: "open",
        closedAt: null,
      },
    });
  });

  return { kind: "ok" as const, monthClose };
}
