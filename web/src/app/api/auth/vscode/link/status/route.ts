import { NextResponse } from "next/server";
import { createSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Device-link status polling endpoint (VS Code extension only).
 *
 * The extension polls with the high-entropy pairing_id that it initiated.
 * Once the user completes Google sign-in on the web, the extension can
 * retrieve a bearer token bound to an application session. The token is
 * returned exactly once and only to the correct pairing_id.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pairingId = searchParams.get("pairing_id");

  if (!pairingId || pairingId.length < 32 || pairingId.length > 256) {
    return noStoreJson({ error: "Invalid pairing_id" }, 400);
  }

  const now = new Date().toISOString();
  const { data: pending, error } = await supabase
    .from("pending_links")
    .update({ claimed_at: now })
    .eq("pairing_id", pairingId)
    .is("claimed_at", null)
    .gt("expires_at", now)
    .select("user_id")
    .maybeSingle();

  if (error) {
    return noStoreJson({ error: "Supabase error" }, 500);
  }

  if (!pending) {
    return noStoreJson({ status: "claimed" });
  }

  try {
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, google_id, email, name, avatar_url")
      .eq("id", pending.user_id)
      .single();
    if (userError) {
      throw new Error(`Failed to resolve linked user: ${userError.message}`);
    }

    const token = await createSession(user.id);
    return noStoreJson({
      status: "linked",
      token,
      user: {
        id: user.id,
        google_id: user.google_id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
      },
    });
  } catch (error) {
    const { error: releaseError } = await supabase
      .from("pending_links")
      .update({ claimed_at: null })
      .eq("pairing_id", pairingId)
      .eq("claimed_at", now);
    if (releaseError) {
      console.error("Failed to release a pending device link:", releaseError);
    }
    console.error("Failed to complete device link:", error);
    return noStoreJson({ error: "Failed to complete device link" }, 500);
  }
}
