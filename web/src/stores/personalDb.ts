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
      "notes": "&id, title, favorite, archived, trashed, updatedAt, -updatedAt",
      "folders": "&id, label",
      "tags": "&id, label",
    });
  }
}

export const PERSONAL_DB = new PersonalDb();
