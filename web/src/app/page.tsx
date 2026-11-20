import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionFromToken } from "@/lib/session";
import { SideNav } from "@/components/layout/SideNav";
import { WorkMain } from "@/components/work/WorkMain";
import { PersonalMain } from "@/components/personal/PersonalMain";

export default async function RootPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("notes-md-session")?.value;

  let isAuthenticated = false;
  let user = null;
  if (token) {
    const session = await getSessionFromToken(token);
    isAuthenticated = !!session;
    user = session?.user ?? null;
  }

  // Authenticate the web app session before entering mode-specific UI.
  if (isAuthenticated) {
    if (!user) {
      redirect("/signin");
    }
  } else {
    // No session cookie → show the mode picker (personal is always public).
    redirect("/signin");
  }

  // In Work mode the authenticated user is present; route to Work UI.
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <SideNav user={user} />
      <WorkMain user={user} />
    </div>
  );
}
