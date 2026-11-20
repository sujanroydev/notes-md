import { NextResponse } from "next/server";
import { authenticateRequest, HttpError, isHttpError } from "@/lib/auth";
import {
  clearSessionCookie,
  createSession,
  revokeSession,
  SESSION_MAX_AGE_SECONDS,
  setSessionCookie,
} from "@/lib/session";

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
  try {
    const session = await authenticateRequest(request);
    const token = await createSession(session.user.id, SESSION_MAX_AGE_SECONDS);
    try {
      const revoked = await revokeSession(session.token);
      if (!revoked) {
        await revokeSession(token);
        throw new HttpError(401, "Session has already been refreshed or revoked");
      }
    } catch (error) {
      if (!(error instanceof HttpError)) {
        await revokeSession(token);
      }
      throw error;
    }

    const expiresAt = new Date(
      Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    ).toISOString();
    const response = noStoreJson({
      ...(isBearerRequest ? { token } : {}),
      expires_at: expiresAt,
    });
    if (isBearerRequest) {
      return response;
    }
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    if (isHttpError(error)) {
      const response = noStoreJson(
        { error: error.message },
        error.statusCode,
      );
      if (!isBearerRequest) {
        clearSessionCookie(response);
      }
      return response;
    }

    console.error("Session refresh failed:", error);
    const response = noStoreJson({ error: "Failed to refresh session" }, 500);
    if (!isBearerRequest) {
      clearSessionCookie(response);
    }
    return response;
  }
}
