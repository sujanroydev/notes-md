import * as vscode from "vscode";

import { NotesManager } from "./notes/NotesManager";
import { NotesProvider } from "./notes/NotesProvider";

export function activate(context: vscode.ExtensionContext) {
  const notesManager = new NotesManager(context);
  const provider = new NotesProvider(notesManager);

  const treeView = vscode.window.createTreeView("notesMd.view", {
    treeDataProvider: provider,
  });

  const createNote = vscode.commands.registerCommand(
    "notes-md.createNote",
    async () => {
      const workspace = vscode.workspace.workspaceFolders?.[0];

      if (!workspace) {
        vscode.window.showWarningMessage("Please open a workspace first.");

        return;
      }

      const name = await vscode.window.showInputBox({
        prompt: "Enter a name for your note",
        placeHolder: "e.g. JavaScript Promises",
        validateInput: (value) => {
          if (!value.trim()) {
            return "Note name cannot be empty.";
          }

          return undefined;
        },
      });

      if (!name) {
        return;
      }

      const uri = await notesManager.createNote(name);

      if (!uri) {
        return;
      }

      provider.refresh();

      await notesManager.openNote(uri);
    },
  );

  const openNote = vscode.commands.registerCommand(
    "notes-md.openNote",
    async (uri: vscode.Uri) => {
      if (!uri) {
        return;
      }

      await notesManager.openNote(uri);
    },
  );

  const workspaceChange = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    provider.refresh();
  });

  context.subscriptions.push(treeView, createNote, openNote, workspaceChange);
}

export function deactivate() {}
