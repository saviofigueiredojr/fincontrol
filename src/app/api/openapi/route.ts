import { NextRequest, NextResponse } from "next/server";
import { getOpenApiSpec } from "@/lib/api-docs";
import { getSessionUser } from "@/lib/session-user";

export const dynamic = "force-dynamic";

function getBaseUrl(request: NextRequest) {
  return new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  return NextResponse.json(getOpenApiSpec(getBaseUrl(request)));
}
