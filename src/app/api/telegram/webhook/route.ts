import { NextRequest, NextResponse } from "next/server";
import { handleTelegramUpdate } from "@/modules/telegram/telegram.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await handleTelegramUpdate(
      body,
      request.headers.get("x-telegram-bot-api-secret-token")
    );

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
