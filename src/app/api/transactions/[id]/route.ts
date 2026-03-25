import { NextRequest, NextResponse } from "next/server";
import { getHouseholdForUser } from "@/lib/household";
import { getSessionUser } from "@/lib/session-user";
import { updateTransactionSchema } from "@/modules/transactions/transactions.schemas";
import {
  deleteScopedTransaction,
  updateScopedTransaction,
} from "@/modules/transactions/transactions.service";

export const dynamic = "force-dynamic";

function getValidationMessage(error: { issues?: Array<{ message?: string }> }) {
  return error.issues?.[0]?.message ?? "Payload inválido";
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { memberIds } = await getHouseholdForUser(sessionUser.id);
    const body = await request.json();
    const parsedBody = updateTransactionSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: getValidationMessage(parsedBody.error) },
        { status: 400 }
      );
    }

    const result = await updateScopedTransaction(
      {
        userId: sessionUser.id,
        userRole: sessionUser.role,
        memberIds,
      },
      params.id,
      parsedBody.data
    );

    if (result.kind === "not_found") {
      return NextResponse.json(
        { error: "Transação não encontrada" },
        { status: 404 }
      );
    }

    if (result.kind === "forbidden") {
      return NextResponse.json(
        { error: "Sem permissão para editar esta transação" },
        { status: 403 }
      );
    }

    return NextResponse.json(result.transaction);
  } catch (error) {
    console.error("Update transaction error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { memberIds } = await getHouseholdForUser(sessionUser.id);
    const result = await deleteScopedTransaction(
      {
        userId: sessionUser.id,
        userRole: sessionUser.role,
        memberIds,
      },
      params.id
    );

    if (result.kind === "not_found") {
      return NextResponse.json(
        { error: "Transação não encontrada" },
        { status: 404 }
      );
    }

    if (result.kind === "forbidden") {
      return NextResponse.json(
        { error: "Sem permissão para excluir esta transação" },
        { status: 403 }
      );
    }

    return NextResponse.json({ message: "Transação excluída com sucesso" });
  } catch (error) {
    console.error("Delete transaction error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
