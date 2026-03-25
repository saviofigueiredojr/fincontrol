import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const { searchParams } = new URL(request.url);
    const competencia = searchParams.get("competencia");

    if (competencia && !/^\d{4}-\d{2}$/.test(competencia)) {
      return NextResponse.json(
        { error: "Parâmetro competencia inválido (YYYY-MM)" },
        { status: 400 }
      );
    }

    const installments = await prisma.transaction.findMany({
      where: {
        userId,
        type: "expense",
        installmentTotal: { not: null },
        installmentCurrent: { not: null },
        ...(competencia ? { competencia: { gte: competencia } } : {}),
      },
      orderBy: [{ competencia: "asc" }, { installmentCurrent: "asc" }],
      select: {
        id: true,
        parentId: true,
        description: true,
        amount: true,
        competencia: true,
        installmentCurrent: true,
        installmentTotal: true,
      },
    });

    const grouped = new Map<string, typeof installments>();
    for (const item of installments) {
      const key = item.parentId ?? item.id;
      const current = grouped.get(key) ?? [];
      current.push(item);
      grouped.set(key, current);
    }

    const result = Array.from(grouped.entries())
      .map(([id, txs]) => {
        const sorted = [...txs].sort((a, b) => {
          if (a.competencia === b.competencia) {
            return (a.installmentCurrent ?? 0) - (b.installmentCurrent ?? 0);
          }
          return a.competencia.localeCompare(b.competencia);
        });

        const currentTx = competencia
          ? sorted.find((tx) => tx.competencia >= competencia)
          : sorted[0];

        if (!currentTx) return null;

        const totalInstallments = currentTx.installmentTotal ?? 0;
        const currentInstallment = currentTx.installmentCurrent ?? 1;
        const remainingMonths = Math.max(totalInstallments - currentInstallment + 1, 0);
        if (remainingMonths <= 0) return null;

        const description = String(currentTx.description).replace(/\s*\(\d+\/\d+\)\s*$/, "");
        const monthlyAmount = currentTx.amount;

        return {
          id,
          description,
          currentInstallment,
          totalInstallments,
          monthlyAmount,
          remainingMonths,
          totalRemaining: monthlyAmount * remainingMonths,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.description.localeCompare(b.description));

    return NextResponse.json(result);
  } catch (error) {
    console.error("List installments error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
