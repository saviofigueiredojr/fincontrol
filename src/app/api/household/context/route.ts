import { NextResponse } from "next/server";
import { getHouseholdContextForUser } from "@/lib/household";
import { getSessionUser } from "@/lib/session-user";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sessionUser = await getSessionUser();

    if (!sessionUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const context = await getHouseholdContextForUser(sessionUser.id);

    return NextResponse.json({
      self: context.self,
      partner: context.partner,
      members: context.members,
    });
  } catch (error) {
    console.error("Household context error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
