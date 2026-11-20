import { withAuth } from "@/lib/auth";
import { RenameProjectInputSchema } from "@/lib/validation";
import { supabase } from "@/lib/supabase";
import {
  databaseError,
  getUuidFromPath,
  mapProject,
  notFound,
  parseJson,
  privateJson,
} from "@/lib/work-api";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (request, session) => {
  const projectId = getUuidFromPath(request);
  if (!projectId) {
    return privateJson({ error: "Invalid project ID" }, 400);
  }

  const { data, error } = await supabase
    .from("work_projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", session.user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return databaseError(error, "Failed to get project");
  }
  if (!data) {
    return notFound();
  }
  return privateJson(mapProject(data));
});

export const PATCH = withAuth(async (request, session) => {
  const projectId = getUuidFromPath(request);
  if (!projectId) {
    return privateJson({ error: "Invalid project ID" }, 400);
  }

  const parsed = await parseJson(request, RenameProjectInputSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  const { data, error } = await supabase
    .from("work_projects")
    .update({
      name: parsed.value.name.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .eq("user_id", session.user.id)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();

  if (error) {
    return databaseError(error, "Failed to rename project");
  }
  if (!data) {
    return notFound();
  }
  return privateJson(mapProject(data));
});

export const DELETE = withAuth(async (request, session) => {
  const projectId = getUuidFromPath(request);
  if (!projectId) {
    return privateJson({ error: "Invalid project ID" }, 400);
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("work_projects")
    .update({ deleted_at: now, updated_at: now })
    .eq("id", projectId)
    .eq("user_id", session.user.id)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();

  if (error) {
    return databaseError(error, "Failed to delete project");
  }
  if (!data) {
    return notFound();
  }
  return privateJson({ ok: true, project: mapProject(data) });
});
