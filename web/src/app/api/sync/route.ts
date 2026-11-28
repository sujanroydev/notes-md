import { withAuth } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import { SyncRequestSchema } from "@/lib/validation";
import { supabase } from "@/lib/supabase";
import {
  databaseError,
  isUuid,
  mapNote,
  parseJson,
  privateJson,
} from "@/lib/work-api";

export const dynamic = "force-dynamic";

async function getOwnedNote(noteId: string, userId: string) {
  return supabase
    .from("work_notes")
    .select("*")
    .eq("id", noteId)
    .eq("user_id", userId)
    .maybeSingle();
}

async function hasOwnedProject(
  projectId: string,
  userId: string,
): Promise<{
  available: boolean;
  error: { code?: string; message?: string } | null;
}> {
  const { data, error } = await supabase
    .from("work_projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  return { available: data !== null, error };
}

function isSameSyncedContent(
  note: {
    name: string;
    content: string;
    project_id: string | null;
    note_type: string;
    content_hash: string | null;
    deleted_at: string | null;
  },
  change: {
    name: string;
    content?: string;
    project_id: string | null;
    note_type: string;
  },
): boolean {
  return (
    note.deleted_at === null &&
    note.name === change.name &&
    note.content === change.content &&
    note.project_id === change.project_id &&
    note.note_type === change.note_type &&
    note.content_hash === sha256(change.content ?? "")
  );
}

export const GET = withAuth(async (request, session) => {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (projectId !== null && !isUuid(projectId)) {
    return privateJson({ error: "Invalid project ID" }, 400);
  }

  if (projectId) {
    const project = await hasOwnedProject(projectId, session.user.id);
    if (project.error) {
      return databaseError(project.error, "Failed to validate sync project");
    }
    if (!project.available) {
      return privateJson({ error: "Project not found" }, 404);
    }

    const [projectNotes, globalNotes] = await Promise.all([
      supabase
        .from("work_notes")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("project_id", projectId),
      supabase
        .from("work_notes")
        .select("*")
        .eq("user_id", session.user.id)
        .is("project_id", null)
        .eq("note_type", "global"),
    ]);

    if (projectNotes.error) {
      return databaseError(projectNotes.error, "Failed to fetch project sync notes");
    }
    if (globalNotes.error) {
      return databaseError(globalNotes.error, "Failed to fetch global sync notes");
    }
    return privateJson({
      notes: [...globalNotes.data, ...projectNotes.data]
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
        .map(mapNote),
    });
  }

  const { data, error } = await supabase
    .from("work_notes")
    .select("*")
    .eq("user_id", session.user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return databaseError(error, "Failed to fetch sync notes");
  }
  return privateJson({ notes: data.map(mapNote) });
});

export const POST = withAuth(async (request, session) => {
  const parsed = await parseJson(request, SyncRequestSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  const synced = [];
  const conflicts = [];

  for (const change of parsed.value.changes) {
    try {
      if (change.project_id) {
        const project = await hasOwnedProject(change.project_id, session.user.id);
        if (project.error) {
          return databaseError(project.error, "Failed to validate sync project");
        }
        if (!project.available) {
          conflicts.push({ id: change.id, reason: "project_unavailable", remote: null });
          continue;
        }
      }

      const { data: current, error: readError } = await getOwnedNote(
        change.id,
        session.user.id,
      );
      if (readError) {
        return databaseError(readError, "Failed to read sync note");
      }

      if (change.base_version === 0) {
        if (change.type === "delete") {
          if (!current || current.deleted_at !== null) {
            if (current) {
              synced.push(mapNote(current));
            } else {
              conflicts.push({
                id: change.id,
                reason: "note_not_found",
                remote: null,
              });
            }
            continue;
          }

          const currentVersion = Number(current.version);
          if (!Number.isSafeInteger(currentVersion)) {
            return privateJson({ error: "Stored note version is invalid" }, 500);
          }
          const now = new Date().toISOString();
          const { data, error } = await supabase
            .from("work_notes")
            .update({
              deleted_at: now,
              updated_at: now,
              version: currentVersion + 1,
            })
            .eq("id", change.id)
            .eq("user_id", session.user.id)
            .eq("version", currentVersion)
            .is("deleted_at", null)
            .select("*")
            .maybeSingle();

          if (error) {
            return databaseError(error, "Failed to apply sync note delete");
          }
          if (!data) {
            const { data: latest, error: latestError } = await getOwnedNote(
              change.id,
              session.user.id,
            );
            if (latestError) {
              return databaseError(latestError, "Failed to resolve sync delete conflict");
            }
            conflicts.push({
              id: change.id,
              reason: "version_conflict",
              remote: latest ? mapNote(latest) : null,
            });
            continue;
          }
          synced.push(mapNote(data));
          continue;
        }

        if (current) {
          if (isSameSyncedContent(current, change)) {
            synced.push(mapNote(current));
          } else {
            conflicts.push({
              id: change.id,
              reason: "id_already_exists",
              remote: mapNote(current),
            });
          }
          continue;
        }
        if (change.type !== "upsert" || change.content === undefined) {
          conflicts.push({ id: change.id, reason: "invalid_create", remote: null });
          continue;
        }

        const contentHash = sha256(change.content);
        const { data, error } = await supabase
          .from("work_notes")
          .insert({
            id: change.id,
            user_id: session.user.id,
            project_id: change.project_id,
            name: change.name,
            content: change.content,
            note_type: change.note_type,
            version: 1,
            content_hash: contentHash,
          })
          .select("*")
          .single();

        if (error?.code === "23505") {
          const { data: existing, error: existingError } = await getOwnedNote(
            change.id,
            session.user.id,
          );
          if (existingError) {
            return databaseError(existingError, "Failed to resolve sync create conflict");
          }
          if (existing && isSameSyncedContent(existing, change)) {
            synced.push(mapNote(existing));
          } else {
            conflicts.push({
              id: change.id,
              reason: existing ? "id_already_exists" : "duplicate_name",
              remote: existing ? mapNote(existing) : null,
            });
          }
          continue;
        }
        if (error) {
          return databaseError(error, "Failed to create sync note");
        }
        synced.push(mapNote(data));
        continue;
      }

      if (!current) {
        conflicts.push({ id: change.id, reason: "note_not_found", remote: null });
        continue;
      }

      const currentVersion = Number(current.version);
      if (!Number.isSafeInteger(currentVersion)) {
        return privateJson({ error: "Stored note version is invalid" }, 500);
      }

      if (change.type === "delete" && current.deleted_at !== null) {
        synced.push(mapNote(current));
        continue;
      }

      if (current.deleted_at !== null) {
        conflicts.push({
          id: change.id,
          reason: "remote_deleted",
          remote: mapNote(current),
        });
        continue;
      }

      if (
        current.project_id !== change.project_id ||
        current.note_type !== change.note_type
      ) {
        conflicts.push({
          id: change.id,
          reason: "note_scope_changed",
          remote: mapNote(current),
        });
        continue;
      }

      if (
        change.type === "upsert" &&
        change.content !== undefined &&
        currentVersion === change.base_version + 1 &&
        isSameSyncedContent(current, change)
      ) {
        synced.push(mapNote(current));
        continue;
      }

      if (
        currentVersion !== change.base_version ||
        current.content_hash !== change.base_content_hash
      ) {
        conflicts.push({
          id: change.id,
          reason: "version_conflict",
          remote: mapNote(current),
        });
        continue;
      }

      const now = new Date().toISOString();
      const updates =
        change.type === "delete"
          ? {
              deleted_at: now,
              updated_at: now,
              version: currentVersion + 1,
            }
          : {
              name: change.name,
              content: change.content ?? "",
              content_hash: sha256(change.content ?? ""),
              updated_at: now,
              version: currentVersion + 1,
            };

      const { data, error } = await supabase
        .from("work_notes")
        .update(updates)
        .eq("id", change.id)
        .eq("user_id", session.user.id)
        .eq("version", currentVersion)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();

      if (error) {
        return databaseError(error, "Failed to apply sync note");
      }
      if (!data) {
        const { data: latest, error: latestError } = await getOwnedNote(
          change.id,
          session.user.id,
        );
        if (latestError) {
          return databaseError(latestError, "Failed to resolve sync conflict");
        }
        conflicts.push({
          id: change.id,
          reason: "version_conflict",
          remote: latest ? mapNote(latest) : null,
        });
        continue;
      }
      synced.push(mapNote(data));
    } catch (error) {
      console.error("Failed to process note synchronization:", error);
      return privateJson({ error: "Failed to synchronize notes" }, 500);
    }
  }

  return privateJson({ synced, conflicts });
});
