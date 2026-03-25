import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const cardId = params.id;
    const { searchParams } = new URL(request.url);
    const competencia = searchParams.get("competencia");

    if (competencia && !/^\d{4}-\d{2}$/.test(competencia)) {
      return NextResponse.json(
        { error: "Parâmetro competencia inválido (YYYY-MM)" },
        { status: 400 }
      );
    }

    const card = await prisma.creditCard.findFirst({
      where: { id: cardId, userId },
      select: { id: true },
    });

    if (!card) {
      return NextResponse.json({ error: "Cartão não encontrado" }, { status: 404 });
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        cardStatement: { cardId },
        ...(competencia ? { competencia } : {}),
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        date: true,
        description: true,
        category: true,
        amount: true,
        installmentCurrent: true,
        installmentTotal: true,
      },
    });

    return NextResponse.json(
      transactions.map((tx) => ({
        id: tx.id,
        date: tx.date,
        description: tx.description,
        category: tx.category,
        amount: tx.amount,
        currentInstallment: tx.installmentCurrent,
        totalInstallments: tx.installmentTotal,
      }))
    );
  } catch (error) {
    console.error("Card transactions error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
