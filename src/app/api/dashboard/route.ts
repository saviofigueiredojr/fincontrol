import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { getHouseholdForUser } from "@/lib/household";
import { ReserveBenchmarkService } from "@/modules/analytics/reserve-benchmark.service";
import { competenciaToLabel, normalizeCategoryKey } from "@/lib/utils";

export const dynamic = "force-dynamic";

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
    const { householdId, memberIds } = await getHouseholdForUser(userId);

    // 1. Totals for the given competencia
    // Visibility: household members only, excluding partner's secret transactions
    const transactions = await prisma.transaction.findMany({
      where: {
        competencia,
        userId: { in: memberIds },
        OR: [
          { isSecret: false },
          { isSecret: true, userId },
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
        userId: { in: memberIds },
        OR: [
          { isSecret: false },
          { isSecret: true, userId },
        ],
      },
      select: { competencia: true, type: true, amount: true },
    });

    const chartData = chartMonths.map((comp) => {
      const monthTxs = chartTransactions.filter((t) => t.competencia === comp);
      const income = monthTxs
        .filter((t) => t.type === "income")
        .reduce((s, t) => s + t.amount, 0);
      const expense = monthTxs
        .filter((t) => t.type === "expense")
        .reduce((s, t) => s + t.amount, 0);

      return {
        competencia: comp,
        label: competenciaToLabel(comp),
        income,
        expense,
        balance: income - expense,
      };
    });

    // 3. Top 5 categories by expense
    const expenseByCategory = new Map<string, { label: string; amount: number }>();
    transactions
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        const key = normalizeCategoryKey(t.category);
        const current = expenseByCategory.get(key) ?? { label: t.category, amount: 0 };
        current.amount += t.amount;
        if (!current.label) current.label = t.category;
        expenseByCategory.set(key, current);
      });

    const topCategories = Array.from(expenseByCategory.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map(({ label, amount }) => ({ category: label, amount }));

    // 4. Active installments (household scoped)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeInstallmentTransactions = await prisma.transaction.findMany({
      where: {
        installmentTotal: { not: null },
        date: { gte: today },
        userId: { in: memberIds },
        OR: [
          { isSecret: false },
          { isSecret: true, userId },
        ],
      },
      orderBy: [{ date: "asc" }, { installmentCurrent: "asc" }],
      select: {
        id: true,
        parentId: true,
        description: true,
        amount: true,
        date: true,
        installmentCurrent: true,
        installmentTotal: true,
      },
    });

    const installmentGroups = new Map<string, typeof activeInstallmentTransactions>();
    for (const item of activeInstallmentTransactions) {
      const key = item.parentId ?? item.id;
      const current = installmentGroups.get(key) ?? [];
      current.push(item);
      installmentGroups.set(key, current);
    }

    const activeInstallments = Array.from(installmentGroups.entries())
      .map(([id, items]) => {
        const nextInstallment = [...items].sort((a, b) => a.date.getTime() - b.date.getTime())[0];
        if (!nextInstallment || !nextInstallment.installmentTotal || !nextInstallment.installmentCurrent) {
          return null;
        }

        return {
          id,
          description: nextInstallment.description.replace(/\s*\(\d+\/\d+\)\s*$/, ""),
          currentInstallment: nextInstallment.installmentCurrent,
          totalInstallments: nextInstallment.installmentTotal,
          amount: nextInstallment.amount,
          nextDueDate: nextInstallment.date,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime())
      .slice(0, 8);

    // 5. Budget progress per category (household scoped)
    const budgetSettings = await prisma.setting.findMany({
      where: {
        householdId,
        key: { startsWith: "budget_" },
      },
    });

    const recurringBudgetTemplates = await prisma.recurringTemplate.findMany({
      where: {
        householdId,
        isActive: true,
        type: "expense",
        startDate: { lte: competencia },
        OR: [
          { endDate: null },
          { endDate: { gte: competencia } },
        ],
      },
    });

    const recurringBudgetByCategory = new Map<string, { label: string; budget: number }>();
    for (const template of recurringBudgetTemplates) {
      const key = normalizeCategoryKey(template.category);
      const current = recurringBudgetByCategory.get(key) ?? {
        label: template.category,
        budget: 0,
      };
      current.budget += template.amount;
      recurringBudgetByCategory.set(key, current);
    }

    const explicitBudgetByCategory = new Map<string, { label: string; budget: number }>();
    for (const setting of budgetSettings) {
      const category = setting.key.replace("budget_", "");
      const key = normalizeCategoryKey(category);
      explicitBudgetByCategory.set(key, {
        label: category,
        budget: parseFloat(setting.value),
      });
    }

    const budgetKeys = new Set<string>([
      ...Array.from(expenseByCategory.keys()),
      ...Array.from(recurringBudgetByCategory.keys()),
      ...Array.from(explicitBudgetByCategory.keys()),
    ]);

    const budgetProgress = Array.from(budgetKeys)
      .map((key) => {
        const actual = expenseByCategory.get(key)?.amount ?? 0;
        const explicitBudget = explicitBudgetByCategory.get(key);
        const recurringBudget = recurringBudgetByCategory.get(key);
        const budget = explicitBudget?.budget ?? recurringBudget?.budget ?? 0;
        const category =
          explicitBudget?.label ??
          expenseByCategory.get(key)?.label ??
          recurringBudget?.label ??
          "Categoria";

        if (budget <= 0 && actual <= 0) {
          return null;
        }

        return {
          category,
          budget,
          spent: actual,
          remaining: budget - actual,
          percentage: budget > 0 ? Math.round((actual / budget) * 100) : 0,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.spent - a.spent);

    // 6. Meta de Reserva e Lifespan
    const reserveGoal = await prisma.goal.findFirst({ where: { householdId }, orderBy: { createdAt: 'asc' } });
    const meta = reserveGoal ? {
      current: reserveGoal.currentAmount,
      target: reserveGoal.targetAmount,
      percentage: reserveGoal.targetAmount > 0 ? (reserveGoal.currentAmount / reserveGoal.targetAmount) * 100 : 0
    } : { current: 0, target: 0, percentage: 0 };

    // Calcula o lifespan baseado na média real de despesas dos últimos meses capturados no chartData
    const last6MonthsExpenses = chartData.map(c => c.expense);
    const lifespan = ReserveBenchmarkService.calculateLifespan(meta.current, last6MonthsExpenses);

    return NextResponse.json({
      totalIncome,
      totalExpense,
      balance,
      chartData,
      topCategories,
      activeInstallments,
      budgetProgress,
      meta: { ...meta, lifespan }
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
