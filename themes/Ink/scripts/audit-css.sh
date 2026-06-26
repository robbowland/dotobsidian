#!/usr/bin/env bash
set -euo pipefail

theme_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
repo_dir="$(git -C "$theme_dir" rev-parse --show-toplevel 2>/dev/null || true)"

if ! command -v rg >/dev/null 2>&1; then
  printf "Ink CSS audit requires ripgrep (rg).\n" >&2
  exit 1
fi

failures=0

fail_if_matches() {
  local label="$1"
  local pattern="$2"
  local output

  if output="$(rg -n --glob '*.css' "$pattern" "$theme_dir/src")"; then
    printf "\n[fail] %s\n%s\n" "$label" "$output" >&2
    failures=$((failures + 1))
  fi
}

warn_if_matches() {
  local label="$1"
  local pattern="$2"
  local output

  if output="$(rg -n --glob '*.css' "$pattern" "$theme_dir/src")"; then
    printf "\n[warn] %s\n%s\n" "$label" "$output" >&2
  fi
}

fail_if_matches \
  "Generic grouped input reset must exclude checkbox and radio controls." \
  ':is\(input, textarea|:is\(input,textarea|input:not\(\[type="range"\]\),'

fail_if_matches \
  "Scoped plugin inputs must not target every setting-item-control input." \
  '\.setting-item-control input,'

fail_if_matches \
  "Community modal search styles must not target every input in controls." \
  '\.community-modal-controls input \{'

warn_if_matches \
  "Review broad universal selectors before adding more." \
  '^\s*\.theme-dark \*'

important_count="$(rg -n --glob '*.css' '!important' "$theme_dir/src" | wc -l | tr -d ' ')"
printf "Ink CSS audit: %s !important declarations in source partials.\n" "$important_count"

if [[ -n "$repo_dir" ]]; then
  changed_files="$(
    {
      git -C "$repo_dir" diff --name-only -- themes/Ink/src themes/Ink/theme.css
      git -C "$repo_dir" diff --cached --name-only -- themes/Ink/src themes/Ink/theme.css
    } | sort -u
  )"

  if grep -qx 'themes/Ink/theme.css' <<<"$changed_files" &&
    ! grep -q '^themes/Ink/src/' <<<"$changed_files"; then
    printf "\n[fail] themes/Ink/theme.css changed without source partial changes.\n" >&2
    failures=$((failures + 1))
  fi
fi

if ((failures > 0)); then
  printf "\nInk CSS audit failed with %d issue(s).\n" "$failures" >&2
  exit 1
fi

printf "Ink CSS audit passed.\n"
