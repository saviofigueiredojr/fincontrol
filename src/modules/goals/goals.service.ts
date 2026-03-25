import { prisma } from "@/lib/prisma";
import { UpdateGoalInput } from "./goals.schemas";

function parseDeadline(deadline: string | null | undefined) {
  if (deadline === undefined) {
    return { hasValue: false as const };
  }

  if (deadline === null || deadline === "") {
    return { hasValue: true as const, value: null };
  }

  const parsed = new Date(deadline);

  if (Number.isNaN(parsed.getTime())) {
    return { hasValue: true as const, invalid: true as const };
  }

  return { hasValue: true as const, value: parsed };
}

export async function listGoals(householdId: string) {
  return prisma.goal.findMany({
    where: { householdId },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateGoal(
  householdId: string,
  input: UpdateGoalInput
) {
  const existingGoal = await prisma.goal.findFirst({
    where: {
      id: input.id,
      householdId,
    },
  });

  if (!existingGoal) {
    return { kind: "not_found" as const };
  }

  const parsedDeadline = parseDeadline(input.deadline);
  if ("invalid" in parsedDeadline) {
    return { kind: "invalid_deadline" as const };
  }

  const data: {
    name?: string;
    targetAmount?: number;
    currentAmount?: number;
    deadline?: Date | null;
  } = {};

  if (input.name !== undefined) {
    data.name = input.name;
  }

  if (input.targetAmount !== undefined) {
    data.targetAmount = input.targetAmount;
  }

  if (input.currentAmount !== undefined) {
    data.currentAmount = input.currentAmount;
  }

  if (parsedDeadline.hasValue) {
    data.deadline = parsedDeadline.value;
  }

  const goal = await prisma.goal.update({
    where: { id: input.id },
    data,
  });

  return { kind: "ok" as const, goal };
}
