import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function isValidDay(value: unknown) {
  return typeof value === "number" && value >= 1 && value <= 31;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const body = await request.json();
    const { name, bank, closingDay, dueDay } = body;

    if (!name || !bank || !isValidDay(closingDay) || !isValidDay(dueDay)) {
      return NextResponse.json(
        { error: "Campos obrigatórios: name, bank, closingDay, dueDay" },
        { status: 400 }
      );
    }

    const existing = await prisma.creditCard.findFirst({
      where: {
        id: params.id,
        userId,
      },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Cartão não encontrado" }, { status: 404 });
    }

    const card = await prisma.creditCard.update({
      where: { id: params.id },
      data: {
        name: String(name).trim(),
        bank: String(bank).trim(),
        closingDay,
        dueDay,
      },
    });

    return NextResponse.json(card);
  } catch (error) {
    console.error("Update card error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;

    const card = await prisma.creditCard.findFirst({
      where: {
        id: params.id,
        userId,
      },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            statements: true,
          },
        },
      },
    });

    if (!card) {
      return NextResponse.json({ error: "Cartão não encontrado" }, { status: 404 });
    }

    const linkedTransactionsCount = await prisma.transaction.count({
      where: {
        userId,
        cardStatement: {
          cardId: card.id,
        },
      },
    });

    if (card._count.statements > 0 || linkedTransactionsCount > 0) {
      return NextResponse.json(
        {
          error: "Não é possível excluir um cartão com faturas ou lançamentos vinculados",
          statementsCount: card._count.statements,
          linkedTransactionsCount,
        },
        { status: 409 }
      );
    }

    await prisma.creditCard.delete({
      where: { id: card.id },
    });

    return NextResponse.json({ message: "Cartão excluído com sucesso" });
  } catch (error) {
    console.error("Delete card error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
