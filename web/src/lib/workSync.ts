import { v4 as uuid } from "uuid";
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
import {
  mergeRemoteWorkNotes,
  mergeRemoteWorkProjects,
  WORK_DB,
  type WorkQueueOperation,
} from "@/stores/workDb";

const SYNC_LOCK_NAME = "notes-md-work-sync";
const MAX_RETRY_DELAY = 5 * 60 * 1000;
const NOTE_BATCH_SIZE = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let syncing = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const projectIdMap = new Map<string, string>();

function operationOrder(
  left: WorkQueueOperation,
  right: WorkQueueOperation,
): number {
  return (left.createdAt ?? "").localeCompare(right.createdAt ?? "") ||
    left.id.localeCompare(right.id);
}

function operationNoteId(
  operation: Extract<WorkQueueOperation, { entity: "note" }>,
): string {
  return operation.noteId ?? operation.note.id;
}

function canRetry(operation: WorkQueueOperation, now: number): boolean {
  return !operation.nextAttemptAt ||
    Date.parse(operation.nextAttemptAt) <= now ||
    operation.status === "syncing";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The sync request failed.";
}

async function markQueueFailure(
  operation: WorkQueueOperation,
  error: unknown,
): Promise<void> {
  const current = await WORK_DB.queue.get(operation.id);
  if (!current) {
    return;
  }
  const retryCount = (current.retryCount ?? 0) + 1;
  const delay = Math.min(
    MAX_RETRY_DELAY,
    1000 * 2 ** Math.min(retryCount, 8),
  );
  await WORK_DB.queue.put({
    ...current,
    retryCount,
    status: "failed",
    lastError: errorMessage(error),
    nextAttemptAt: new Date(Date.now() + delay).toISOString(),
  });
}

async function markQueueSyncing(operation: WorkQueueOperation): Promise<void> {
  const current = await WORK_DB.queue.get(operation.id);
  if (current) {
    await WORK_DB.queue.put({ ...current, status: "syncing", lastError: null });
  }
}

async function syncProjectQueue(userId: string): Promise<void> {
  const operations = (await WORK_DB.queue.toArray())
    .filter(
      (
        operation,
      ): operation is Extract<WorkQueueOperation, { entity: "project" }> =>
        operation.entity === "project" &&
        operation.project.userId === userId &&
        canRetry(operation, Date.now()),
    )
    .sort(operationOrder);
  if (!operations.length) {
    return;
  }

  let remoteProjects: WorkProject[];
  try {
    remoteProjects = await listProjects();
  } catch (error) {
    await Promise.all(operations.map((operation) => markQueueFailure(operation, error)));
    return;
  }

  for (const operation of operations) {
    await markQueueSyncing(operation);
    try {
      if (operation.type === "delete") {
        const namedMatches = remoteProjects.filter(
          (project) => project.name === operation.project.name,
        );
        const remote =
          remoteProjects.find((project) => project.id === operation.project.id) ??
          (namedMatches.length === 1 ? namedMatches[0] : undefined);
        if (!remote && namedMatches.length > 1) {
          throw new Error(
            "Could not safely match this project for deletion because multiple projects have the same name.",
          );
        }
        if (remote) {
          await deleteProject(remote.id);
          remoteProjects = remoteProjects.filter((item) => item.id !== remote.id);
        }
        await WORK_DB.projects.delete(operation.project.id);
        await WORK_DB.queue.delete(operation.id);
        continue;
      }

      const matchingProjects = remoteProjects.filter(
        (project) =>
          project.name === (operation.originalName ?? operation.project.name) ||
          project.name === operation.project.name,
      );
      let remote =
        remoteProjects.find((project) => project.id === operation.project.id) ??
        (matchingProjects.length === 1 ? matchingProjects[0] : undefined);

      if (remote && remote.name !== operation.project.name) {
        remote = await renameProject(remote.id, operation.project.name);
      } else if (!remote) {
        remote = await createProject(operation.project.name, operation.project.id);
      }

      await WORK_DB.transaction(
        "rw",
        WORK_DB.projects,
        WORK_DB.notes,
        WORK_DB.queue,
        async () => {
          const latest = await WORK_DB.queue.get(operation.id);
          const pendingDelete = await WORK_DB.queue.get(
            `project-delete:${operation.project.id}`,
          );
          const latestUpsert =
            latest?.entity === "project" && latest.type === "upsert"
              ? latest
              : undefined;
          if (pendingDelete) {
            await WORK_DB.queue.delete(operation.id);
          } else if (
            latestUpsert &&
            (latestUpsert.project.updatedAt !== operation.project.updatedAt ||
              latestUpsert.project.name !== operation.project.name)
          ) {
            await WORK_DB.queue.put({
              ...latestUpsert,
              originalName: remote!.name,
              status: "pending",
              retryCount: 0,
              lastError: null,
              nextAttemptAt: new Date(Date.now() + 250).toISOString(),
            });
          } else {
            await WORK_DB.queue.delete(operation.id);
          }
          await WORK_DB.projects.delete(operation.project.id);
          if (!pendingDelete) {
            await WORK_DB.projects.put({
              ...(latestUpsert?.project ?? operation.project),
              id: remote!.id,
            });
          }
          await WORK_DB.notes
            .where("projectId")
            .equals(operation.project.id)
            .modify((note) => {
              note.projectId = remote!.id;
            });
        },
      );
      projectIdMap.set(operation.project.id, remote.id);
      remoteProjects = [
        ...remoteProjects.filter((project) => project.id !== remote!.id),
        remote,
      ];
    } catch (error) {
      await markQueueFailure(operation, error);
    }
  }

  await mergeRemoteWorkProjects(userId, remoteProjects);
}

function isValidRemoteNote(note: unknown, userId: string): note is WorkNote {
  if (typeof note !== "object" || note === null) {
    return false;
  }
  const value = note as Record<string, unknown>;
  return (
    typeof value.id === "string" &&
    UUID_PATTERN.test(value.id) &&
    typeof value.userId === "string" &&
    value.userId === userId &&
    (value.projectId === null ||
      (typeof value.projectId === "string" &&
        UUID_PATTERN.test(value.projectId))) &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    value.name.length <= 120 &&
    /^[a-zA-Z0-9 _.&-]+$/.test(value.name) &&
    typeof value.content === "string" &&
    value.content.length <= 10 * 1024 * 1024 &&
    typeof value.noteType === "string" &&
    ["global", "project_default", "regular"].includes(value.noteType) &&
    (value.noteType !== "global" || value.projectId === null) &&
    (value.noteType !== "project_default" || value.projectId !== null) &&
    typeof value.version === "number" &&
    Number.isSafeInteger(value.version) &&
    value.version >= 1 &&
    (value.contentHash === null || typeof value.contentHash === "string") &&
    typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    typeof value.updatedAt === "string" &&
    Number.isFinite(Date.parse(value.updatedAt)) &&
    (value.deletedAt === null ||
      (typeof value.deletedAt === "string" &&
        Number.isFinite(Date.parse(value.deletedAt))))
  );
}

function isValidRemoteProject(
  project: unknown,
  userId: string,
): project is WorkProject {
  if (typeof project !== "object" || project === null) {
    return false;
  }
  const value = project as Record<string, unknown>;
  return (
    typeof value.id === "string" &&
    UUID_PATTERN.test(value.id) &&
    value.userId === userId &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    value.name.length <= 120 &&
    /^[a-zA-Z0-9 _.&-]+$/.test(value.name) &&
    typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    typeof value.updatedAt === "string" &&
    Number.isFinite(Date.parse(value.updatedAt)) &&
    (value.deletedAt === null ||
      (typeof value.deletedAt === "string" &&
        Number.isFinite(Date.parse(value.deletedAt))))
  );
}

function sameNoteContent(left: WorkNote, right: WorkNote): boolean {
  return (
    left.name === right.name &&
    left.content === right.content &&
    left.projectId === right.projectId &&
    left.noteType === right.noteType
  );
}

function conflictCopyName(name: string, suffix: string): string {
  const availableLength = Math.max(1, 120 - suffix.length);
  return `${name.slice(0, availableLength).trimEnd()}${suffix}`;
}

async function uniqueConflictName(note: WorkNote, label: string): Promise<string> {
  const sameScope = await WORK_DB.notes
    .where("userId")
    .equals(note.userId)
    .toArray();
  const existingNames = new Set(
    sameScope
      .filter(
        (item) => item.projectId === note.projectId && item.id !== note.id,
      )
      .map((item) => item.name.toLocaleLowerCase()),
  );
  let suffix = ` - ${label}`;
  let name = conflictCopyName(note.name, suffix);
  let sequence = 2;
  while (existingNames.has(name.toLocaleLowerCase())) {
    suffix = ` - ${label} ${sequence++}`;
    name = conflictCopyName(note.name, suffix);
  }
  return name;
}

async function addConflictCopy(note: WorkNote, label: string): Promise<void> {
  await WORK_DB.transaction("rw", WORK_DB.notes, WORK_DB.queue, async () => {
    const sameScope = await WORK_DB.notes
      .where("userId")
      .equals(note.userId)
      .toArray();
    const existingNames = new Set(
      sameScope
        .filter((item) => item.projectId === note.projectId)
        .map((item) => item.name.toLocaleLowerCase()),
    );
    let suffix = ` - ${label}`;
    let name = conflictCopyName(note.name, suffix);
    let sequence = 2;
    while (existingNames.has(name.toLocaleLowerCase())) {
      suffix = ` - ${label} ${sequence++}`;
      name = conflictCopyName(note.name, suffix);
    }

    const now = new Date().toISOString();
    const copy: WorkNote = {
      ...note,
      id: uuid(),
      name,
      noteType: "regular",
      version: 0,
      contentHash: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    const id = `note-upsert:${copy.id}`;
    await WORK_DB.notes.add(copy);
    await WORK_DB.queue.put({
      id,
      entity: "note",
      noteId: copy.id,
      type: "upsert",
      baseVersion: 0,
      baseContentHash: null,
      note: copy,
      createdAt: now,
      retryCount: 0,
      status: "pending",
      lastError: null,
      nextAttemptAt: new Date(Date.now() + 250).toISOString(),
    });
  });
}

async function applyConflict(
  operation: Extract<WorkQueueOperation, { entity: "note" }>,
  conflict: { reason: string; remote: WorkNote | null },
): Promise<void> {
  const current = await WORK_DB.queue.get(operation.id);
  if (!current || current.entity !== "note") {
    return;
  }

  const localNote = current.note;
  const remoteNote = conflict.remote;

  if (
    remoteNote &&
    (!isValidRemoteNote(remoteNote, localNote.userId) ||
      remoteNote.id !== operationNoteId(operation))
  ) {
    await markQueueFailure(operation, new Error("The server returned an invalid note."));
    return;
  }

  if (conflict.reason === "project_unavailable") {
    await markQueueFailure(operation, new Error("The note's project is unavailable."));
    return;
  }

  if (conflict.reason === "duplicate_name" && current.type === "upsert") {
    const name = await uniqueConflictName(localNote, "recovered");
    const now = new Date().toISOString();
    await WORK_DB.transaction("rw", WORK_DB.notes, WORK_DB.queue, async () => {
      const latest = await WORK_DB.queue.get(operation.id);
      if (!latest || latest.entity !== "note") {
        return;
      }
      const updated = { ...latest.note, name, updatedAt: now };
      await WORK_DB.notes.put(updated);
      await WORK_DB.queue.put({
        ...latest,
        note: updated,
        baseVersion: 0,
        baseContentHash: null,
        status: "pending",
        retryCount: 0,
        lastError: null,
        nextAttemptAt: new Date(Date.now() + 250).toISOString(),
      });
    });
    return;
  }

  if (remoteNote?.deletedAt && current.type === "upsert") {
    const recoveredName = await uniqueConflictName(localNote, "recovered");
    const preserved = {
      ...localNote,
      id: uuid(),
      noteType: "regular" as const,
      version: 0,
      contentHash: null,
    };
    const id = `note-upsert:${preserved.id}`;
    const now = new Date().toISOString();
    const copy = {
      ...preserved,
      name: recoveredName,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await WORK_DB.transaction("rw", WORK_DB.notes, WORK_DB.queue, async () => {
      await WORK_DB.notes.put(remoteNote);
      await WORK_DB.notes.add(copy);
      await WORK_DB.queue.delete(operation.id);
      await WORK_DB.queue.put({
        id,
        entity: "note",
        noteId: copy.id,
        type: "upsert",
        baseVersion: 0,
        baseContentHash: null,
        note: copy,
        createdAt: now,
        retryCount: 0,
        status: "pending",
        lastError: null,
        nextAttemptAt: new Date(Date.now() + 250).toISOString(),
      });
    });
    return;
  }

  if (
    remoteNote &&
    remoteNote.deletedAt === null &&
    !sameNoteContent(localNote, remoteNote)
  ) {
    await addConflictCopy(remoteNote, "conflict copy");
  }

  if (!remoteNote && conflict.reason === "note_not_found") {
    if (current.type === "delete") {
      await WORK_DB.transaction("rw", WORK_DB.notes, WORK_DB.queue, async () => {
        await WORK_DB.queue.delete(operation.id);
        await WORK_DB.notes.delete(current.noteId ?? current.note.id);
      });
      return;
    }
    if (current.type === "upsert") {
      await WORK_DB.queue.put({
        ...current,
        baseVersion: 0,
        baseContentHash: null,
        status: "pending",
        lastError: null,
        nextAttemptAt: new Date(Date.now() + 250).toISOString(),
      });
      return;
    }
  }

  if (conflict.reason === "id_already_exists" && !remoteNote) {
    await addConflictCopy(localNote, "recovered copy");
    await WORK_DB.transaction("rw", WORK_DB.notes, WORK_DB.queue, async () => {
      await WORK_DB.notes.delete(current.noteId ?? current.note.id);
      await WORK_DB.queue.delete(operation.id);
    });
    return;
  }

  if (remoteNote && current.type === "upsert") {
    await WORK_DB.transaction("rw", WORK_DB.notes, WORK_DB.queue, async () => {
      const latest = await WORK_DB.queue.get(operation.id);
      if (!latest || latest.entity !== "note") {
        return;
      }
      await WORK_DB.notes.put({
        ...latest.note,
        version: remoteNote.version,
        contentHash: remoteNote.contentHash,
        createdAt: remoteNote.createdAt,
      });
      await WORK_DB.queue.put({
        ...latest,
        baseVersion: remoteNote.version,
        baseContentHash: remoteNote.contentHash,
        status: "pending",
        lastError: null,
        nextAttemptAt: new Date(Date.now() + 250).toISOString(),
      });
    });
    return;
  }

  await markQueueFailure(operation, new Error(`Sync conflict: ${conflict.reason}`));
}

async function confirmNoteSync(
  operation: Extract<WorkQueueOperation, { entity: "note" }>,
  syncedNote: WorkNote,
): Promise<void> {
  await WORK_DB.transaction("rw", WORK_DB.notes, WORK_DB.queue, async () => {
    const current = await WORK_DB.queue.get(operation.id);
    if (!current || current.entity !== "note") {
      return;
    }
    if (
      current.type !== "delete" &&
      current.type === operation.type &&
      current.note.updatedAt === operation.note.updatedAt &&
      sameNoteContent(current.note, operation.note) &&
      current.note.deletedAt === operation.note.deletedAt
    ) {
      await WORK_DB.notes.put(syncedNote);
      await WORK_DB.queue.delete(operation.id);
      return;
    }

    if (current.type === "delete") {
      await WORK_DB.notes.put({
        ...current.note,
        version: syncedNote.version,
        contentHash: syncedNote.contentHash,
        createdAt: syncedNote.createdAt,
        deletedAt: syncedNote.deletedAt,
      });
      await WORK_DB.queue.delete(operation.id);
      return;
    }

    await WORK_DB.notes.put({
      ...current.note,
      version: syncedNote.version,
      contentHash: syncedNote.contentHash,
      createdAt: syncedNote.createdAt,
    });
    await WORK_DB.queue.put({
      ...current,
      baseVersion: syncedNote.version,
      baseContentHash: syncedNote.contentHash,
      status: "pending",
      retryCount: 0,
      lastError: null,
      nextAttemptAt: new Date(Date.now() + 250).toISOString(),
    });
  });
}

async function syncNoteQueue(userId: string): Promise<void> {
  const operations = (await WORK_DB.queue.toArray())
    .filter(
      (operation): operation is Extract<WorkQueueOperation, { entity: "note" }> =>
        operation.entity === "note" &&
        operation.note.userId === userId &&
        canRetry(operation, Date.now()),
    )
    .sort(operationOrder)
    .slice(0, NOTE_BATCH_SIZE);
  if (!operations.length) {
    return;
  }

  for (const operation of operations) {
    await markQueueSyncing(operation);
  }

  let result;
  try {
    result = await syncNotes({
      changes: operations.map((operation) => {
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
  } catch (error) {
    await Promise.all(operations.map((operation) => markQueueFailure(operation, error)));
    return;
  }

  if (
    !result ||
    !Array.isArray(result.synced) ||
    !Array.isArray(result.conflicts)
  ) {
    const error = new Error("The server returned an invalid sync response.");
    await Promise.all(operations.map((operation) => markQueueFailure(operation, error)));
    return;
  }

  const syncedIds = new Set<string>();
  for (const note of result.synced) {
    if (!isValidRemoteNote(note, userId)) {
      throw new Error("The server returned an invalid synchronized note.");
    }
    const operation = operations.find((item) => operationNoteId(item) === note.id);
    if (operation) {
      syncedIds.add(operationNoteId(operation));
      await confirmNoteSync(operation, note);
    }
  }
  for (const conflict of result.conflicts) {
    const operation = operations.find(
      (item) => operationNoteId(item) === conflict.id,
    );
    if (operation) {
      syncedIds.add(operationNoteId(operation));
      await applyConflict(operation, conflict);
    }
  }

  const missing = operations.filter(
    (operation) => !syncedIds.has(operationNoteId(operation)),
  );
  await Promise.all(
    missing.map((operation) =>
      markQueueFailure(operation, new Error("The server did not confirm this note.")),
    ),
  );
}

async function synchronize(userId: string, force: boolean): Promise<void> {
  if (!navigator.onLine || syncing) {
    return;
  }

  syncing = true;
  try {
    if (force) {
      const queue = await WORK_DB.queue.toArray();
      await Promise.all(
        queue
          .filter(
            (operation) =>
              (operation.entity === "note" && operation.note.userId === userId) ||
              (operation.entity === "project" && operation.project.userId === userId),
          )
          .map((operation) =>
            WORK_DB.queue.update(operation.id, { nextAttemptAt: null }),
          ),
      );
    }
    await syncProjectQueue(userId);
    await syncNoteQueue(userId);
  } finally {
    syncing = false;
    scheduleRetry(userId);
  }
}

function scheduleRetry(userId: string): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  void WORK_DB.queue.toArray().then((queue) => {
    const nextAttempt = queue
      .filter(
        (
          operation,
        ): operation is WorkQueueOperation & { nextAttemptAt: string } =>
          ((operation.entity === "note" && operation.note.userId === userId) ||
            (operation.entity === "project" && operation.project.userId === userId)) &&
          typeof operation.nextAttemptAt === "string",
      )
      .map((operation) => Date.parse(operation.nextAttemptAt))
      .filter(Number.isFinite)
      .sort((left, right) => left - right)[0];
    if (nextAttempt !== undefined) {
      retryTimer = setTimeout(
        () =>
          void syncWorkNow(userId).catch((error: unknown) => {
            console.error("Could not resume Work note synchronization:", error);
          }),
        Math.max(0, nextAttempt - Date.now()),
      );
    }
  });
}

export async function syncWorkNow(
  userId: string,
  force = false,
): Promise<void> {
  if (!navigator.onLine) {
    return;
  }
  if (navigator.locks) {
    await navigator.locks.request(
      SYNC_LOCK_NAME,
      { ifAvailable: true },
      async (lock) => {
        if (lock) {
          await synchronize(userId, force);
        }
      },
    );
    return;
  }
  await synchronize(userId, force);
}

export async function refreshRemoteWork(
  userId: string,
  force = false,
): Promise<void> {
  if (!navigator.onLine) {
    return;
  }
  await syncWorkNow(userId, force);
  const [projects, notes] = await Promise.all([listProjects(), getSyncNotes()]);
  if (
    !Array.isArray(projects) ||
    !projects.every((project) => isValidRemoteProject(project, userId))
  ) {
    throw new Error("The server returned invalid Work projects.");
  }
  if (!Array.isArray(notes) || !notes.every((note) => isValidRemoteNote(note, userId))) {
    throw new Error("The server returned invalid Work notes.");
  }
  await Promise.all([
    mergeRemoteWorkProjects(userId, projects),
    mergeRemoteWorkNotes(userId, notes),
  ]);
}
