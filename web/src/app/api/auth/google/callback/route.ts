import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  getAppBaseUrl,
  getGoogleCallbackUrl,
  verifyGoogleIdToken,
} from "@/lib/google";
import { supabase } from "@/lib/supabase";
import {
  createSession,
  revokeSession,
  setSessionCookie,
} from "@/lib/session";

export const dynamic = "force-dynamic";

const OAUTH_COOKIE_NAMES = [
  "oauth_state",
  "oauth_nonce",
  "pending_pairing_id",
] as const;

function clearOAuthCookies(response: NextResponse): void {
  for (const name of OAUTH_COOKIE_NAMES) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    });
  }
}

function authRedirect(baseUrl: URL, path: string, error?: string): NextResponse {
  const redirectUrl = new URL(path, baseUrl);
  if (error) {
    redirectUrl.searchParams.set("error", error);
  }
  const response = NextResponse.redirect(redirectUrl);
  response.headers.set("Cache-Control", "no-store");
  clearOAuthCookies(response);
  return response;
}

export async function GET(request: Request) {
  const baseUrl = getAppBaseUrl(request.url);
  const callbackUrl = getGoogleCallbackUrl(baseUrl);
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const providerError = searchParams.get("error");
  const cookieStore = await cookies();
  const cookieState = cookieStore.get("oauth_state")?.value;
  const cookieNonce = cookieStore.get("oauth_nonce")?.value;
  const pendingPairingId = cookieStore.get("pending_pairing_id")?.value;

  if (providerError) {
    return authRedirect(baseUrl, "/signin", "google_auth_denied");
  }

  if (!code) {
    return authRedirect(baseUrl, "/signin", "missing_code");
  }

  if (!state || !cookieState || state !== cookieState || !cookieNonce) {
    return authRedirect(baseUrl, "/signin", "invalid_state");
  }

  try {
    const tokens = await exchangeCodeForTokens(code, callbackUrl);
    if (!tokens.id_token) {
      return authRedirect(baseUrl, "/signin", "no_id_token");
    }

    const payload = await verifyGoogleIdToken({
      idToken: tokens.id_token,
      nonce: cookieNonce,
    });

    const { data: user, error: userError } = await supabase
      .from("users")
      .upsert(
        {
          google_id: payload.sub,
          email: payload.email,
          name: payload.name ?? null,
          avatar_url: payload.picture ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "google_id" },
      )
      .select("id")
      .single();

    if (userError) {
      console.error("Failed to save authenticated user:", userError);
      return authRedirect(baseUrl, "/signin", "database_unavailable");
    }

    const token = await createSession(user.id);
    try {
      if (pendingPairingId) {
        const { error: pairingError } = await supabase
          .from("pending_links")
          .insert({
            pairing_id: pendingPairingId,
            user_id: user.id,
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          });
        if (pairingError) {
          throw new Error(`Failed to create device link: ${pairingError.message}`);
        }
      }
    } catch (error) {
      await revokeSession(token);
      throw error;
    }

    const response = NextResponse.redirect(new URL("/", baseUrl));
    response.headers.set("Cache-Control", "no-store");
    setSessionCookie(response, token);
    clearOAuthCookies(response);
    return response;
  } catch (error) {
    console.error("Google OAuth callback failed:", error);
    return authRedirect(baseUrl, "/signin", "oauth_failed");
  }
}
