import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionFromToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token = request.headers.get("authorization")?.startsWith("Bearer ")
    ? request.headers.get("authorization")!.slice(7).trim()
    : cookieStore.get("notes-md-session")?.value;

  const session = await getSessionFromToken(token ?? "");

  if (!session) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: session.user.id,
      google_id: session.user.google_id,
      email: session.user.email,
      name: session.user.name,
      avatar_url: session.user.avatar_url,
    },
    expires_at: session.expires_at,
  });
}
