import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

const CREDITO_CATEGORY = "Crédito PJ";
const CREDITO_SOURCE = "credito_pj";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;

    // Get all credito transactions
    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        category: CREDITO_CATEGORY,
        source: CREDITO_SOURCE,
      },
      orderBy: { date: "desc" },
    });

    // Get status settings for each transaction
    const statusKeys = transactions.map((t) => `credito_status_${t.id}`);
    const statusSettings = statusKeys.length > 0
      ? await prisma.setting.findMany({
          where: { key: { in: statusKeys } },
        })
      : [];

    const statusMap = new Map(
      statusSettings.map((s) => [s.key, s.value])
    );

    // Enrich transactions with status
    const enrichedTransactions = transactions.map((t) => ({
      ...t,
      status: statusMap.get(`credito_status_${t.id}`) || "pending",
    }));

    // Group by description (client name)
    const grouped: Record<
      string,
      {
        clientName: string;
        totalAmount: number;
        transactions: typeof enrichedTransactions;
      }
    > = {};

    for (const tx of enrichedTransactions) {
      const clientName = tx.description;
      if (!grouped[clientName]) {
        grouped[clientName] = {
          clientName,
          totalAmount: 0,
          transactions: [],
        };
      }
      grouped[clientName].totalAmount += tx.amount;
      grouped[clientName].transactions.push(tx);
    }

    return NextResponse.json(Object.values(grouped));
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
    const body = await request.json();

    const { clientName, description, amount, dueDate, status = "pending" } = body;

    if (!clientName || !amount || !dueDate) {
      return NextResponse.json(
        { error: "Campos obrigatórios: clientName, amount, dueDate" },
        { status: 400 }
      );
    }

    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json({ error: "amount deve ser um número positivo" }, { status: 400 });
    }

    if (!["received", "pending", "future"].includes(status)) {
      return NextResponse.json(
        { error: "status deve ser received, pending ou future" },
        { status: 400 }
      );
    }

    const parsedDate = new Date(dueDate);
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: "Data inválida" }, { status: 400 });
    }

    const competencia = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, "0")}`;

    const transaction = await prisma.transaction.create({
      data: {
        date: parsedDate,
        competencia,
        description: clientName,
        category: CREDITO_CATEGORY,
        amount,
        type: "income",
        ownership: "mine",
        source: CREDITO_SOURCE,
        userId,
      },
    });

    // Store status as a setting
    await prisma.setting.upsert({
      where: { key: `credito_status_${transaction.id}` },
      create: {
        key: `credito_status_${transaction.id}`,
        value: status,
      },
      update: { value: status },
    });

    return NextResponse.json(
      {
        ...transaction,
        status,
        detail: description || null,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create credito error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
