import Dexie, { type Table } from "dexie";
import { v4 as uuid } from "uuid";

export interface PersonalNote {
  id: string;
  title: string;
  content: string;
  folderId: string | null;
  favorite: boolean;
  archived: boolean;
  trashed: boolean;
  tags: { id: string; label: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface PersonalFolder {
  id: string;
  label: string;
  icon: string;
}

export interface PersonalTag {
  id: string;
  label: string;
}

/**
 * Dexie IndexedDB schema for the Personal (local-only) note storage.
 *
 * This data NEVER leaves the browser and is never synced to Supabase or the
 * VS Code extension.
 */
export class PersonalDb extends Dexie {
  notes!: Table<PersonalNote>;
  folders!: Table<PersonalFolder>;
  tags!: Table<PersonalTag>;

  constructor() {
    super("notes-md-personal");
    this.version(1).stores({
      "notes": "&id, title, favorite, archived, trashed, updatedAt",
      "folders": "&id, label",
      "tags": "&id, label",
    });
    this.version(2).stores({
      "notes": "&id, title, folderId, updatedAt",
      "folders": "&id, label",
      "tags": "&id, label",
    });
  }
}

export const PERSONAL_DB = new PersonalDb();

type NoteFields = Pick<
  PersonalNote,
  "title" | "content" | "folderId" | "favorite" | "archived" | "trashed" | "tags"
>;
export type PersonalNoteUpdate = Partial<NoteFields>;

function normalizedLabel(label: string): string {
  return label.trim().toLocaleLowerCase();
}

function requireLabel(label: string, kind: string): string {
  const normalized = label.trim();
  if (!normalized) {
    throw new Error(`${kind} name cannot be empty.`);
  }
  if (normalized.length > 120) {
    throw new Error(`${kind} name cannot exceed 120 characters.`);
  }
  return normalized;
}

export async function createPersonalNote(title: string): Promise<PersonalNote> {
  const now = new Date().toISOString();
  const note: PersonalNote = {
    id: uuid(),
    title: requireLabel(title, "Note"),
    content: "",
    folderId: null,
    favorite: false,
    archived: false,
    trashed: false,
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
  await PERSONAL_DB.notes.add(note);
  return note;
}

export async function updatePersonalNote(
  id: string,
  changes: PersonalNoteUpdate,
): Promise<PersonalNote> {
  return PERSONAL_DB.transaction(
    "rw",
    PERSONAL_DB.notes,
    PERSONAL_DB.folders,
    PERSONAL_DB.tags,
    async () => {
      const current = await PERSONAL_DB.notes.get(id);
      if (!current) {
        throw new Error("This note no longer exists.");
      }

      const title =
        changes.title === undefined
          ? current.title
          : requireLabel(changes.title, "Note");
      const folderId =
        changes.folderId === undefined ? current.folderId : changes.folderId;
      if (folderId && !(await PERSONAL_DB.folders.get(folderId))) {
        throw new Error("The selected folder no longer exists.");
      }
      const requestedTags = changes.tags ?? current.tags ?? [];
      const currentTagIds = new Set((current.tags ?? []).map((tag) => tag.id));
      const tags = (
        await Promise.all(
          requestedTags.map(async (tag) => {
            const storedTag = await PERSONAL_DB.tags.get(tag.id);
            if (storedTag) {
              return { id: storedTag.id, label: storedTag.label };
            }
            return currentTagIds.has(tag.id) ? tag : undefined;
          }),
        )
      ).filter((tag): tag is { id: string; label: string } => tag !== undefined);

      const updated: PersonalNote = {
        ...current,
        ...changes,
        title,
        folderId,
        tags,
        updatedAt: new Date().toISOString(),
      };
      await PERSONAL_DB.notes.put(updated);
      return updated;
    },
  );
}

export async function movePersonalNoteToTrash(id: string): Promise<void> {
  await updatePersonalNote(id, { trashed: true });
}

export async function restorePersonalNote(id: string): Promise<void> {
  await updatePersonalNote(id, { trashed: false });
}

export async function permanentlyDeletePersonalNote(id: string): Promise<void> {
  await PERSONAL_DB.notes.delete(id);
}

export async function emptyPersonalTrash(): Promise<void> {
  await PERSONAL_DB.notes.filter((note) => note.trashed).delete();
}

export async function createPersonalFolder(
  label: string,
  icon = "📁",
): Promise<PersonalFolder> {
  const folderLabel = requireLabel(label, "Folder");
  return PERSONAL_DB.transaction("rw", PERSONAL_DB.folders, async () => {
    const folders = await PERSONAL_DB.folders.toArray();
    if (
      folders.some(
        (folder) => normalizedLabel(folder.label) === normalizedLabel(folderLabel),
      )
    ) {
      throw new Error("A folder with this name already exists.");
    }

    const folder = { id: uuid(), label: folderLabel, icon };
    await PERSONAL_DB.folders.add(folder);
    return folder;
  });
}

export async function renamePersonalFolder(
  id: string,
  label: string,
): Promise<PersonalFolder> {
  const folderLabel = requireLabel(label, "Folder");
  return PERSONAL_DB.transaction("rw", PERSONAL_DB.folders, async () => {
    const [current, folders] = await Promise.all([
      PERSONAL_DB.folders.get(id),
      PERSONAL_DB.folders.toArray(),
    ]);
    if (!current) {
      throw new Error("This folder no longer exists.");
    }
    if (
      folders.some(
        (folder) =>
          folder.id !== id &&
          normalizedLabel(folder.label) === normalizedLabel(folderLabel),
      )
    ) {
      throw new Error("A folder with this name already exists.");
    }
    const updated = { ...current, label: folderLabel };
    await PERSONAL_DB.folders.put(updated);
    return updated;
  });
}

export async function deletePersonalFolder(id: string): Promise<void> {
  await PERSONAL_DB.transaction(
    "rw",
    PERSONAL_DB.folders,
    PERSONAL_DB.notes,
    async () => {
      await PERSONAL_DB.folders.delete(id);
      const now = new Date().toISOString();
      await PERSONAL_DB.notes.where("folderId").equals(id).modify((note) => {
        note.folderId = null;
        note.updatedAt = now;
      });
    },
  );
}

export async function createPersonalTag(label: string): Promise<PersonalTag> {
  const tagLabel = requireLabel(label, "Tag");
  return PERSONAL_DB.transaction("rw", PERSONAL_DB.tags, async () => {
    const tags = await PERSONAL_DB.tags.toArray();
    if (
      tags.some((tag) => normalizedLabel(tag.label) === normalizedLabel(tagLabel))
    ) {
      throw new Error("A tag with this name already exists.");
    }
    const tag = { id: uuid(), label: tagLabel };
    await PERSONAL_DB.tags.add(tag);
    return tag;
  });
}

export async function renamePersonalTag(
  id: string,
  label: string,
): Promise<PersonalTag> {
  const tagLabel = requireLabel(label, "Tag");
  return PERSONAL_DB.transaction(
    "rw",
    PERSONAL_DB.tags,
    PERSONAL_DB.notes,
    async () => {
      const [current, tags] = await Promise.all([
        PERSONAL_DB.tags.get(id),
        PERSONAL_DB.tags.toArray(),
      ]);
      if (!current) {
        throw new Error("This tag no longer exists.");
      }
      if (
        tags.some(
          (tag) =>
            tag.id !== id &&
            normalizedLabel(tag.label) === normalizedLabel(tagLabel),
        )
      ) {
        throw new Error("A tag with this name already exists.");
      }

      const updated = { ...current, label: tagLabel };
      await PERSONAL_DB.tags.put(updated);
      const now = new Date().toISOString();
      await PERSONAL_DB.notes.toCollection().modify((note) => {
        const noteTags = note.tags ?? [];
        if (!noteTags.some((tag) => tag.id === id)) {
          return;
        }
        note.tags = noteTags.map((tag) =>
          tag.id === id ? { ...tag, label: tagLabel } : tag,
        );
        note.updatedAt = now;
      });
      return updated;
    },
  );
}

export async function deletePersonalTag(id: string): Promise<void> {
  await PERSONAL_DB.transaction(
    "rw",
    PERSONAL_DB.tags,
    PERSONAL_DB.notes,
    async () => {
      await PERSONAL_DB.tags.delete(id);
      const now = new Date().toISOString();
      await PERSONAL_DB.notes.toCollection().modify((note) => {
        const tags = note.tags ?? [];
        if (tags.some((tag) => tag.id === id)) {
          note.tags = tags.filter((tag) => tag.id !== id);
          note.updatedAt = now;
        }
      });
    },
  );
}
