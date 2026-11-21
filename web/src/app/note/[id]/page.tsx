"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Archive,
  Check,
  RotateCcw,
  Star,
  Tag,
  Trash2,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { showToast } from "@/components/ui/toast";
import { ModeSwitcher } from "@/components/layout/ModeSwitcher";
import {
  movePersonalNoteToTrash,
  PERSONAL_DB,
  updatePersonalNote,
  type PersonalFolder,
  type PersonalNote,
  type PersonalTag,
} from "@/stores/personalDb";

interface NoteDraft {
  title: string;
  content: string;
  folderId: string | null;
  favorite: boolean;
  archived: boolean;
  trashed: boolean;
  tags: PersonalNote["tags"];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toDraft(note: PersonalNote): NoteDraft {
  return {
    title: note.title,
    content: note.content,
    folderId: note.folderId,
    favorite: note.favorite,
    archived: note.archived,
    trashed: note.trashed,
    tags: note.tags ?? [],
  };
}

export default function PersonalNotePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [note, setNote] = useState<PersonalNote | null>(null);
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  const [folders, setFolders] = useState<PersonalFolder[]>([]);
  const [tags, setTags] = useState<PersonalTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const draftRef = useRef<NoteDraft | null>(null);
  const revisionRef = useRef(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [loadedNote, loadedFolders, loadedTags] = await Promise.all([
          PERSONAL_DB.notes.get(id),
          PERSONAL_DB.folders.toArray(),
          PERSONAL_DB.tags.toArray(),
        ]);
        if (!active) {
          return;
        }
        if (!loadedNote) {
          setNote(null);
          return;
        }
        const initialDraft = toDraft(loadedNote);
        draftRef.current = initialDraft;
        setNote(loadedNote);
        setDraft(initialDraft);
        setFolders(loadedFolders.sort((a, b) => a.label.localeCompare(b.label)));
        setTags(loadedTags.sort((a, b) => a.label.localeCompare(b.label)));
      } catch (error) {
        if (active) {
          setSaveError(errorMessage(error));
          showToast({
            title: "Could not open this note",
            description: errorMessage(error),
            variant: "error",
          });
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [id]);

  const saveDraft = useCallback(async (): Promise<boolean> => {
    const currentDraft = draftRef.current;
    if (!currentDraft || !dirty) {
      return true;
    }

    const revision = revisionRef.current;
    setSaving(true);
    try {
      const saved = await updatePersonalNote(id, currentDraft);
      setNote(saved);
      if (revision === revisionRef.current) {
        setDirty(false);
        setSaveError(null);
      }
      return true;
    } catch (error) {
      const message = errorMessage(error);
      setSaveError(message);
      showToast({
        title: "Could not save note",
        description: message,
        variant: "error",
      });
      return false;
    } finally {
      if (revision === revisionRef.current) {
        setSaving(false);
      }
    }
  }, [dirty, id]);

  useEffect(() => {
    if (!dirty) {
      return;
    }
    const timer = window.setTimeout(() => {
      void saveDraft();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [dirty, draft, saveDraft]);

  const changeDraft = (changes: Partial<NoteDraft>) => {
    if (!draft) {
      return;
    }
    const nextDraft = { ...draft, ...changes };
    draftRef.current = nextDraft;
    revisionRef.current += 1;
    setDraft(nextDraft);
    setDirty(true);
    setSaveError(null);
  };

  const handleBack = async () => {
    if (await saveDraft()) {
      router.push("/personal");
    }
  };

  const handleTrash = async () => {
    if (!(await saveDraft())) {
      return;
    }
    try {
      await movePersonalNoteToTrash(id);
      showToast({ title: "Moved to Trash", variant: "success" });
      router.push("/personal");
    } catch (error) {
      showToast({
        title: "Could not move note to Trash",
        description: errorMessage(error),
        variant: "error",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        Loading note…
      </div>
    );
  }

  if (!note || !draft) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {saveError ? `IndexedDB error: ${saveError}` : "This note does not exist."}
        </p>
        <Button variant="outline" onClick={() => router.push("/personal")}>
          <ArrowLeft className="h-4 w-4" /> Back to Personal
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="ghost" size="icon" onClick={handleBack} aria-label="Back to notes">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{draft.title || "Untitled note"}</p>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {saving
              ? "Saving…"
              : saveError
                ? `Save failed: ${saveError}`
                : dirty
                  ? "Unsaved changes"
                  : `Saved ${new Date(note.updatedAt).toLocaleTimeString()}`}
          </p>
        </div>
        <ModeSwitcher mode="personal" />
        <Button
          variant={draft.favorite ? "default" : "outline"}
          size="sm"
          onClick={() => changeDraft({ favorite: !draft.favorite })}
        >
          <Star
            className="h-4 w-4"
            fill={draft.favorite ? "currentColor" : "none"}
          />
          Favorite
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => changeDraft({ archived: !draft.archived, trashed: false })}
        >
          {draft.archived ? (
            <RotateCcw className="h-4 w-4" />
          ) : (
            <Archive className="h-4 w-4" />
          )}
          {draft.archived ? "Unarchive" : "Archive"}
        </Button>
        <Button variant="destructive" size="sm" onClick={handleTrash}>
          <Trash2 className="h-4 w-4" /> Trash
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-3">
          <Input
            aria-label="Note title"
            value={draft.title}
            maxLength={120}
            onChange={(event) => changeDraft({ title: event.target.value })}
            className="h-auto border-0 px-0 py-2 text-2xl font-semibold shadow-none focus-visible:ring-0"
            placeholder="Note title"
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Folder
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              value={draft.folderId ?? ""}
              onChange={(event) =>
                changeDraft({ folderId: event.target.value || null })
              }
            >
              <option value="">Unfiled</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.icon || "📁"} {folder.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-2">
          <Tag className="h-4 w-4 text-muted-foreground" />
          {tags.map((tag) => {
            const selected = draft.tags.some((item) => item.id === tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  changeDraft({
                    tags: selected
                      ? draft.tags.filter((item) => item.id !== tag.id)
                      : [...draft.tags, { id: tag.id, label: tag.label }],
                  })
                }
              >
                <Badge variant={selected ? "default" : "outline"}>{tag.label}</Badge>
              </button>
            );
          })}
          {tags.length === 0 && (
            <span className="text-xs text-muted-foreground">
              Create tags from the Personal notes list.
            </span>
          )}
        </div>

        <Textarea
          aria-label="Note content"
          value={draft.content}
          onChange={(event) => changeDraft({ content: event.target.value })}
          placeholder="Write your note in Markdown…"
          className="mx-auto min-h-[50vh] w-full max-w-4xl flex-1 resize-y font-mono text-sm leading-6"
        />
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between text-xs text-muted-foreground">
          <span>
            {draft.trashed ? "In Trash" : draft.archived ? "Archived" : "Personal note"}
          </span>
          <span>
            {draft.content.length} characters
            {saveError && <span className="ml-2 text-destructive">{saveError}</span>}
          </span>
        </div>
      </div>

      <footer className="flex justify-end border-t border-border px-4 py-3">
        <Button onClick={() => void saveDraft()} disabled={saving || !dirty}>
          <Check className="h-4 w-4" /> Save now
        </Button>
      </footer>
    </div>
  );
}
