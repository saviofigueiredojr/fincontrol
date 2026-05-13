import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import { getHouseholdForUser } from "@/lib/household";
import { getSessionUser } from "@/lib/session-user";
import { updatePlanningDocumentSchema } from "@/modules/planning/planning.schemas";
import {
  getPlanningDocument,
  updatePlanningDocument,
} from "@/modules/planning/planning.service";

export const dynamic = "force-dynamic";

function getValidationMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? "Payload inválido";
}

export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { householdId } = await getHouseholdForUser(sessionUser.id);
    const document = await getPlanningDocument(householdId);

    return NextResponse.json(document);
  } catch (error) {
    console.error("Get planning document error:", error);
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

    const body = await request.json();
    const parsedBody = updatePlanningDocumentSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: getValidationMessage(parsedBody.error) },
        { status: 400 }
      );
    }

    const { householdId } = await getHouseholdForUser(sessionUser.id);
    const document = await updatePlanningDocument(householdId, parsedBody.data);

    return NextResponse.json(document);
  } catch (error) {
    console.error("Update planning document error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
