import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { WorkNoteEditor } from "@/components/work/WorkNoteEditor";
import { getSessionFromToken } from "@/lib/session";

export default async function WorkNotePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("notes-md-session")?.value;
  const session = token ? await getSessionFromToken(token) : null;
  if (!session) {
    redirect("/signin");
  }

  return <WorkNoteEditor user={session.user} />;
}
