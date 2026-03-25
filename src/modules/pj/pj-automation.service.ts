import { PjRetainer, PjReceipt } from "@prisma/client";

export class PjAutomationService {
    /**
     * Calculates the exact tax amount based on the receipt amount and the household's set tax rate.
     * @param amount The gross receipt amount
     * @param taxRate The percentage tax rate (e.g., 6.0 for 6%)
     * @returns The exact calculated tax equivalent, or 0 if disabled
     */
    static calculateTaxProvision(amount: number, taxRate?: number | null): number {
        if (!taxRate || taxRate <= 0) return 0;
        return Number(((amount * taxRate) / 100).toFixed(2));
    }

    /**
     * Pure domain function to calculate which PjReceipts need to be generated 
     * based on the active retainers and the existing receipts context for the given month.
     */
    static getReceiptsToGenerate(
        retainers: Pick<PjRetainer, "id" | "householdId" | "clientName" | "description" | "amount" | "dueDay" | "active">[],
        existingReceipts: Pick<PjReceipt, "retainerId" | "competencia">[],
        targetMonth: string, // YYYY-MM
        targetDateStr: string // YYYY-MM-DD
    ) {
        const receiptsToCreate = [];
        const [yearStr, monthStr, dayStr] = targetDateStr.split('-');
        const currentYear = parseInt(yearStr, 10);
        const currentMonth = parseInt(monthStr, 10); // 1-indexed
        const currentDay = parseInt(dayStr, 10);

        for (const retainer of retainers) {
            if (!retainer.active) continue;

            // Only generate if we reached or passed the due day for the month
            if (currentDay < retainer.dueDay) continue;

            const alreadyGenerated = existingReceipts.some(
                (r) => r.retainerId === retainer.id && r.competencia === targetMonth
            );
            if (alreadyGenerated) continue;

            // Construction of exact due date preserving local time boundaries by using explicit components
            const dueDate = new Date(currentYear, currentMonth - 1, retainer.dueDay);

            receiptsToCreate.push({
                retainerId: retainer.id,
                householdId: retainer.householdId,
                clientName: retainer.clientName,
                description: retainer.description,
                amount: retainer.amount,
                dueDate,
                status: "unissued" as const,
                competencia: targetMonth,
            });
        }

        return receiptsToCreate;
    }
}
