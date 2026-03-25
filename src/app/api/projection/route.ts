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

    const userId = (session.user as { id: string }).id;
    const { searchParams } = new URL(request.url);
    const monthsParam = searchParams.get("months");
    const totalMonths = monthsParam ? Math.min(parseInt(monthsParam), 36) : 12;

    if (isNaN(totalMonths) || totalMonths < 1) {
      return NextResponse.json({ error: "months deve ser um número positivo" }, { status: 400 });
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    // Get active recurring templates
    const templates = await prisma.recurringTemplate.findMany({
      where: { isActive: true },
    });

    // Get all future installment transactions
    const futureCompetencias: string[] = [];
    for (let i = 0; i < totalMonths; i++) {
      const d = new Date(currentYear, currentMonth + i, 1);
      futureCompetencias.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      );
    }

    const installmentTransactions = await prisma.transaction.findMany({
      where: {
        userId,
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

    // Get starting balance from the most recent month close
    const currentCompetencia = futureCompetencias[0];
    const [cYear, cMonth] = currentCompetencia.split("-").map(Number);
    const prevDate = new Date(cYear, cMonth - 2, 1);
    const prevCompetencia = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

    const lastClose = await prisma.monthClose.findUnique({
      where: { competencia: prevCompetencia },
    });

    let rollingBalance = lastClose?.closingBalance || 0;

    // Also get current month actual transactions for the first month
    const currentMonthTxs = await prisma.transaction.findMany({
      where: { userId, competencia: currentCompetencia },
      select: { amount: true, type: true },
    });

    const projection = futureCompetencias.map((comp, index) => {
      let projectedIncome = 0;
      let projectedExpense = 0;

      // Add recurring templates applicable to this month
      for (const tpl of templates) {
        if (comp < tpl.startDate) continue;
        if (tpl.endDate && comp > tpl.endDate) continue;

        if (tpl.type === "income") {
          projectedIncome += tpl.amount;
        } else {
          projectedExpense += tpl.amount;
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
