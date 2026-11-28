export interface WorkProject {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface WorkNote {
  id: string;
  userId: string;
  projectId: string | null;
  name: string;
  content: string;
  noteType: "global" | "project_default" | "regular";
  version: number;
  contentHash: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateProjectInput {
  name: string;
}

export interface CreateNoteInput {
  projectId: string | null;
  name: string;
  noteType?: "global" | "project_default" | "regular";
}

export interface SyncRequest {
  changes: SyncChange[];
}

export interface SyncChange {
  id: string;
  type: "upsert" | "delete";
  projectId: string | null;
  name: string;
  noteType: "global" | "project_default" | "regular";
  content?: string;
  baseVersion: number;
  baseContentHash: string | null;
}

export interface SyncConflict {
  id: string;
  reason: string;
  remote: WorkNote | null;
}

export interface SyncResult {
  synced: WorkNote[];
  conflicts: SyncConflict[];
}

async function failureMessage(res: Response): Promise<string> {
  const responseText = await res.text();
  if (!responseText) {
    return `Request failed with status ${res.status}`;
  }
  try {
    const body = JSON.parse(responseText) as { error?: unknown };
    if (typeof body.error === "string") {
      return body.error;
    }
  } catch {
    // Keep a useful response body when the server does not return JSON.
  }
  return responseText;
}

export async function listProjects(): Promise<WorkProject[]> {
  const res = await fetch("/api/work/projects", { cache: "no-store" });
  if (!res.ok) {
    throw new Error(await failureMessage(res));
  }
  return res.json();
}

export async function createProject(
  name: string,
  id?: string,
): Promise<WorkProject> {
  const res = await fetch("/api/work/projects", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, ...(id ? { id } : {}) }),
  });
  if (!res.ok) {
    throw new Error(await failureMessage(res));
  }
  return res.json();
}

export async function renameProject(id: string, name: string): Promise<WorkProject> {
  const res = await fetch(`/api/work/projects/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error(await failureMessage(res));
  }
  return res.json();
}

export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`/api/work/projects/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(await failureMessage(res));
  }
}

export async function restoreProject(id: string): Promise<WorkProject> {
  const res = await fetch(`/api/work/projects/${id}/restore`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(await failureMessage(res));
  }
  return res.json();
}

export async function listNotes(projectId?: string): Promise<WorkNote[]> {
  const url = projectId
    ? `/api/work/notes?projectId=${encodeURIComponent(projectId)}`
    : "/api/work/notes";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(await failureMessage(res));
  }
  return res.json();
}

export async function getNote(id: string): Promise<WorkNote> {
  const res = await fetch(`/api/work/notes/${id}`);
  if (!res.ok) {
    throw new Error(await failureMessage(res));
  }
  return res.json();
}

export async function createNote(
  data: CreateNoteInput
): Promise<WorkNote> {
  const res = await fetch("/api/work/notes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      project_id: data.projectId,
      name: data.name,
      note_type: data.noteType,
    }),
  });
  if (!res.ok) {
    throw new Error(await failureMessage(res));
  }
  return res.json();
}

export async function updateNote(
  id: string,
  content: string,
  version: number,
  contentHash: string | null
): Promise<WorkNote> {
  const res = await fetch(`/api/work/notes/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content, version, contentHash }),
  });
  if (!res.ok) {
    throw new Error(await failureMessage(res));
  }
  return res.json();
}

export async function renameNote(
  id: string,
  name: string,
  version?: number,
  contentHash?: string | null,
): Promise<WorkNote> {
  const res = await fetch(`/api/work/notes/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, version, contentHash }),
  });
  if (!res.ok) {
    throw new Error(await failureMessage(res));
  }
  return res.json();
}

export async function deleteNote(
  id: string,
  version: number,
  contentHash: string | null
): Promise<void> {
  const res = await fetch(`/api/work/notes/${id}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ version, contentHash }),
  });
  if (!res.ok) {
    throw new Error(await failureMessage(res));
  }
}

export async function syncNotes(
  request: SyncRequest
): Promise<SyncResult> {
  const res = await fetch("/api/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      changes: request.changes.map((change) => ({
        id: change.id,
        type: change.type,
        project_id: change.projectId,
        name: change.name,
        note_type: change.noteType,
        content: change.content,
        base_version: change.baseVersion,
        base_content_hash: change.baseContentHash,
      })),
    }),
  });
  if (!res.ok) {
    throw new Error(await failureMessage(res));
  }
  return res.json();
}

export async function getSyncNotes(projectId?: string): Promise<WorkNote[]> {
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  const res = await fetch(`/api/sync${query}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(await failureMessage(res));
  }
  const result: { notes: WorkNote[] } = await res.json();
  return result.notes;
}

export async function listTrashedNotes(): Promise<WorkNote[]> {
  const res = await fetch("/api/work/notes?trashed=true");
  if (!res.ok) {
    throw new Error(await failureMessage(res));
  }
  return res.json();
}

export async function restoreNote(id: string): Promise<void> {
  const res = await fetch(`/api/work/notes/${id}/restore`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(await failureMessage(res));
  }
}