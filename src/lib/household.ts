import { prisma } from "./prisma";

export interface HouseholdMember {
  id: string;
  name: string;
  email: string;
}

export interface HouseholdContext {
  householdId: string;
  self: HouseholdMember;
  partner: HouseholdMember | null;
  members: HouseholdMember[];
}

/**
 * Get the household context for a given user.
 * Returns householdId and all member user IDs in the same household.
 * Used to scope all queries so users only see their household's data.
 */
export async function getHouseholdForUser(userId: string) {
  const context = await getHouseholdContextForUser(userId);

  return {
    householdId: context.householdId,
    memberIds: context.members.map((member) => member.id),
  };
}

export async function getHouseholdContextForUser(
  userId: string
): Promise<HouseholdContext> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { householdId: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const members = await prisma.user.findMany({
    where: { householdId: user.householdId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  const self = members.find((member) => member.id === userId);

  if (!self) {
    throw new Error("Household member not found");
  }

  const partner = members.find((member) => member.id !== userId) ?? null;

  return {
    householdId: user.householdId,
    self,
    partner,
    members,
  };
}
