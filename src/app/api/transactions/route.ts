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
    const ownership = searchParams.get("ownership");
    const type = searchParams.get("type");
    const category = searchParams.get("category");
    const search = searchParams.get("search");

    // Visibility rules:
    // - Individual transactions (mine/partner): only visible to the owner
    // - Joint transactions: visible to everyone
    const where: Record<string, unknown> = {};

    if (competencia && /^\d{4}-\d{2}$/.test(competencia)) {
      where.competencia = competencia;
    }

    // Apply ownership filter with visibility rules
    if (ownership === "joint") {
      where.ownership = "joint";
    } else if (ownership === "mine" || ownership === "partner") {
      // Specific ownership filter: only show if user owns them
      where.ownership = ownership;
      where.userId = userId;
    } else {
      // No ownership filter: show own transactions + joint
      where.OR = [
        { userId },
        { ownership: "joint" },
      ];
    }
    if (type && ["income", "expense", "transfer"].includes(type)) {
      where.type = type;
    }
    if (category) {
      where.category = category;
    }
    if (search) {
      where.description = { contains: search };
    }

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { date: "desc" },
      include: {
        cardStatement: {
          include: { card: { select: { name: true, bank: true } } },
        },
      },
    });

    return NextResponse.json(transactions);
  } catch (error) {
    console.error("List transactions error:", error);
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

    const {
      date,
      competencia,
      description,
      category,
      amount,
      type,
      ownership,
      installmentCurrent,
      installmentTotal,
      source = "manual",
    } = body;

    if (!date || !competencia || !description || !category || !amount || !type || !ownership) {
      return NextResponse.json(
        { error: "Campos obrigatórios: date, competencia, description, category, amount, type, ownership" },
        { status: 400 }
      );
    }

    if (!["income", "expense", "transfer"].includes(type)) {
      return NextResponse.json({ error: "type deve ser income, expense ou transfer" }, { status: 400 });
    }

    if (!["mine", "partner", "joint"].includes(ownership)) {
      return NextResponse.json({ error: "ownership deve ser mine, partner ou joint" }, { status: 400 });
    }

    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json({ error: "amount deve ser um número positivo" }, { status: 400 });
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: "Data inválida" }, { status: 400 });
    }

    // Create the main transaction
    const mainTransaction = await prisma.transaction.create({
      data: {
        date: parsedDate,
        competencia,
        description,
        category,
        amount,
        type,
        ownership,
        installmentCurrent: installmentTotal && installmentTotal > 1 ? 1 : installmentCurrent || null,
        installmentTotal: installmentTotal || null,
        source,
        userId,
      },
    });

    const createdTransactions = [mainTransaction];

    // Auto-create future installments if installmentTotal > 1
    if (installmentTotal && installmentTotal > 1) {
      const [compYear, compMonth] = competencia.split("-").map(Number);

      for (let i = 2; i <= installmentTotal; i++) {
        const futureDate = new Date(parsedDate);
        futureDate.setMonth(futureDate.getMonth() + (i - 1));

        const futureComp = new Date(compYear, compMonth - 1 + (i - 1), 1);
        const futureCompStr = `${futureComp.getFullYear()}-${String(futureComp.getMonth() + 1).padStart(2, "0")}`;

        const installment = await prisma.transaction.create({
          data: {
            date: futureDate,
            competencia: futureCompStr,
            description: `${description} (${i}/${installmentTotal})`,
            category,
            amount,
            type,
            ownership,
            installmentCurrent: i,
            installmentTotal,
            parentId: mainTransaction.id,
            source,
            userId,
          },
        });
        createdTransactions.push(installment);
      }
    }

    return NextResponse.json(createdTransactions, { status: 201 });
  } catch (error) {
    console.error("Create transaction error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
