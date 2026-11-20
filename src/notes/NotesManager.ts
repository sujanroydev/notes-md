import * as vscode from "vscode";
import { getProjectId } from "../utils/projectId";

export const PROTECTED_FILE_NAMES = new Set<string>(["GLOBAL.md", "NOTES.md"]);

export class NotesManager {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private getWorkspace(): vscode.WorkspaceFolder | undefined {
    return vscode.workspace.workspaceFolders?.[0];
  }

  private getGlobalNoteUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.context.globalStorageUri, "GLOBAL.md");
  }

  private getProjectStorageUri(): vscode.Uri | undefined {
    const workspace = this.getWorkspace();

    if (!workspace) {
      return undefined;
    }

    const projectId = getProjectId(workspace);

    return vscode.Uri.joinPath(this.context.globalStorageUri, projectId);
  }

  async ensureStorage(): Promise<vscode.Uri | undefined> {
    const storageUri = this.getProjectStorageUri();

    if (!storageUri) {
      return undefined;
    }

    await vscode.workspace.fs.createDirectory(storageUri);

    return storageUri;
  }

  async ensureGlobalNote(): Promise<void> {
    const noteUri = this.getGlobalNoteUri();

    try {
      await vscode.workspace.fs.stat(noteUri);
    } catch {
      const content = `# Global Notes

These notes are available across all projects.
`;

      await vscode.workspace.fs.writeFile(
        noteUri,
        Buffer.from(content, "utf8"),
      );
    }
  }

  async ensureDefaultNote(): Promise<void> {
    const storageUri = await this.ensureStorage();

    if (!storageUri) {
      return;
    }

    const noteUri = vscode.Uri.joinPath(storageUri, "NOTES.md");

    try {
      await vscode.workspace.fs.stat(noteUri);
    } catch {
      const content = `# Notes

Start writing your notes here...
`;

      await vscode.workspace.fs.writeFile(
        noteUri,
        Buffer.from(content, "utf8"),
      );
    }
  }

  async listNotes(): Promise<vscode.Uri[]> {
    const storageUri = await this.ensureStorage();

    if (!storageUri) {
      return [];
    }

    await this.ensureDefaultNote();
    await this.ensureGlobalNote();

    const entries = await vscode.workspace.fs.readDirectory(storageUri);

    const projectNotes = entries
      .filter(
        ([name, type]) =>
          type === vscode.FileType.File && name.toLowerCase().endsWith(".md"),
      )
      .map(([name]) => vscode.Uri.joinPath(storageUri, name));

    const globalNote = this.getGlobalNoteUri();

    projectNotes.sort((a, b) => {
      const aName = a.path.split("/").pop() ?? "";
      const bName = b.path.split("/").pop() ?? "";

      if (aName.toLowerCase() === "notes.md") {
        return -1;
      }
      if (bName.toLowerCase() === "notes.md") {
        return 1;
      }

      return aName.localeCompare(bName);
    });

    return [globalNote, ...projectNotes];
  }

  async createNote(name: string): Promise<vscode.Uri | undefined> {
    const storageUri = await this.ensureStorage();

    if (!storageUri) {
      vscode.window.showWarningMessage("Please open a workspace first.");

      return undefined;
    }

    let fileName = name.trim();

    if (!fileName) {
      return undefined;
    }

    // Remove .md if the user entered it.
    if (fileName.toLowerCase().endsWith(".md")) {
      fileName = fileName.slice(0, -3);
    }

    // Prevent invalid filename characters.
    fileName = fileName
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
      .replace(/\s+/g, " ")
      .trim();

    if (!fileName) {
      vscode.window.showErrorMessage("Please enter a valid note name.");

      return undefined;
    }

    fileName += ".md";

    const noteUri = vscode.Uri.joinPath(storageUri, fileName);

    try {
      await vscode.workspace.fs.stat(noteUri);

      vscode.window.showWarningMessage(
        `A note named "${fileName}" already exists.`,
      );

      return undefined;
    } catch {
      // File doesn't exist. Continue.
    }

    const content = `# ${fileName.replace(/\.md$/i, "")}

`;

    await vscode.workspace.fs.writeFile(noteUri, Buffer.from(content, "utf8"));

    return noteUri;
  }

  async openNote(uri: vscode.Uri): Promise<void> {
    const document = await vscode.workspace.openTextDocument(uri);

    await vscode.window.showTextDocument(document);
  }

  async renameNote(uri: vscode.Uri, inputName: string): Promise<vscode.Uri | undefined> {
    const oldName = uri.path.split("/").pop() ?? "";

    if (PROTECTED_FILE_NAMES.has(oldName)) {
      vscode.window.showErrorMessage(
        `"${oldName}" is a system file and cannot be renamed.`,
      );

      return undefined;
    }

    let fileName = inputName.trim();

    if (!fileName) {
      vscode.window.showErrorMessage("Note name cannot be empty.");

      return undefined;
    }

    // Remove .md if the user entered it.
    if (fileName.toLowerCase().endsWith(".md")) {
      fileName = fileName.slice(0, -3);
    }

    // Prevent invalid filename characters.
    fileName = fileName
      .replace(/[<>:"\/\\|?*\x00-\x1F]/g, "-")
      .replace(/\s+/g, " ")
      .trim();

    if (!fileName) {
      vscode.window.showErrorMessage("Please enter a valid note name.");

      return undefined;
    }

    const oldBase = oldName.replace(/\.md$/i, "");

    if (fileName === oldBase) {
      return uri;
    }

    fileName += ".md";

    if (PROTECTED_FILE_NAMES.has(fileName)) {
      vscode.window.showErrorMessage(
        `"${fileName}" is a reserved system file name.`,
      );

      return undefined;
    }

    const parentPath = uri.path.substring(0, uri.path.lastIndexOf("/"));
    const parentUri = uri.with({ path: parentPath });
    const newUri = vscode.Uri.joinPath(parentUri, fileName);

    try {
      await vscode.workspace.fs.stat(newUri);

      vscode.window.showWarningMessage(
        `A note named "${fileName}" already exists.`,
      );

      return undefined;
    } catch {
      // Target does not exist. Continue.
    }

    try {
      await vscode.workspace.fs.rename(uri, newUri, { overwrite: false });

      return newUri;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      vscode.window.showErrorMessage(`Failed to rename note: ${message}`);

      return undefined;
    }
  }

  async deleteNote(uri: vscode.Uri): Promise<boolean> {
    const name = uri.path.split("/").pop() ?? "the note";

    if (PROTECTED_FILE_NAMES.has(name)) {
      vscode.window.showErrorMessage(
        `"${name}" is a system file and cannot be deleted.`,
      );

      return false;
    }

    try {
      await vscode.workspace.fs.delete(uri);

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      vscode.window.showErrorMessage(`Failed to delete note: ${message}`);

      return false;
    }
  }
}
