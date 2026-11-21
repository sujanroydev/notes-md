import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionFromToken } from "@/lib/session";
import { WorkMain } from "@/components/work/WorkMain";

export default async function RootPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("notes-md-session")?.value;

  const session = token ? await getSessionFromToken(token) : null;
  if (!session) {
    redirect(token ? "/signin?error=session_expired" : "/signin");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <WorkMain user={session.user} />
    </div>
  );
}
