"""Generate compatible previews without modifying original HEIC files."""
import json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image, ImageOps
import pillow_heif
pillow_heif.register_heif_opener()
root = Path(__file__).resolve().parent.parent
catalog = json.loads((root/'media/catalog.json').read_text())
items = [i for i in catalog['items'] if i['type'] == 'image' and (i['format'] == 'HEIC' or not (root/f'media/previews/{i["id"]}.jpg').exists())]
def process(item):
    output = root/f'media/previews/{item["id"]}.jpg'
    try:
        with Image.open(root/item['path']) as source:
            source.draft('RGB', (1000, 1000))
            image = ImageOps.exif_transpose(source)
            image.thumbnail((1000, 1000))
            image.convert('RGB').save(output, 'JPEG', quality=83, optimize=True)
        return None
    except Exception as exc:
        return {'name': item['name'], 'error': str(exc)}
errors=[]
with ThreadPoolExecutor(max_workers=4) as pool:
    for i,future in enumerate(as_completed(pool.submit(process,item) for item in items),1):
        error = future.result()
        if error: errors.append(error)
        if i%100==0: print(f'HEIC previews: {i}/{len(items)}',flush=True)
(root/'media/preview-errors.json').write_text(json.dumps(errors,indent=2)+'\n')
print(f'Completed {len(items)} previews, {len(errors)} errors.',flush=True)
