"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { liveQuery } from "dexie";
import { ArrowLeft, Check, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ModeSwitcher } from "@/components/layout/ModeSwitcher";
import { showToast } from "@/components/ui/toast";
import type { WorkNote } from "@/lib/api";
import {
  deleteNoteAndQueue,
  getCachedNote,
  WORK_DB,
  saveNoteAndQueue,
  type WorkQueueOperation,
} from "@/stores/workDb";
import { refreshRemoteWork, syncWorkNow } from "@/lib/workSync";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Please try again.";
}

export function WorkNoteEditor({
  user,
  noteId,
  onClose,
}: {
  user: { id: string; name: string | null; email: string | null };
  noteId?: string;
  onClose?: () => void;
}) {
  const params = useParams<{ id: string }>();
  const id = noteId ?? params.id;
  const [note, setNote] = useState<WorkNote | null>(null);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [queue, setQueue] = useState<WorkQueueOperation[]>([]);
  const [online, setOnline] = useState(true);
  const dirtyRef = useRef(false);

  useEffect(() => {
    let active = true;
    const subscription = liveQuery(async () => {
      const [localNote, operations] = await Promise.all([
        getCachedNote(id, user.id),
        WORK_DB.queue.toArray(),
      ]);
      return {
        note: localNote,
        queue: operations.filter(
          (operation) =>
            (operation.entity === "note" &&
              (operation.noteId ?? operation.note.id) === id) ||
            (operation.entity === "project" && operation.project.userId === user.id),
        ),
      };
    }).subscribe({
      next: (local) => {
        if (!active) return;
        if (local.note && !dirtyRef.current) {
          setNote(local.note);
          setName(local.note.name);
          setContent(local.note.content);
          setLoading(false);
        } else if (!local.note && !dirtyRef.current) {
          setNote(null);
        }
        setQueue(local.queue);
      },
      error: (error: unknown) => {
        if (active) {
          setSaveError(messageOf(error));
          setLoading(false);
        }
      },
    });

    const refresh = (force = false) =>
      void refreshRemoteWork(user.id, force)
        .then(() => {
          if (active) {
            setSyncError(null);
          }
        })
        .catch((error: unknown) => {
          if (active) {
            setSyncError(messageOf(error));
          }
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });
    refresh();
    const handleOnline = () => refresh(true);
    window.addEventListener("online", handleOnline);
    return () => {
      active = false;
      window.removeEventListener("online", handleOnline);
      subscription.unsubscribe();
    };
  }, [id, user.id]);

  useEffect(() => {
    const updateStatus = () => setOnline(navigator.onLine);
    updateStatus();
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  const dirty = useMemo(
    () => note !== null && (name !== note.name || content !== note.content),
    [content, name, note],
  );
  dirtyRef.current = dirty;

  const noteQueue = queue.filter(
    (operation) =>
      operation.entity === "note" &&
      (operation.noteId ?? operation.note.id) === id,
  );
  const syncStatus = !online
    ? `Offline · ${noteQueue.length ? "saved locally, sync pending" : "saved locally"}`
    : noteQueue.some((operation) => operation.status === "syncing")
      ? "Syncing…"
      : noteQueue.some((operation) => operation.status === "failed")
        ? "Sync failed · saved locally"
        : noteQueue.length
          ? "Saved locally · sync pending"
          : syncError
            ? "Saved locally · sync unavailable"
            : "Synced with account";

  const save = useCallback(async (): Promise<WorkNote | null> => {
    if (!note || !dirty || saving) {
      return note && !dirty ? note : null;
    }

    setSaving(true);
    setSaveError(null);
    setSyncError(null);
    const now = new Date().toISOString();
    const current: WorkNote = {
      ...note,
      name,
      content,
      updatedAt: now,
    };
    try {
      const saved = await saveNoteAndQueue(current);
      setNote(saved);
      setName(saved.name);
      setContent(saved.content);
      showToast({ title: "Work note saved locally", variant: "success" });
      void syncWorkNow(user.id, true).catch((error: unknown) => {
        setSyncError(messageOf(error));
      });
      return saved;
    } catch (error) {
      const message = messageOf(error);
      setSaveError(message);
      showToast({
        title: "Could not save Work note locally",
        description: message,
        variant: "error",
      });
      return null;
    } finally {
      setSaving(false);
    }
  }, [content, dirty, name, note, saving, user.id]);

  const handleBack = async () => {
    if (await save()) {
      if (onClose) {
        onClose();
      } else {
        window.location.assign("/work");
      }
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
    try {
      await deleteNoteAndQueue(saved);
      showToast({ title: "Work note moved to Trash locally", variant: "success" });
      void syncWorkNow(user.id, true).catch((error: unknown) => {
        setSyncError(messageOf(error));
      });
      if (onClose) {
        onClose();
      } else {
        window.location.assign("/work");
      }
    } catch (error) {
      showToast({
        title: "Could not delete Work note locally",
        description: messageOf(error),
        variant: "error",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        Loading Work note from this device…
      </div>
    );
  }

  if (!note) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p role="alert" className="text-sm text-destructive">
          Could not open this Work note: {saveError ?? "Note not found."}
        </p>
        <Button
          variant="outline"
          onClick={() => (onClose ? onClose() : window.location.assign("/work"))}
        >
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
                  : syncStatus}
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
          <span>{syncError ? `Sync issue: ${syncError}` : "Saved on this device · Syncs with your Work account"}</span>
          <span>{content.length} characters</span>
        </div>
      </main>

      <footer className="flex justify-end border-t border-border px-4 py-3">
        <Button onClick={() => void save()} disabled={saving || !dirty}>
          <Check className="h-4 w-4" /> Save locally
        </Button>
      </footer>
    </div>
  );
}
