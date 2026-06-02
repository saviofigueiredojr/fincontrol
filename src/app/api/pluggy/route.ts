import { NextRequest, NextResponse } from "next/server";
import { getHouseholdForUser } from "@/lib/household";
import { getSessionUser } from "@/lib/session-user";
import { listPluggyOverview, registerPluggyItem } from "@/modules/pluggy/pluggy.service";
import { registerPluggyItemSchema } from "@/modules/pluggy/pluggy.schemas";

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

export async function GET() {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const overview = await listPluggyOverview(actor);
    return NextResponse.json(overview);
  } catch (error) {
    console.error("Pluggy overview error:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const body = await request.json();
    const parsed = registerPluggyItemSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: getValidationMessage(parsed.error) }, { status: 400 });
    }

    const item = await registerPluggyItem(actor, parsed.data.itemId);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("Pluggy register item error:", error);
    const message = error instanceof Error ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
