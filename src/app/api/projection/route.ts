import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { getHouseholdForUser } from "@/lib/household";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const { householdId, memberIds } = await getHouseholdForUser(userId);
    const { searchParams } = new URL(request.url);
    const monthsParam = searchParams.get("months");
    const totalMonths = monthsParam ? Math.min(parseInt(monthsParam), 36) : 12;

    if (isNaN(totalMonths) || totalMonths < 1) {
      return NextResponse.json({ error: "months deve ser um número positivo" }, { status: 400 });
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    // Get active recurring templates (household scoped)
    const templates = await prisma.recurringTemplate.findMany({
      where: { isActive: true, householdId },
    });

    // Pre-calculate averages for variable templates
    const variableAverages: Record<string, number> = {};
    for (const tpl of templates) {
      if (tpl.isVariable) {
        const history = await prisma.transaction.findMany({
          where: {
            userId: { in: memberIds },
            category: tpl.category,
            description: tpl.description,
          },
          orderBy: { date: "desc" },
          take: 3,
          select: { amount: true }
        });
        if (history.length > 0) {
          const sum = history.reduce((s, h) => s + h.amount, 0);
          variableAverages[tpl.id] = sum / history.length;
        } else {
          variableAverages[tpl.id] = tpl.amount;
        }
      }
    }

    // Get all future installment transactions (household scoped)
    const futureCompetencias: string[] = [];
    for (let i = 0; i < totalMonths; i++) {
      const d = new Date(currentYear, currentMonth + i, 1);
      futureCompetencias.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      );
    }

    const installmentTransactions = await prisma.transaction.findMany({
      where: {
        userId: { in: memberIds },
        competencia: { in: futureCompetencias },
        installmentTotal: { not: null },
      },
      select: {
        competencia: true,
        amount: true,
        type: true,
        description: true,
        installmentCurrent: true,
        installmentTotal: true,
      },
    });

    // Get all future pending PJ receipts
    const pendingPjReceipts = await prisma.pjReceipt.findMany({
      where: {
        userId: { in: memberIds },
        competencia: { in: futureCompetencias },
        status: { in: ["unissued", "issued", "pending"] },
      },
      select: {
        competencia: true,
        amount: true,
      },
    });

    // Get starting balance from the most recent month close (compound key)
    const currentCompetencia = futureCompetencias[0];
    const [cYear, cMonth] = currentCompetencia.split("-").map(Number);
    const prevDate = new Date(cYear, cMonth - 2, 1);
    const prevCompetencia = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

    const lastClose = await prisma.monthClose.findUnique({
      where: { householdId_competencia: { householdId, competencia: prevCompetencia } },
    });

    let rollingBalance = lastClose?.closingBalance || 0;

    // Also get current month actual transactions for the first month (household scoped)
    const currentMonthTxs = await prisma.transaction.findMany({
      where: { userId: { in: memberIds }, competencia: currentCompetencia },
      select: { amount: true, type: true },
    });

    const projection = futureCompetencias.map((comp, index) => {
      let projectedIncome = 0;
      let projectedExpense = 0;

      // Add recurring templates applicable to this month
      for (const tpl of templates) {
        if (comp < tpl.startDate) continue;
        if (tpl.endDate && comp > tpl.endDate) continue;

        const startYear = parseInt(tpl.startDate.split("-")[0], 10);
        const startMonth = parseInt(tpl.startDate.split("-")[1], 10);
        const currentYear = parseInt(comp.split("-")[0], 10);
        const currentMonthNum = parseInt(comp.split("-")[1], 10);
        const monthsDiff = (currentYear - startYear) * 12 + (currentMonthNum - startMonth);

        const interval = tpl.interval || "monthly";
        const intervalCount = tpl.intervalCount || 1;

        if (interval === "yearly" && monthsDiff % (12 * intervalCount) !== 0) continue;
        if (interval === "monthly" && monthsDiff % intervalCount !== 0) continue;

        const amountToUse = tpl.isVariable ? (variableAverages[tpl.id] || tpl.amount) : tpl.amount;

        if (tpl.type === "income") {
          projectedIncome += amountToUse;
        } else {
          projectedExpense += amountToUse;
        }
      }

      // Collect known installments for this month
      const monthInstallments = installmentTransactions.filter(
        (t) => t.competencia === comp
      );

      const knownInstallments = monthInstallments.map((t) => ({
        description: t.description,
        amount: t.amount,
        installmentCurrent: t.installmentCurrent,
        installmentTotal: t.installmentTotal,
      }));

      // Add installment amounts to projections
      for (const inst of monthInstallments) {
        if (inst.type === "income") {
          projectedIncome += inst.amount;
        } else {
          projectedExpense += inst.amount;
        }
      }

      // Add PJ Receipts
      const monthPj = pendingPjReceipts.filter(p => p.competencia === comp);
      projectedIncome += monthPj.reduce((s, p) => s + p.amount, 0);

      // For the first month, use actual data if available
      if (index === 0 && currentMonthTxs.length > 0) {
        const actualIncome = currentMonthTxs
          .filter((t) => t.type === "income")
          .reduce((s, t) => s + t.amount, 0);
        const actualExpense = currentMonthTxs
          .filter((t) => t.type === "expense")
          .reduce((s, t) => s + t.amount, 0);

        // Use whichever is higher: actual or projected
        projectedIncome = Math.max(projectedIncome, actualIncome);
        projectedExpense = Math.max(projectedExpense, actualExpense);
      }

      rollingBalance = rollingBalance + projectedIncome - projectedExpense;

      return {
        competencia: comp,
        projectedIncome: Math.round(projectedIncome * 100) / 100,
        projectedExpense: Math.round(projectedExpense * 100) / 100,
        projectedBalance: Math.round(rollingBalance * 100) / 100,
        knownInstallments,
      };
    });

    return NextResponse.json(projection);
  } catch (error) {
    console.error("Projection error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
