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

async function openNote(context: vscode.ExtensionContext) {
  const storageUri = context.globalStorageUri;

  const noteUri = vscode.Uri.joinPath(storageUri, "NOTE.md");

  try {
    await vscode.workspace.fs.stat(noteUri);
  } catch {
    await vscode.workspace.fs.createDirectory(storageUri);

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
