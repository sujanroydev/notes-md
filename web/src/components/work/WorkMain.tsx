"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileText,
  FolderOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModeSwitcher } from "@/components/layout/ModeSwitcher";
import { showToast } from "@/components/ui/toast";
import {
  listNotes,
  listProjects,
  type WorkNote,
  type WorkProject,
} from "@/lib/api";
import {
  cacheWorkNotes,
  cacheWorkProjects,
  deleteCachedProject,
  listCachedNotes,
  listCachedProjects,
  localNote,
  localProject,
  queueNoteUpsert,
  queueProjectDelete,
  queueProjectUpsert,
  saveCachedNote,
  saveCachedProject,
} from "@/stores/workDb";
import { refreshRemoteWork, syncWorkNow } from "@/lib/workSync";

interface WorkMainProps {
  user: { id: string; name: string | null; email: string | null };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Please try again.";
}

export function WorkMain({ user }: WorkMainProps) {
  const router = useRouter();
  const [projects, setProjects] = useState<WorkProject[]>([]);
  const [notes, setNotes] = useState<WorkNote[]>([]);
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    setProjectError(null);
    setProjects(await listCachedProjects(user.id));
    try {
      const remoteProjects = await listProjects();
      await cacheWorkProjects(remoteProjects);
      setProjects(await listCachedProjects(user.id));
      await syncWorkNow();
    } catch (error) {
      setProjectError(messageOf(error));
    } finally {
      setProjectsLoading(false);
    }
  }, [user.id]);

  const loadNotes = useCallback(async () => {
    setNotesLoading(true);
    setNoteError(null);
    setNotes(await listCachedNotes(user.id));
    try {
      const remoteNotes = await listNotes(activeProject ?? undefined);
      await cacheWorkNotes(remoteNotes);
      setNotes(await listCachedNotes(user.id));
      await syncWorkNow();
    } catch (error) {
      setNoteError(messageOf(error));
      setNotes(await listCachedNotes(user.id));
    } finally {
      setNotesLoading(false);
    }
  }, [activeProject, user.id]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  useEffect(() => {
    const handleOnline = () => {
      void refreshRemoteWork(user.id).finally(() => {
        void syncWorkNow();
      });
    };
    if (navigator.onLine) {
      void handleOnline();
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [user.id]);

  const handleCreateProject = async () => {
    const name = window.prompt("Project name:");
    if (name === null) return;
    const project = localProject(user.id, name);
    await saveCachedProject(project);
    await queueProjectUpsert(project);
    setProjects((current) => [...current, project]);
    setActiveProject(project.id);
    try {
      await syncWorkNow();
      setProjects(await listCachedProjects(user.id));
      showToast({ title: "Project saved locally", variant: "success" });
    } catch (error) {
      showToast({
        title: "Project saved locally",
        description: messageOf(error),
        variant: "success",
      });
    }
  };

  const handleRenameProject = async (project: WorkProject) => {
    const name = window.prompt("Project name:", project.name);
    if (name === null) return;
    const updated = {
      ...project,
      name,
      updatedAt: new Date().toISOString(),
    };
    await saveCachedProject(updated);
    await queueProjectUpsert(updated, project.name);
    setProjects((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
    try {
      await syncWorkNow();
      setProjects(await listCachedProjects(user.id));
      showToast({ title: "Project rename saved locally", variant: "success" });
    } catch (error) {
      showToast({
        title: "Project rename saved locally",
        description: messageOf(error),
        variant: "success",
      });
    }
  };

  const handleDeleteProject = async (project: WorkProject) => {
    if (!window.confirm(`Delete "${project.name}"? Its notes will no longer appear in active projects.`)) {
      return;
    }
    const deleted = {
      ...project,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveCachedProject(deleted);
    await queueProjectDelete(deleted);
    await deleteCachedProject(project.id);
    setProjects((current) => current.filter((item) => item.id !== project.id));
    if (activeProject === project.id) {
      setActiveProject(null);
    }
    try {
      await syncWorkNow();
      showToast({ title: "Project moved to Trash locally", variant: "success" });
    } catch (error) {
      showToast({
        title: "Project moved to Trash locally",
        description: messageOf(error),
        variant: "success",
      });
    }
  };

  const handleCreateNote = async () => {
    const name = window.prompt("Note name:", "Untitled note");
    if (name === null) return;
    const note = localNote(user.id, activeProject, name);
    await saveCachedNote(note);
    await queueNoteUpsert(note);
    router.push(`/work/note/${note.id}`);
    try {
      await syncWorkNow();
    } catch (error) {
      showToast({
        title: "Note saved locally",
        description: messageOf(error),
        variant: "success",
      });
    }
  };

  const visibleProjects = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return projects.filter((project) =>
      project.name.toLocaleLowerCase().includes(query),
    );
  }, [projects, search]);

  const visibleNotes = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return notes.filter((note) => {
      const projectName = projects.find((project) => project.id === note.projectId)?.name ?? "";
      return (
        note.name.toLocaleLowerCase().includes(query) ||
        note.content.toLocaleLowerCase().includes(query) ||
        projectName.toLocaleLowerCase().includes(query)
      );
    });
  }, [notes, projects, search]);

  const currentProject = projects.find((project) => project.id === activeProject);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search projects or notes..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        <Badge variant="work" className="hidden sm:inline-flex">Work · Supabase</Badge>
        <select
          aria-label="Choose project"
          value={activeProject ?? ""}
          onChange={(event) => setActiveProject(event.target.value || null)}
          className="h-9 min-w-36 rounded-md border border-input bg-background px-2 text-sm md:hidden"
        >
          <option value="">All Work notes</option>
          {visibleProjects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <ModeSwitcher mode="work" user={user} />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-52 shrink-0 flex-col border-r border-border bg-muted/20 md:flex lg:w-56 xl:w-64">
          <div className="flex items-center justify-between p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Projects
            </h2>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => void handleCreateProject()}
              aria-label="Create project"
              title="Create project"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <nav className="grid gap-1 px-2" aria-label="Work projects">
            <button
              type="button"
              className={`flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent ${
                activeProject === null ? "bg-accent font-medium" : ""
              }`}
              onClick={() => setActiveProject(null)}
            >
              <FolderOpen className="h-4 w-4" />
              All Work notes
            </button>
            {visibleProjects.map((project) => (
              <div
                key={project.id}
                className={`group flex items-center rounded-md hover:bg-accent ${
                  activeProject === project.id ? "bg-accent" : ""
                }`}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm"
                  onClick={() => setActiveProject(project.id)}
                >
                  <FolderOpen className="h-4 w-4 shrink-0" />
                  <span className="truncate">{project.name}</span>
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                  onClick={() => void handleRenameProject(project)}
                  aria-label={`Rename ${project.name}`}
                  title="Rename project"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="mr-1 rounded p-1 text-muted-foreground hover:text-destructive"
                  onClick={() => void handleDeleteProject(project)}
                  aria-label={`Delete ${project.name}`}
                  title="Delete project"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </nav>

          {projectsLoading && (
            <p className="px-4 py-3 text-xs text-muted-foreground">Loading projects…</p>
          )}
          {projectError && (
            <div className="m-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              <p>Could not load Work projects: {projectError}</p>
              <button
                type="button"
                className="mt-2 underline"
                onClick={() => void loadProjects()}
              >
                Retry
              </button>
            </div>
          )}
          {!projectsLoading && !projectError && visibleProjects.length === 0 && (
            <p className="px-4 py-3 text-xs text-muted-foreground">
              {projects.length === 0 ? "No projects yet." : "No matching projects."}
            </p>
          )}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h1 className="text-base font-semibold">
                {currentProject?.name ?? "All Work notes"}
              </h1>
              <p className="text-xs text-muted-foreground">
                {notesLoading
                  ? "Loading from Supabase…"
                  : noteError
                    ? "Could not synchronize with Supabase"
                    : `${visibleNotes.length} ${visibleNotes.length === 1 ? "note" : "notes"} · Synced with Supabase`}
              </p>
            </div>
            <Button type="button" onClick={() => void handleCreateNote()}>
              <Plus className="h-4 w-4" /> New note
            </Button>
          </div>

          {noteError && (
            <div
              role="alert"
              className="flex items-center justify-between border-b border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              <span>Could not load Work notes: {noteError}</span>
              <button
                type="button"
                className="underline"
                onClick={() => void loadNotes()}
              >
                Retry
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {notesLoading ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Loading Work notes…
              </p>
            ) : !noteError && visibleNotes.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center text-center text-muted-foreground">
                <FileText className="mb-3 h-10 w-10 opacity-40" />
                <p className="text-sm font-medium">
                  {search.trim() ? "No matching Work notes" : "No Work notes yet"}
                </p>
                <p className="mt-1 text-xs">
                  {search.trim()
                    ? "Try a different search."
                    : "Notes here are stored in your authenticated Supabase account."}
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {visibleNotes.map((note) => {
                  const project = projects.find((item) => item.id === note.projectId);
                  return (
                    <button
                      type="button"
                      key={note.id}
                      className="flex min-h-36 flex-col rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-primary/40"
                      onClick={() => router.push(`/work/note/${note.id}`)}
                    >
                      <span className="truncate text-sm font-semibold">{note.name}</span>
                      <span className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs text-muted-foreground">
                        {note.content || "No content yet"}
                      </span>
                      <span className="mt-auto flex items-center justify-between pt-4 text-[11px] text-muted-foreground">
                        <span>{project?.name ?? "Global note"}</span>
                        <span>{new Date(note.updatedAt).toLocaleDateString()}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
