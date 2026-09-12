# NOTES.md - Markdown Notes

A simple Markdown note manager for [Visual Studio Code](https://code.visualstudio.com/).

NOTES.md lets you create and manage Markdown notes directly inside VS Code without adding note files to your project.

## Features

- 📝 **Project-specific notes** — Each VS Code workspace has its own collection of notes.
- ➕ **Create multiple notes** — Create as many Markdown notes as you need for a project.
- 📂 **Dedicated Notes view** — Access all your notes from the NOTES.md icon in the Activity Bar.
- ✏️ **Edit in VS Code** — Notes open directly in the normal VS Code editor.
- 🔒 **Keeps your project clean** — Notes are stored separately from your project files.
- 💾 **Persistent storage** — Notes remain available between VS Code sessions.
- 📄 **Markdown support** — Write notes using the familiar Markdown format.
- ⭐ **Default note** — A `NOTES.md` file is automatically created for each project.

### How it works

After installing the extension:

1. Open a project or workspace in VS Code.
2. Click the **NOTES.md** icon in the Activity Bar.
3. Your project's notes will appear in the **Notes** view.
4. Click a note to open it in the editor.
5. Click the **+** button to create a new note.
6. Enter a name such as `JavaScript`, `Ideas`, or `Todo`.
7. The new Markdown note opens automatically.

Your project remains untouched. Notes are stored in VS Code's extension storage and are separated by project.

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

This extension does not currently contribute any VS Code settings.

## Known Issues

- Notes are currently associated with the first workspace folder when using a multi-root workspace.
- Rename and delete functionality are not currently available.
- Notes are stored locally and are not synchronized between different computers.

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
npm install
```

Compile the extension:

```bash
npm run compile
```

For development with automatic compilation:

```bash
npm run watch
```

Press `F5` in VS Code to launch the Extension Development Host.

## Project Structure

```text
notes-md/
├── media/
│   └── icon.svg
├── src/
│   ├── extension.ts
│   ├── notes/
│   │   ├── NoteItem.ts
│   │   ├── NotesManager.ts
│   │   └── NotesProvider.ts
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
