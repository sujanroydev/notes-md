import * as vscode from "vscode";
import { NotesManager } from "./NotesManager";
import { NoteItem } from "./NoteItem";

export class NotesProvider implements vscode.TreeDataProvider<NoteItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();

  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly notesManager: NotesManager) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: NoteItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: NoteItem): Promise<NoteItem[]> {
    if (element) {
      return [];
    }

    const notes = await this.notesManager.listNotes();

    return notes.map((uri) => new NoteItem(uri));
  }
}
