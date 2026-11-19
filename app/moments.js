const hour = 3600000;

// Treat recorded camera times consistently with the time-of-day control. UTC
// here is only a stable arithmetic/formatting frame, not a timezone conversion.
export function captureStamp(value) {
  const match = typeof value === 'string' && value.match(/^(\d{4})[-:](\d{2})[-:](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/);
  if (!match) return null;
  const [year, month, day, h, m, s] = match.slice(1).map(value => Number(value || 0));
  if (month < 1 || month > 12 || day < 1 || h > 23 || m > 59 || s > 59) return null;
  const stamp = Date.UTC(year, month - 1, day, h, m, s);
  const date = new Date(stamp);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? stamp : null;
}

function coordinates(photo) {
  const point = photo.coordinates;
  return point && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 &&
    Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180 ? point : null;
}

export function distanceKm(a, b) {
  const rad = value => value * Math.PI / 180;
  const lat = rad(b.latitude - a.latitude), lon = rad(b.longitude - a.longitude);
  const h = Math.sin(lat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(lon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function buildMoments(photos) {
  const entries = photos.map(photo => ({photo, stamp: captureStamp(photo.capturedAt), point: coordinates(photo)}));
  entries.sort((a, b) => (a.stamp ?? Infinity) - (b.stamp ?? Infinity) || (a.photo.name || '').localeCompare(b.photo.name || ''));
  const groups = [];
  for (const entry of entries) {
    let group = groups.at(-1);
    const gap = group && entry.stamp !== null && group.end !== null ? entry.stamp - group.end : Infinity;
    let nearby = false;
    if (group && entry.stamp !== null && group.start !== null && gap <= 2 * hour && entry.stamp - group.start <= 8 * hour) {
      if (group.anchor && entry.point) nearby = distanceKm(group.anchor, entry.point) <= 5;
      else {
        const previousPlace = group.photos.at(-1).location?.id, nextPlace = entry.photo.location?.id;
        if (previousPlace && nextPlace) nearby = previousPlace === nextPlace;
        // Missing places never borrow a known location from their neighbours.
        else if (!previousPlace && !nextPlace && !group.anchor && !entry.point) nearby = gap <= hour / 2;
      }
    }
    if (!nearby) {
      group = {id: 'moment-' + (groups.length + 1), start: entry.stamp, end: entry.stamp, anchor: entry.point, photos: []};
      groups.push(group);
    }
    group.photos.push(entry.photo);
    group.end = entry.stamp;
    group.anchor ||= entry.point;
  }
  for (const group of groups) {
    const places = new Map();
    for (const photo of group.photos) {
      if (photo.location) {
        const {id, label} = photo.location;
        const place = places.get(id) || {label, count: 0};
        place.count++;
        places.set(id, place);
      }
    }
    group.place = [...places.values()].sort((a, b) => b.count - a.count)[0]?.label || (group.anchor ? 'Nearby photos' : 'Location unavailable');
    group.date = group.start === null ? group.photos[0].capturedAt?.slice(0, 10) || 'Date unavailable' : dateLabel(group.start, group.end);
    group.time = group.start === null ? 'Time unavailable' : clockLabel(group.start, group.end);
    group.label = group.place + ' · ' + group.date + ' · ' + group.time;
  }
  return groups;
}

const dates = new Intl.DateTimeFormat('en-US', {month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'});
const clocks = new Intl.DateTimeFormat('en-GB', {hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC'});
function dateLabel(start, end) { return dates.format(start) === dates.format(end) ? dates.format(start) : dates.formatRange(start, end); }
function clockLabel(start, end) { return clocks.format(start) === clocks.format(end) ? clocks.format(start) : clocks.format(start) + '–' + clocks.format(end); }

export function matchesMoment(photo, selection) { return !selection || photo.momentId === selection; }
