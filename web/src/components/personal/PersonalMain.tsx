"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Archive,
  FileText,
  Folder,
  FolderPlus,
  Moon,
  Plus,
  RotateCcw,
  Search,
  Star,
  Sun,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/app/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { showToast } from "@/components/ui/toast";
import { ModeSwitcher } from "@/components/layout/ModeSwitcher";
import { cn } from "@/lib/utils";
import {
  createPersonalFolder,
  createPersonalNote,
  createPersonalTag,
  deletePersonalFolder,
  deletePersonalTag,
  emptyPersonalTrash,
  movePersonalNoteToTrash,
  permanentlyDeletePersonalNote,
  PERSONAL_DB,
  renamePersonalFolder,
  renamePersonalTag,
  restorePersonalNote,
  updatePersonalNote,
  type PersonalFolder,
  type PersonalNote,
  type PersonalTag,
} from "@/stores/personalDb";

type NoteView = "all" | "favorites" | "recent" | "archive" | "trash";
type FolderFilter = "all" | "unfiled" | string;
type NameDialogState = {
  kind: "folder" | "tag";
  id?: string;
  label: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function PersonalMain() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const [folders, setFolders] = useState<PersonalFolder[]>([]);
  const [tags, setTags] = useState<PersonalTag[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useState<NoteView>("all");
  const [folderFilter, setFolderFilter] = useState<FolderFilter>("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshData = useCallback(async () => {
    try {
      const [nextNotes, nextFolders, nextTags] = await Promise.all([
        PERSONAL_DB.notes.toArray(),
        PERSONAL_DB.folders.toArray(),
        PERSONAL_DB.tags.toArray(),
      ]);
      setNotes(nextNotes);
      setFolders(nextFolders.sort((a, b) => a.label.localeCompare(b.label)));
      setTags(nextTags.sort((a, b) => a.label.localeCompare(b.label)));
      setLoadError(null);
    } catch (error) {
      const message = errorMessage(error);
      setLoadError(message);
      throw error;
    }
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        await refreshData();
      } catch (error) {
        if (active) {
          showToast({
            title: "Could not load Personal notes",
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
  }, [refreshData]);

  const runMutation = useCallback(
    async <T,>(
      action: () => Promise<T>,
      successMessage: string,
    ): Promise<T | undefined> => {
      let result: T;
      try {
        result = await action();
      } catch (error) {
        showToast({
          title: "Personal notes were not updated",
          description: errorMessage(error),
          variant: "error",
        });
        return undefined;
      }

      try {
        await refreshData();
        showToast({ title: successMessage, variant: "success" });
      } catch (error) {
        showToast({
          title: "Saved, but the list could not be refreshed",
          description: errorMessage(error),
          variant: "error",
        });
      }
      return result;
    },
    [refreshData],
  );

  const activeNotes = useMemo(
    () => notes.filter((note) => !note.trashed && !note.archived),
    [notes],
  );

  const filteredNotes = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return notes
      .filter((note) => {
        if (view === "favorites" && (!note.favorite || note.archived || note.trashed)) {
          return false;
        }
        if (view === "recent" && (note.archived || note.trashed)) {
          return false;
        }
        if (view === "archive" && (!note.archived || note.trashed)) {
          return false;
        }
        if (view === "trash" && !note.trashed) {
          return false;
        }
        if (view === "all" && (note.archived || note.trashed)) {
          return false;
        }
        if (folderFilter === "unfiled" && note.folderId !== null) {
          return false;
        }
        if (
          folderFilter !== "all" &&
          folderFilter !== "unfiled" &&
          note.folderId !== folderFilter
        ) {
          return false;
        }
        if (tagFilter && !(note.tags ?? []).some((tag) => tag.id === tagFilter)) {
          return false;
        }
        if (
          query &&
          !note.title.toLocaleLowerCase().includes(query) &&
          !note.content.toLocaleLowerCase().includes(query) &&
          !(note.tags ?? []).some((tag) =>
            tag.label.toLocaleLowerCase().includes(query),
          )
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, view === "recent" ? 20 : undefined);
  }, [folderFilter, notes, searchQuery, tagFilter, view]);

  const handleCreateNote = async () => {
    const note = await runMutation(
      () => createPersonalNote("Untitled note"),
      "Note created",
    );
    if (note) {
      router.push(`/note/${note.id}`);
    }
  };

  const openNameDialog = (
    kind: NameDialogState["kind"],
    item?: PersonalFolder | PersonalTag,
  ) => {
    setNameDialog({
      kind,
      id: item?.id,
      label: item?.label ?? "",
    });
  };

  const saveNameDialog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!nameDialog) {
      return;
    }
    const { kind, id, label } = nameDialog;
    const action =
      kind === "folder"
        ? id
          ? () => renamePersonalFolder(id, label)
          : () => createPersonalFolder(label)
        : id
          ? () => renamePersonalTag(id, label)
          : () => createPersonalTag(label);
    const result = await runMutation(
      action,
      `${kind === "folder" ? "Folder" : "Tag"} saved`,
    );
    if (result) {
      setNameDialog(null);
    }
  };

  const handleDeleteFolder = async (folder: PersonalFolder) => {
    if (
      !window.confirm(
        `Delete "${folder.label}"? Its notes will be moved to Unfiled.`,
      )
    ) {
      return;
    }
    await runMutation(
      () => deletePersonalFolder(folder.id),
      "Folder deleted",
    );
    if (folderFilter === folder.id) {
      setFolderFilter("all");
    }
  };

  const handleDeleteTag = async (tag: PersonalTag) => {
    if (!window.confirm(`Delete the "${tag.label}" tag from all notes?`)) {
      return;
    }
    await runMutation(
      () => deletePersonalTag(tag.id),
      "Tag deleted",
    );
    if (tagFilter === tag.id) {
      setTagFilter(null);
    }
  };

  const handleTrashNote = async (note: PersonalNote) => {
    await runMutation(() => movePersonalNoteToTrash(note.id), "Moved to Trash");
  };

  const handleRestoreNote = async (note: PersonalNote) => {
    await runMutation(() => restorePersonalNote(note.id), "Note restored");
  };

  const handlePermanentDelete = async (note: PersonalNote) => {
    if (!window.confirm(`Permanently delete "${note.title}"? This cannot be undone.`)) {
      return;
    }
    await runMutation(
      () => permanentlyDeletePersonalNote(note.id),
      "Note permanently deleted",
    );
  };

  const handleEmptyTrash = async () => {
    if (!window.confirm("Permanently delete every note in Trash? This cannot be undone.")) {
      return;
    }
    await runMutation(emptyPersonalTrash, "Trash emptied");
  };

  const handleToggleFavorite = async (note: PersonalNote) => {
    await runMutation(
      () => updatePersonalNote(note.id, { favorite: !note.favorite }),
      note.favorite ? "Removed from Favorites" : "Added to Favorites",
    );
  };

  const handleToggleArchive = async (note: PersonalNote) => {
    await runMutation(
      () =>
        updatePersonalNote(note.id, {
          archived: !note.archived,
          trashed: false,
        }),
      note.archived ? "Note unarchived" : "Note archived",
    );
  };

  const viewButtons: { id: NoteView; label: string; count: number }[] = [
    { id: "all", label: "All notes", count: activeNotes.length },
    {
      id: "favorites",
      label: "Favorites",
      count: activeNotes.filter((note) => note.favorite).length,
    },
    {
      id: "recent",
      label: "Recent",
      count: Math.min(activeNotes.length, 20),
    },
    {
      id: "archive",
      label: "Archive",
      count: notes.filter((note) => note.archived && !note.trashed).length,
    },
    {
      id: "trash",
      label: "Trash",
      count: notes.filter((note) => note.trashed).length,
    },
  ];

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-3">
        <div className="relative min-w-36 flex-1 sm:min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search title, content, or tags..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pl-9"
          />
        </div>
        <Badge variant="personal" className="hidden sm:inline-flex">Personal</Badge>
        <span className="hidden text-xs text-muted-foreground md:inline">
          Stored only in this browser
        </span>
        <select
          aria-label="Choose note view"
          value={view}
          onChange={(event) => setView(event.target.value as NoteView)}
          className="h-9 min-w-32 rounded-md border border-input bg-background px-2 text-sm md:hidden"
        >
          {viewButtons.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <ModeSwitcher mode="personal" />
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label="Toggle theme"
        >
          {theme === "light" ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
        </Button>
        <Button onClick={handleCreateNote}>
          <Plus className="h-4 w-4" /> New note
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-52 shrink-0 flex-col border-r border-border bg-muted/20 md:flex lg:w-56 xl:w-64">
          <div className="p-3">
            <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Library
            </p>
            <nav className="grid gap-1">
              {viewButtons.map((item) => (
                <button
                  key={item.id}
                  className={cn(
                    "flex items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-accent",
                    view === item.id && "bg-accent font-medium",
                  )}
                  onClick={() => setView(item.id)}
                >
                  <span className="flex items-center gap-2">
                    {item.id === "favorites" ? (
                      <Star className="h-4 w-4" />
                    ) : item.id === "archive" ? (
                      <Archive className="h-4 w-4" />
                    ) : item.id === "trash" ? (
                      <Trash2 className="h-4 w-4" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    {item.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{item.count}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="border-t border-border p-3">
            <div className="mb-2 flex items-center justify-between px-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Folders
              </p>
              <button
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() => openNameDialog("folder")}
                aria-label="Create folder"
                title="Create folder"
              >
                <FolderPlus className="h-4 w-4" />
              </button>
            </div>
            <nav className="grid gap-1">
              <button
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent",
                  folderFilter === "all" && "bg-accent font-medium",
                )}
                onClick={() => setFolderFilter("all")}
              >
                <Folder className="h-4 w-4" /> All folders
              </button>
              <button
                className={cn(
                  "flex items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-accent",
                  folderFilter === "unfiled" && "bg-accent font-medium",
                )}
                onClick={() => setFolderFilter("unfiled")}
              >
                <span>Unfiled</span>
                <span className="text-xs text-muted-foreground">
                  {activeNotes.filter((note) => !note.folderId).length}
                </span>
              </button>
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className={cn(
                    "group flex items-center rounded-md hover:bg-accent",
                    folderFilter === folder.id && "bg-accent",
                  )}
                >
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm"
                    onClick={() => setFolderFilter(folder.id)}
                  >
                    <span>{folder.icon || "📁"}</span>
                    <span className="truncate">{folder.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {activeNotes.filter((note) => note.folderId === folder.id).length}
                    </span>
                  </button>
                  <button
                    className="mr-1 rounded p-1 text-muted-foreground opacity-0 hover:bg-background hover:text-foreground group-hover:opacity-100 focus:opacity-100"
                    onClick={() => openNameDialog("folder", folder)}
                    aria-label={`Rename ${folder.label}`}
                    title="Rename folder"
                  >
                    <span className="text-xs">Edit</span>
                  </button>
                  <button
                    className="mr-1 rounded p-1 text-muted-foreground opacity-0 hover:bg-background hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                    onClick={() => void handleDeleteFolder(folder)}
                    aria-label={`Delete ${folder.label}`}
                    title="Delete folder"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </nav>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto border-t border-border p-3">
            <div className="mb-2 flex items-center justify-between px-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tags
              </p>
              <button
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() => openNameDialog("tag")}
                aria-label="Create tag"
                title="Create tag"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-1">
              {tags.map((tag) => (
                <div
                  key={tag.id}
                  className={cn(
                    "group flex items-center rounded-md hover:bg-accent",
                    tagFilter === tag.id && "bg-accent",
                  )}
                >
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm"
                    onClick={() =>
                      setTagFilter((current) => (current === tag.id ? null : tag.id))
                    }
                  >
                    <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{tag.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {activeNotes.filter((note) =>
                        (note.tags ?? []).some((item) => item.id === tag.id),
                      ).length}
                    </span>
                  </button>
                  <button
                    className="mr-1 rounded p-1 text-muted-foreground opacity-0 hover:bg-background hover:text-foreground group-hover:opacity-100 focus:opacity-100"
                    onClick={() => openNameDialog("tag", tag)}
                    aria-label={`Rename ${tag.label}`}
                    title="Rename tag"
                  >
                    <span className="text-xs">Edit</span>
                  </button>
                  <button
                    className="mr-1 rounded p-1 text-muted-foreground opacity-0 hover:bg-background hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                    onClick={() => void handleDeleteTag(tag)}
                    aria-label={`Delete ${tag.label}`}
                    title="Delete tag"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {tags.length === 0 && (
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  Create tags to organize notes.
                </p>
              )}
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <h1 className="text-base font-semibold">
                {viewButtons.find((item) => item.id === view)?.label}
              </h1>
              <p className="text-xs text-muted-foreground">
                {filteredNotes.length} {filteredNotes.length === 1 ? "note" : "notes"}
                {folderFilter !== "all" &&
                  ` · ${
                    folderFilter === "unfiled"
                      ? "Unfiled"
                      : folders.find((folder) => folder.id === folderFilter)?.label ??
                        "Folder"
                  }`}
                {tagFilter &&
                  ` · ${tags.find((tag) => tag.id === tagFilter)?.label ?? "Tag"}`}
              </p>
            </div>
            {view === "trash" && notes.some((note) => note.trashed) && (
              <Button variant="destructive" size="sm" onClick={handleEmptyTrash}>
                <Trash2 className="h-4 w-4" /> Empty Trash
              </Button>
            )}
          </div>

          {loadError && (
            <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
              IndexedDB could not be read: {loadError}
            </div>
          )}

          <ScrollArea className="min-h-0 flex-1">
            <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredNotes.map((note) => {
                const folder = folders.find((item) => item.id === note.folderId);
                return (
                  <article
                    key={note.id}
                    className={cn(
                      "group flex min-h-44 flex-col rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary/40",
                      note.favorite && "border-primary/30",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={() => router.push(`/note/${note.id}`)}
                      >
                        <h2 className="truncate text-sm font-semibold">{note.title}</h2>
                        <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs text-muted-foreground">
                          {note.content || "No content yet"}
                        </p>
                      </button>
                      {!note.trashed && (
                        <button
                          className={cn(
                            "rounded p-1 text-muted-foreground hover:bg-accent",
                            note.favorite && "text-amber-500",
                          )}
                          onClick={() => void handleToggleFavorite(note)}
                          aria-label={
                            note.favorite ? "Remove from Favorites" : "Add to Favorites"
                          }
                          title={note.favorite ? "Unfavorite" : "Favorite"}
                        >
                          <Star
                            className="h-4 w-4"
                            fill={note.favorite ? "currentColor" : "none"}
                          />
                        </button>
                      )}
                    </div>

                    <div className="mt-auto flex flex-wrap items-center gap-1 pt-4">
                      {folder && (
                        <Badge variant="outline">
                          {folder.icon || "📁"} {folder.label}
                        </Badge>
                      )}
                      {(note.tags ?? []).map((tag) => (
                        <Badge key={tag.id} variant="secondary">
                          {tag.label}
                        </Badge>
                      ))}
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {new Date(note.updatedAt).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-end gap-1 border-t border-border pt-2">
                      {view === "trash" ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleRestoreNote(note)}
                          >
                            <RotateCcw className="h-4 w-4" /> Restore
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => void handlePermanentDelete(note)}
                          >
                            <Trash2 className="h-4 w-4" /> Delete forever
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleToggleArchive(note)}
                          >
                            {note.archived ? (
                              <RotateCcw className="h-4 w-4" />
                            ) : (
                              <Archive className="h-4 w-4" />
                            )}
                            {note.archived ? "Unarchive" : "Archive"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => void handleTrashNote(note)}
                          >
                            <Trash2 className="h-4 w-4" /> Trash
                          </Button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}

              {!loading && filteredNotes.length === 0 && (
                <div className="col-span-full flex min-h-64 flex-col items-center justify-center text-center text-muted-foreground">
                  <FileText className="mb-3 h-10 w-10 opacity-40" />
                  <p className="text-sm font-medium">
                    {view === "trash" ? "Trash is empty" : "No notes found"}
                  </p>
                  <p className="mt-1 text-xs">
                    {view === "trash"
                      ? "Notes you move to Trash will appear here."
                      : searchQuery || tagFilter || folderFilter !== "all"
                      ? "Try changing the search or filters."
                      : "Create a note to get started."}
                  </p>
                </div>
              )}
              {loading && (
                <p className="col-span-full py-16 text-center text-sm text-muted-foreground">
                  Loading local notes…
                </p>
              )}
            </div>
          </ScrollArea>
        </main>
      </div>

      <Dialog
        open={nameDialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setNameDialog(null);
          }
        }}
      >
        <DialogContent>
          <form onSubmit={saveNameDialog}>
            <DialogHeader>
              <DialogTitle>
                {nameDialog?.id ? "Rename" : "Create"}{" "}
                {nameDialog?.kind === "folder" ? "folder" : "tag"}
              </DialogTitle>
              <DialogDescription>
                {nameDialog?.kind === "folder"
                  ? "Folders help keep your Personal notes organized."
                  : "Tags can be applied to multiple notes."}
              </DialogDescription>
            </DialogHeader>
            <Input
              className="my-4"
              autoFocus
              maxLength={120}
              value={nameDialog?.label ?? ""}
              onChange={(event) =>
                setNameDialog((current) =>
                  current ? { ...current, label: event.target.value } : current,
                )
              }
              placeholder={
                nameDialog?.kind === "folder" ? "Folder name" : "Tag name"
              }
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setNameDialog(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!nameDialog?.label.trim()}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
