"""Sample preview colors. These are derived colors, not embedded camera metadata."""
import json, hashlib
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image
from photo_palette import sample_palette
root=Path(__file__).resolve().parent.parent
catalog=json.loads((root/'media/catalog.json').read_text())
output=root/'media/palettes.json'
old=json.loads(output.read_text()).get('items',{}) if output.exists() else {}
def extract(item):
    p=root/item['preview']
    stamp=f'{p.stat().st_mtime_ns}:{p.stat().st_size}'
    cached=old.get(item['id'])
    if cached and cached.get('stamp')==stamp:return item['id'],cached
    return item['id'],{'stamp':stamp,'palette':sample_palette(p),'source':'Generated preview' if item['type']=='image' else 'Generated first-frame preview'}
items={}
with ThreadPoolExecutor(max_workers=6) as pool:
    for i,future in enumerate(as_completed(pool.submit(extract,item) for item in catalog['items'] if item.get('preview')),1):
        key,value=future.result();items[key]=value
        if i%500==0:print(f'Color palettes: {i}',flush=True)
# Collection swatches derive from a combined sample of each image's quantized palette.
strips=Image.new('RGB',(100,max(1,len(items))))
for y,entry in enumerate(items.values()):
    x=0
    for color in entry['palette']:
        end=min(100,x+round(color['weight']*100))
        for px in range(x,end):strips.putpixel((px,y),tuple(bytes.fromhex(color['hex'][1:])))
        x=end
    if x<100:
        for px in range(x,100):strips.putpixel((px,y),tuple(bytes.fromhex(entry['palette'][-1]['hex'][1:])))
q=strips.quantize(colors=10,method=Image.Quantize.MEDIANCUT)
p=q.getpalette();collection=[]
for count,index in sorted(q.getcolors(),reverse=True):
    rgb=p[index*3:index*3+3];collection.append({'hex':'#'+''.join(f'{n:02X}' for n in rgb),'weight':round(count/(strips.width*strips.height),5)})
data={'method':'Median-cut quantization of generated JPEG previews; comparison uses CIE Lab distance (Delta E 76).','pantoneLibrary':False,'collection':collection,'items':items}
tmp=output.with_suffix('.tmp');tmp.write_text(json.dumps(data,separators=(',',':'))+'\n');tmp.replace(output)
print(f'Indexed palettes for {len(items)} media previews.',flush=True)
