import { NextRequest, NextResponse } from "next/server";
import { getApiIndex } from "@/lib/api-docs";

export const dynamic = "force-dynamic";

function getBaseUrl(request: NextRequest) {
  return new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
  return NextResponse.json(getApiIndex(getBaseUrl(request)));
}
