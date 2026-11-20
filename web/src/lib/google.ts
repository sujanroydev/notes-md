import { OAuth2Client, type LoginTicket } from "google-auth-library";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

function getGoogleClient(redirectUri?: string): OAuth2Client {
  if (!googleClientId || !googleClientSecret) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment variables.",
    );
  }
  return new OAuth2Client(googleClientId, googleClientSecret, redirectUri);
}

export function getAppBaseUrl(requestUrl: string): URL {
  const configuredUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (!configuredUrl && process.env.NODE_ENV === "production") {
    throw new Error("Missing NEXT_PUBLIC_BASE_URL environment variable.");
  }

  const baseUrl = new URL(configuredUrl ?? new URL(requestUrl).origin);
  if (baseUrl.protocol !== "https:" && baseUrl.protocol !== "http:") {
    throw new Error("NEXT_PUBLIC_BASE_URL must use HTTP or HTTPS.");
  }
  if (process.env.NODE_ENV === "production" && baseUrl.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_BASE_URL must use HTTPS in production.");
  }
  return new URL(baseUrl.origin);
}

export function getGoogleCallbackUrl(baseUrl: URL): string {
  return new URL("/api/auth/google/callback", baseUrl).toString();
}

export const GOOGLE_ISSUERS = [
  "accounts.google.com",
  "https://accounts.google.com",
];

type VerifiedGooglePayload = NonNullable<
  ReturnType<LoginTicket["getPayload"]>
> & {
  email: string;
  email_verified: true;
  sub: string;
};

/**
 * Build the Google authorization URL for the server-side code flow.
 */
export function buildGoogleAuthUrl(params: {
  state: string;
  nonce: string;
  redirectUri: string;
  scope?: string;
}): string {
  const { state, nonce, redirectUri, scope } = params;
  return getGoogleClient(redirectUri).generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    state,
    nonce,
    scope: scope ?? "openid email profile",
    redirect_uri: redirectUri,
  });
}

/**
 * Exchange an authorization code for Google tokens.
 */
export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const { tokens } = await getGoogleClient(redirectUri).getToken(code);
  return tokens;
}

/**
 * Verify a Google ID token: signature, issuer, audience, expiration, nonce.
 * Returns the verified token payload (containing Google's stable `sub`).
 */
export async function verifyGoogleIdToken(params: {
  idToken: string;
  nonce: string;
}): Promise<VerifiedGooglePayload> {
  const { idToken, nonce } = params;
  const ticket = await getGoogleClient().verifyIdToken({
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

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!googleClientId || !audiences.includes(googleClientId)) {
    throw new Error("Google ID token audience does not match the client ID");
  }

  const { email, sub } = payload;
  if (!sub) {
    throw new Error("Google ID token is missing the subject");
  }
  if (!email || payload.email_verified !== true) {
    throw new Error("Google account does not have a verified email address");
  }

  // Expiration is validated by verifyIdToken; re-check defensively.
  if (payload.exp && Date.now() >= payload.exp * 1000) {
    throw new Error("Google ID token has expired");
  }

  if (!nonce || payload.nonce !== nonce) {
    throw new Error("Google ID token nonce does not match");
  }

  return { ...payload, email, email_verified: true, sub };
}

