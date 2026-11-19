"""Index the still images directly inside the selected Desktop folder."""
import base64
import json
import sys
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import quote

from PIL import ExifTags, Image, ImageOps
import pillow_heif
from photo_metadata import load_palettes, save_metadata, source_tags
from photo_palette import sample_palette
from image_text import folder_images, includes_text, scan
from photo_locations import enrich_locations

pillow_heif.register_heif_opener()
root = Path(__file__).resolve().parent.parent
media = root / "media"
source = (Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else
          Path(json.loads((media / "import-manifest.json").read_text())["source"]))
output = media / "grid"
palettes = load_palettes(root)
catalog = media / "catalog.json"
imported = {item["sha256"]: item for item in json.loads(catalog.read_text())["items"]
            if item["type"] == "image" and item.get("preview")} if catalog.exists() else {}


def save_preview(image, path, size):
    image.thumbnail((size, size), Image.Resampling.LANCZOS)
    if image.mode in ("RGBA", "LA") or "transparency" in image.info:
        rgba = image.convert("RGBA")
        matte = Image.new("RGB", image.size, "white")
        matte.paste(rgba, mask=rgba.getchannel("A"))
        image = matte
    with NamedTemporaryFile(dir=path.parent, delete=False) as temp:
        image.convert("RGB").save(temp, "JPEG", quality=85)
    Path(temp.name).replace(path)


def index_image(path, tags, key):
    entry = {"name": path.name}
    match = imported.get(key)
    entry["metadataUrl"] = save_metadata(root, tags, key, match, palettes)
    if path.suffix.lower() == ".svg":
        # Keep vectors in an image context, including when viewed at full size.
        entry["thumbnail"] = "data:image/svg+xml;base64," + base64.b64encode(path.read_bytes()).decode("ascii")
        return entry
    thumb = output / "thumbs" / (key + ".jpg")
    preview = output / "previews" / (key + ".jpg")
    if match and (root / match["preview"]).is_file():
        preview = root / match["preview"]
        date = match.get("capturedAt")
    else:
        with Image.open(path) as original:
            date = original.getexif().get_ifd(ExifTags.IFD.Exif).get(36867)
            if not preview.exists():
                save_preview(ImageOps.exif_transpose(original), preview, 1600)
    if not thumb.exists():
        with Image.open(preview) as image:
            save_preview(image, thumb, 480)
    if date:
        entry["capturedAt"] = date[:10].replace(":", "-") + date[10:]
    entry["thumbnail"] = "/" + thumb.relative_to(root).as_posix()
    indexed = palettes.get(match["id"], {}) if match else {}
    entry["palette"] = indexed.get("palette") or sample_palette(thumb)
    entry["preview"] = "/" + quote(preview.relative_to(root).as_posix())
    return entry


files = folder_images(source)
scan(files)
paths = [path for path, digest in files.items() if not includes_text(digest)]
(output / "thumbs").mkdir(parents=True, exist_ok=True)
(output / "previews").mkdir(exist_ok=True)
images = []
for path, tags in source_tags(root, paths):
    try:
        images.append(index_image(path, tags, files[path]))
    except Exception as error:
        raise RuntimeError(f"Could not index {path.name}") from error
    if len(images) % 250 == 0:
        print(f"Prepared {len(images)} images", flush=True)
images.sort(key=lambda image: (image.get("capturedAt") or "9999", image["name"].casefold()))
enrich_locations(root, images)
with NamedTemporaryFile(mode="w", dir=output, delete=False) as manifest:
    json.dump(images, manifest, ensure_ascii=False, separators=(",", ":"))
    manifest.write("\n")
Path(manifest.name).replace(output / "index.json")
print(f"Indexed {len(images)} images from {source}; omitted {len(files) - len(images)} with detected text.")
