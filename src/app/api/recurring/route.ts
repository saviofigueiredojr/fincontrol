import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { getHouseholdForUser } from "@/lib/household";
import { createRecurringSchema } from "@/modules/recurring/recurring.schemas";
import { createRecurringTemplate } from "@/modules/recurring/recurring.service";

export const dynamic = "force-dynamic";

function getValidationMessage(error: { issues?: Array<{ message?: string }> }) {
  return error.issues?.[0]?.message ?? "Payload inválido";
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const { householdId } = await getHouseholdForUser(userId);

    const templates = await prisma.recurringTemplate.findMany({
      where: { householdId },
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

    const userId = (session.user as { id: string }).id;
    const { householdId, memberIds } = await getHouseholdForUser(userId);

    const body = await request.json();
    const parsedBody = createRecurringSchema.safeParse({
      ...body,
      cardId:
        typeof body.cardId === "string" && body.cardId.trim().length > 0
          ? body.cardId.trim()
          : null,
      endDate:
        typeof body.endDate === "string" && body.endDate.trim().length > 0
          ? body.endDate.trim()
          : null,
    });

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: getValidationMessage(parsedBody.error) },
        { status: 400 }
      );
    }

    const template = await createRecurringTemplate(
      {
        userId,
        householdId,
        memberIds,
      },
      parsedBody.data
    );

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

    const userId = (session.user as { id: string }).id;
    const { householdId } = await getHouseholdForUser(userId);

    const body = await request.json();
    const { id, ...fields } = body;

    if (!id) {
      return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
    }

    // Verify template belongs to this household
    const existing = await prisma.recurringTemplate.findUnique({ where: { id } });
    if (!existing || existing.householdId !== householdId) {
      return NextResponse.json({ error: "Template não encontrado" }, { status: 404 });
    }

    const allowedFields = [
      "description", "category", "amount", "type", "ownership",
      "dayOfMonth", "startDate", "endDate", "isActive",
      "interval", "intervalCount", "isVariable"
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

    if (data.interval !== undefined && !["monthly", "yearly"].includes(data.interval as string)) {
      return NextResponse.json({ error: "interval deve ser monthly ou yearly" }, { status: 400 });
    }

    if (data.intervalCount !== undefined && (typeof data.intervalCount !== "number" || data.intervalCount < 1)) {
      return NextResponse.json({ error: "intervalCount deve ser maior ou igual a 1" }, { status: 400 });
    }

    if (data.isVariable !== undefined && typeof data.isVariable !== "boolean") {
      return NextResponse.json({ error: "isVariable deve ser booleano" }, { status: 400 });
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

    const userId = (session.user as { id: string }).id;
    const { householdId } = await getHouseholdForUser(userId);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Parâmetro id é obrigatório" }, { status: 400 });
    }

    // Verify template belongs to this household
    const existing = await prisma.recurringTemplate.findUnique({ where: { id } });
    if (!existing || existing.householdId !== householdId) {
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
