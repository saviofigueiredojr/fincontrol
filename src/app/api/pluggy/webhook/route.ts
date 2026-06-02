import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest) {
  if (!env.PLUGGY_WEBHOOK_SECRET) return true;

  const headerSecret =
    request.headers.get("x-pluggy-webhook-secret") ??
    request.headers.get("x-webhook-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const querySecret = new URL(request.url).searchParams.get("secret");

  return headerSecret === env.PLUGGY_WEBHOOK_SECRET || querySecret === env.PLUGGY_WEBHOOK_SECRET;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  console.info("Pluggy webhook received", {
    event: payload?.event ?? payload?.type ?? null,
    itemId: payload?.itemId ?? payload?.item?.id ?? null,
  });

  return NextResponse.json({ ok: true });
}
