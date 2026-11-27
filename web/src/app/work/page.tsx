import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WorkMain } from "@/components/work/WorkMain";
import { getSessionFromToken } from "@/lib/session";

export default async function WorkPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("notes-md-session")?.value;

  const session = token ? await getSessionFromToken(token) : null;
  if (!session) {
    redirect(token ? "/signin?error=session_expired" : "/signin");
  }

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-background">
      <WorkMain user={session.user} />
    </div>
  );
}
