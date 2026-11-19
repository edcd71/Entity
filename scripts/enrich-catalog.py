"""Merge ExifTool's read-only extraction into the normalized catalog."""
import json, sys
from pathlib import Path
from datetime import datetime, timezone
root=Path(__file__).resolve().parent.parent
records=json.loads(Path(sys.argv[1]).read_text())
by_path={r['SourceFile']:r for r in records}
path=root/'media/catalog.json'
catalog=json.loads(path.read_text())
items=catalog['items']
for item in items:
    raw=by_path.get(item['path'],{})
    def set_field(field,*keys):
        for key in keys:
            value=raw.get(key)
            if value is not None and value!='': item[field]=value; return
    set_field('camera','IFD0:Model','Keys:Model')
    set_field('make','IFD0:Make','Keys:Make')
    set_field('lens','ExifIFD:LensModel','VideoKeys:LensModel')
    set_field('iso','ExifIFD:ISO')
    set_field('aperture','ExifIFD:FNumber')
    set_field('exposure','ExifIFD:ExposureTime')
    set_field('focalLength','ExifIFD:FocalLength')
    set_field('focalLength35','ExifIFD:FocalLengthIn35mmFormat','VideoKeys:FocalLengthIn35mmFormat')
    set_field('contentIdentifier','Apple:ContentIdentifier','Keys:ContentIdentifier')
    set_field('timezone','ExifIFD:OffsetTimeOriginal')
    set_field('latitude','Composite:GPSLatitude')
    set_field('longitude','Composite:GPSLongitude')
    set_field('altitude','Composite:GPSAltitude')
    if raw.get('ExifIFD:DateTimeOriginal'):
        date=raw['ExifIFD:DateTimeOriginal']
        item['capturedAt']=date[:10].replace(':','-')+date[10:]
        item['dateSource']='EXIF DateTimeOriginal'
    elif raw.get('Keys:CreationDate'):
        date=raw['Keys:CreationDate']
        item['capturedAt']=date[:10].replace(':','-')+date[10:]
        item['dateSource']='QuickTime creationdate'
    preview=f'media/previews/{item["id"]}.jpg'
    if (root/preview).exists(): item['preview']=preview;item.pop('previewError',None)
    if raw and raw.get('File:ImageWidth'):
        item.pop('extractionError',None)
    metadata_path=root/item['metadataPath']
    metadata=json.loads(metadata_path.read_text()) if metadata_path.exists() else {}
    metadata['ExifTool']=raw
    metadata_path.write_text(json.dumps(metadata,ensure_ascii=False,separators=(',',':'))+'\n')
    for key in ['liveVideo','liveVideoId','isLiveCompanion']:item.pop(key,None)
# Multiple edits can share a Live Photo identifier. Never infer pairing from filenames.
videos={i['contentIdentifier']:i for i in items if i['type']=='video' and i.get('contentIdentifier')}
companion_ids=set()
for item in items:
    if item['type']=='image' and item.get('contentIdentifier') in videos:
        companion=videos[item['contentIdentifier']]
        item['liveVideo']=companion['path'];item['liveVideoId']=companion['id'];companion_ids.add(companion['id'])
for item in items:
    if item['id'] in companion_ids: item['isLiveCompanion']=True
catalog['generatedAt']=datetime.now(timezone.utc).isoformat()
catalog['extraction']=['Apple ImageIO','Apple AVFoundation','ExifTool']
temp=path.with_suffix('.tmp');temp.write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+'\n');temp.replace(path)
print(f'{len(items)} media records; {len(companion_ids)} paired video companions; {sum(bool(i.get("preview")) for i in items)} previews.')
