import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildMoments, captureStamp, distanceKm} from '../app/moments.js';

const point = (latitude, longitude = 0) => ({latitude, longitude});
const photo = (name, date, coordinates = point(0), place = 'place') => ({name, capturedAt: date, coordinates, location: place ? {id: place, label: place + ' area'} : null});
const ids = groups => groups.map(group => group.photos.map(p => p.name));
assert.equal(captureStamp('2024-02-29 23:59:59'), Date.UTC(2024, 1, 29, 23, 59, 59));
assert.equal(captureStamp('2024-02-29T23:59:59-08:00'), captureStamp('2024:02:29 23:59:59'));
for (const value of [null, '', '2024-02-29', '2023-02-29 12:00:00', '2024-13-01 12:00:00', '2024-02-29 24:00:00', '2024-02-29 12:60:00']) assert.equal(captureStamp(value), null);
assert.equal(distanceKm(point(0), point(0)), 0);
assert.ok(distanceKm(point(0, 179.99), point(0, -179.99)) < 3, 'Handle the date line');

// Time gap, midnight crossing, nearby places across town boundaries, and far
// places with the same town label. Input order must not change membership.
const day = '2024-11-07';
const sample = [
  photo('a', day + ' 23:00:00'),
  photo('b', '2024-11-08 00:30:00', point(.01), 'other-town'),
  photo('c', '2024-11-08 02:30:01', point(.01)),
  photo('d', '2024-11-08 02:40:00', point(1)),
];
assert.deepEqual(ids(buildMoments(sample)), [['a', 'b'], ['c'], ['d']]);
assert.deepEqual(ids(buildMoments([...sample].reverse())), [['a', 'b'], ['c'], ['d']]);
const bounded = [0, 1, 2].map((n) => photo(String(n), day + ` 1${n}:00:00`, point(n * .03)));
assert.deepEqual(ids(buildMoments(bounded)), [['0', '1'], ['2']], 'A chain of nearby photos must not drift beyond 5 km from its first location');
const longDay = [0, 2, 4, 6, 8, 10].map(n => photo(String(n), day + ` ${String(n).padStart(2, '0')}:00:00`));
assert.deepEqual(ids(buildMoments(longDay)), [['0', '2', '4', '6', '8'], ['10']], 'Cap a moment at eight hours');
assert.deepEqual(ids(buildMoments([
  photo('unknown-a', day + ' 10:00:00', null, null),
  photo('unknown-b', day + ' 10:30:00', null, null),
  photo('unknown-c', day + ' 11:01:00', null, null),
  photo('located', day + ' 11:02:00'),
  photo('unknown-d', day + ' 11:03:00', null, null),
])), [['unknown-a', 'unknown-b'], ['unknown-c'], ['located'], ['unknown-d']]);
assert.deepEqual(ids(buildMoments([
  photo('named-a', day + ' 10:00:00', null, 'written-city'),
  photo('named-b', day + ' 11:00:00', null, 'written-city'),
  photo('named-c', day + ' 11:01:00', null, 'other-city'),
])), [['named-a', 'named-b'], ['named-c']]);
assert.deepEqual(ids(buildMoments([photo('unknown-date-a', null), photo('unknown-date-b', null)])), [['unknown-date-a'], ['unknown-date-b']]);
assert.equal(buildMoments([photo('unknown', day + ' 10:00:00', null, null)])[0].place, 'Location unavailable');
assert.equal(buildMoments([photo('missing-clock', '2024-11-07')])[0].time, 'Time unavailable');

const photos = JSON.parse(await readFile(new URL('../media/grid/index.json', import.meta.url))).filter(p => /^202[2-6]/.test(p.capturedAt || ''));
const moments = buildMoments(photos);
assert.deepEqual(moments.flatMap(m => m.photos).map(p => p.name).sort(), photos.map(p => p.name).sort(), 'Every eligible photo appears exactly once');
assert.equal(new Set(moments.map(m => m.id)).size, moments.length);
for (const moment of moments) {
  assert.ok(moment.end - moment.start <= 8 * 3600000);
  if (moment.anchor) for (const p of moment.photos) if (p.coordinates) assert.ok(distanceKm(moment.anchor, p.coordinates) <= 5);
}
console.log(`Verified automatic grouping boundaries, midnight, GPS distance, missing metadata, stable ordering, and ${photos.length} photos in ${moments.length} moments.`);
