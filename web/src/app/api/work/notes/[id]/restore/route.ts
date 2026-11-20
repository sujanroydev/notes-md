import { withAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  conflict,
  databaseError,
  getUuidFromPath,
  mapNote,
  notFound,
  privateJson,
} from "@/lib/work-api";

export const dynamic = "force-dynamic";

export const POST = withAuth(async (request, session) => {
  const noteId = getUuidFromPath(request, 2);
  if (!noteId) {
    return privateJson({ error: "Invalid note ID" }, 400);
  }

  const { data: current, error: readError } = await supabase
    .from("work_notes")
    .select("version")
    .eq("id", noteId)
    .eq("user_id", session.user.id)
    .not("deleted_at", "is", null)
    .maybeSingle();
  if (readError) {
    return databaseError(readError, "Failed to load note for restore");
  }
  if (!current) {
    return notFound();
  }

  const version = Number(current.version);
  if (!Number.isSafeInteger(version)) {
    return privateJson({ error: "Note version is invalid" }, 500);
  }

  const { data, error } = await supabase
    .from("work_notes")
    .update({
      deleted_at: null,
      updated_at: new Date().toISOString(),
      version: version + 1,
    })
    .eq("id", noteId)
    .eq("user_id", session.user.id)
    .eq("version", version)
    .not("deleted_at", "is", null)
    .select("*")
    .maybeSingle();

  if (error) {
    return databaseError(error, "Failed to restore note");
  }
  if (!data) {
    return conflict();
  }
  return privateJson(mapNote(data));
});
