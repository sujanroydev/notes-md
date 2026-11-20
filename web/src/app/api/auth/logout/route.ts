import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { clearSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await authenticateRequest(request);
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
