import { withAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  databaseError,
  getUuidFromPath,
  mapProject,
  notFound,
  privateJson,
} from "@/lib/work-api";

export const dynamic = "force-dynamic";

export const POST = withAuth(async (request, session) => {
  const projectId = getUuidFromPath(request, 2);
  if (!projectId) {
    return privateJson({ error: "Invalid project ID" }, 400);
  }

  const { data, error } = await supabase
    .from("work_projects")
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", session.user.id)
    .not("deleted_at", "is", null)
    .select("*")
    .maybeSingle();

  if (error) {
    return databaseError(error, "Failed to restore project");
  }
  if (!data) {
    return notFound();
  }
  return privateJson(mapProject(data));
});
