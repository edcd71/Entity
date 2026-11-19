"""Screen still images with local Vision OCR, caching measurements by original file content."""
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "media/text-scan/v1"
EXTENSIONS = {".avif", ".bmp", ".gif", ".heic", ".heif", ".jpeg", ".jpg", ".png",
              ".svg", ".tif", ".tiff", ".webp"}


def original_hash(path):
    digest = hashlib.sha256()
    with path.open("rb") as src:
        for chunk in iter(lambda: src.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def folder_images(source):
    return {p.resolve(): original_hash(p) for p in sorted(source.iterdir())
            if p.is_file() and not p.name.startswith(".") and p.suffix.lower() in EXTENSIONS and p.stat().st_size}


def run_pass(files, cache, arguments):
    cache.mkdir(parents=True, exist_ok=True)
    missing = {digest: path for path, digest in files.items() if not (cache / (digest + ".json")).exists()}
    if not missing:
        return
    with tempfile.TemporaryDirectory() as work:
        binary = Path(work) / "recognize-text"
        subprocess.run(["swiftc", "-O", "-module-cache-path", str(Path(tempfile.gettempdir()) / "entity-swift-cache"),
                        ROOT / "scripts/recognize-text.swift", "-o", binary], check=True)
        with tempfile.TemporaryFile(mode="w+") as requests:
            json.dump([{"digest": key, "path": str(path)} for key, path in missing.items()], requests)
            requests.seek(0)
            failures = []
            with subprocess.Popen([binary, *arguments], stdin=requests, stdout=subprocess.PIPE, text=True) as process:
                completed = 0
                for line in process.stdout:
                    # Some macOS image decoders print diagnostics to stdout.
                    if not line.startswith("ENTITY_OCR "):
                        continue
                    result = json.loads(line[len("ENTITY_OCR "):])
                    digest = result.pop("digest")
                    completed += 1
                    if "error" in result:
                        failures.append(f"{missing[digest].name}: {result['error']}")
                    else:
                        with tempfile.NamedTemporaryFile(mode="w", dir=cache, delete=False) as tmp:
                            json.dump(result, tmp, separators=(",", ":"))
                        Path(tmp.name).replace(cache / (digest + ".json"))
                    if completed % 100 == 0:
                        print(f"OCR {completed}/{len(missing)}", flush=True)
                if process.wait() or completed != len(missing):
                    raise RuntimeError("Local Vision OCR failed. Completed measurements are cached.")
            if failures:
                raise RuntimeError("OCR incomplete:\n" + "\n".join(failures))


def full_frame_text(digest):
    return json.loads((CACHE / (digest + ".json")).read_text())["lines"] > 0


def scan(files):
    run_pass(files, CACHE, [])
    clear = {path: digest for path, digest in files.items() if not full_frame_text(digest)}
    run_pass(clear, CACHE / "detail", ["--detail"])


def includes_text(digest):
    return full_frame_text(digest) or json.loads((CACHE / "detail" / (digest + ".json")).read_text())["text"]


if __name__ == "__main__":
    media = ROOT / "media"
    source = Path(json.loads((media / "import-manifest.json").read_text())["source"])
    files = folder_images(source)
    for item in json.loads((media / "catalog.json").read_text())["items"]:
        if item["type"] == "image":
            files[ROOT / item["path"]] = item["sha256"]
    print(f"Checking {len(set(files.values()))} distinct still images", flush=True)
    scan(files)
    print("Local OCR complete", flush=True)
