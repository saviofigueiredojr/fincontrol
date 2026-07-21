import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "Cron route is disabled: CRON_SECRET is not configured" },
      { status: 503, headers: noStoreHeaders }
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: noStoreHeaders }
    );
  }

  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      { ok: true, database: "reachable", checkedAt: new Date().toISOString() },
      { headers: noStoreHeaders }
    );
  } catch (error) {
    console.error("Database healthcheck failed:", error);

    return NextResponse.json(
      { ok: false, database: "unreachable" },
      { status: 503, headers: noStoreHeaders }
    );
  }
}
