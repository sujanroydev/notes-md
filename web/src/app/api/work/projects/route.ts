import { withAuth } from "@/lib/auth";
import {
  CreateProjectInputSchema,
} from "@/lib/validation";
import { supabase } from "@/lib/supabase";
import {
  databaseError,
  mapProject,
  parseJson,
  privateJson,
} from "@/lib/work-api";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (request, session) => {
  const { searchParams } = new URL(request.url);
  const trashed = searchParams.get("trashed");
  if (trashed !== null && trashed !== "true" && trashed !== "false") {
    return privateJson({ error: "Invalid trashed filter" }, 400);
  }

  let query = supabase
    .from("work_projects")
    .select("*")
    .eq("user_id", session.user.id)
    .order("name", { ascending: true });

  query =
    trashed === "true"
      ? query.not("deleted_at", "is", null)
      : query.is("deleted_at", null);

  const { data, error } = await query;
  if (error) {
    return databaseError(error, "Failed to list projects");
  }
  return privateJson(data.map(mapProject));
});

export const POST = withAuth(async (request, session) => {
  const parsed = await parseJson(request, CreateProjectInputSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  const { data, error } = await supabase
    .from("work_projects")
    .insert({
      user_id: session.user.id,
      name: parsed.value.name.trim(),
    })
    .select("*")
    .single();

  if (error) {
    return databaseError(error, "Failed to create project");
  }
  return privateJson(mapProject(data), 201);
});
