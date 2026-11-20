import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildGoogleAuthUrl } from "@/lib/google";

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;
const REDIRECT_URI = `${BASE_URL}/api/auth/google/callback`;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pairingId = searchParams.get("pairing_id") ?? null;

  const cookieStore = await cookies();
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();

  cookieStore.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  cookieStore.set("oauth_nonce", nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  if (pairingId) {
    cookieStore.set("pending_pairing_id", pairingId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
  }

  const url = buildGoogleAuthUrl({
    state,
    nonce,
    redirectUri: REDIRECT_URI,
  });

  return NextResponse.redirect(url);
}
