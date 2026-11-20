import { NextResponse } from "next/server";
import { extractToken } from "@/lib/auth";
import { getSessionFromToken } from "@/lib/session";

export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  try {
    const token = await extractToken(request);
    const session = token ? await getSessionFromToken(token) : null;
    if (!session) {
      return noStoreJson({ error: "Unauthenticated" }, 401);
    }

    return noStoreJson({
      user: session.user,
      expires_at: session.expires_at,
    });
  } catch (error) {
    console.error("Session validation failed:", error);
    return noStoreJson({ error: "Failed to validate session" }, 500);
  }
}
