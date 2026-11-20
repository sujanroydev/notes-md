import { withAuth } from "@/lib/auth";
import { CreateNoteInputSchema } from "@/lib/validation";
import { supabase } from "@/lib/supabase";
import {
  databaseError,
  isUuid,
  mapNote,
  notFound,
  parseJson,
  privateJson,
} from "@/lib/work-api";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (request, session) => {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const trashed = searchParams.get("trashed");
  if (trashed !== null && trashed !== "true" && trashed !== "false") {
    return privateJson({ error: "Invalid trashed filter" }, 400);
  }
  if (projectId !== null && !isUuid(projectId)) {
    return privateJson({ error: "Invalid project ID" }, 400);
  }

  if (projectId !== null) {
    const { data: project, error: projectError } = await supabase
      .from("work_projects")
      .select("id, deleted_at")
      .eq("id", projectId)
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (projectError) {
      return databaseError(projectError, "Failed to validate project ownership");
    }
    if (!project || (trashed !== "true" && project.deleted_at)) {
      return notFound();
    }
  }

  let query = supabase
    .from("work_notes")
    .select("*")
    .eq("user_id", session.user.id)
    .order("updated_at", { ascending: false });

  query =
    trashed === "true"
      ? query.not("deleted_at", "is", null)
      : query.is("deleted_at", null);
  if (projectId !== null) {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query;
  if (error) {
    return databaseError(error, "Failed to list notes");
  }

  if (projectId !== null || trashed === "true") {
    return privateJson(data.map(mapNote));
  }

  const { data: projects, error: projectsError } = await supabase
    .from("work_projects")
    .select("id")
    .eq("user_id", session.user.id)
    .is("deleted_at", null);
  if (projectsError) {
    return databaseError(projectsError, "Failed to validate note project ownership");
  }
  const activeProjectIds = new Set(projects.map((project) => project.id));
  const visibleNotes = data.filter(
    (note) => note.project_id === null || activeProjectIds.has(note.project_id),
  );
  return privateJson(visibleNotes.map(mapNote));
});

export const POST = withAuth(async (request, session) => {
  const parsed = await parseJson(request, CreateNoteInputSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  const projectId = parsed.value.project_id ?? null;
  if (projectId !== null) {
    const { data: project, error: projectError } = await supabase
      .from("work_projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", session.user.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (projectError) {
      return databaseError(projectError, "Failed to validate project ownership");
    }
    if (!project) {
      return notFound();
    }
  }

  const { data, error } = await supabase
    .from("work_notes")
    .insert({
      user_id: session.user.id,
      project_id: projectId,
      name: parsed.value.name.trim(),
      content: "",
      note_type: parsed.value.note_type,
    })
    .select("*")
    .single();

  if (error) {
    return databaseError(error, "Failed to create note");
  }
  return privateJson(mapNote(data), 201);
});
