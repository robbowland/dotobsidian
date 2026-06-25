# Ink Theme Source

Obsidian loads `../theme.css`. Treat that file as generated output.
Edit these partials, then run:

```bash
themes/Ink/scripts/build-theme.sh
```

Ink is a standalone theme. It does not import or vendor another Obsidian theme as
its base layer; every partial in this directory is part of Ink's own cascade.

## Source Layout

- `core/tokens.css`: Ink palette, shared terminal tokens, GitHub dark code tokens, and global app variables.
- `core/base.css`: Ink-owned Obsidian foundation styles shared by all surfaces.
- `chrome/workspace.css`: app chrome, title bars, panes, and terminal frame treatment.
- `chrome/stacked-tabs.css`: focused stacked-tabs behavior, formerly the `stacked-tabs-focused` snippet.
- `file-explorer/tree.css`: complete file explorer component styling.
- `editor/source-syntax.css`: raw Markdown editor syntax colours.
- `markdown/document.css`: reading/editing Markdown document surface and GitHub-style rendering.
- `settings/base.css`: settings modal shell and controls.
- `settings/plugin-browser.css`: community plugin/theme browser overlay inside settings.
- `modals/command-palette.css`: command palette, quick switcher, and shared prompt styling.
- `plugins/omnisearch/search-modal.css`: Omnisearch prompt/results styling.
- `plugins/spacekeys/which-key.css`: Spacekeys which-key modal, formerly the `spacekeys-whichkey` snippet.
- `plugins/tasknotes/modal.css`: TaskNotes modal and form surface.
- `plugins/tasknotes/status-priority.css`: TaskNotes status and priority colour system.

`scripts/build-theme.sh` owns the cascade order. Filenames and folders should describe
the Obsidian component being styled, not the external app used as visual reference.

## Editing Rules

- Put new plugin-specific CSS under `plugins/<plugin-name>/`.
- Put Obsidian surface CSS under the closest component folder, such as `chrome/`, `file-explorer/`, `markdown/`, `editor/`, `modals/`, or `settings/`.
- Reuse variables from `core/tokens.css` before adding new colour literals.
- Use the `--ink-palette-*` variables for terminal-aligned colours. They mirror
  `~/.config/fish/palettes/github_dark.fish` and feed the `--ink-terminal-*`,
  Yazi, cmdline, and code syntax aliases.
- Scope selectors under `.theme-dark` and a stable Obsidian/plugin root class.
- Run `git diff --check -- .obsidian/themes/Ink` after rebuilding.
