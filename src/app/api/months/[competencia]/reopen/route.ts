import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: NextRequest,
  { params }: { params: { competencia: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { competencia } = params;

    if (!/^\d{4}-\d{2}$/.test(competencia)) {
      return NextResponse.json(
        { error: "Formato de competência inválido (YYYY-MM)" },
        { status: 400 }
      );
    }

    const monthClose = await prisma.monthClose.findUnique({
      where: { competencia },
    });

    if (!monthClose) {
      return NextResponse.json(
        { error: "Fechamento não encontrado para esta competência" },
        { status: 404 }
      );
    }

    if (monthClose.status === "open") {
      return NextResponse.json(
        { error: "Este mês já está aberto" },
        { status: 400 }
      );
    }

    const updated = await prisma.monthClose.update({
      where: { competencia },
      data: {
        status: "open",
        closedAt: null,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Reopen month error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
