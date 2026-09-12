import * as vscode from "vscode";
import { getProjectId } from "../utils/projectId";

export class NotesManager {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private getWorkspace(): vscode.WorkspaceFolder | undefined {
    return vscode.workspace.workspaceFolders?.[0];
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

  async ensureDefaultNote(): Promise<void> {
    const storageUri = await this.ensureStorage();

    if (!storageUri) {
      return;
    }

    const noteUri = vscode.Uri.joinPath(storageUri, "NOTE.md");

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

    const entries = await vscode.workspace.fs.readDirectory(storageUri);

    const notes = entries
      .filter(
        ([name, type]) =>
          type === vscode.FileType.File && name.toLowerCase().endsWith(".md"),
      )
      .map(([name]) => vscode.Uri.joinPath(storageUri, name));

    notes.sort((a, b) => {
      const aName = a.path.split("/").pop() ?? "";
      const bName = b.path.split("/").pop() ?? "";

      if (aName.toLowerCase() === "note.md") {
        return -1;
      }

      if (bName.toLowerCase() === "note.md") {
        return 1;
      }

      return aName.localeCompare(bName);
    });

    return notes;
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
}
