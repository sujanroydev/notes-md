import { NextResponse } from "next/server";
import { getSessionCookieToken } from "./session";
import { getSessionFromToken } from "./session";

export class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

/**
 * Extract the session token from either the HttpOnly cookie (web) or the
 * Authorization: Bearer header (VS Code extension / API clients).
 */
export async function extractToken(request: Request): Promise<string | undefined> {
  // Authorization: Bearer <token> takes precedence for API clients.
  const authHeader = request.headers.get("authorization");
  const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    const token = bearerMatch[1].trim();
    if (token) {
      return token;
    }
  }

  // Fall back to the HttpOnly session cookie for browser clients.
  return getSessionCookieToken();
}

/**
 * Authenticate an incoming request and return the authenticated user.
 * Throws HttpError(401) when no valid session exists.
 */
export async function authenticateRequest(
  request: Request,
): Promise<NonNullable<Awaited<ReturnType<typeof getSessionFromToken>>>> {
  const token = await extractToken(request);
  if (!token) {
    throw new HttpError(401, "Unauthenticated: no session found");
  }

  const session = await getSessionFromToken(token);
  if (!session) {
    throw new HttpError(401, "Unauthenticated: invalid or expired session");
  }

  return session;
}

/**
 * Wrapper for route handlers that authenticates the request then invokes the
 * handler with the authenticated session. Returns 401/500 JSON on failure.
 */
export function withAuth(
  handler: (
    request: Request,
    session: { token: string; user: { id: string } },
  ) => Promise<Response>,
) {
  return async (request: Request): Promise<Response> => {
    try {
      const session = await authenticateRequest(request);
      return handler(request, session);
    } catch (error) {
      if (isHttpError(error)) {
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
      }
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
