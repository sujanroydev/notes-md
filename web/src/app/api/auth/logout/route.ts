import { NextResponse } from "next/server";
import { extractToken } from "@/lib/auth";
import { clearSessionCookie, revokeSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const isBearerRequest =
    /^Bearer\s+\S+$/i.test(request.headers.get("authorization") ?? "");
  const token = await extractToken(request);

  try {
    if (token) {
      await revokeSession(token);
    }
    const response = noStoreJson({ ok: true });
    if (!isBearerRequest) {
      clearSessionCookie(response);
    }
    return response;
  } catch (error) {
    console.error("Session logout failed:", error);
    const response = noStoreJson({ error: "Failed to end session" }, 500);
    if (!isBearerRequest) {
      clearSessionCookie(response);
    }
    return response;
  }
}
