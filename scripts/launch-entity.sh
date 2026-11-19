#!/bin/bash
set -euo pipefail

# Finder applications do not inherit the interactive shell's PATH.
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
entity_script_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo 'Entity needs Node.js. Install Node.js, then open Entity again.' >&2
  exit 1
fi
exec node "$entity_script_dir/launch-entity.mjs"
