import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session-user";
import { importTransactionsSchema } from "@/modules/import/import.schemas";
import { importTransactionsFromStatement } from "@/modules/import/import.service";

export const dynamic = "force-dynamic";

function getValidationMessage(error: { issues?: Array<{ message?: string }> }) {
  return error.issues?.[0]?.message ?? "Payload inválido";
}

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const formData = await request.formData();
    const parsedBody = importTransactionsSchema.safeParse({
      file: formData.get("file"),
      cardId: formData.get("cardId"),
      competencia: formData.get("competencia"),
    });

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: getValidationMessage(parsedBody.error) },
        { status: 400 }
      );
    }

    const result = await importTransactionsFromStatement(
      sessionUser.id,
      parsedBody.data
    );

    if (result.kind === "card_not_found") {
      return NextResponse.json({ error: "Cartão não encontrado" }, { status: 404 });
    }

    if (result.kind === "unsupported_format") {
      return NextResponse.json(
        { error: "Formato não suportado. Use CSV ou OFX." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: `${result.count} transações importadas com sucesso`,
      count: result.count,
    });
  } catch (error) {
    console.error("Import error:", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Erro ao importar arquivo";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
