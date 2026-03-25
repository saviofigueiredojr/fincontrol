import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;

    const cards = await prisma.creditCard.findMany({
      where: { userId },
      include: {
        statements: {
          orderBy: { competencia: "desc" },
          include: {
            transactions: {
              select: {
                id: true,
                description: true,
                amount: true,
                category: true,
                date: true,
                installmentCurrent: true,
                installmentTotal: true,
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(cards);
  } catch (error) {
    console.error("List cards error:", error);
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

    const { name, bank, closingDay, dueDay } = body;

    if (!name || !bank || !closingDay || !dueDay) {
      return NextResponse.json(
        { error: "Campos obrigatórios: name, bank, closingDay, dueDay" },
        { status: 400 }
      );
    }

    if (
      typeof closingDay !== "number" ||
      closingDay < 1 ||
      closingDay > 31 ||
      typeof dueDay !== "number" ||
      dueDay < 1 ||
      dueDay > 31
    ) {
      return NextResponse.json(
        { error: "closingDay e dueDay devem ser números entre 1 e 31" },
        { status: 400 }
      );
    }

    const card = await prisma.creditCard.create({
      data: { name, bank, closingDay, dueDay, userId },
    });

    return NextResponse.json(card, { status: 201 });
  } catch (error) {
    console.error("Create card error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
