import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { getHouseholdForUser } from "@/lib/household";
import { shiftCompetencia } from "@/lib/utils";

export const dynamic = "force-dynamic";
const DEFAULT_GENERATION_HORIZON_MONTHS = 24;

function getPartnerUserId(memberIds: string[], currentUserId: string) {
  return memberIds.find((memberId) => memberId !== currentUserId) ?? currentUserId;
}

function getTransactionUserId(
  ownership: string,
  currentUserId: string,
  memberIds: string[]
) {
  if (ownership === "mine") {
    return currentUserId;
  }

  if (ownership === "partner") {
    return getPartnerUserId(memberIds, currentUserId);
  }

  return currentUserId;
}

function getDateForCompetencia(competencia: string, desiredDay: number) {
  const [year, month] = competencia.split("-").map(Number);
  const maxDay = new Date(year, month, 0).getDate();
  const safeDay = Math.min(Math.max(desiredDay, 1), maxDay);
  return new Date(year, month - 1, safeDay);
}

function shouldCreateOccurrence(
  startDate: string,
  competencia: string,
  interval: string,
  intervalCount: number
) {
  const [startYear, startMonth] = startDate.split("-").map(Number);
  const [currentYear, currentMonth] = competencia.split("-").map(Number);
  const monthsDiff = (currentYear - startYear) * 12 + (currentMonth - startMonth);

  if (monthsDiff < 0) {
    return false;
  }

  if (interval === "yearly") {
    return monthsDiff % (12 * intervalCount) === 0;
  }

  return monthsDiff % intervalCount === 0;
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
    const {
      description, category, amount, type, ownership,
      dayOfMonth, startDate, endDate,
      interval, intervalCount, isVariable
    } = body;

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

    const finalInterval = interval || "monthly";
    if (!["monthly", "yearly"].includes(finalInterval)) {
      return NextResponse.json({ error: "interval deve ser monthly ou yearly" }, { status: 400 });
    }

    const finalIntervalCount = typeof intervalCount === "number" ? intervalCount : 1;
    if (finalIntervalCount < 1) {
      return NextResponse.json({ error: "intervalCount deve ser maior ou igual a 1" }, { status: 400 });
    }

    const finalIsVariable = typeof isVariable === "boolean" ? isVariable : false;

    const template = await prisma.$transaction(async (db) => {
      const createdTemplate = await db.recurringTemplate.create({
        data: {
          description,
          category,
          amount,
          type,
          ownership,
          dayOfMonth,
          startDate,
          endDate: endDate || null,
          interval: finalInterval,
          intervalCount: finalIntervalCount,
          isVariable: finalIsVariable,
          isActive: true,
          householdId,
        },
      });

      const transactionUserId = getTransactionUserId(ownership, userId, memberIds);
      const lastCompetencia = endDate || shiftCompetencia(startDate, DEFAULT_GENERATION_HORIZON_MONTHS - 1);

      const competencias: string[] = [];
      let cursor = startDate;
      while (cursor <= lastCompetencia) {
        if (shouldCreateOccurrence(startDate, cursor, finalInterval, finalIntervalCount)) {
          competencias.push(cursor);
        }
        cursor = shiftCompetencia(cursor, 1);
      }

      if (competencias.length > 0) {
        await db.transaction.createMany({
          data: competencias.map((competencia) => ({
            date: getDateForCompetencia(competencia, dayOfMonth),
            competencia,
            description,
            category,
            amount,
            type,
            ownership,
            isRecurring: true,
            recurringId: createdTemplate.id,
            source: "recurring",
            userId: transactionUserId,
          })),
        });
      }

      return createdTemplate;
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
