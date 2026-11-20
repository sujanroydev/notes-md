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

const API_BASE = process.env.NEXT_PUBLIC_BASE_URL;

export async function apiAuthHeaders(): Promise<Record<string, string>> {
  // Try cookie first, then Authorization header
  const cookieStore = await import("next/headers").then((m) => m.cookies());
  const token = cookieStore.get("notes-md-session")?.value;
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  // Fallback: the session can also come from the VS Code context.secrets
  // We don't have access to that here; let the caller decide.
  return {};
}

export async function listProjects(): Promise<WorkProject[]> {
  const res = await fetch(`${API_BASE}/api/work/projects`, {
    headers: await apiAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error("Failed to list projects");
  }
  return res.json();
}

export async function createProject(name: string): Promise<WorkProject> {
  const res = await fetch(`${API_BASE}/api/work/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await apiAuthHeaders()),
    },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to create project: ${txt}`);
  }
  return res.json();
}

export async function renameProject(id: string, name: string): Promise<WorkProject> {
  const res = await fetch(`${API_BASE}/api/work/projects/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(await apiAuthHeaders()),
    },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to rename project: ${txt}`);
  }
  return res.json();
}

export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/work/projects/${id}`, {
    method: "DELETE",
    headers: await apiAuthHeaders(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to delete project: ${txt}`);
  }
}

export async function restoreProject(id: string): Promise<WorkProject> {
  const res = await fetch(`${API_BASE}/api/work/projects/${id}/restore`, {
    method: "POST",
    headers: await apiAuthHeaders(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to restore project: ${txt}`);
  }
  return res.json();
}

export async function listNotes(projectId?: string): Promise<WorkNote[]> {
  const url = projectId
    ? `${API_BASE}/api/work/notes?projectId=${projectId}`
    : `${API_BASE}/api/work/notes`;
  const res = await fetch(url, {
    headers: await apiAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error("Failed to list notes");
  }
  return res.json();
}

export async function getNote(id: string): Promise<WorkNote> {
  const res = await fetch(`${API_BASE}/api/work/notes/${id}`, {
    headers: await apiAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error("Failed to get note");
  }
  return res.json();
}

export async function createNote(
  data: CreateNoteInput
): Promise<WorkNote> {
  const res = await fetch(`${API_BASE}/api/work/notes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await apiAuthHeaders()),
    },
    body: JSON.stringify({
      project_id: data.projectId,
      name: data.name,
      note_type: data.noteType,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to create note: ${txt}`);
  }
  return res.json();
}

export async function updateNote(
  id: string,
  content: string,
  version: number,
  contentHash: string | null
): Promise<WorkNote> {
  const res = await fetch(`${API_BASE}/api/work/notes/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(await apiAuthHeaders()),
    },
    body: JSON.stringify({ content, version, contentHash }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to update note: ${txt}`);
  }
  return res.json();
}

export async function renameNote(
  id: string,
  name: string,
  version?: number,
  contentHash?: string | null,
): Promise<WorkNote> {
  const res = await fetch(`${API_BASE}/api/work/notes/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(await apiAuthHeaders()),
    },
    body: JSON.stringify({ name, version, contentHash }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to rename note: ${txt}`);
  }
  return res.json();
}

export async function deleteNote(
  id: string,
  version: number,
  contentHash: string | null
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/work/notes/${id}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...(await apiAuthHeaders()),
    },
    body: JSON.stringify({ version, contentHash }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to delete note: ${txt}`);
  }
}

export async function syncNotes(
  request: SyncRequest
): Promise<SyncResult> {
  const res = await fetch(`${API_BASE}/api/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await apiAuthHeaders()),
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
    const txt = await res.text();
    throw new Error(`Sync failed: ${txt}`);
  }
  return res.json();
}

export async function getSyncNotes(projectId?: string): Promise<WorkNote[]> {
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  const res = await fetch(`${API_BASE}/api/sync${query}`, {
    headers: await apiAuthHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to fetch sync notes: ${txt}`);
  }
  const result: { notes: WorkNote[] } = await res.json();
  return result.notes;
}

export async function listTrashedNotes(): Promise<WorkNote[]> {
  const res = await fetch(`${API_BASE}/api/work/notes?trashed=true`, {
    headers: await apiAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error("Failed to list trashed notes");
  }
  return res.json();
}

export async function restoreNote(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/work/notes/${id}/restore`, {
    method: "POST",
    headers: await apiAuthHeaders(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to restore note: ${txt}`);
  }
}