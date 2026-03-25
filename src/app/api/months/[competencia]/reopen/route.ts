import { NextRequest, NextResponse } from "next/server";
import { getHouseholdForUser } from "@/lib/household";
import { getSessionUser } from "@/lib/session-user";
import { reopenMonthParamsSchema } from "@/modules/months/months.schemas";
import { reopenMonth } from "@/modules/months/months.service";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: { competencia: string } }
) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const parsedParams = reopenMonthParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: "Formato de competência inválido (YYYY-MM)" },
        { status: 400 }
      );
    }

    const { householdId } = await getHouseholdForUser(sessionUser.id);
    const result = await reopenMonth(householdId, parsedParams.data.competencia);

    if (result.kind === "not_found") {
      return NextResponse.json(
        { error: "Fechamento não encontrado para esta competência" },
        { status: 404 }
      );
    }

    if (result.kind === "already_open") {
      return NextResponse.json(
        { error: "Este mês já está aberto" },
        { status: 400 }
      );
    }

    return NextResponse.json(result.monthClose);
  } catch (error) {
    console.error("Reopen month error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
