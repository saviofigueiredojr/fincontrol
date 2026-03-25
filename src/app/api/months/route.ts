import { NextRequest, NextResponse } from "next/server";
import { getHouseholdForUser } from "@/lib/household";
import { getSessionUser } from "@/lib/session-user";
import { closeMonthSchema, monthQuerySchema } from "@/modules/months/months.schemas";
import { closeMonth, getMonthSummary } from "@/modules/months/months.service";

export const dynamic = "force-dynamic";

function getValidationMessage(error: { issues?: Array<{ message?: string }> }) {
  return error.issues?.[0]?.message ?? "Payload inválido";
}

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const parsedQuery = monthQuerySchema.safeParse({
      competencia: new URL(request.url).searchParams.get("competencia"),
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: getValidationMessage(parsedQuery.error) },
        { status: 400 }
      );
    }

    const { householdId, memberIds } = await getHouseholdForUser(sessionUser.id);
    const month = await getMonthSummary(
      {
        userId: sessionUser.id,
        householdId,
        memberIds,
      },
      parsedQuery.data.competencia
    );

    return NextResponse.json(month);
  } catch (error) {
    console.error("Get month error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const parsedBody = closeMonthSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: getValidationMessage(parsedBody.error) },
        { status: 400 }
      );
    }

    const { householdId, memberIds } = await getHouseholdForUser(sessionUser.id);
    const result = await closeMonth(
      {
        userId: sessionUser.id,
        householdId,
        memberIds,
      },
      parsedBody.data
    );

    if (result.kind === "already_closed") {
      return NextResponse.json(
        { error: "Este mês já está fechado" },
        { status: 400 }
      );
    }

    return NextResponse.json(result.monthClose);
  } catch (error) {
    console.error("Close month error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
