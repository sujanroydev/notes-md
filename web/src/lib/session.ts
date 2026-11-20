import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { sha256, generateToken } from "./crypto";
import { supabase } from "./supabase";

export const SESSION_COOKIE_NAME = "notes-md-session";

export interface AppUser {
  id: string;
  google_id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
}

export interface SessionContext {
  token: string;
  user: AppUser;
  expires_at: string;
}

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
};

const configuredMaxAge = Number(process.env.SESSION_MAX_AGE_SECONDS);
export const SESSION_MAX_AGE_SECONDS =
  Number.isSafeInteger(configuredMaxAge) && configuredMaxAge > 0
    ? configuredMaxAge
    : 1209600;

/**
 * Create a new application session for a user. Returns the raw session token
 * (shown only once to the caller). The raw token is never stored; only its
 * SHA-256 hash is persisted in `public.sessions`.
 */
export async function createSession(
  userId: string,
  maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS,
): Promise<string> {
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds <= 0) {
    throw new Error("Session lifetime must be a positive integer.");
  }

  const token = generateToken();
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000).toISOString();

  const { error } = await supabase.from("sessions").insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  if (error) {
    throw new Error(`Failed to create session: ${error.message}`);
  }

  return token;
}

/**
 * Set the session token as a secure, HttpOnly, SameSite cookie (web clients).
 */
export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/**
 * Clear the session cookie (logout).
 */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: 0,
    expires: new Date(0),
  });
}

/**
 * Read the session token from the HttpOnly cookie (web clients).
 */
export async function getSessionCookieToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}

/**
 * Validate a raw session token against `public.sessions`. Only non-revoked,
 * non-expired sessions are valid. Returns the authenticated user.
 */
export async function getSessionFromToken(
  token: string,
): Promise<SessionContext | null> {
  if (!token) {
    return null;
  }

  const tokenHash = sha256(token);
  const now = new Date().toISOString();

  const { data: session, error } = await supabase
    .from("sessions")
    .select("*, users(id, google_id, email, name, avatar_url)")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to validate session: ${error.message}`);
  }
  if (!session) {
    return null;
  }

  const users = (session as unknown as {
    users: AppUser | null;
    expires_at: string;
  }).users;
  if (!users) {
    return null;
  }

  return {
    token,
    user: users,
    expires_at: (session as unknown as { expires_at: string }).expires_at,
  };
}

/**
 * Revoke a session (logout / revocation).
 */
export async function revokeSession(token: string): Promise<boolean> {
  if (!token) {
    return false;
  }

  const tokenHash = sha256(token);
  const { data, error } = await supabase
    .from("sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to revoke session: ${error.message}`);
  }
  return data !== null;
}
