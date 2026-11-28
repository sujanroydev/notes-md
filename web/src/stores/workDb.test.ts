import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import Dexie from "dexie";
import type { WorkNote } from "@/lib/api";
import { syncWorkNow } from "@/lib/workSync";
import {
  deleteNoteAndQueue,
  listCachedNotes,
  localNote,
  mergeRemoteWorkNotes,
  saveNoteAndQueue,
  WORK_DB,
} from "@/stores/workDb";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const projectId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const originalFetch = globalThis.fetch;
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

function makeNote(overrides: Partial<WorkNote> = {}): WorkNote {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    userId,
    projectId,
    name: "Local note",
    content: "local content",
    noteType: "regular",
    version: 1,
    contentHash: "base-hash",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(async () => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { onLine: true },
  });
  WORK_DB.close();
  await WORK_DB.delete();
  await WORK_DB.open();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalNavigator) {
    Object.defineProperty(globalThis, "navigator", originalNavigator);
  } else {
    Reflect.deleteProperty(globalThis, "navigator");
  }
});

test("note and queue are committed atomically and survive reopening the database", async () => {
  const note = makeNote();
  await saveNoteAndQueue(note);

  WORK_DB.close();
  await WORK_DB.open();

  assert.deepEqual(await WORK_DB.notes.get(note.id), note);
  assert.equal((await WORK_DB.queue.get(`note-upsert:${note.id}`))?.status, "pending");
});

test("stale cloud data cannot replace a queued local edit", async () => {
  const local = makeNote({ content: "unsynced edit", updatedAt: "2026-01-03T00:00:00.000Z" });
  await saveNoteAndQueue(local);

  await mergeRemoteWorkNotes(userId, [
    makeNote({ content: "stale cloud copy", version: 2, updatedAt: "2026-01-02T00:00:00.000Z" }),
  ]);

  assert.equal((await WORK_DB.notes.get(local.id))?.content, "unsynced edit");
  assert.ok(await WORK_DB.queue.get(`note-upsert:${local.id}`));
});

test("a newer cloud version is merged when there is no queued local change", async () => {
  const local = makeNote();
  await WORK_DB.notes.put(local);
  const remote = makeNote({
    content: "new cloud content",
    version: 2,
    updatedAt: "2026-01-02T00:00:00.000Z",
  });

  await mergeRemoteWorkNotes(userId, [remote]);

  assert.equal((await WORK_DB.notes.get(local.id))?.content, "new cloud content");
  assert.equal((await WORK_DB.notes.get(local.id))?.version, 2);
});

test("first cloud load adds remote notes without replacing local notes", async () => {
  const local = makeNote({ version: 0, contentHash: null });
  const remote = makeNote({
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    name: "Remote note",
    version: 3,
  });
  await WORK_DB.notes.put(local);

  await mergeRemoteWorkNotes(userId, [remote]);

  const notes = await listCachedNotes(userId);
  assert.deepEqual(new Set(notes.map((note) => note.id)), new Set([local.id, remote.id]));
});

test("a previously synced note missing from the full cloud snapshot becomes a tombstone", async () => {
  const local = makeNote();
  await WORK_DB.notes.put(local);

  await mergeRemoteWorkNotes(userId, []);

  const stored = await WORK_DB.notes.get(local.id);
  assert.ok(stored?.deletedAt);
  assert.equal((await listCachedNotes(userId)).length, 0);
});

test("legacy unversioned local notes are queued instead of replaced by cloud data", async () => {
  const local = makeNote({
    version: 0,
    contentHash: null,
    content: "local only note",
  });
  await WORK_DB.notes.put(local);

  await mergeRemoteWorkNotes(userId, [
    makeNote({ content: "remote note", version: 1 }),
  ]);

  assert.equal((await WORK_DB.notes.get(local.id))?.content, "local only note");
  const queued = await WORK_DB.queue.get(`note-upsert:${local.id}`);
  assert.equal(queued?.entity, "note");
  if (!queued || queued.entity !== "note") {
    throw new Error("The unversioned local note should be queued.");
  }
  assert.equal(queued.baseVersion, 0);
});

test("new Work notes retain their global and project note types", () => {
  assert.equal(localNote(userId, null, "Standalone note").noteType, "global");
  assert.equal(localNote(userId, projectId, "Project note").noteType, "regular");
});

test("rapid edits coalesce to the latest payload while preserving the original base version", async () => {
  const original = makeNote();
  await saveNoteAndQueue(original);
  await saveNoteAndQueue({
    ...original,
    content: "first edit",
    updatedAt: "2026-01-02T00:00:00.000Z",
  });
  await saveNoteAndQueue({
    ...original,
    content: "latest edit",
    updatedAt: "2026-01-03T00:00:00.000Z",
  });

  const queued = await WORK_DB.queue.get(`note-upsert:${original.id}`);
  assert.equal(queued?.entity, "note");
  if (!queued || queued.entity !== "note") {
    throw new Error("The note update should remain queued.");
  }
  assert.equal(queued.baseVersion, original.version);
  assert.equal(queued.note.content, "latest edit");
});

test("deleting an unsaved local-only note removes it without a queue operation", async () => {
  const note = makeNote({ version: 0, contentHash: null });
  await WORK_DB.notes.put(note);

  await deleteNoteAndQueue(note);

  assert.equal(await WORK_DB.notes.get(note.id), undefined);
  assert.equal(await WORK_DB.queue.get(`note-upsert:${note.id}`), undefined);
  assert.equal(await WORK_DB.queue.get(`note-delete:${note.id}`), undefined);
});

test("deleting a queued create queues a base-version-zero tombstone", async () => {
  const note = makeNote({ version: 0, contentHash: null });
  await saveNoteAndQueue(note);

  await deleteNoteAndQueue(note);

  const tombstone = await WORK_DB.notes.get(note.id);
  const deletion = await WORK_DB.queue.get(`note-delete:${note.id}`);
  assert.ok(tombstone?.deletedAt);
  assert.equal(deletion?.entity, "note");
  if (!deletion || deletion.entity !== "note") {
    throw new Error("The in-flight create needs a delete operation.");
  }
  assert.equal(deletion.baseVersion, 0);
});

test("deleting a synced note persists a queued tombstone and hides it from active notes", async () => {
  const note = makeNote();
  await WORK_DB.notes.put(note);

  await deleteNoteAndQueue(note);

  const tombstone = await WORK_DB.notes.get(note.id);
  assert.ok(tombstone?.deletedAt);
  assert.equal((await listCachedNotes(userId)).length, 0);
  assert.equal((await WORK_DB.queue.get(`note-delete:${note.id}`))?.status, "pending");
});

test("confirming a delete does not erase content saved locally while offline", async () => {
  const note = makeNote({ content: "offline edit before delete" });
  await saveNoteAndQueue(note);
  await deleteNoteAndQueue(note);
  globalThis.fetch = async () =>
    Response.json({
      synced: [
        makeNote({
          content: "older cloud content",
          version: 2,
          deletedAt: "2026-01-02T00:00:00.000Z",
        }),
      ],
      conflicts: [],
    });

  await syncWorkNow(userId, true);

  const stored = await WORK_DB.notes.get(note.id);
  assert.equal(stored?.content, "offline edit before delete");
  assert.ok(stored?.deletedAt);
  assert.equal(await WORK_DB.queue.get(`note-delete:${note.id}`), undefined);
});

test("a remote tombstone cannot replace a note with a pending local edit", async () => {
  const local = makeNote({ content: "pending edit" });
  await saveNoteAndQueue(local);

  await mergeRemoteWorkNotes(userId, [
    makeNote({
      content: "remote deletion",
      version: 2,
      deletedAt: "2026-01-02T00:00:00.000Z",
    }),
  ]);

  assert.equal((await WORK_DB.notes.get(local.id))?.content, "pending edit");
  assert.equal((await WORK_DB.notes.get(local.id))?.deletedAt, null);
});

test("notes from another account are ignored during local reconciliation", async () => {
  const foreign = makeNote({ userId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" });

  await mergeRemoteWorkNotes(userId, [foreign]);

  assert.equal(await WORK_DB.notes.get(foreign.id), undefined);
});

test("a confirmed note sync stores the server version and removes the queue item", async () => {
  const note = makeNote({ version: 0, contentHash: null });
  await saveNoteAndQueue(note);
  const synced = makeNote({
    version: 1,
    contentHash: "server-hash",
    updatedAt: "2026-01-02T00:00:00.000Z",
  });
  globalThis.fetch = async () =>
    Response.json({ synced: [synced], conflicts: [] });

  await syncWorkNow(userId, true);

  assert.deepEqual(await WORK_DB.notes.get(note.id), synced);
  assert.equal(await WORK_DB.queue.get(`note-upsert:${note.id}`), undefined);
});

test("cloud failures keep changes queued and a forced retry can confirm them", async () => {
  const note = makeNote({ version: 0, contentHash: null });
  await saveNoteAndQueue(note);
  globalThis.fetch = async () => {
    throw new Error("Network unavailable");
  };

  await syncWorkNow(userId, true);
  const failed = await WORK_DB.queue.get(`note-upsert:${note.id}`);
  assert.equal(failed?.status, "failed");
  assert.equal(failed?.retryCount, 1);
  assert.equal((await WORK_DB.notes.get(note.id))?.content, note.content);

  globalThis.fetch = async () =>
    Response.json({
      synced: [
        makeNote({
          version: 1,
          contentHash: "server-hash",
          updatedAt: "2026-01-02T00:00:00.000Z",
        }),
      ],
      conflicts: [],
    });
  await syncWorkNow(userId, true);

  assert.equal(await WORK_DB.queue.get(`note-upsert:${note.id}`), undefined);
});

test("offline edits remain local and sync after connectivity returns", async () => {
  const initial = makeNote({ version: 0, contentHash: null });
  await saveNoteAndQueue(initial);
  const edited = {
    ...initial,
    content: "edited while offline",
    updatedAt: "2026-01-03T00:00:00.000Z",
  };
  await saveNoteAndQueue(edited);
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { onLine: false },
  });
  globalThis.fetch = async () => {
    throw new Error("Fetch must not run while offline");
  };

  await syncWorkNow(userId, true);

  assert.equal((await WORK_DB.notes.get(initial.id))?.content, edited.content);
  assert.equal((await WORK_DB.queue.get(`note-upsert:${initial.id}`))?.status, "pending");

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { onLine: true },
  });
  globalThis.fetch = async () =>
    Response.json({
      synced: [
        makeNote({
          content: edited.content,
          version: 1,
          contentHash: "server-hash",
          updatedAt: edited.updatedAt,
        }),
      ],
      conflicts: [],
    });
  await syncWorkNow(userId, true);

  assert.equal(await WORK_DB.queue.get(`note-upsert:${initial.id}`), undefined);
  assert.equal((await WORK_DB.notes.get(initial.id))?.content, edited.content);
});

test("separate WorkDb connections observe the same persistent notes", async () => {
  const otherTab = new Dexie("notes-md-work");
  otherTab.version(1).stores({
    projects: "&id, userId, name, updatedAt",
    notes: "&id, userId, projectId, name, updatedAt",
    queue: "&id",
  });
  await otherTab.open();
  try {
    const note = makeNote();
    await otherTab.table<WorkNote>("notes").put(note);
    assert.deepEqual(await WORK_DB.notes.get(note.id), note);

    await saveNoteAndQueue({
      ...note,
      content: "edited in another tab",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    assert.equal(
      (await otherTab.table<WorkNote>("notes").get(note.id))?.content,
      "edited in another tab",
    );
    assert.ok(await otherTab.table("queue").get(`note-upsert:${note.id}`));
  } finally {
    otherTab.close();
  }
});

test("an edit made while a cloud request is in flight is kept and rebased", async () => {
  const initial = makeNote({ version: 0, contentHash: null });
  await saveNoteAndQueue(initial);
  const updated = {
    ...initial,
    content: "edited during sync",
    updatedAt: "2026-01-03T00:00:00.000Z",
  };
  globalThis.fetch = async () => {
    await saveNoteAndQueue(updated);
    return Response.json({
      synced: [
        makeNote({
          version: 1,
          contentHash: "confirmed-hash",
          updatedAt: "2026-01-02T00:00:00.000Z",
        }),
      ],
      conflicts: [],
    });
  };

  await syncWorkNow(userId, true);

  assert.equal((await WORK_DB.notes.get(initial.id))?.content, updated.content);
  const pending = await WORK_DB.queue.get(`note-upsert:${initial.id}`);
  assert.equal(pending?.entity, "note");
  if (!pending || pending.entity !== "note") {
    throw new Error("The note update should remain queued.");
  }
  assert.equal(pending?.status, "pending");
  assert.equal(pending?.baseVersion, 1);
});

test("simultaneous cloud edits are preserved as a local conflict copy", async () => {
  const local = makeNote({ content: "local edit" });
  await saveNoteAndQueue(local);
  const remote = makeNote({
    name: "Remote note",
    content: "remote edit",
    version: 2,
    contentHash: "remote-hash",
    updatedAt: "2026-01-04T00:00:00.000Z",
  });
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return Response.json(
      requests === 1
        ? {
            synced: [],
            conflicts: [{ id: local.id, reason: "version_conflict", remote }],
          }
        : {
            synced: [
              makeNote({
                content: local.content,
                version: 3,
                contentHash: "local-hash",
                updatedAt: local.updatedAt,
              }),
            ],
            conflicts: [],
          },
    );
  };

  await syncWorkNow(userId, true);

  const notes = await WORK_DB.notes.toArray();
  assert.ok(notes.some((note) => note.id === local.id && note.content === "local edit"));
  assert.ok(notes.some((note) => note.id !== local.id && note.content === "remote edit"));
  const pending = await WORK_DB.queue.get(`note-upsert:${local.id}`);
  assert.equal(pending?.entity, "note");
  if (!pending || pending.entity !== "note") {
    throw new Error("The conflicting local note should remain queued.");
  }
  assert.equal(pending?.baseVersion, 2);
  assert.equal(pending?.status, "pending");
});
