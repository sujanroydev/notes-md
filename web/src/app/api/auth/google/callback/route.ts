import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyGoogleIdToken, exchangeCodeForTokens } from "@/lib/google";
import { supabase } from "@/lib/supabase";
import { createSession, setSessionCookie, clearSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;
const HOME_ORIGIN = `${BASE_URL?.replace(/\/$/, "")}`;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const nonce = searchParams.get("nonce");

  const cookieState = (await cookies()).get("oauth_state")?.value;
  const cookieNonce = (await cookies()).get("oauth_nonce")?.value;

  if (!code) {
    return NextResponse.redirect(`${HOME_ORIGIN}/auth/error?error=missing_code`);
  }

  // CSRF and nonce validation.
  if (state !== cookieState || nonce !== cookieNonce) {
    return NextResponse.redirect(`${HOME_ORIGIN}/auth/error?error=invalid_state`);
  }

  // Clear the state/nonce cookies after successful consumption.
  await clearSessionCookie();

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.id_token) {
      return NextResponse.redirect(`${HOME_ORIGIN}/auth/error?error=no_id_token`);
    }

    const payload = await verifyGoogleIdToken({
      idToken: tokens.id_token,
      nonce: cookieNonce,
    });

    if (!payload) {
      return NextResponse.redirect(`${HOME_ORIGIN}/auth/error?error=no_id_token`);
    }

    const googleId = payload.sub as string;
    const email = payload.email as string;
    const name = payload.name ?? null;
    const avatarUrl = payload.picture ?? null;

    // Find or create the application-managed user.
    const { data: existingUser, error: findError } = await supabase
      .from("users")
      .select("id")
      .eq("google_id", googleId)
      .maybeSingle();

    if (findError) {
      throw findError;
    }

    let userId: string;
    if (existingUser) {
      // Update email/name in case they changed in Google.
      await supabase
        .from("users")
        .update({ email, name, avatar_url: avatarUrl, updated_at: new Date().toISOString() })
        .eq("id", existingUser.id);
      userId = existingUser.id;
    } else {
      const { data, error } = await supabase
        .from("users")
        .insert({
          google_id: googleId,
          email,
          name,
          avatar_url: avatarUrl,
        })
        .select("id")
        .single();

      if (error) {
        throw error;
      }
      userId = data.id;
    }

    // Create the application-managed session.
    const token = await createSession(userId);
    setSessionCookie(token);

    // If this was a VS Code device-link request, issue the token to the
    // extension via `pending_links`.
    const pendingPairingId = (await cookies()).get("pending_pairing_id")?.value;
    if (pendingPairingId) {
      await supabase.from("pending_links").update({
        claimed_at: new Date().toISOString(),
      }).eq("pairing_id", pendingPairingId);

      await supabase.from("pending_links").insert({
        pairing_id: pendingPairingId,
        user_id: userId,
        issued_token: token,
      });
    }

    // Resolve the success URL.
    const success = searchParams.get("success");
    const redirectTo = success
      ? `${HOME_ORIGIN}/auth/success?${success}`
      : `${HOME_ORIGIN}/auth/success`;

    return NextResponse.redirect(redirectTo);
  } catch (error) {
    console.error("Google OAuth callback failed:", error);
    return NextResponse.redirect(`${HOME_ORIGIN}/auth/error?error=oauth_failed`);
  } finally {
    await clearSessionCookie();
  }
}
