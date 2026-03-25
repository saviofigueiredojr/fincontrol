import { NextRequest, NextResponse } from "next/server";
import { getHouseholdForUser } from "@/lib/household";
import { getSessionUser } from "@/lib/session-user";
import {
  createTransactionSchema,
  listTransactionsQuerySchema,
} from "@/modules/transactions/transactions.schemas";
import { createTransactionWithInstallments, listVisibleTransactions } from "@/modules/transactions/transactions.service";

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

    const { memberIds } = await getHouseholdForUser(sessionUser.id);
    const { searchParams } = new URL(request.url);

    const parsedQuery = listTransactionsQuerySchema.safeParse({
      competencia: searchParams.get("competencia") ?? undefined,
      ownership: searchParams.get("ownership") ?? undefined,
      type: searchParams.get("type") ?? undefined,
      category: searchParams.get("category") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: getValidationMessage(parsedQuery.error) },
        { status: 400 }
      );
    }

    const transactions = await listVisibleTransactions({
      userId: sessionUser.id,
      memberIds,
    }, parsedQuery.data);

    return NextResponse.json(transactions);
  } catch (error) {
    console.error("List transactions error:", error);
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
    const parsedBody = createTransactionSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: getValidationMessage(parsedBody.error) },
        { status: 400 }
      );
    }

    const createdTransactions = await createTransactionWithInstallments(
      sessionUser.id,
      parsedBody.data
    );

    return NextResponse.json(createdTransactions, { status: 201 });
  } catch (error) {
    console.error("Create transaction error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
