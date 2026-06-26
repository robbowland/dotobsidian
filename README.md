<h1 align="center">
  <br>
  dotobsidian
  <br>
</h1>

<h4 align="center"><a href="https://www.robbow.land" target="_blank">My</a> Obsidian profile for simplicity, consistency & functionality.</h4>

<p align="center">
  <a>ink</a> •
  <a>keymaps</a> •
  <a>capture</a> •
  <a>tasks</a>
</p>

## Usage

This repository is intended to be mounted directly as a vault's `.obsidian`
directory:

```bash
git submodule add git@github.com:robbowland/dotobsidian.git .obsidian
```

## Contents

- Core app and keymap config: `app.json`, `appearance.json`, `community-plugins.json`, `core-plugins.json`, `hotkeys.json`, `obsidian.vimrc`.
- Enabled community plugins under the standard `plugins/<id>/` layout.
- Spacekeys keymap colocated with the plugin: `plugins/spacekeys/keymap.yaml`.
- Local workflow plugins: `plugins/project-capture-markers`, `plugins/ink-bionic-reading`.
- Standalone theme: `themes/Ink`.

## Notes

Workspace layout, graph/backlink state, plugin caches, and raw TaskNotes runtime
history are ignored. Commit the stable profile surface; leave vault content and
local runtime state in the vault repository.

TaskNotes uses its standard `plugins/tasknotes/data.json` path, but that file is
kept intentionally lean so it carries preferences rather than tokens, queues,
release bookkeeping, or pomodoro history.
