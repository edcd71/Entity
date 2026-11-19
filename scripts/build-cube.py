"""Build six overview texture atlases from retained photos and all videos."""
import hashlib, io, json, math
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from tempfile import NamedTemporaryFile
from PIL import Image, ImageOps
from photo_metadata import load_palettes, save_metadata, source_tags
from image_text import includes_text, scan
root=Path(__file__).resolve().parent.parent
catalog=json.loads((root/'media/catalog.json').read_text())
still_images={root/item['path']:item['sha256'] for item in catalog['items'] if item['type']=='image'}
scan(still_images)
items=sorted((item for item in catalog['items'] if item['type']!='image' or not includes_text(item['sha256'])),
             key=lambda item:(item.get('capturedAt') or '9999',item['name']))
output=root/'media/cube';output.mkdir(exist_ok=True)
per_face=math.ceil(len(items)/6);columns=max(1,math.ceil(math.sqrt(per_face)));rows=max(1,math.ceil(per_face/columns))
cell=96;gap=1
palettes=load_palettes(root)
photos={root/item['path']:item for item in items if item['type']=='image'}
for path,tags in source_tags(root,list(photos)):
    item=photos[path]
    item['metadataUrl']=save_metadata(root,tags,item['sha256'],item,palettes)
keys=['id','name','type','path','preview','width','height','capturedAt','duration','metadataUrl']
def build(face):
    group=items[face*per_face:(face+1)*per_face]
    atlas=Image.new('RGB',(columns*cell,rows*cell),'#050505')
    for index,item in enumerate(group):
        x=(index%columns)*cell;y=(index//columns)*cell
        with Image.open(root/item['preview']) as image:
            thumb=ImageOps.fit(image.convert('RGB'),(cell-gap*2,cell-gap*2),method=Image.Resampling.LANCZOS)
            atlas.paste(thumb,(x+gap,y+gap))
    data=io.BytesIO()
    atlas.save(data,'JPEG',quality=91,optimize=True)
    path=output/f"face-{face}-{hashlib.sha256(data.getvalue()).hexdigest()[:16]}.jpg"
    if not path.exists():
        with NamedTemporaryFile(dir=output,delete=False) as temp:
            temp.write(data.getvalue())
        Path(temp.name).replace(path)
    return {'atlas':path.relative_to(root).as_posix(),'items':[{key:item[key] for key in keys if key in item} for item in group]}
with ThreadPoolExecutor(max_workers=6) as pool:faces=list(pool.map(build,range(6)))
index={'total':len(items),'images':sum(i['type']=='image' for i in items),'videos':sum(i['type']=='video' for i in items),'columns':columns,'rows':rows,'cellPixels':cell,'gapPixels':gap,'faces':faces}
assert sum(len(face['items']) for face in faces)==len(items)
assert len({item['id'] for face in faces for item in face['items']})==len(items)
with NamedTemporaryFile(mode='w',dir=output,delete=False) as temp:
    json.dump(index,temp,separators=(',',':'))
Path(temp.name).replace(output/'index.json')
print(f'Built six cube faces: {len(items)} media tiles, {columns} × {rows} per face.')
