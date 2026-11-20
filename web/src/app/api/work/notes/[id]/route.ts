import { withAuth } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import {
  DeleteNoteInputSchema,
  RenameNoteInputSchema,
  UpdateNoteContentSchema,
} from "@/lib/validation";
import { supabase } from "@/lib/supabase";
import {
  conflict,
  databaseError,
  getUuidFromPath,
  mapNote,
  notFound,
  parseJson,
  privateJson,
} from "@/lib/work-api";

export const dynamic = "force-dynamic";

interface NoteMutation {
  name?: string;
  content?: string;
  version?: number;
  contentHash?: string | null;
  deletedAt?: string | null;
}

async function mutateNote(
  noteId: string,
  userId: string,
  mutation: NoteMutation,
) {
  const { data: current, error: readError } = await supabase
    .from("work_notes")
    .select("*")
    .eq("id", noteId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError) {
    return databaseError(readError, "Failed to load note for update");
  }
  if (!current) {
    return notFound();
  }

  const currentVersion = Number(current.version);
  if (!Number.isSafeInteger(currentVersion)) {
    console.error("Note has an invalid version:", noteId);
    return privateJson({ error: "Note version is invalid" }, 500);
  }
  if (mutation.version !== undefined && mutation.version !== currentVersion) {
    return conflict();
  }
  if (
    mutation.contentHash !== undefined &&
    mutation.contentHash !== current.content_hash
  ) {
    return conflict();
  }

  const now = new Date().toISOString();
  const updates: {
    name?: string;
    content?: string;
    content_hash?: string;
    deleted_at?: string | null;
    updated_at: string;
    version: number;
  } = {
    updated_at: now,
    version: currentVersion + 1,
  };
  if (mutation.name !== undefined) {
    updates.name = mutation.name.trim();
  }
  if (mutation.content !== undefined) {
    updates.content = mutation.content;
    updates.content_hash = sha256(mutation.content);
  }
  if (mutation.deletedAt !== undefined) {
    updates.deleted_at = mutation.deletedAt;
  }

  const { data, error } = await supabase
    .from("work_notes")
    .update(updates)
    .eq("id", noteId)
    .eq("user_id", userId)
    .eq("version", currentVersion)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();

  if (error) {
    return databaseError(error, "Failed to update note");
  }
  if (!data) {
    return conflict();
  }
  return privateJson(mapNote(data));
}

export const GET = withAuth(async (request, session) => {
  const noteId = getUuidFromPath(request);
  if (!noteId) {
    return privateJson({ error: "Invalid note ID" }, 400);
  }

  const { data, error } = await supabase
    .from("work_notes")
    .select("*")
    .eq("id", noteId)
    .eq("user_id", session.user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return databaseError(error, "Failed to get note");
  }
  if (!data) {
    return notFound();
  }
  return privateJson(mapNote(data));
});

export const PUT = withAuth(async (request, session) => {
  const noteId = getUuidFromPath(request);
  if (!noteId) {
    return privateJson({ error: "Invalid note ID" }, 400);
  }
  const parsed = await parseJson(request, UpdateNoteContentSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  return mutateNote(noteId, session.user.id, {
    content: parsed.value.content,
    version: parsed.value.version,
    contentHash: parsed.value.contentHash,
  });
});

export const PATCH = withAuth(async (request, session) => {
  const noteId = getUuidFromPath(request);
  if (!noteId) {
    return privateJson({ error: "Invalid note ID" }, 400);
  }
  const parsed = await parseJson(request, RenameNoteInputSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  return mutateNote(noteId, session.user.id, {
    name: parsed.value.name,
    version: parsed.value.version,
    contentHash: parsed.value.contentHash,
  });
});

export const DELETE = withAuth(async (request, session) => {
  const noteId = getUuidFromPath(request);
  if (!noteId) {
    return privateJson({ error: "Invalid note ID" }, 400);
  }
  const parsed = await parseJson(request, DeleteNoteInputSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  return mutateNote(noteId, session.user.id, {
    deletedAt: new Date().toISOString(),
    version: parsed.value.version,
    contentHash: parsed.value.contentHash,
  });
});
