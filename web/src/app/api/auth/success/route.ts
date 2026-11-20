import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.redirect(new URL("/signin", process.env.NEXT_PUBLIC_BASE_URL));
}
