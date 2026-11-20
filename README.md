# NOTES.md - Markdown Notes

A simple Markdown note manager for [Visual Studio Code](https://code.visualstudio.com/).

NOTES.md lets you create and manage Markdown notes directly inside VS Code without adding note files to your project.

## Features

- 📝 **Project-specific notes** — Each VS Code workspace has its own collection of notes.
- ➕ **Create multiple notes** — Create as many Markdown notes as you need for a project.
- 📂 **Dedicated Notes view** — Access all your notes from the NOTES.md icon in the Activity Bar.
- ✏️ **Edit in VS Code** — Notes open directly in the normal VS Code editor.
- 🔄 **Rename notes** — Rename any note from its context menu in the Notes view.
- 🗑️ **Delete notes** — Delete notes with a confirmation dialog from the context menu.
- 🔒 **Keeps your project clean** — Notes are stored separately from your project files.
- 🛡️ **Protected system files** — `GLOBAL.md` and `NOTES.md` cannot be renamed or deleted.
- 💾 **Persistent storage** — Notes remain available between VS Code sessions.
- 📄 **Markdown support** — Write notes using the familiar Markdown format.
- ⭐ **Default note** — A `NOTES.md` file is automatically created for each project.
- ☁️ **Web synchronization** — Link your account to sync notes with the NOTES.md web app.
- ⚖️ **Conflict protection** — Concurrent edits are reported without overwriting local content.

### How it works

After installing the extension:

1. Open a project or workspace in VS Code.
2. Click the **NOTES.md** icon in the Activity Bar.
3. Your project's notes will appear in the **Notes** view.
4. Click a note to open it in the editor.
5. Click the **+** button to create a new note.
6. Enter a name such as `JavaScript`, `Ideas`, or `Todo`.
7. The new Markdown note opens automatically.
8. Right-click any note in the Notes view to **Rename** or **Delete** it. `NOTES.md` and `GLOBAL.md` are system files and are protected from renaming and deletion.

Your project remains untouched. Notes are stored in VS Code's extension storage and are separated by project.

### Syncing with the web app

1. Set `notes-md.webBaseUrl` to your NOTES.md web app URL.
2. Run **Notes.md: Connect to Web** and complete Google sign-in in your browser.
3. Run **Notes.md: Sync with Web** to pull and push notes.

The extension stores its session token in VS Code SecretStorage. Notes are matched by
their sync IDs and versions; when both copies changed since the last sync, the
extension keeps the local file and reports the conflict in the **NOTES.md Sync**
output channel. Review the web copy before resolving such conflicts.

### Example

For a project named `my-project`, you could have:

```text
Notes
├── NOTES.md
├── JavaScript.md
├── Ideas.md
├── Todo.md
└── Commands.md
```

These files are **not added to your project's Explorer**.

## Requirements

- Visual Studio Code `1.135.0` or later.

No additional dependencies or configuration are required.

## Extension Settings

- `notes-md.webBaseUrl`: Base URL for the web app. Defaults to
  `http://localhost:3000`; non-local URLs must use HTTPS.

## Known Issues

- Notes are currently associated with the first workspace folder when using a multi-root workspace.
- Synchronization is manual; run **Notes.md: Sync with Web** after editing notes.
- `GLOBAL.md` and `NOTES.md` are protected local files and are not removed when deleted from the web app.

## Release Notes

### 0.0.1

Initial release.

- Added NOTES.md Activity Bar view.
- Added project-specific note storage.
- Added automatic creation of the default `NOTES.md`.
- Added support for creating multiple Markdown notes.
- Added opening notes directly in the VS Code editor.
- Added persistent extension storage outside the project workspace.

---

## Development

Clone the repository:

```bash
git clone https://github.com/sujanroydev/notes-md.git
cd notes-md
```

Install dependencies:

```bash
pnpm install
```

Compile the extension:

```bash
pnpm run compile
```

For development with automatic compilation:

```bash
pnpm run watch
```

Press `F5` in VS Code to launch the Extension Development Host.

## Project Structure

```text
notes-md/
├── media/
│   ├── icon.png
│   └── icon.svg
├── src/
│   ├── extension.ts
│   ├── notes/
│   │   ├── NoteItem.ts
│   │   ├── NotesManager.ts
│   │   ├── NotesProvider.ts
│   │   └── SyncManager.ts
│   └── utils/
│       └── projectId.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Storage

NOTES.md does not create `.md` files inside your project.

Instead, notes are stored in the extension's VS Code global storage using a unique identifier derived from the workspace.

Conceptually:

```text
VS Code Global Storage
└── notes-md/
    ├── <project-id>/
    │   ├── NOTES.md
    │   ├── Ideas.md
    │   └── JavaScript.md
    │
    └── <another-project-id>/
        ├── NOTES.md
        └── Todo.md
```

This keeps notes separate for each project while keeping the project itself clean.

## Contributing

Contributions, suggestions, and bug reports are welcome.

If you find an issue or have an idea for a feature, feel free to open an issue or pull request.

## License

This project is licensed under the MIT License.

---

**Enjoy taking notes without leaving your editor! 📝**
