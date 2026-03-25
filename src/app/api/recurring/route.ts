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

    const templates = await prisma.recurringTemplate.findMany({
      orderBy: [{ isActive: "desc" }, { description: "asc" }],
    });

    return NextResponse.json(templates);
  } catch (error) {
    console.error("List recurring error:", error);
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

    const body = await request.json();
    const { description, category, amount, type, ownership, dayOfMonth, startDate, endDate } = body;

    if (!description || !category || !amount || !type || !ownership || !dayOfMonth || !startDate) {
      return NextResponse.json(
        { error: "Campos obrigatórios: description, category, amount, type, ownership, dayOfMonth, startDate" },
        { status: 400 }
      );
    }

    if (!["income", "expense"].includes(type)) {
      return NextResponse.json({ error: "type deve ser income ou expense" }, { status: 400 });
    }

    if (!["mine", "partner", "joint"].includes(ownership)) {
      return NextResponse.json({ error: "ownership deve ser mine, partner ou joint" }, { status: 400 });
    }

    if (typeof dayOfMonth !== "number" || dayOfMonth < 1 || dayOfMonth > 31) {
      return NextResponse.json({ error: "dayOfMonth deve ser entre 1 e 31" }, { status: 400 });
    }

    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json({ error: "amount deve ser um número positivo" }, { status: 400 });
    }

    if (!/^\d{4}-\d{2}$/.test(startDate)) {
      return NextResponse.json({ error: "startDate deve ser YYYY-MM" }, { status: 400 });
    }

    if (endDate && !/^\d{4}-\d{2}$/.test(endDate)) {
      return NextResponse.json({ error: "endDate deve ser YYYY-MM" }, { status: 400 });
    }

    const template = await prisma.recurringTemplate.create({
      data: {
        description,
        category,
        amount,
        type,
        ownership,
        dayOfMonth,
        startDate,
        endDate: endDate || null,
        isActive: true,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error("Create recurring error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...fields } = body;

    if (!id) {
      return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
    }

    const existing = await prisma.recurringTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Template não encontrado" }, { status: 404 });
    }

    const allowedFields = [
      "description", "category", "amount", "type", "ownership",
      "dayOfMonth", "startDate", "endDate", "isActive",
    ];

    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (fields[field] !== undefined) {
        data[field] = fields[field];
      }
    }

    if (data.type && !["income", "expense"].includes(data.type as string)) {
      return NextResponse.json({ error: "type deve ser income ou expense" }, { status: 400 });
    }

    if (data.ownership && !["mine", "partner", "joint"].includes(data.ownership as string)) {
      return NextResponse.json({ error: "ownership deve ser mine, partner ou joint" }, { status: 400 });
    }

    if (data.dayOfMonth !== undefined) {
      const day = data.dayOfMonth as number;
      if (typeof day !== "number" || day < 1 || day > 31) {
        return NextResponse.json({ error: "dayOfMonth deve ser entre 1 e 31" }, { status: 400 });
      }
    }

    const updated = await prisma.recurringTemplate.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update recurring error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Parâmetro id é obrigatório" }, { status: 400 });
    }

    const existing = await prisma.recurringTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Template não encontrado" }, { status: 404 });
    }

    const updated = await prisma.recurringTemplate.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Deactivate recurring error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
