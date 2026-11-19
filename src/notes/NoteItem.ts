import * as vscode from "vscode";
import { PROTECTED_FILE_NAMES } from "./NotesManager";

export class NoteItem extends vscode.TreeItem {
  constructor(public readonly uri: vscode.Uri) {
    const fileName = uri.path.split("/").pop() ?? "NOTES.md";

    super(fileName, vscode.TreeItemCollapsibleState.None);

    this.tooltip = fileName;

    const isProtected = PROTECTED_FILE_NAMES.has(fileName);

    if (fileName === "GLOBAL.md") {
      this.iconPath = new vscode.ThemeIcon("globe");
      this.description = "Global notes";
    } else {
      this.iconPath = new vscode.ThemeIcon("note");
      this.description = "Markdown notes";
    }

    this.contextValue = isProtected ? "notesMd.protectedNote" : "notesMd.note";

    this.command = {
      command: "notes-md.openNote",
      title: "Open Note",
      arguments: [uri],
    };
  }
}
