import * as vscode from "vscode";

export class NoteItem extends vscode.TreeItem {
  constructor(public readonly uri: vscode.Uri) {
    const fileName = uri.path.split("/").pop() ?? "NOTES.md";

    super(fileName, vscode.TreeItemCollapsibleState.None);

    this.tooltip = fileName;
    this.description = "Markdown note";

    this.iconPath = new vscode.ThemeIcon("note");

    this.contextValue = "noteMd.note";

    this.command = {
      command: "notes-md.openNote",
      title: "Open Note",
      arguments: [uri],
    };
  }
}
