import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PjAutomationService } from "@/modules/pj/pj-automation.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        if (!process.env.CRON_SECRET) {
            return NextResponse.json(
                { error: "Cron route is disabled: CRON_SECRET is not configured" },
                { status: 503 }
            );
        }

        const authHeader = request.headers.get("authorization");
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const today = new Date();
        const currentYear = today.getUTCFullYear();
        const currentMonthNum = today.getUTCMonth() + 1;
        const currentDay = today.getUTCDate();
        const targetMonth = `${currentYear}-${currentMonthNum.toString().padStart(2, "0")}`;
        const targetDateStr = `${currentYear}-${currentMonthNum.toString().padStart(2, "0")}-${currentDay.toString().padStart(2, "0")}`;

        // Get all active retainers
        const retainers = await prisma.pjRetainer.findMany({
            where: { active: true },
        });

        if (retainers.length === 0) {
            return NextResponse.json({ success: true, generated: 0, message: "No active retainers found" });
        }

        // Get existing receipts for this month linked to these retainers
        const retainerIds = retainers.map(r => r.id);
        const existingReceipts = await prisma.pjReceipt.findMany({
            where: {
                retainerId: { in: retainerIds },
                competencia: targetMonth
            },
            select: { retainerId: true, competencia: true }
        });

        // Run the domain logic
        const receiptsToCreate = PjAutomationService.getReceiptsToGenerate(
            retainers,
            existingReceipts,
            targetMonth,
            targetDateStr
        );

        if (receiptsToCreate.length === 0) {
            return NextResponse.json({ success: true, generated: 0 });
        }

        // Since our domain function returns Partial<PjReceipt>, we need to map userId since retainers only have householdId.
        // Retainers belong to a household, but PjReceipts also need a userId. We'll just grab the first admin user
        // or the owner of the household.

        // To solve this reliably, we can fetch one user from the household for each retainer.
        const createdCount = await prisma.$transaction(async (tx) => {
            let count = 0;
            for (const rx of receiptsToCreate) {
                // Find a user belonging to the household
                const userInHousehold = await tx.user.findFirst({
                    where: { householdId: rx.householdId },
                    select: { id: true }
                });

                if (!userInHousehold) continue;

                await tx.pjReceipt.create({
                    data: {
                        retainerId: rx.retainerId,
                        householdId: rx.householdId!,
                        userId: userInHousehold.id, // assigned to the first user in the HH
                        clientName: rx.clientName!,
                        description: rx.description!,
                        amount: rx.amount!,
                        dueDate: rx.dueDate!,
                        status: rx.status!,
                        competencia: rx.competencia!,
                    }
                });
                count++;
            }
            return count;
        });

        return NextResponse.json({ success: true, generated: createdCount });
    } catch (error) {
        console.error("Cron Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
