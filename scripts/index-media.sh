#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p media/previews media/metadata
swiftc -swift-version 5 -module-cache-path /private/tmp/entity-swift-cache scripts/index-media.swift -o /private/tmp/entity-index-media
/private/tmp/entity-index-media "$PWD"

metadata_tmp="$(mktemp /private/tmp/entity-exif.XXXXXX)"
trap 'rm -f "$metadata_tmp"' EXIT
LC_ALL=C LANG=C perl node_modules/exiftool-vendored.pl/bin/exiftool -json -n -G1 -r media/originals/iphone-entity > "$metadata_tmp"
if [ -x .venv/bin/python ]; then
  .venv/bin/python scripts/preview-heic.py
fi
python3 scripts/enrich-catalog.py "$metadata_tmp"

if [ -x .venv/bin/python ]; then
  .venv/bin/python scripts/build-cube.py
fi
