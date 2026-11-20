import { NextResponse } from "next/server";
import { createSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

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

  if (!pairingId) {
    return NextResponse.json({ error: "Missing pairing_id" }, { status: 400 });
  }

  const { data: pending, error } = await supabase
    .from("pending_links")
    .select("*, users(id, google_id, email, name, avatar_url)")
    .eq("pairing_id", pairingId)
    .eq("claimed_at", null)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Supabase error" }, { status: 500 });
  }

  if (!pending) {
    return NextResponse.json({ status: "claimed" });
  }

  // Issue a new application session for the linked VS Code client.
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, google_id, email, name, avatar_url")
    .eq("id", pending.user_id)
    .single();

  if (userError) {
    return NextResponse.json({ error: "Failed to resolve user" }, { status: 500 });
  }

  const token = await createSession(user.id);

  // Mark the pairing as claimed and persist the issued session token hash.
  const { error: updateError } = await supabase
    .from("pending_links")
    .update({ claimed_at: new Date().toISOString() })
    .eq("pairing_id", pairingId);

  if (updateError) {
    console.error("Failed to claim pairing:", updateError);
  }

  // Return the raw token once to the extension (bound to `pairing_id`).
  return NextResponse.json({
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
}
