import { prisma } from "./prisma";

/**
 * Get the household context for a given user.
 * Returns householdId and all member user IDs in the same household.
 * Used to scope all queries so users only see their household's data.
 */
export async function getHouseholdForUser(userId: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { householdId: true },
    });

    if (!user) {
        throw new Error("User not found");
    }

    const members = await prisma.user.findMany({
        where: { householdId: user.householdId },
        select: { id: true },
    });

    return {
        householdId: user.householdId,
        memberIds: members.map((m) => m.id),
    };
}
