"use client";

import { useState, useEffect } from "react";
import { Search, Plus, Trash2, Archive, CheckCircle, AlertTriangle, Eye, EyeOff, Clock, Folder, Tag, MoreHorizontal, LayoutGrid, List, Sun, Moon, Settings, Save, Loader2, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useTheme } from "@/app/providers";
import { PERSONAL_DB } from "@/stores/personalDb";
import type { PersonalNote, PersonalFolder, PersonalTag } from "@/stores/personalDb";

export function PersonalMain() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const [folders, setFolders] = useState<PersonalFolder[]>([]);
  const [tags, setTags] = useState<PersonalTag[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useState<"all" | "favorites" | "recent" | "archive" | "trash">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [nts, flds, gst] = await Promise.all([
        PERSONAL_DB.notes.toArray(),
        PERSONAL_DB.folders.toArray(),
        PERSONAL_DB.tags.toArray(),
      ]);
      if (!cancelled) {
        setNotes(nts);
        setFolders(flds);
        setTags(gst);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreate = async () => {
    const title = prompt("Note title:");
    if (!title) return;
    const id = crypto.randomUUID();
    const note: PersonalNote = {
      id,
      title,
      content: "",
      folderId: null,
      favorite: false,
      archived: false,
      trashed: false,
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await PERSONAL_DB.notes.add(note);
    setNotes((prev) => [...prev, note]);
    router.push(`/note/${note.id}`);
  };

  const filteredNotes =
    view === "favorites"
      ? notes.filter((n) => n.favorite && !n.trashed)
      : view === "recent"
      ? [...notes]
          .filter((n) => !n.trashed)
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          .slice(0, 20)
      : view === "archive"
      ? notes.filter((n) => n.archived && !n.trashed)
      : view === "trash"
      ? notes.filter((n) => n.trashed)
      : notes;

  const filtered = filteredNotes.filter(
    (n) =>
      !searchQuery ||
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (n.tags ?? []).some((t) => t.label.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  const saveRename = async () => {
    if (!editingId || !editTitle.trim()) return;
    await PERSONAL_DB.notes.update(editingId, { title: editTitle.trim() });
    setEditingId(null);
    setNotes((prev) => prev.map((n) => (n.id === editingId ? { ...n, title: editTitle.trim() } : n)));
  };

  const archiveNote = async (id: string) => {
    await PERSONAL_DB.notes.update(id, { archived: true });
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, archived: true } : n)));
  };

  const restoreNote = async (id: string) => {
    await PERSONAL_DB.notes.update(id, { trashed: false });
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, trashed: false } : n)));
  };

  const permanentDelete = async (id: string) => {
    await PERSONAL_DB.notes.delete(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4" /> Note
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push("/settings")}>
            <Settings className="h-4 w-4" /> Settings
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-border px-4 py-2">
        <Badge variant="personal">Personal</Badge>
        <span className="text-xs text-muted-foreground">
          Stored only in this browser — export regularly
        </span>
        <Button variant="ghost" size="sm" onClick={() => setView("favorites")}>
          <Star className="h-4 w-4" /> Favorites
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setView("recent")}>
          <Clock className="h-4 w-4" /> Recent
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setView("archive")}>
          <Archive className="h-4 w-4" /> Archive
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setView("trash")}>
          <Trash2 className="h-4 w-4" /> Trash
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Folder className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{filtered.length} notes</span>
          </div>

          <div className="grid gap-2">
            {filtered.map((note) => (
              <div
                key={note.id}
                className={cn(
                  "flex items-start justify-between rounded-md border border-border p-3 transition-colors",
                  note.favorite && "border-primary/30 bg-primary/5",
                )}
              >
                <div className="flex-1 min-w-0">
                  {editingId === note.id ? (
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="text-sm"
                      autoFocus
                    />
                  ) : (
                    <button
                      onClick={() => router.push(`/note/${note.id}`)}
                      className="text-left"
                    >
                      <p className="text-sm font-medium truncate">{note.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(note.updatedAt ?? 0).toLocaleDateString()} ·{" "}
                        {note.tags?.length ?? 0} tags
                      </p>
                    </button>
                  )}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {note.favorite && <Badge variant="default">Fav</Badge>}
                  {view === "all" && (
                    <button
                      onClick={() => archiveNote(note.id)}
                      className="p-1 text-muted-foreground hover:text-foreground"
                      aria-label="Archive"
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                  )}
                  {view === "archive" && (
                    <button
                      onClick={() => restoreNote(note.id)}
                      className="p-1 text-muted-foreground hover:text-foreground"
                      aria-label="Restore"
                    >
                      <CheckCircle className="h-4 w-4" />
                    </button>
                  )}
                  {!note.trashed && view !== "archive" && (
                    <button
                      onClick={() => permanentDelete(note.id)}
                      className="p-1 text-muted-foreground hover:text-red-600"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                  {note.trashed && view === "trash" && (
                    <button
                      onClick={() => restoreNote(note.id)}
                      className="p-1 text-muted-foreground hover:text-foreground"
                      aria-label="Restore from Trash"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-10 w-10 mb-3 opacity-50 animate-spin" />
                <p className="text-sm">{view === "trash" ? "Trash is empty" : "No notes here"}</p>
                <p className="text-xs mt-1">
                  {view === "trash"
                    ? "Items in Trash are permanently deleted after 30 days."
                    : "Create a new note to get started"}
                </p>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
