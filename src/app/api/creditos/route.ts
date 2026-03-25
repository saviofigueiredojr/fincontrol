import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { getHouseholdForUser } from "@/lib/household";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const { memberIds } = await getHouseholdForUser(userId);

    const receipts = await prisma.pjReceipt.findMany({
      where: {
        userId: { in: memberIds },
      },
      orderBy: { dueDate: "asc" },
      include: {
        transaction: true
      }
    });

    return NextResponse.json({ credits: receipts });
  } catch (error) {
    console.error("List creditos error:", error);
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
    const { householdId } = await getHouseholdForUser(userId);
    const body = await request.json();

    const { clientName, description, amount, dueDate, status = "unissued", competencia } = body;

    if (!clientName || !amount || !dueDate) {
      return NextResponse.json(
        { error: "Campos obrigatórios: clientName, amount, dueDate" },
        { status: 400 }
      );
    }

    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json({ error: "amount deve ser um número positivo" }, { status: 400 });
    }

    const parsedDate = new Date(dueDate);
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: "Data inválida" }, { status: 400 });
    }

    let comp = competencia;
    if (!comp) {
      comp = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, "0")}`;
    }

    const receipt = await prisma.pjReceipt.create({
      data: {
        clientName,
        description: description || "Crédito PJ",
        amount,
        dueDate: parsedDate,
        status,
        competencia: comp,
        userId,
        householdId,
      },
    });

    return NextResponse.json(receipt, { status: 201 });
  } catch (error) {
    console.error("Create credito error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
