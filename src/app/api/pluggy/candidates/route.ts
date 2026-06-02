import { NextRequest, NextResponse } from "next/server";
import { getHouseholdForUser } from "@/lib/household";
import { getSessionUser } from "@/lib/session-user";
import {
  importPluggyTransactions,
  listImportCandidates,
  setPluggyTransactionsIgnored,
} from "@/modules/pluggy/pluggy.service";
import {
  ignorePluggyTransactionsSchema,
  importPluggyTransactionsSchema,
  listPluggyCandidatesQuerySchema,
} from "@/modules/pluggy/pluggy.schemas";

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

export async function GET(request: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const parsed = listPluggyCandidatesQuerySchema.safeParse({
      accountId: searchParams.get("accountId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ error: getValidationMessage(parsed.error) }, { status: 400 });
    }

    const candidates = await listImportCandidates(actor, parsed.data);
    return NextResponse.json(candidates);
  } catch (error) {
    console.error("Pluggy candidates list error:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const body = await request.json();
    const parsed = importPluggyTransactionsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: getValidationMessage(parsed.error) }, { status: 400 });
    }

    const imported = await importPluggyTransactions(actor, parsed.data);
    return NextResponse.json(imported, { status: 201 });
  } catch (error) {
    console.error("Pluggy import candidates error:", error);
    const message = error instanceof Error ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const body = await request.json();
    const parsed = ignorePluggyTransactionsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: getValidationMessage(parsed.error) }, { status: 400 });
    }

    const result = await setPluggyTransactionsIgnored(actor, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Pluggy ignore candidates error:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
