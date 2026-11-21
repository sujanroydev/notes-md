import { AlertCircle, FileCode2 } from "lucide-react";

const AUTH_ERRORS: Record<string, string> = {
  google_auth_denied: "Google sign-in was cancelled or denied. Please try again.",
  missing_code: "Google did not return an authorization code. Please try again.",
  invalid_state: "The sign-in request expired or could not be verified. Please try again.",
  no_id_token: "Google did not provide an identity token. Please try again.",
  oauth_failed: "Sign-in could not be completed. Please try again.",
  oauth_unavailable: "Google sign-in is currently unavailable. Please contact the site administrator.",
  database_unavailable: "Google verified your account, but NOTES.md could not save it. Please try again later or contact the site administrator.",
  session_expired: "Your session has expired. Please sign in again.",
};

interface SigninPageProps {
  searchParams: Promise<{ error?: string | string[] }>;
}

export default async function SigninPage({ searchParams }: SigninPageProps) {
  const { error } = await searchParams;
  const errorCode = Array.isArray(error) ? error[0] : error;
  const errorMessage = errorCode
    ? AUTH_ERRORS[errorCode] ?? "Sign-in could not be completed. Please try again."
    : undefined;

  return (
    <main className="flex min-h-full w-full items-center justify-center bg-muted/20 p-6">
      <section className="w-full max-w-sm rounded-lg border border-border bg-background p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FileCode2 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold">Sign in to NOTES.md</h1>
            <p className="text-sm text-muted-foreground">Continue to Work mode</p>
          </div>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mb-4 flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <a
          href="/api/auth/google/login"
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span aria-hidden="true" className="font-semibold">G</span>
          Continue with Google
        </a>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Work notes are stored in your account. Personal notes remain in this browser.
        </p>
      </section>
    </main>
  );
}
