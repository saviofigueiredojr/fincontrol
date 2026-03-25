import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

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
    const userRole = (session.user as { role: string }).role;
    const { id } = params;

    const existing = await prisma.transaction.findFirst({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Transação não encontrada" },
        { status: 404 }
      );
    }

    // Only the owner or admin can edit
    if (existing.userId !== userId && userRole !== "admin") {
      return NextResponse.json(
        { error: "Sem permissão para editar esta transação" },
        { status: 403 }
      );
    }

    const body = await request.json();

    const allowedFields = [
      "date",
      "competencia",
      "description",
      "category",
      "amount",
      "type",
      "ownership",
      "installmentCurrent",
      "installmentTotal",
      "source",
      "cardStatementId",
      "isRecurring",
      "recurringId",
    ];

    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        data[field] = body[field];
      }
    }

    if (data.date) {
      data.date = new Date(data.date as string);
    }

    if (data.type && !["income", "expense", "transfer"].includes(data.type as string)) {
      return NextResponse.json({ error: "type deve ser income, expense ou transfer" }, { status: 400 });
    }

    if (data.ownership && !["mine", "partner", "joint"].includes(data.ownership as string)) {
      return NextResponse.json({ error: "ownership deve ser mine, partner ou joint" }, { status: 400 });
    }

    if (data.amount !== undefined && (typeof data.amount !== "number" || (data.amount as number) <= 0)) {
      return NextResponse.json({ error: "amount deve ser um número positivo" }, { status: 400 });
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update transaction error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const userRole = (session.user as { role: string }).role;
    const { id } = params;

    const existing = await prisma.transaction.findFirst({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Transação não encontrada" },
        { status: 404 }
      );
    }

    // Only the owner or admin can delete
    if (existing.userId !== userId && userRole !== "admin") {
      return NextResponse.json(
        { error: "Sem permissão para excluir esta transação" },
        { status: 403 }
      );
    }

    // Delete child installments first
    await prisma.transaction.deleteMany({
      where: { parentId: id },
    });

    // Delete the transaction itself
    await prisma.transaction.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Transação excluída com sucesso" });
  } catch (error) {
    console.error("Delete transaction error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
