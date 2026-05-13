import { NextResponse } from "next/server";
import { getHouseholdForUser } from "@/lib/household";
import { getSessionUser } from "@/lib/session-user";
import { createPlanningDocx } from "@/lib/docx";
import { getPlanningDocument } from "@/modules/planning/planning.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sanitizeFilename(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();

  return normalized || "planejamento-financeiro";
}

export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { householdId } = await getHouseholdForUser(sessionUser.id);
    const document = await getPlanningDocument(householdId);
    const docx = createPlanningDocx({
      title: document.title,
      content: document.content,
    });

    return new NextResponse(docx, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${sanitizeFilename(
          document.title
        )}.docx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Export planning docx error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
