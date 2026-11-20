import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { createSession, SESSION_MAX_AGE_SECONDS } from "@/lib/session";
import { sha256 } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await authenticateRequest(request);

  const refreshToken = Buffer.from(sha256(session.token), "hex").toString("hex");
  const token = await createSession(session.user.id, SESSION_MAX_AGE_SECONDS);

  // Issue a fresh rotating refresh token alongside the new session token.
  return NextResponse.json({
    refreshToken,
    expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString(),
  });
}
