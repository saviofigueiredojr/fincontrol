import { NextRequest, NextResponse } from "next/server";
import { getHouseholdForUser } from "@/lib/household";
import { getSessionUser } from "@/lib/session-user";
import { linkPluggyAccountToCard } from "@/modules/pluggy/pluggy.service";
import { updatePluggyAccountSchema } from "@/modules/pluggy/pluggy.schemas";

export const dynamic = "force-dynamic";

async function getActor() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null;
  const { householdId, memberIds } = await getHouseholdForUser(sessionUser.id);
  return { userId: sessionUser.id, householdId, memberIds };
}

function getValidationMessage(error: { issues?: Array<{ message?: string }> }) {
  return error.issues?.[0]?.message ?? "Payload inválido";
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const body = await request.json();
    const parsed = updatePluggyAccountSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: getValidationMessage(parsed.error) }, { status: 400 });
    }

    const result = await linkPluggyAccountToCard(actor, parsed.data);
    if (result.kind === "not_found") {
      return NextResponse.json({ error: "Conta Pluggy não encontrada" }, { status: 404 });
    }
    if (result.kind === "card_not_found") {
      return NextResponse.json({ error: "Cartão não encontrado" }, { status: 404 });
    }

    return NextResponse.json(result.account);
  } catch (error) {
    console.error("Pluggy account update error:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
