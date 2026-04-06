import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { getHouseholdForUser } from "@/lib/household";
import { isSensitiveSettingKey } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const { householdId } = await getHouseholdForUser(userId);

    const settings = await prisma.setting.findMany({
      where: { householdId },
    });

    const result: Record<string, string> = {};
    for (const s of settings) {
      if (isSensitiveSettingKey(s.key)) {
        continue;
      }
      result[s.key] = s.value;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Get settings error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const { householdId } = await getHouseholdForUser(userId);

    const body = await request.json();

    // Support both single { key, value } and batch { settings: [{key, value}] }
    const entries: Array<{ key: string; value: string }> = [];

    if (body.settings && Array.isArray(body.settings)) {
      for (const entry of body.settings) {
        if (!entry.key || entry.value === undefined) {
          return NextResponse.json(
            { error: "Cada setting deve ter key e value" },
            { status: 400 }
          );
        }
        entries.push({ key: entry.key, value: String(entry.value) });
      }
    } else if (body.key && body.value !== undefined) {
      entries.push({ key: body.key, value: String(body.value) });
    } else {
      return NextResponse.json(
        { error: "Envie { key, value } ou { settings: [{key, value}] }" },
        { status: 400 }
      );
    }

    const results = [];

    for (const { key, value } of entries) {
      const setting = await prisma.setting.upsert({
        where: { householdId_key: { householdId, key } },
        create: { key, value, householdId },
        update: { value },
      });
      results.push(setting);
    }

    return NextResponse.json(results.length === 1 ? results[0] : results);
  } catch (error) {
    console.error("Update settings error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
