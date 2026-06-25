#!/usr/bin/env bash
set -euo pipefail

theme_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
out="$theme_dir/theme.css"
tmp_dir="${TMPDIR:-/tmp}"
tmp="$(mktemp "$tmp_dir/ink-theme.XXXXXX.css")"

partials=(
  "core/tokens.css"
  "core/base.css"
  "file-explorer/tree.css"
  "editor/source-syntax.css"
  "markdown/document.css"
  "chrome/workspace.css"
  "chrome/stacked-tabs.css"
  "settings/base.css"
  "settings/plugin-browser.css"
  "modals/command-palette.css"
  "plugins/omnisearch/search-modal.css"
  "plugins/spacekeys/which-key.css"
  "plugins/tasknotes/modal.css"
  "plugins/tasknotes/status-priority.css"
)

{
  printf "/*\n"
  printf " * Ink theme generated from .obsidian/themes/Ink/src/ component partials.\n"
  printf " * Edit the source partials, then run scripts/build-theme.sh.\n"
  printf " */\n\n"

  first_partial=1
  for partial in "${partials[@]}"; do
    path="$theme_dir/src/$partial"
    if [[ ! -f "$path" ]]; then
      printf "Missing theme partial: %s\n" "$path" >&2
      exit 1
    fi

    if [[ "$first_partial" -eq 0 ]]; then
      printf "\n"
    fi
    first_partial=0

    printf "/* === %s === */\n\n" "$partial"
    cat "$path"
  done
} > "$tmp"

mv "$tmp" "$out"
