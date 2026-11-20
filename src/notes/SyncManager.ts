import { createHash, randomUUID } from "node:crypto";
import * as vscode from "vscode";
import { getProjectId } from "../utils/projectId";
import { NotesManager } from "./NotesManager";

type NoteType = "global" | "project_default" | "regular";

interface RemoteNote {
  id: string;
  projectId: string | null;
  name: string;
  content: string;
  noteType: NoteType;
  version: number;
  contentHash: string | null;
  deletedAt: string | null;
}

interface RemoteProject {
  id: string;
  name: string;
}

interface SessionResponse {
  user: { id: string };
}

interface SyncResponse {
  synced: RemoteNote[];
  conflicts: Array<{
    id: string;
    reason: string;
    remote: RemoteNote | null;
  }>;
}

interface SyncMetadata {
  id: string;
  version: number;
  remoteContentHash: string | null;
  localContentHash: string;
  remoteName: string;
  localName: string;
  projectId: string | null;
  noteType: NoteType;
}

interface LocalNote {
  uri: vscode.Uri;
  name: string;
  content: string;
  contentHash: string;
  projectId: string | null;
  noteType: NoteType;
}

interface SyncChange {
  id: string;
  type: "upsert" | "delete";
  project_id: string | null;
  name: string;
  note_type: NoteType;
  content?: string;
  base_version: number;
  base_content_hash: string | null;
}

const ACCESS_TOKEN_SECRET = "notes-md.access-token";
const NOTE_STATE_PREFIX = "notes-md.sync-notes.";
const PROJECT_STATE_PREFIX = "notes-md.sync-project.";

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function isValidSyncName(name: string): boolean {
  return /^[a-zA-Z0-9 _.&-]{1,120}$/.test(name);
}

function noteTypeFromName(name: string): NoteType {
  if (name.toUpperCase() === "GLOBAL.MD") {
    return "global";
  }
  if (name.toUpperCase() === "NOTES.MD") {
    return "project_default";
  }
  return "regular";
}

function localNameFromUri(uri: vscode.Uri, type: NoteType): string {
  if (type === "global") {
    return "GLOBAL";
  }
  if (type === "project_default") {
    return "NOTES";
  }
  return (uri.path.split("/").pop() ?? "").replace(/\.md$/i, "");
}

function localNameFromRemote(note: RemoteNote): string {
  if (note.noteType === "global") {
    return "GLOBAL";
  }
  if (note.noteType === "project_default") {
    return "NOTES";
  }
  return note.name.replace(/\.md$/i, "");
}

function fileNameForRemote(note: RemoteNote): string {
  if (note.noteType === "global") {
    return "GLOBAL.md";
  }
  if (note.noteType === "project_default") {
    return "NOTES.md";
  }
  return `${localNameFromRemote(note)}.md`;
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

export class SyncManager {
  private readonly output = vscode.window.createOutputChannel("NOTES.md Sync");

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly notesManager: NotesManager,
  ) {}

  dispose(): void {
    this.output.dispose();
  }

  async signIn(): Promise<void> {
    const baseUrl = this.getBaseUrl();
    const pairingId = randomUUID();
    const loginUrl = new URL("/api/auth/google/login", baseUrl);
    loginUrl.searchParams.set("pairing_id", pairingId);

    const opened = await vscode.env.openExternal(vscode.Uri.parse(loginUrl.toString()));
    if (!opened) {
      throw new Error("Could not open the sign-in page in a browser.");
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Waiting for NOTES.md sign-in",
        cancellable: true,
      },
      async (_progress, cancellation) => {
        const deadline = Date.now() + 10 * 60 * 1000;
        while (Date.now() < deadline) {
          if (cancellation.isCancellationRequested) {
            throw new Error("Sign-in was cancelled.");
          }

          const response = await fetch(
            new URL(
              `/api/auth/vscode/link/status?pairing_id=${encodeURIComponent(pairingId)}`,
              baseUrl,
            ),
            { cache: "no-store" },
          );
          const result = await this.readJson<{ status: string; token?: string }>(
            response,
            "Could not check the sign-in status",
          );

          if (result.status === "linked" && result.token) {
            await this.context.secrets.store(ACCESS_TOKEN_SECRET, result.token);
            vscode.window.showInformationMessage("NOTES.md is connected.");
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        throw new Error("Sign-in timed out. Run the sign-in command again.");
      },
    );
  }

  async sync(): Promise<void> {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
      throw new Error("Open a workspace before synchronizing notes.");
    }

    if (!(await this.context.secrets.get(ACCESS_TOKEN_SECRET))) {
      await this.signIn();
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Synchronizing NOTES.md",
      },
      async (progress) => {
        progress.report({ message: "Checking account" });
        let session: SessionResponse;
        try {
          session = await this.getJson<SessionResponse>("/api/auth/session");
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !error.message.includes("Your NOTES.md session expired")
          ) {
            throw error;
          }
          await this.signIn();
          session = await this.getJson<SessionResponse>("/api/auth/session");
        }
        const remoteProjectId = await this.getRemoteProject(
          session.user.id,
          workspace,
        );
        const projectStorage = await this.notesManager.ensureStorage();
        if (!projectStorage) {
          throw new Error("Could not access the workspace note storage.");
        }

        progress.report({ message: "Fetching web notes" });
        const remoteResult = await this.getJson<{ notes: RemoteNote[] }>(
          `/api/sync?projectId=${encodeURIComponent(remoteProjectId)}`,
        );
        const remoteById = new Map(remoteResult.notes.map((note) => [note.id, note]));
        const localUris = await this.notesManager.listNotes();
        const localNotes = await Promise.all(
          localUris.map((uri) => this.readLocalNote(uri, remoteProjectId)),
        );
        const localByUri = new Map(
          localNotes.map((note) => [note.uri.toString(), note]),
        );

        const stateKey = `${NOTE_STATE_PREFIX}${session.user.id}.${getProjectId(workspace)}`;
        const state = {
          ...this.context.globalState.get<Record<string, SyncMetadata>>(stateKey, {}),
        };
        const changes: SyncChange[] = [];
        const localForChange = new Map<string, LocalNote>();
        const uriForChange = new Map<string, vscode.Uri>();
        const handledRemoteIds = new Set<string>();
        const conflicts: string[] = [];
        let remoteChangesApplied = 0;

        for (const local of localNotes) {
          if (!isValidSyncName(local.name)) {
            conflicts.push(`${local.name}: this name is not supported by web sync`);
            continue;
          }
          if (Buffer.byteLength(local.content, "utf8") > 10 * 1024 * 1024) {
            conflicts.push(`${local.name}: note exceeds the 10 MB web sync limit`);
            continue;
          }

          const localKey = local.uri.toString();
          const metadata = state[localKey];
          if (metadata) {
            const remote = remoteById.get(metadata.id);
            if (!remote) {
              conflicts.push(`${local.name}: the linked web note was not found`);
              continue;
            }
            handledRemoteIds.add(remote.id);
            if (!isValidSyncName(localNameFromRemote(remote))) {
              conflicts.push(`${local.name}: the web note name is not supported`);
              continue;
            }

            if (remote.deletedAt) {
              const localChanged =
                local.contentHash !== metadata.localContentHash ||
                local.name !== metadata.localName;
              if (!localChanged && local.noteType === "regular") {
                await vscode.workspace.fs.delete(local.uri);
                delete state[localKey];
                remoteChangesApplied++;
              } else {
                conflicts.push(`${local.name}: the web note was deleted`);
              }
              continue;
            }

            const localChanged =
              local.contentHash !== metadata.localContentHash ||
              local.name !== metadata.localName;
            const remoteChanged =
              remote.version !== metadata.version ||
              remote.contentHash !== metadata.remoteContentHash ||
              remote.name !== metadata.remoteName;

            if (localChanged && remoteChanged) {
              if (
                local.content === remote.content &&
                local.name === localNameFromRemote(remote)
              ) {
                state[localKey] = this.metadataFromRemote(remote, local);
              } else {
                conflicts.push(`${local.name}: both copies changed`);
              }
            } else if (localChanged) {
              changes.push({
                id: metadata.id,
                type: "upsert",
                project_id: local.projectId,
                name: local.name,
                note_type: local.noteType,
                content: local.content,
                base_version: metadata.version,
                base_content_hash: metadata.remoteContentHash,
              });
              localForChange.set(metadata.id, local);
              uriForChange.set(metadata.id, local.uri);
            } else if (remoteChanged) {
              const appliedUri = await this.applyRemoteNote(
                remote,
                local.uri,
                projectStorage,
              );
              if (!appliedUri) {
                conflicts.push(`${local.name}: another local file has that name`);
                continue;
              }
              delete state[localKey];
              const updatedLocal = {
                ...local,
                uri: appliedUri,
                name: localNameFromRemote(remote),
                content: remote.content,
                contentHash: hashContent(remote.content),
              };
              state[appliedUri.toString()] = this.metadataFromRemote(
                remote,
                updatedLocal,
              );
              remoteChangesApplied++;
            }
            continue;
          }

          const match = remoteResult.notes.find(
            (note) =>
              !note.deletedAt &&
              !handledRemoteIds.has(note.id) &&
              note.projectId === local.projectId &&
              note.noteType === local.noteType &&
              (note.noteType === "regular"
                ? localNameFromRemote(note).toLowerCase() === local.name.toLowerCase()
                : localNameFromRemote(note) === local.name),
          );
          if (match) {
            handledRemoteIds.add(match.id);
            if (match.content === local.content) {
              state[localKey] = this.metadataFromRemote(match, local);
            } else {
              conflicts.push(`${local.name}: a web note with this name differs`);
            }
            continue;
          }

          const id = randomUUID();
          changes.push({
            id,
            type: "upsert",
            project_id: local.projectId,
            name: local.name,
            note_type: local.noteType,
            content: local.content,
            base_version: 0,
            base_content_hash: null,
          });
          localForChange.set(id, local);
          uriForChange.set(id, local.uri);
        }

        for (const [localKey, metadata] of Object.entries(state)) {
          if (localByUri.has(localKey)) {
            continue;
          }
          const remote = remoteById.get(metadata.id);
          if (!remote || remote.deletedAt) {
            delete state[localKey];
            continue;
          }
          handledRemoteIds.add(remote.id);
          changes.push({
            id: metadata.id,
            type: "delete",
            project_id: metadata.projectId,
            name: metadata.localName,
            note_type: metadata.noteType,
            base_version: metadata.version,
            base_content_hash: metadata.remoteContentHash,
          });
          uriForChange.set(metadata.id, vscode.Uri.parse(localKey));
        }

        for (const remote of remoteResult.notes) {
          if (remote.deletedAt || handledRemoteIds.has(remote.id)) {
            continue;
          }
          if (!isValidSyncName(localNameFromRemote(remote))) {
            conflicts.push(`${remote.name}: the web note name is not supported`);
            continue;
          }
          const target = this.localUriForRemote(remote, projectStorage);
          const existing = localByUri.get(target.toString());
          if (existing) {
            if (existing.content === remote.content) {
              state[target.toString()] = this.metadataFromRemote(remote, existing);
            } else {
              conflicts.push(`${existing.name}: a web note with this name differs`);
            }
            handledRemoteIds.add(remote.id);
            continue;
          }

          await vscode.workspace.fs.writeFile(
            target,
            Buffer.from(remote.content, "utf8"),
          );
          const pulledLocal: LocalNote = {
            uri: target,
            name: localNameFromRemote(remote),
            content: remote.content,
            contentHash: hashContent(remote.content),
            projectId: remote.projectId,
            noteType: remote.noteType,
          };
          state[target.toString()] = this.metadataFromRemote(remote, pulledLocal);
          localByUri.set(target.toString(), pulledLocal);
          remoteChangesApplied++;
        }

        let syncedCount = 0;
        for (let offset = 0; offset < changes.length; offset += 50) {
          progress.report({
            message: `Sending changes ${Math.min(offset + 50, changes.length)} of ${changes.length}`,
          });
          const result = await this.postJson<SyncResponse>("/api/sync", {
            changes: changes.slice(offset, offset + 50),
          });

          for (const note of result.synced) {
            const local = localForChange.get(note.id);
            if (local && note.deletedAt === null) {
              state[local.uri.toString()] = this.metadataFromRemote(note, local);
            } else {
              for (const [key, metadata] of Object.entries(state)) {
                if (metadata.id === note.id) {
                  delete state[key];
                }
              }
            }
            syncedCount++;
          }

          for (const item of result.conflicts) {
            const local = localForChange.get(item.id);
            const localUri = uriForChange.get(item.id);
            if (local && item.remote) {
              conflicts.push(`${local.name}: ${item.reason}`);
            } else if (localUri && item.remote && !item.remote.deletedAt) {
              if (!isValidSyncName(localNameFromRemote(item.remote))) {
                conflicts.push(`${item.id}: web note name is not supported`);
                continue;
              }
              delete state[localUri.toString()];
              const target = this.localUriForRemote(item.remote, projectStorage);
              if (await this.fileExists(target)) {
                conflicts.push(
                  `${item.remote.name}: ${item.reason}; a local file already exists`,
                );
              } else {
                await vscode.workspace.fs.writeFile(
                  target,
                  Buffer.from(item.remote.content, "utf8"),
                );
                const restored: LocalNote = {
                  uri: target,
                  name: localNameFromRemote(item.remote),
                  content: item.remote.content,
                  contentHash: hashContent(item.remote.content),
                  projectId: item.remote.projectId,
                  noteType: item.remote.noteType,
                };
                state[target.toString()] = this.metadataFromRemote(
                  item.remote,
                  restored,
                );
                remoteChangesApplied++;
                conflicts.push(`${restored.name}: ${item.reason}; web copy restored`);
              }
            } else {
              conflicts.push(`${item.id}: ${item.reason}`);
            }
          }
        }

        await this.context.globalState.update(stateKey, state);
        this.output.clear();
        this.output.appendLine(
          `Sync finished: ${syncedCount} change(s) sent, ${remoteChangesApplied} web change(s) applied, ${conflicts.length} conflict(s).`,
        );
        for (const conflict of conflicts) {
          this.output.appendLine(`Conflict: ${conflict}`);
        }
        if (conflicts.length > 0) {
          vscode.window.showWarningMessage(
            `Sync finished with ${conflicts.length} conflict(s). Local files were preserved.`,
            "Show Sync Output",
          ).then((selection) => {
            if (selection === "Show Sync Output") {
              this.output.show();
            }
          });
        } else {
          vscode.window.showInformationMessage(
            `NOTES.md sync complete: ${syncedCount} change(s) sent, ${remoteChangesApplied} web change(s) applied.`,
          );
        }
      },
    );
  }

  async noteRenamed(oldUri: vscode.Uri, newUri: vscode.Uri): Promise<void> {
    for (const key of this.context.globalState.keys()) {
      if (!key.startsWith(NOTE_STATE_PREFIX)) {
        continue;
      }
      const state = this.context.globalState.get<Record<string, SyncMetadata>>(key);
      if (!state?.[oldUri.toString()]) {
        continue;
      }
      const updated = { ...state };
      updated[newUri.toString()] = updated[oldUri.toString()];
      delete updated[oldUri.toString()];
      await this.context.globalState.update(key, updated);
    }
  }

  private getBaseUrl(): URL {
    const configured = vscode.workspace
      .getConfiguration("notes-md")
      .get<string>("webBaseUrl", "http://localhost:3000");
    const url = new URL(configured);
    if (
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && isLoopbackHost(url.hostname))
    ) {
      throw new Error("The web URL must use HTTPS (HTTP is allowed for localhost).");
    }
    return new URL(url.origin);
  }

  private async getRemoteProject(
    userId: string,
    workspace: vscode.WorkspaceFolder,
  ): Promise<string> {
    const localProjectId = getProjectId(workspace);
    const stateKey = `${PROJECT_STATE_PREFIX}${userId}.${localProjectId}`;
    const savedId = this.context.globalState.get<string>(stateKey);
    if (savedId) {
      const response = await this.request(`/api/work/projects/${savedId}`);
      if (response.ok) {
        return savedId;
      }
      if (response.status !== 404) {
        await this.readJson(response, "Could not load the linked project");
      }
      await this.context.globalState.update(stateKey, undefined);
    }

    const safeName =
      workspace.name
        .replace(/[^a-zA-Z0-9 _.&-]/g, "-")
        .slice(0, 120)
        .trim() || "VS Code Workspace";
    const projects = await this.getJson<RemoteProject[]>("/api/work/projects");
    const matches = projects.filter(
      (project) => project.name === workspace.name || project.name === safeName,
    );
    if (matches.length === 1) {
      await this.context.globalState.update(stateKey, matches[0].id);
      return matches[0].id;
    }

    const created = await this.postJson<RemoteProject>("/api/work/projects", {
      name: safeName,
    });
    await this.context.globalState.update(stateKey, created.id);
    return created.id;
  }

  private async readLocalNote(
    uri: vscode.Uri,
    remoteProjectId: string,
  ): Promise<LocalNote> {
    const fileName = uri.path.split("/").pop() ?? "";
    const noteType = noteTypeFromName(fileName);
    const openDocument = vscode.workspace.textDocuments.find(
      (document) => document.uri.toString() === uri.toString(),
    );
    const content = openDocument
      ? openDocument.getText()
      : Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
    return {
      uri,
      name: localNameFromUri(uri, noteType),
      content,
      contentHash: hashContent(content),
      projectId: noteType === "global" ? null : remoteProjectId,
      noteType,
    };
  }

  private localUriForRemote(
    note: RemoteNote,
    projectStorage: vscode.Uri,
  ): vscode.Uri {
    const fileName = fileNameForRemote(note);
    const parent =
      note.noteType === "global" ? this.context.globalStorageUri : projectStorage;
    return vscode.Uri.joinPath(parent, fileName);
  }

  private async applyRemoteNote(
    note: RemoteNote,
    currentUri: vscode.Uri,
    projectStorage: vscode.Uri,
  ): Promise<vscode.Uri | null> {
    const target = this.localUriForRemote(note, projectStorage);
    if (target.toString() !== currentUri.toString()) {
      if (await this.fileExists(target)) {
        return null;
      }
      await vscode.workspace.fs.rename(currentUri, target, { overwrite: false });
    }
    await vscode.workspace.fs.writeFile(target, Buffer.from(note.content, "utf8"));
    return target;
  }

  private async fileExists(uri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch (error) {
      if (
        error instanceof vscode.FileSystemError &&
        error.code === "FileNotFound"
      ) {
        return false;
      }
      throw error;
    }
  }

  private metadataFromRemote(note: RemoteNote, local: LocalNote): SyncMetadata {
    return {
      id: note.id,
      version: note.version,
      remoteContentHash: note.contentHash,
      localContentHash: local.contentHash,
      remoteName: note.name,
      localName: local.name,
      projectId: note.projectId,
      noteType: note.noteType,
    };
  }

  private async getJson<T>(path: string): Promise<T> {
    return this.readJson(await this.request(path), "Request failed");
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    return this.readJson(
      await this.request(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      "Request failed",
    );
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const token = await this.context.secrets.get(ACCESS_TOKEN_SECRET);
    if (!token) {
      throw new Error("Sign in to NOTES.md before synchronizing.");
    }

    const response = await this.fetchWithToken(path, token, init);
    if (response.status !== 401) {
      return response;
    }

    const refresh = await this.fetchWithToken("/api/auth/refresh", token, {
      method: "POST",
    });
    if (!refresh.ok) {
      await this.context.secrets.delete(ACCESS_TOKEN_SECRET);
      throw new Error("Your NOTES.md session expired. Sign in again.");
    }
    const refreshed = await this.readJson<{ token?: string }>(
      refresh,
      "Could not refresh the NOTES.md session",
    );
    if (!refreshed.token) {
      throw new Error("The server did not return a refreshed session token.");
    }
    await this.context.secrets.store(ACCESS_TOKEN_SECRET, refreshed.token);
    return this.fetchWithToken(path, refreshed.token, init);
  }

  private async fetchWithToken(
    path: string,
    token: string,
    init?: RequestInit,
  ): Promise<Response> {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Cache-Control", "no-store");
    return fetch(new URL(path, this.getBaseUrl()), {
      ...init,
      headers,
      cache: "no-store",
    });
  }

  private async readJson<T>(response: Response, errorMessage: string): Promise<T> {
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`${errorMessage} (${response.status}): ${detail}`);
    }
    return (await response.json()) as T;
  }
}
