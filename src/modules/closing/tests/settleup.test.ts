import { describe, it, expect } from "vitest";
import { SettleUpService } from "../settleup.service";

describe("SettleUpService", () => {
    it("should calculate 50/50 split evenly when incomes don't matter", () => {
        const contributions = [
            { userId: "A", totalIncome: 10000, totalJointExpensesPaid: 1500 },
            { userId: "B", totalIncome: 5000, totalJointExpensesPaid: 500 },
        ]; // Total joint = 2000. Each should pay 1000. A paid 1500, B paid 500.
        // B owes A 500.

        const { settlements } = SettleUpService.calculateSettlement(contributions, "fifty-fifty");

        expect(settlements).toHaveLength(1);
        expect(settlements[0]).toMatchObject({
            fromUserId: "B",
            toUserId: "A",
            amount: 500
        });
    });

    it("should calculate proportional split based on income", () => {
        const contributions = [
            { userId: "A", totalIncome: 15000, totalJointExpensesPaid: 1000 },
            { userId: "B", totalIncome: 5000, totalJointExpensesPaid: 1000 },
        ]; // Total joint = 2000. ratio A = 75%, B = 25%.
        // Target A = 1500. Target B = 500.
        // A paid 1000 (owes 500). B paid 1000 (owed 500).
        // A owes B 500.

        const { settlements } = SettleUpService.calculateSettlement(contributions, "proportional");

        expect(settlements).toHaveLength(1);
        expect(settlements[0]).toMatchObject({
            fromUserId: "A",
            toUserId: "B",
            amount: 500
        });
    });

    it("should return zero settlements if everything is balanced perfectly", () => {
        const contributions = [
            { userId: "A", totalIncome: 5000, totalJointExpensesPaid: 1000 },
            { userId: "B", totalIncome: 5000, totalJointExpensesPaid: 1000 },
        ];

        const { settlements } = SettleUpService.calculateSettlement(contributions, "fifty-fifty");
        expect(settlements).toHaveLength(0);
    });

    it("math proof: zero-sum balance", () => {
        const contributions = [
            { userId: "A", totalIncome: 8431.25, totalJointExpensesPaid: 2130.45 },
            { userId: "B", totalIncome: 4120.90, totalJointExpensesPaid: 80.10 },
            { userId: "C", totalIncome: 12000.00, totalJointExpensesPaid: 0 },
        ];

        const { settlements } = SettleUpService.calculateSettlement(contributions, "proportional");

        const totalExchanged = settlements.reduce((acc, s) => acc + s.amount, 0);
        expect(totalExchanged).toBeGreaterThan(0);

        // Verification of conservation of mass:
        const initialTotal = contributions.reduce((acc, c) => acc + c.totalJointExpensesPaid, 0);

        const finalBalances = contributions.reduce((acc, c) => {
            acc[c.userId] = c.totalJointExpensesPaid;
            return acc;
        }, {} as Record<string, number>);

        // simulate transfers
        for (const s of settlements) {
            finalBalances[s.fromUserId] += s.amount; // they spend more
            finalBalances[s.toUserId] -= s.amount;   // they receive money back
        }

        const finalTotal = Object.values(finalBalances).reduce((acc, v) => acc + v, 0);
        // Should only deviate by tiny floating points, so approx equal
        expect(Math.abs(initialTotal - finalTotal)).toBeLessThan(0.05);
    });
});
