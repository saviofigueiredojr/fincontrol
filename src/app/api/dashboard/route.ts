import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const competencia = searchParams.get("competencia");

    if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) {
      return NextResponse.json(
        { error: "Parâmetro competencia (YYYY-MM) é obrigatório" },
        { status: 400 }
      );
    }

    const userId = (session.user as { id: string }).id;

    // 1. Totals for the given competencia
    // Show: user's own transactions + joint transactions
    const transactions = await prisma.transaction.findMany({
      where: {
        competencia,
        OR: [
          { userId },
          { ownership: "joint" },
        ],
      },
    });

    const totalIncome = transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const totalExpense = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    const balance = totalIncome - totalExpense;

    // 2. Monthly chart data for last 6 months
    const [year, month] = competencia.split("-").map(Number);
    const chartMonths: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1);
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      chartMonths.push(m);
    }

    const chartTransactions = await prisma.transaction.findMany({
      where: {
        competencia: { in: chartMonths },
        OR: [
          { userId },
          { ownership: "joint" },
        ],
      },
      select: { competencia: true, type: true, amount: true },
    });

    const chartData = chartMonths.map((comp) => {
      const monthTxs = chartTransactions.filter((t) => t.competencia === comp);
      return {
        competencia: comp,
        income: monthTxs
          .filter((t) => t.type === "income")
          .reduce((s, t) => s + t.amount, 0),
        expense: monthTxs
          .filter((t) => t.type === "expense")
          .reduce((s, t) => s + t.amount, 0),
      };
    });

    // 3. Top 5 categories by expense
    const expenseByCategory: Record<string, number> = {};
    transactions
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        expenseByCategory[t.category] =
          (expenseByCategory[t.category] || 0) + t.amount;
      });

    const topCategories = Object.entries(expenseByCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([category, amount]) => ({ category, amount }));

    // 4. Active installments count
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeInstallments = await prisma.transaction.count({
      where: {
        installmentTotal: { not: null },
        date: { gte: today },
        OR: [
          { userId },
          { ownership: "joint" },
        ],
      },
    });

    // 5. Budget progress per category
    const budgetSettings = await prisma.setting.findMany({
      where: { key: { startsWith: "budget_" } },
    });

    const budgetProgress = budgetSettings.map((s) => {
      const category = s.key.replace("budget_", "");
      const budgetAmount = parseFloat(s.value);
      const spent = expenseByCategory[category] || 0;
      return {
        category,
        budget: budgetAmount,
        spent,
        remaining: budgetAmount - spent,
        percentage: budgetAmount > 0 ? Math.round((spent / budgetAmount) * 100) : 0,
      };
    });

    return NextResponse.json({
      totalIncome,
      totalExpense,
      balance,
      chartData,
      topCategories,
      activeInstallments,
      budgetProgress,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
