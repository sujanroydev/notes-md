import {
  cacheWorkNotes,
  cacheWorkProjects,
  WORK_DB,
  type WorkQueueOperation,
} from "@/stores/workDb";
import {
  createProject,
  deleteProject,
  listProjects,
  renameProject,
  getSyncNotes,
  syncNotes,
  type WorkNote,
  type WorkProject,
} from "@/lib/api";

let syncing = false;
const projectIdMap = new Map<string, string>();

async function syncProjects() {
  const queue = (await WORK_DB.queue.toArray()).filter(
    (operation) => operation.entity === "project",
  );
  if (!queue.length) {
    return;
  }

  const remoteProjects = await listProjects();
  for (const operation of queue) {
    try {
      if (operation.type === "delete") {
        const remote = remoteProjects.find(
          (project) => project.name === operation.project.name,
        );
        if (remote) {
          await deleteProject(remote.id);
          await WORK_DB.projects.delete(operation.project.id);
          await WORK_DB.queue.delete(operation.id);
          remoteProjects.splice(remoteProjects.indexOf(remote), 1);
        } else {
          await WORK_DB.queue.delete(operation.id);
        }
        continue;
      }

      const matchName = operation.originalName ?? operation.project.name;
      let remote = remoteProjects.find(
        (project) =>
          project.id === operation.project.id ||
          project.name === matchName ||
          project.name === operation.project.name,
      );

      if (remote) {
        if (remote.name !== operation.project.name) {
          remote = await renameProject(remote.id, operation.project.name);
          const index = remoteProjects.findIndex(
            (project) => project.id === remote!.id,
          );
          if (index >= 0) {
            remoteProjects[index] = remote;
          }
        }
        await WORK_DB.projects.delete(operation.project.id);
        await WORK_DB.projects.put({ ...operation.project, id: remote.id });
        projectIdMap.set(operation.project.id, remote.id);

        await WORK_DB.notes
          .where("projectId")
          .equals(operation.project.id)
          .modify((note) => {
            note.projectId = remote!.id;
          });
      } else {
        remote = await createProject(operation.project.name);
        await WORK_DB.projects.delete(operation.project.id);
        await WORK_DB.projects.put(remote);
        projectIdMap.set(operation.project.id, remote.id);
        await WORK_DB.notes
          .where("projectId")
          .equals(operation.project.id)
          .modify((note) => {
            note.projectId = remote!.id;
          });
      }

      await WORK_DB.queue.delete(operation.id);
    } catch {
      // Leave the operation queued for the next attempt.
    }
  }
  await cacheWorkProjects(await listProjects());
}

async function syncNoteQueue() {
  const queue = (await WORK_DB.queue.toArray()).filter(
    (operation): operation is Extract<WorkQueueOperation, { entity: "note" }> =>
      operation.entity === "note",
  );
  if (!queue.length) {
    return;
  }

  const result = await syncNotes({
    changes: queue.map((operation) => {
      const projectId = operation.note.projectId
        ? projectIdMap.get(operation.note.projectId) ?? operation.note.projectId
        : null;
      return {
        id: operation.note.id,
        type: operation.type === "delete" ? "delete" : "upsert",
        projectId,
        name: operation.note.name,
        noteType: operation.note.noteType,
        content: operation.type === "delete" ? undefined : operation.note.content,
        baseVersion: operation.baseVersion,
        baseContentHash: operation.baseContentHash,
      };
    }),
  });

  for (const note of result.synced) {
    await WORK_DB.notes.put(note);
    await WORK_DB.queue.delete(`note-upsert:${note.id}`);
    await WORK_DB.queue.delete(`note-delete:${note.id}`);
  }
  for (const conflict of result.conflicts) {
    if (conflict.remote) {
      await WORK_DB.notes.put(conflict.remote);
    }
  }
}

export async function refreshRemoteWork(userId: string) {
  if (!navigator.onLine) {
    return;
  }
  const [projects, notes] = await Promise.all([
    listProjects(),
    getSyncNotes(),
  ]);
  await cacheWorkProjects(projects);
  await cacheWorkNotes(notes);
  void userId;
}

export async function syncWorkNow() {
  if (syncing || !navigator.onLine) {
    return;
  }
  syncing = true;
  try {
    await syncProjects();
    await syncNoteQueue();
  } finally {
    syncing = false;
  }
}

