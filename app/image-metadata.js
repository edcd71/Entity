function element(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function fields(entries) {
  const list = document.createElement('dl');
  for (const [key, value] of entries) {
    const text = typeof value === 'string' && value !== '' ? value : JSON.stringify(value, null, 2);
    list.append(element('dt', key), element('dd', text));
  }
  return list;
}

function overview(photo, tags, archive = {}) {
  const latitude = tags['Composite:GPSLatitude'] ?? archive.latitude;
  const longitude = tags['Composite:GPSLongitude'] ?? archive.longitude;
  const exposure = tags['ExifIFD:ExposureTime'] ?? archive.exposure;
  const inverse = 1 / exposure;
  const shutter = exposure > 0 && (exposure < 1 && Math.abs(inverse - Math.round(inverse)) < .01
    ? '1/' + Math.round(inverse) + ' s' : exposure + ' s');
  const aperture = tags['ExifIFD:FNumber'] ?? archive.aperture;
  const iso = tags['ExifIFD:ISO'] ?? archive.iso;
  return fields([
    ['File', photo.name],
    ['Captured', tags['Composite:SubSecDateTimeOriginal'] || tags['ExifIFD:DateTimeOriginal'] || photo.capturedAt],
    ['Camera', tags['IFD0:Model'] || archive.camera],
    ['Lens', tags['ExifIFD:LensModel'] || archive.lens],
    ['Exposure', [
      shutter,
      aperture && 'ƒ/' + aperture, iso && 'ISO ' + iso,
    ].filter(Boolean).join(' · ')],
    ['Dimensions', tags['Composite:ImageSize']?.toString().replace(/^(\d+)[ x](\d+)$/, '$1 × $2 px')],
    ['Coordinates', latitude != null && longitude != null ? latitude + ', ' + longitude : null],
  ].filter(([, value]) => value != null && value !== ''));
}

function section(title, entries) {
  const group = document.createElement('details');
  group.open = true;
  group.append(element('summary', title), fields(entries));
  return group;
}

function render(panel, photo, record) {
  const tags = record.ExifTool || {};
  const content = document.createDocumentFragment();
  content.append(overview(photo, tags, record.Archive));
  // Keep every group, duplicate-qualified tag, nested value, and binary descriptor.
  const groups = new Map();
  for (const [tag, value] of Object.entries(tags)) {
    const split = tag.indexOf(':');
    const group = split < 0 ? 'Source' : tag.slice(0, split);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push([tag.slice(split + 1), value]);
  }
  const captureGroups = ['ExifIFD', 'GPS', 'Apple', 'IFD0'];
  for (const group of new Set([...captureGroups, ...groups.keys()])) {
    if (groups.has(group)) content.append(section(group, groups.get(group)));
  }
  for (const [group, value] of Object.entries(record)) {
    if (group === 'ExifTool') continue;
    const entries = value && typeof value === 'object' ? Object.entries(value) : [[group, value]];
    content.append(section(group, entries));
  }
  panel.replaceChildren(content);
}

export function imageMetadata(panel) {
  let pending;
  function clear() {
    pending?.abort();
    panel.hidden = true;
    panel.replaceChildren();
  }
  async function show(photo, url = photo.metadataUrl) {
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    panel.hidden = false;
    panel.scrollTop = 0;
    const message = element('p', 'Loading metadata…');
    message.setAttribute('role', 'status');
    panel.replaceChildren(overview(photo, {}), message);
    try {
      if (!url) throw new Error('Missing metadata record');
      const response = await fetch(url, {signal: controller.signal});
      if (!response.ok) throw new Error('Metadata request failed');
      const record = await response.json();
      if (!controller.signal.aborted) {
        render(panel, photo, record);
        return record;
      }
    } catch {
      if (!controller.signal.aborted) message.textContent = 'The detailed metadata for this image is unavailable.';
    }
  }
  return {show, clear};
}
