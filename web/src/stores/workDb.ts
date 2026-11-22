import Dexie, { type Table } from "dexie";
import { v4 as uuid } from "uuid";
import type { WorkNote, WorkProject } from "@/lib/api";

export type WorkQueueOperation =
  | {
      id: string;
      entity: "note";
      type: "upsert";
      baseVersion: number;
      baseContentHash: string | null;
      note: WorkNote;
    }
  | {
      id: string;
      entity: "note";
      type: "delete";
      baseVersion: number;
      baseContentHash: string | null;
      note: WorkNote;
    }
  | {
      id: string;
      entity: "project";
      type: "upsert";
      project: WorkProject;
      originalName?: string;
    }
  | {
      id: string;
      entity: "project";
      type: "delete";
      project: WorkProject;
    };

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

export async function cacheWorkProjects(projects: WorkProject[]) {
  await WORK_DB.transaction("rw", WORK_DB.projects, async () => {
    if (projects.length) {
      await WORK_DB.projects.bulkPut(projects);
    }
  });
}

export async function cacheWorkNotes(notes: WorkNote[]) {
  await WORK_DB.transaction("rw", WORK_DB.notes, async () => {
    if (notes.length) {
      await WORK_DB.notes.bulkPut(notes);
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

export async function getCachedNote(id: string) {
  return WORK_DB.notes.get(id);
}

export async function saveCachedProject(project: WorkProject) {
  await WORK_DB.projects.put(project);
}

export async function saveCachedNote(note: WorkNote) {
  await WORK_DB.notes.put(note);
}

export async function deleteCachedProject(id: string) {
  await WORK_DB.projects.delete(id);
}

export async function deleteCachedNote(id: string) {
  await WORK_DB.notes.delete(id);
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
    name,
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
    name,
    content: "",
    noteType: projectId ? "regular" : "global",
    version: 0,
    contentHash: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export async function queueProjectUpsert(
  project: WorkProject,
  originalName?: string,
) {
  await WORK_DB.queue.put({
    id: `project-upsert:${project.id}`,
    entity: "project",
    type: "upsert",
    project,
    originalName,
  });
}

export async function queueProjectDelete(project: WorkProject) {
  await WORK_DB.queue.put({
    id: `project-delete:${project.id}`,
    entity: "project",
    type: "delete",
    project,
  });
}

export async function queueNoteUpsert(note: WorkNote) {
  const existing = await WORK_DB.queue.get(`note-upsert:${note.id}`);
  await WORK_DB.queue.put({
    id: `note-upsert:${note.id}`,
    entity: "note",
    type: "upsert",
    baseVersion: existing?.entity === "note" ? existing.baseVersion : note.version,
    baseContentHash:
      existing?.entity === "note" ? existing.baseContentHash : note.contentHash,
    note,
  });
}

export async function queueNoteDelete(note: WorkNote) {
  await WORK_DB.queue.delete(`note-upsert:${note.id}`);
  await WORK_DB.queue.put({
    id: `note-delete:${note.id}`,
    entity: "note",
    type: "delete",
    baseVersion: note.version,
    baseContentHash: note.contentHash,
    note,
  });
}
