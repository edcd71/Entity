"""Store a complete, separately loadable metadata record for each selected image."""
import hashlib
import json
import os
import subprocess
from pathlib import Path
from tempfile import NamedTemporaryFile


def load_palettes(root):
    path = root / "media/palettes.json"
    return json.loads(path.read_text())["items"] if path.is_file() else {}


def source_tags(root, paths):
    tool = root / "node_modules/exiftool-vendored.pl/bin/exiftool"
    for offset in range(0, len(paths), 100):
        batch = paths[offset:offset + 100]
        result = subprocess.run(["perl", tool, "-json", "-n", "-a", "-u", "-struct", "-G1:4", "--", *batch],
                                check=True, stdout=subprocess.PIPE, env={**os.environ, "LC_ALL": "C"})
        records = {record["SourceFile"]: record for record in json.loads(result.stdout)}
        for path in batch:
            yield path, records[str(path)]


def save_metadata(root, tags, digest, item, palettes):
    record = {"ExifTool": tags, "File identity": {"SHA256": digest}}
    if item:
        raw = json.loads((root / item["metadataPath"]).read_text())
        record["Archive"] = item
        record["ImageIO"] = {k: v for k, v in raw.items() if k != "ExifTool"}
        if item["id"] in palettes:
            record["Preview palette"] = palettes[item["id"]]
    data = json.dumps(record, ensure_ascii=False, separators=(",", ":")).encode()
    folder = root / "media/image-metadata"
    folder.mkdir(exist_ok=True)
    path = folder / (hashlib.sha256(data).hexdigest() + ".json")
    if not path.exists():
        with NamedTemporaryFile(dir=folder, delete=False) as temp:
            temp.write(data)
        Path(temp.name).replace(path)
    return "/" + path.relative_to(root).as_posix()
