import * as crypto from "node:crypto";
import * as vscode from "vscode";

class NotesProvider implements vscode.TreeDataProvider<NoteItem> {
  getTreeItem(element: NoteItem): vscode.TreeItem {
    return element;
  }

  getChildren(): NoteItem[] {
    return [new NoteItem("Open NOTE.md")];
  }
}

class NoteItem extends vscode.TreeItem {
  constructor(label: string) {
    super(label);

    this.command = {
      command: "note-md.open",
      title: "Open NOTE.md",
    };

    this.iconPath = new vscode.ThemeIcon("note");
  }
}

function getProjectId(workspace: vscode.WorkspaceFolder): string {
  return crypto
    .createHash("sha256")
    .update(workspace.uri.toString())
    .digest("hex")
    .slice(0, 16);
}

async function openNote(context: vscode.ExtensionContext) {
  const workspace = vscode.workspace.workspaceFolders?.[0];

  if (!workspace) {
    vscode.window.showWarningMessage("Please open a workspace first.");

    return;
  }

  // Create a unique ID for this project
  const projectId = getProjectId(workspace);

  // Each project gets its own directory
  const projectStorageUri = vscode.Uri.joinPath(
    context.globalStorageUri,
    projectId,
  );

  // NOTE.md is stored outside the project
  const noteUri = vscode.Uri.joinPath(projectStorageUri, "NOTE.md");

  try {
    await vscode.workspace.fs.stat(noteUri);
  } catch {
    await vscode.workspace.fs.createDirectory(projectStorageUri);

    const content = `# Notes

Start writing your notes here...
`;

    await vscode.workspace.fs.writeFile(noteUri, Buffer.from(content, "utf8"));
  }

  const document = await vscode.workspace.openTextDocument(noteUri);

  await vscode.window.showTextDocument(document);
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new NotesProvider();

  const treeView = vscode.window.createTreeView("noteMd.view", {
    treeDataProvider: provider,
  });

  const command = vscode.commands.registerCommand("note-md.open", () =>
    openNote(context),
  );

  context.subscriptions.push(treeView, command);
}

export function deactivate() {}
