import { NextResponse } from "next/server";
import {
  buildGoogleAuthUrl,
  getAppBaseUrl,
  getGoogleCallbackUrl,
} from "@/lib/google";

export const dynamic = "force-dynamic";

const OAUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 600,
  path: "/",
};

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const { searchParams } = requestUrl;
  const pairingId = searchParams.get("pairing_id") ?? null;

  if (pairingId && pairingId.length > 256) {
    return NextResponse.json({ error: "Invalid pairing_id" }, { status: 400 });
  }

  const baseUrl = getAppBaseUrl(request.url);
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const url = buildGoogleAuthUrl({
    state,
    nonce,
    redirectUri: getGoogleCallbackUrl(baseUrl),
  });

  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set("oauth_state", state, OAUTH_COOKIE_OPTIONS);
  response.cookies.set("oauth_nonce", nonce, OAUTH_COOKIE_OPTIONS);
  if (pairingId) {
    response.cookies.set("pending_pairing_id", pairingId, OAUTH_COOKIE_OPTIONS);
  } else {
    response.cookies.set("pending_pairing_id", "", {
      ...OAUTH_COOKIE_OPTIONS,
      maxAge: 0,
      expires: new Date(0),
    });
  }
  return response;
}
