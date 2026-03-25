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

    const goals = await prisma.goal.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(goals);
  } catch (error) {
    console.error("List goals error:", error);
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
    const { id, name, targetAmount, currentAmount, deadline } = body;

    if (!id) {
      return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
    }

    const existing = await prisma.goal.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Meta não encontrada" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (targetAmount !== undefined) {
      if (typeof targetAmount !== "number" || targetAmount < 0) {
        return NextResponse.json({ error: "targetAmount deve ser um número positivo" }, { status: 400 });
      }
      data.targetAmount = targetAmount;
    }
    if (currentAmount !== undefined) {
      if (typeof currentAmount !== "number" || currentAmount < 0) {
        return NextResponse.json({ error: "currentAmount deve ser um número positivo" }, { status: 400 });
      }
      data.currentAmount = currentAmount;
    }
    if (deadline !== undefined) {
      data.deadline = deadline ? new Date(deadline) : null;
    }

    const updated = await prisma.goal.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update goal error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
