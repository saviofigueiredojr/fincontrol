export interface UserContribution {
    userId: string;
    totalIncome: number;
    totalJointExpensesPaid: number;
}

export interface Settlement {
    fromUserId: string;
    toUserId: string;
    amount: number;
}

export class SettleUpService {
    /**
     * Calculates the required transfers between household members to equalize joint expenses.
     * Ensures a zero-sum game where no money is created or destroyed.
     */
    static calculateSettlement(
        contributions: UserContribution[],
        strategy: "fifty-fifty" | "proportional"
    ): { targetContributions: any[]; settlements: Settlement[] } {
        if (contributions.length === 0) return { targetContributions: [], settlements: [] };

        const totalIncome = contributions.reduce((acc, c) => acc + c.totalIncome, 0);
        const totalJoint = contributions.reduce((acc, c) => acc + c.totalJointExpensesPaid, 0);

        const targetContributions = contributions.map((c) => {
            let ratio = 1 / contributions.length;
            if (strategy === "proportional" && totalIncome > 0) {
                ratio = c.totalIncome / totalIncome;
            }

            const targetAmount = totalJoint * ratio;
            return {
                userId: c.userId,
                targetAmount,
                actualPaid: c.totalJointExpensesPaid,
                balance: c.totalJointExpensesPaid - targetAmount, // (+) owed to them, (-) they owe
            };
        });

        const debtors = targetContributions
            .filter((c) => c.balance < -0.01)
            .map((c) => ({ ...c, balance: Math.abs(c.balance) }));
        const creditors = targetContributions
            .filter((c) => c.balance > 0.01)
            .map((c) => ({ ...c }));

        const settlements: Settlement[] = [];
        let dIndex = 0;
        let cIndex = 0;

        while (dIndex < debtors.length && cIndex < creditors.length) {
            const debtor = debtors[dIndex];
            const creditor = creditors[cIndex];

            const amountToSettle = Math.min(debtor.balance, creditor.balance);

            settlements.push({
                fromUserId: debtor.userId,
                toUserId: creditor.userId,
                amount: Number(amountToSettle.toFixed(2)),
            });

            debtor.balance -= amountToSettle;
            creditor.balance -= amountToSettle;

            if (debtor.balance < 0.01) dIndex++;
            if (creditor.balance < 0.01) cIndex++;
        }

        return { targetContributions, settlements };
    }
}
