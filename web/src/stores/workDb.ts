import Dexie, { type Table } from "dexie";
import { v4 as uuid } from "uuid";
import type { WorkNote, WorkProject } from "@/lib/api";

type QueueStatus = "pending" | "syncing" | "failed";

interface QueueMetadata {
  createdAt: string;
  retryCount: number;
  status: QueueStatus;
  lastError: string | null;
  nextAttemptAt: string | null;
}
type WorkQueueMetadata = Partial<QueueMetadata>;

export type WorkQueueOperation =
  | (WorkQueueMetadata & {
      id: string;
      entity: "note";
      noteId?: string;
      type: "upsert";
      baseVersion: number;
      baseContentHash: string | null;
      note: WorkNote;
    })
  | (WorkQueueMetadata & {
      id: string;
      entity: "note";
      noteId?: string;
      type: "delete";
      baseVersion: number;
      baseContentHash: string | null;
      note: WorkNote;
    })
  | (WorkQueueMetadata & {
      id: string;
      entity: "project";
      type: "upsert";
      project: WorkProject;
      originalName?: string;
    })
  | (WorkQueueMetadata & {
      id: string;
      entity: "project";
      type: "delete";
      project: WorkProject;
    });

class WorkDb extends Dexie {
  projects!: Table<WorkProject>;
  notes!: Table<WorkNote>;
  queue!: Table<WorkQueueOperation>;

  constructor() {
    super("notes-md-work");
    this.version(1).stores({
      projects: "&id, userId, name, updatedAt",
      notes: "&id, userId, projectId, name, updatedAt",
      queue: "&id",
    });
  }
}

export const WORK_DB = new WorkDb();

function validNoteName(name: string): string {
  const normalized = name.trim();
  if (
    !normalized ||
    normalized.length > 120 ||
    !/^[a-zA-Z0-9 _.&-]+$/.test(normalized)
  ) {
    throw new Error(
      "Note names must be 1-120 characters and use letters, numbers, spaces, dots, underscores, ampersands, or hyphens.",
    );
  }
  return normalized;
}

function validProjectName(name: string): string {
  const normalized = name.trim();
  if (
    !normalized ||
    normalized.length > 120 ||
    !/^[a-zA-Z0-9 _.&-]+$/.test(normalized)
  ) {
    throw new Error(
      "Project names must be 1-120 characters and use letters, numbers, spaces, dots, underscores, ampersands, or hyphens.",
    );
  }
  return normalized;
}

function validateWorkNote(note: WorkNote): WorkNote {
  const normalized = { ...note, name: validNoteName(note.name) };
  if (normalized.content.length > 10 * 1024 * 1024) {
    throw new Error("Note content is too large to save.");
  }
  if (
    (normalized.noteType === "global" && normalized.projectId !== null) ||
    (normalized.noteType === "project_default" && normalized.projectId === null)
  ) {
    throw new Error("Note type and project must be consistent.");
  }
  return normalized;
}

function queueMetadata(existing?: WorkQueueOperation): QueueMetadata {
  return {
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    retryCount: 0,
    status: "pending",
    lastError: null,
    nextAttemptAt: null,
  };
}

export async function mergeRemoteWorkProjects(
  userId: string,
  projects: WorkProject[],
) {
  await WORK_DB.transaction("rw", WORK_DB.projects, WORK_DB.queue, async () => {
    for (const project of projects) {
      if (project.userId !== userId) {
        continue;
      }
      const upsert = await WORK_DB.queue.get(`project-upsert:${project.id}`);
      const deletion = await WORK_DB.queue.get(`project-delete:${project.id}`);
      if (!upsert && !deletion) {
        await WORK_DB.projects.put(project);
      }
    }
  });
}

export async function mergeRemoteWorkNotes(
  userId: string,
  notes: WorkNote[],
) {
  await WORK_DB.transaction("rw", WORK_DB.notes, WORK_DB.queue, async () => {
    const queueUnversionedNote = async (note: WorkNote) => {
      const deleted = note.deletedAt !== null;
      const id = `${deleted ? "note-delete" : "note-upsert"}:${note.id}`;
      const existing = await WORK_DB.queue.get(id);
      if (existing) {
        return;
      }
      await WORK_DB.queue.put({
        id,
        entity: "note",
        noteId: note.id,
        type: deleted ? "delete" : "upsert",
        baseVersion: 0,
        baseContentHash: null,
        note,
        ...queueMetadata(),
      });
    };
    const remoteIds = new Set(
      notes.filter((note) => note.userId === userId).map((note) => note.id),
    );
    for (const note of notes) {
      if (note.userId !== userId) {
        continue;
      }
      const queuedUpsert = await WORK_DB.queue.get(`note-upsert:${note.id}`);
      const queuedDelete = await WORK_DB.queue.get(`note-delete:${note.id}`);
      if (queuedUpsert || queuedDelete) {
        continue;
      }

      const local = await WORK_DB.notes.get(note.id);
      if (local?.version === 0) {
        await queueUnversionedNote(local);
        continue;
      }
      if (!local || note.version > local.version) {
        await WORK_DB.notes.put(note);
      }
    }

    const now = new Date().toISOString();
    const localNotes = await WORK_DB.notes
      .where("userId")
      .equals(userId)
      .toArray();
    for (const local of localNotes) {
      if (remoteIds.has(local.id)) {
        continue;
      }
      const queuedUpsert = await WORK_DB.queue.get(`note-upsert:${local.id}`);
      const queuedDelete = await WORK_DB.queue.get(`note-delete:${local.id}`);
      if (local.version === 0 && !queuedUpsert && !queuedDelete) {
        await queueUnversionedNote(local);
        continue;
      }
      if (!queuedUpsert && !queuedDelete && local.deletedAt === null) {
        await WORK_DB.notes.put({ ...local, deletedAt: now, updatedAt: now });
      }
    }
  });
}

export async function listCachedProjects(userId: string) {
  return WORK_DB.projects.where("userId").equals(userId).sortBy("name");
}

export async function listCachedNotes(userId: string) {
  return WORK_DB.notes
    .where("userId")
    .equals(userId)
    .filter((note) => note.deletedAt === null)
    .sortBy("updatedAt");
}

export async function getCachedNote(id: string, userId: string) {
  const note = await WORK_DB.notes.get(id);
  return note?.userId === userId ? note : undefined;
}

export async function saveProjectAndQueue(
  project: WorkProject,
  originalName?: string,
) {
  const normalizedProject = {
    ...project,
    name: validProjectName(project.name),
  };
  await WORK_DB.transaction("rw", WORK_DB.projects, WORK_DB.queue, async () => {
    const id = `project-upsert:${normalizedProject.id}`;
    const existing = await WORK_DB.queue.get(id);
    const existingUpsert =
      existing?.entity === "project" && existing.type === "upsert"
        ? existing
        : undefined;
    await WORK_DB.projects.put(normalizedProject);
    await WORK_DB.queue.put({
      id,
      entity: "project",
      type: "upsert",
      project: normalizedProject,
      originalName: existingUpsert?.originalName ?? originalName,
      ...queueMetadata(existing),
    });
    await WORK_DB.queue.delete(`project-delete:${normalizedProject.id}`);
  });
}

export async function deleteProjectAndQueue(project: WorkProject) {
  await WORK_DB.transaction("rw", WORK_DB.projects, WORK_DB.queue, async () => {
    const id = `project-delete:${project.id}`;
    const existing = await WORK_DB.queue.get(id);
    await WORK_DB.projects.delete(project.id);
    await WORK_DB.queue.delete(`project-upsert:${project.id}`);
    await WORK_DB.queue.put({
      id,
      entity: "project",
      type: "delete",
      project,
      ...queueMetadata(existing),
    });
  });
}

export async function saveNoteAndQueue(note: WorkNote): Promise<WorkNote> {
  const normalizedNote = validateWorkNote(note);
  await WORK_DB.transaction("rw", WORK_DB.notes, WORK_DB.queue, async () => {
    const queueId = `note-upsert:${normalizedNote.id}`;
    const existing = await WORK_DB.queue.get(queueId);
    const existingNoteQueue =
      existing?.entity === "note" ? existing : undefined;
    await WORK_DB.notes.put(normalizedNote);
    await WORK_DB.queue.put({
      id: queueId,
      entity: "note",
      noteId: normalizedNote.id,
      type: "upsert",
      baseVersion: existingNoteQueue?.baseVersion ?? normalizedNote.version,
      baseContentHash:
        existingNoteQueue?.baseContentHash ?? normalizedNote.contentHash,
      note: normalizedNote,
      ...queueMetadata(existing),
    });
    await WORK_DB.queue.delete(`note-delete:${normalizedNote.id}`);
  });
  return normalizedNote;
}

export async function deleteNoteAndQueue(note: WorkNote): Promise<void> {
  await WORK_DB.transaction("rw", WORK_DB.notes, WORK_DB.queue, async () => {
    const upsertId = `note-upsert:${note.id}`;
    const deleteId = `note-delete:${note.id}`;
    const existing = await WORK_DB.queue.get(upsertId);
    const existingNoteQueue = existing?.entity === "note" ? existing : undefined;
    const baseVersion = existingNoteQueue?.baseVersion ?? note.version;
    const baseContentHash =
      existingNoteQueue?.baseContentHash ?? note.contentHash;

    await WORK_DB.queue.delete(upsertId);
    if (baseVersion === 0 && !existingNoteQueue) {
      await WORK_DB.notes.delete(note.id);
      await WORK_DB.queue.delete(deleteId);
      return;
    }

    if (baseVersion === 0) {
      const deletedAt = new Date().toISOString();
      const deletedNote = { ...note, deletedAt, updatedAt: deletedAt };
      await WORK_DB.notes.put(deletedNote);
      await WORK_DB.queue.put({
        id: deleteId,
        entity: "note",
        noteId: note.id,
        type: "delete",
        baseVersion: 0,
        baseContentHash: null,
        note: deletedNote,
        ...queueMetadata(existingNoteQueue),
      });
      return;
    }

    const deletedAt = new Date().toISOString();
    const deletedNote = { ...note, deletedAt, updatedAt: deletedAt };
    await WORK_DB.notes.put(deletedNote);
    const currentDelete = await WORK_DB.queue.get(deleteId);
    await WORK_DB.queue.put({
      id: deleteId,
      entity: "note",
      noteId: note.id,
      type: "delete",
      baseVersion,
      baseContentHash,
      note: deletedNote,
      ...queueMetadata(currentDelete),
    });
  });
}

export function localProject(
  userId: string,
  name: string,
  id = uuid(),
): WorkProject {
  const now = new Date().toISOString();
  return {
    id,
    userId,
    name: validProjectName(name),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export function localNote(
  userId: string,
  projectId: string | null,
  name: string,
  id = uuid(),
): WorkNote {
  const now = new Date().toISOString();
  return {
    id,
    userId,
    projectId,
    name: validNoteName(name),
    content: "",
    noteType: projectId ? "regular" : "global",
    version: 0,
    contentHash: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}
