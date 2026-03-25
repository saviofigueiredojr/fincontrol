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
    const competencia = searchParams.get("competencia");

    if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) {
      return NextResponse.json(
        { error: "Parâmetro competencia (YYYY-MM) é obrigatório" },
        { status: 400 }
      );
    }

    // Check if MonthClose exists
    const monthClose = await prisma.monthClose.findUnique({
      where: { competencia },
    });

    if (monthClose) {
      return NextResponse.json(monthClose);
    }

    // Calculate from transactions
    const transactions = await prisma.transaction.findMany({
      where: { userId, competencia },
    });

    const totalIncome = transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const totalExpense = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    // Get previous month's closing balance as opening balance
    const [year, month] = competencia.split("-").map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const prevCompetencia = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

    const prevMonth = await prisma.monthClose.findUnique({
      where: { competencia: prevCompetencia },
    });

    const openingBalance = prevMonth?.closingBalance || 0;
    const closingBalance = openingBalance + totalIncome - totalExpense;

    return NextResponse.json({
      competencia,
      openingBalance,
      totalIncome,
      totalExpense,
      metaAllocation: 0,
      closingBalance,
      status: "open",
      closedAt: null,
    });
  } catch (error) {
    console.error("Get month error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const body = await request.json();
    const { competencia, metaAllocation = 0 } = body;

    if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) {
      return NextResponse.json(
        { error: "competencia (YYYY-MM) é obrigatório" },
        { status: 400 }
      );
    }

    // Check if already closed
    const existing = await prisma.monthClose.findUnique({
      where: { competencia },
    });

    if (existing?.status === "closed") {
      return NextResponse.json(
        { error: "Este mês já está fechado" },
        { status: 400 }
      );
    }

    // Calculate totals from transactions
    const transactions = await prisma.transaction.findMany({
      where: { userId, competencia },
    });

    const totalIncome = transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const totalExpense = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    // Get opening balance from previous month
    const [year, month] = competencia.split("-").map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const prevCompetencia = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

    const prevMonth = await prisma.monthClose.findUnique({
      where: { competencia: prevCompetencia },
    });

    const openingBalance = prevMonth?.closingBalance || 0;
    const closingBalance = openingBalance + totalIncome - totalExpense;

    // Create or update MonthClose
    const monthClose = await prisma.monthClose.upsert({
      where: { competencia },
      create: {
        competencia,
        openingBalance,
        totalIncome,
        totalExpense,
        metaAllocation,
        closingBalance,
        status: "closed",
        closedAt: new Date(),
      },
      update: {
        openingBalance,
        totalIncome,
        totalExpense,
        metaAllocation,
        closingBalance,
        status: "closed",
        closedAt: new Date(),
      },
    });

    // Update goals with metaAllocation
    if (metaAllocation > 0) {
      const goals = await prisma.goal.findMany({
        orderBy: { createdAt: "asc" },
      });

      if (goals.length > 0) {
        // Distribute evenly among goals, or apply to first goal
        const perGoal = metaAllocation / goals.length;
        for (const goal of goals) {
          await prisma.goal.update({
            where: { id: goal.id },
            data: {
              currentAmount: Math.min(
                goal.currentAmount + perGoal,
                goal.targetAmount
              ),
            },
          });
        }
      }
    }

    // Create opening balance transaction for next month
    const nextDate = new Date(year, month, 1);
    const nextCompetencia = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;

    // Remove existing opening balance transaction for next month if any
    await prisma.transaction.deleteMany({
      where: {
        userId,
        competencia: nextCompetencia,
        source: "opening_balance",
      },
    });

    if (closingBalance !== 0) {
      await prisma.transaction.create({
        data: {
          date: nextDate,
          competencia: nextCompetencia,
          description: `Saldo inicial (fechamento ${competencia})`,
          category: "Saldo Anterior",
          amount: Math.abs(closingBalance),
          type: closingBalance >= 0 ? "income" : "expense",
          ownership: "joint",
          source: "opening_balance",
          userId,
        },
      });
    }

    return NextResponse.json(monthClose);
  } catch (error) {
    console.error("Close month error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
