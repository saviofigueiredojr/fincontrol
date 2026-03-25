export class ReserveBenchmarkService {
    /**
     * Calculates the lifespan of the current emergency reserve in months.
     * Lifespan = Current Reserve / Average Monthly Expenses (from last N months).
     */
    static calculateLifespan(currentReserve: number, pastExpenses: number[]): number {
        if (currentReserve <= 0) return 0;
        if (pastExpenses.length === 0) return 0;

        const totalExpenses = pastExpenses.reduce((sum, val) => sum + val, 0);
        if (totalExpenses <= 0) return 999; // Infinite lifespan (or a cap of 999) if no expenses

        const averageMonthlyExpense = totalExpenses / pastExpenses.length;
        return Number((currentReserve / averageMonthlyExpense).toFixed(1));
    }
}
