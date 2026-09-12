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

async function openNote() {
  const workspace = vscode.workspace.workspaceFolders?.[0];

  if (!workspace) {
    vscode.window.showWarningMessage("Please open a workspace first.");

    return;
  }

  const noteUri = vscode.Uri.joinPath(workspace.uri, "NOTE.md");

  try {
    await vscode.workspace.fs.stat(noteUri);
  } catch {
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

  const command = vscode.commands.registerCommand("note-md.open", openNote);

  context.subscriptions.push(treeView, command);
}

export function deactivate() {}
