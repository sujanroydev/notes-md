import * as vscode from "vscode";

import { NoteItem } from "./notes/NoteItem";
import { NotesManager } from "./notes/NotesManager";
import { NotesProvider } from "./notes/NotesProvider";
import { SyncManager } from "./notes/SyncManager";

export function activate(context: vscode.ExtensionContext) {
  const notesManager = new NotesManager(context);
  const syncManager = new SyncManager(context, notesManager);
  const provider = new NotesProvider(notesManager);
  const updateSignedInContext = async () => {
    await vscode.commands.executeCommand(
      "setContext",
      "notesMd.signedIn",
      await syncManager.isSignedIn(),
    );
  };

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

  const renameNote = vscode.commands.registerCommand(
    "notes-md.renameNote",
    async (item?: NoteItem | vscode.Uri) => {
      const uri = item instanceof vscode.Uri ? item : item?.uri;

      if (!uri) {
        vscode.window.showWarningMessage(
          "Please select a note from the Notes view.",
        );

        return;
      }

      const wasOpen =
        vscode.window.activeTextEditor?.document.uri.toString() ===
        uri.toString();

      const currentName = uri.path.split("/").pop() ?? "";
      const nameWithoutExt = currentName.replace(/\.md$/i, "");

      const input = await vscode.window.showInputBox({
        prompt: "Enter a new name for the note",
        value: nameWithoutExt,
        placeHolder: "e.g. JavaScript Promises",
        validateInput: (value) => {
          if (!value.trim()) {
            return "Note name cannot be empty.";
          }

          return undefined;
        },
      });

      if (input === undefined) {
        return;
      }

      const newUri = await notesManager.renameNote(uri, input);

      if (!newUri) {
        return;
      }

      await syncManager.noteRenamed(uri, newUri);
      provider.refresh();

      if (wasOpen) {
        await notesManager.openNote(newUri);
      }
    },
  );

  const deleteNote = vscode.commands.registerCommand(
    "notes-md.deleteNote",
    async (item?: NoteItem | vscode.Uri) => {
      const uri = item instanceof vscode.Uri ? item : item?.uri;

      if (!uri) {
        vscode.window.showWarningMessage(
          "Please select a note from the Notes view.",
        );

        return;
      }

      const name = uri.path.split("/").pop() ?? "the note";
      const wasOpen =
        vscode.window.activeTextEditor?.document.uri.toString() ===
        uri.toString();

      const choice = await vscode.window.showWarningMessage(
        `Are you sure you want to delete "${name}"? This action cannot be undone.`,
        { modal: true },
        "Delete",
        "Cancel",
      );

      if (choice !== "Delete") {
        return;
      }

      const deleted = await notesManager.deleteNote(uri);

      if (!deleted) {
        return;
      }

      provider.refresh();

      if (wasOpen) {
        await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
      }

      vscode.window.showInformationMessage(`"${name}" has been deleted.`);
    },
  );

  const workspaceChange = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    provider.refresh();
  });

  const signIn = vscode.commands.registerCommand(
    "notes-md.signIn",
    async () => {
      try {
        await syncManager.signIn();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Could not connect NOTES.md: ${message}`);
      }
    },
  );

  const signOut = vscode.commands.registerCommand(
    "notes-md.signOut",
    async () => {
      await syncManager.signOut();
      vscode.window.showInformationMessage("NOTES.md has been disconnected.");
    },
  );

  const sync = vscode.commands.registerCommand("notes-md.sync", async () => {
    try {
      await syncManager.sync();
      provider.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Could not sync NOTES.md: ${message}`);
    } finally {
      await updateSignedInContext();
    }
  });

  const signedInChange = syncManager.onDidChangeSignedIn((signedIn) => {
    void vscode.commands.executeCommand(
      "setContext",
      "notesMd.signedIn",
      signedIn,
    );
  });

  void updateSignedInContext();

  context.subscriptions.push(
    treeView,
    createNote,
    openNote,
    renameNote,
    deleteNote,
    signIn,
    signOut,
    sync,
    workspaceChange,
    signedInChange,
    syncManager,
  );
}

export function deactivate() {}
