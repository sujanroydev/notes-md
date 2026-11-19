import { OAuth2Client, type Payload } from "google-auth-library";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!googleClientId || !googleClientSecret) {
  throw new Error(
    "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment variables.",
  );
}

/**
 * Google OAuth 2.0 client used ONLY on the server.
 * The client secret never reaches the browser.
 */
export const oauth2Client = new OAuth2Client(
  googleClientId,
  googleClientSecret,
  `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/google/callback`,
);

export const GOOGLE_ISSUERS = [
  "accounts.google.com",
  "https://accounts.google.com",
];

/**
 * Build the Google authorization URL for the server-side code flow.
 */
export function buildGoogleAuthUrl(params: {
  state: string;
  nonce: string;
  redirectUri?: string;
  scope?: string;
}): string {
  const { state, nonce, redirectUri, scope } = params;
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    state,
    nonce,
    scope: scope ?? "openid email profile",
    redirect_uri: redirectUri ?? oauth2Client.redirectUri,
  });
}

/**
 * Exchange an authorization code for Google tokens.
 */
export async function exchangeCodeForTokens(code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

/**
 * Verify a Google ID token: signature, issuer, audience, expiration, nonce.
 * Returns the verified payload (containing Google's stable `sub`).
 */
export async function verifyGoogleIdToken(params: {
  idToken: string;
  nonce?: string;
}): Promise<Payload> {
  const { idToken, nonce } = params;
  const ticket = await oauth2Client.verifyIdToken({
    idToken,
    audience: googleClientId,
  });
  const payload = ticket.getPayload();
  if (!payload) {
    throw new Error("Google ID token payload is missing");
  }

  if (!GOOGLE_ISSUERS.includes(payload.iss ?? "")) {
    throw new Error("Google ID token has an invalid issuer");
  }

  if (payload.aud !== googleClientId) {
    throw new Error("Google ID token audience does not match the client ID");
  }

  // Expiration is validated by verifyIdToken; re-check defensively.
  if (payload.exp && Date.now() >= payload.exp * 1000) {
    throw new Error("Google ID token has expired");
  }

  if (nonce && payload.nonce !== nonce) {
    throw new Error("Google ID token nonce does not match");
  }

  return payload;
}
