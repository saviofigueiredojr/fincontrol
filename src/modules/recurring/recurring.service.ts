import { randomUUID } from "crypto";
import { getOrCreateCardStatement, getScopedCreditCard } from "@/lib/card-statements";
import { prisma } from "@/lib/prisma";
import { shiftCompetencia } from "@/lib/utils";
import { CreateRecurringInput } from "./recurring.schemas";

const DEFAULT_GENERATION_HORIZON_MONTHS = 24;

export interface RecurringActor {
  userId: string;
  memberIds: string[];
  householdId: string;
}

function getPartnerUserId(memberIds: string[], currentUserId: string) {
  return memberIds.find((memberId) => memberId !== currentUserId) ?? currentUserId;
}

function getTransactionUserId(
  ownership: CreateRecurringInput["ownership"],
  currentUserId: string,
  memberIds: string[]
) {
  if (ownership === "mine") {
    return currentUserId;
  }

  if (ownership === "partner") {
    return getPartnerUserId(memberIds, currentUserId);
  }

  return currentUserId;
}

function getDateForCompetencia(competencia: string, desiredDay: number) {
  const [year, month] = competencia.split("-").map(Number);
  const maxDay = new Date(year, month, 0).getDate();
  const safeDay = Math.min(Math.max(desiredDay, 1), maxDay);
  return new Date(year, month - 1, safeDay);
}

function shouldCreateOccurrence(
  startDate: string,
  competencia: string,
  interval: CreateRecurringInput["interval"],
  intervalCount: number
) {
  const [startYear, startMonth] = startDate.split("-").map(Number);
  const [currentYear, currentMonth] = competencia.split("-").map(Number);
  const monthsDiff = (currentYear - startYear) * 12 + (currentMonth - startMonth);

  if (monthsDiff < 0) {
    return false;
  }

  if (interval === "yearly") {
    return monthsDiff % (12 * intervalCount) === 0;
  }

  return monthsDiff % intervalCount === 0;
}

export async function createRecurringTemplate(
  actor: RecurringActor,
  input: CreateRecurringInput
) {
  const selectedCard = input.cardId
    ? await getScopedCreditCard(prisma, input.cardId, actor.memberIds)
    : null;

  if (input.cardId && !selectedCard) {
    throw new Error("Cartão selecionado não encontrado");
  }

  const transactionUserId = getTransactionUserId(input.ownership, actor.userId, actor.memberIds);
  const lastCompetencia =
    input.endDate || shiftCompetencia(input.startDate, DEFAULT_GENERATION_HORIZON_MONTHS - 1);

  const competencias: string[] = [];
  let cursor = input.startDate;
  while (cursor <= lastCompetencia) {
    if (shouldCreateOccurrence(input.startDate, cursor, input.interval, input.intervalCount)) {
      competencias.push(cursor);
    }
    cursor = shiftCompetencia(cursor, 1);
  }

  let statementIdsByCompetencia = new Map<string, string>();
  if (selectedCard && competencias.length > 0) {
    const statements = await Promise.all(
      competencias.map((competencia) =>
        getOrCreateCardStatement(prisma, selectedCard.id, competencia)
      )
    );

    statementIdsByCompetencia = new Map(
      statements.map((statement) => [statement.competencia, statement.id])
    );
  }

  const recurringId = randomUUID();
  const transactionRows = competencias.map((competencia) => ({
    id: randomUUID(),
    date: getDateForCompetencia(competencia, input.dayOfMonth),
    competencia,
    description: input.description,
    category: input.category,
    amount: input.amount,
    type: input.type,
    ownership: input.ownership,
    isRecurring: true,
    recurringId,
    source: "recurring",
    userId: transactionUserId,
    cardStatementId: statementIdsByCompetencia.get(competencia) ?? null,
  }));

  const [template] = await prisma.$transaction([
    prisma.recurringTemplate.create({
      data: {
        id: recurringId,
        description: input.description,
        category: input.category,
        amount: input.amount,
        type: input.type,
        ownership: input.ownership,
        dayOfMonth: input.dayOfMonth,
        startDate: input.startDate,
        endDate: input.endDate || null,
        interval: input.interval,
        intervalCount: input.intervalCount,
        isVariable: input.isVariable,
        isActive: true,
        householdId: actor.householdId,
      },
    }),
    ...(transactionRows.length > 0
      ? [prisma.transaction.createMany({ data: transactionRows })]
      : []),
  ]);

  return template;
}
