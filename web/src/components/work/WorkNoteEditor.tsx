"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ModeSwitcher } from "@/components/layout/ModeSwitcher";
import { showToast } from "@/components/ui/toast";
import { getNote, type WorkNote } from "@/lib/api";
import {
  deleteCachedNote,
  getCachedNote,
  queueNoteDelete,
  queueNoteUpsert,
  saveCachedNote,
  WORK_DB,
} from "@/stores/workDb";
import { syncWorkNow } from "@/lib/workSync";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Please try again.";
}

export function WorkNoteEditor({
  user,
}: {
  user: { id: string; name: string | null; email: string | null };
}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [note, setNote] = useState<WorkNote | null>(null);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const cached = await getCachedNote(id);
      if (!active) return;
      if (cached) {
        setNote(cached);
        setName(cached.name);
        setContent(cached.content);
      }
      try {
        const loaded = await getNote(id);
        if (active) {
          await saveCachedNote(loaded);
          setNote(loaded);
          setName(loaded.name);
          setContent(loaded.content);
        }
      } catch (error: unknown) {
        if (active && !cached) {
          setSaveError(messageOf(error));
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [id, router]);

  const dirty = useMemo(
    () => note !== null && (name !== note.name || content !== note.content),
    [content, name, note],
  );

  const save = useCallback(async (): Promise<WorkNote | null> => {
    if (!note || !dirty || saving) {
      return note && !dirty ? note : null;
    }

    setSaving(true);
    setSaveError(null);
    const now = new Date().toISOString();
    const current: WorkNote = {
      ...note,
      name,
      content,
      updatedAt: now,
    };
    try {
      await saveCachedNote(current);
      await queueNoteUpsert(current);
      setNote(current);
      setName(current.name);
      setContent(current.content);
      showToast({ title: "Work note saved locally", variant: "success" });
      void syncWorkNow();
      return current;
    } catch (error) {
      const message = messageOf(error);
      setSaveError(message);
      showToast({
        title: "Could not sync Work note",
        description: message,
        variant: "error",
      });
      return null;
    } finally {
      setSaving(false);
    }
  }, [content, dirty, id, name, note, saving]);

  const handleBack = async () => {
    if (await save()) {
      router.push("/");
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Move this Work note to Trash?")) {
      return;
    }
    const saved = await save();
    if (!saved) {
      return;
    }
    if (saved.version === 0) {
      await deleteCachedNote(id);
      await WORK_DB.queue.delete(`note-upsert:${id}`);
    } else {
      const deleted = {
        ...saved,
        deletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveCachedNote(deleted);
      await queueNoteDelete(deleted);
    }
    await syncWorkNow();
    showToast({ title: "Work note moved to Trash locally", variant: "success" });
    router.push("/");
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        Loading Work note from Supabase…
      </div>
    );
  }

  if (!note) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p role="alert" className="text-sm text-destructive">
          Could not open this Work note: {saveError ?? "Note not found."}
        </p>
        <Button variant="outline" onClick={() => router.push("/")}>
          <ArrowLeft className="h-4 w-4" /> Back to Work
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="ghost" size="icon" onClick={handleBack} aria-label="Back to Work notes">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{name || "Untitled note"}</p>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {saving
              ? "Saving locally…"
              : saveError
                ? `Local save issue: ${saveError}`
                : dirty
                  ? "Unsaved changes"
                  : "Saved locally · Supabase sync pending"}
          </p>
        </div>
        <Badge variant="work">Work</Badge>
        <ModeSwitcher mode="work" user={user} />
        <Button
          variant="destructive"
          size="sm"
          disabled={saving}
          onClick={() => void handleDelete()}
        >
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-8">
        <Input
          aria-label="Note title"
          value={name}
          maxLength={120}
          disabled={saving}
          onChange={(event) => setName(event.target.value)}
          className="mx-auto h-auto w-full max-w-4xl border-0 px-0 py-2 text-2xl font-semibold shadow-none focus-visible:ring-0"
          placeholder="Note title"
        />
        <Textarea
          aria-label="Note content"
          value={content}
          disabled={saving}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Write your note in Markdown…"
          className="mx-auto min-h-[50vh] w-full max-w-4xl flex-1 resize-y font-mono text-sm leading-6"
        />
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between text-xs text-muted-foreground">
          <span>Saved on this device · Syncs with your Work account</span>
          <span>{content.length} characters</span>
        </div>
      </main>

      <footer className="flex justify-end border-t border-border px-4 py-3">
        <Button onClick={() => void save()} disabled={saving || !dirty}>
          <Check className="h-4 w-4" /> Save to Supabase
        </Button>
      </footer>
    </div>
  );
}
