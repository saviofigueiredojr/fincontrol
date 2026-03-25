import { NextRequest, NextResponse } from "next/server";
import { getHouseholdForUser } from "@/lib/household";
import { getSessionUser } from "@/lib/session-user";
import { updateGoalSchema } from "@/modules/goals/goals.schemas";
import { listGoals, updateGoal } from "@/modules/goals/goals.service";

export const dynamic = "force-dynamic";

function getValidationMessage(error: { issues?: Array<{ message?: string }> }) {
  return error.issues?.[0]?.message ?? "Payload inválido";
}

export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { householdId } = await getHouseholdForUser(sessionUser.id);
    const goals = await listGoals(householdId);

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
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { householdId } = await getHouseholdForUser(sessionUser.id);
    const body = await request.json();
    const parsedBody = updateGoalSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: getValidationMessage(parsedBody.error) },
        { status: 400 }
      );
    }

    const result = await updateGoal(householdId, parsedBody.data);

    if (result.kind === "not_found") {
      return NextResponse.json({ error: "Meta não encontrada" }, { status: 404 });
    }

    if (result.kind === "invalid_deadline") {
      return NextResponse.json(
        { error: "deadline deve ser uma data válida" },
        { status: 400 }
      );
    }

    return NextResponse.json(result.goal);
  } catch (error) {
    console.error("Update goal error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
