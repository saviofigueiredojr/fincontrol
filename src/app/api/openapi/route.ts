import { NextRequest, NextResponse } from "next/server";
import { getOpenApiSpec } from "@/lib/api-docs";

export const dynamic = "force-dynamic";

function getBaseUrl(request: NextRequest) {
  return new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
  return NextResponse.json(getOpenApiSpec(getBaseUrl(request)));
}
