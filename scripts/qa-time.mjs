import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {captureMinute, matchesTime, formatTime, timeRangeLabel} from '../app/time-control.js';
import {hexToLab} from '../app/color-pad.js';

// Capture clocks are read as written, including when an offset is supplied.
for (const value of ['2024-11-03 22:35:17', '2024:11:03 22:35:17', '2024-11-03T22:35:17-08:00', '2024-11-03T22:35:17Z']) {
  assert.equal(captureMinute(value), 1355);
}
for (const value of [null, '', '2024-11-03', '2024-11-03 25:00:00', '2024-11-03 12:60:00']) assert.equal(captureMinute(value), null);
assert.equal(formatTime(0), '00:00');
assert.equal(formatTime(1439), '23:59');
assert.equal(matchesTime(null, null), true);
assert.equal(matchesTime(null, {start: 0, end: 0}), true);
assert.equal(matchesTime(null, {start: 420, end: 720}), false);
for (const [minute, expected] of [[419, false], [420, true], [600, true], [720, true], [721, false]]) {
  assert.equal(matchesTime(minute, {start: 420, end: 720}), expected);
}
for (const [minute, expected] of [[1319, false], [1320, true], [1439, true], [0, true], [360, true], [361, false]]) {
  assert.equal(matchesTime(minute, {start: 1320, end: 360}), expected);
}
assert.equal(timeRangeLabel({start: 1320, end: 360}), '22:00 to 06:00, across midnight');

const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--enable-unsafe-swiftshader']});
const url = 'http://127.0.0.1:4173/app/grid.html';
const settled = rail => rail.evaluate(el => Promise.allSettled(el.getAnimations({subtree: true}).map(a => a.finished)));
const names = page => page.locator('.photo img').evaluateAll(images => images.map(image => image.alt));
const minute = photo => Number(photo.capturedAt.slice(11, 13)) * 60 + Number(photo.capturedAt.slice(14, 16));
const inTime = (photos, start, end) => photos.filter(p => start === end || (start < end ? minute(p) >= start && minute(p) <= end : minute(p) >= start || minute(p) <= end));
async function open(page, selector) {
  const rail = page.locator(selector);
  const toggle = rail.locator('.rail-toggle');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.press('Enter');
  await settled(rail);
}
async function point(page, minute) {
  const r = await page.locator('.time-clock').boundingBox();
  const angle = minute / 1440 * Math.PI * 2;
  return {x: r.x + r.width / 2 + Math.sin(angle) * r.width * 82 / 240, y: r.y + r.height / 2 - Math.cos(angle) * r.width * 82 / 240};
}
async function drag(page, handle, value, beforeRelease) {
  const node = page.locator('.time-' + handle);
  await node.scrollIntoViewIfNeeded();
  const r = await node.boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  const target = await point(page, value);
  await page.mouse.move(target.x, target.y, {steps: 6});
  if (beforeRelease) await beforeRelease();
  await page.mouse.up();
  assert.equal(await node.getAttribute('aria-valuenow'), String(value));
}
async function observeSpring(rail, collapsed) {
  await rail.evaluate((el, collapsed) => {
    window.timeHeights = [];
    new MutationObserver((_, observer) => {
      if (el.classList.contains('collapsed') !== collapsed) return;
      observer.disconnect();
      const sample = () => {
        window.timeHeights.push(el.getBoundingClientRect().height);
        if (el.getAnimations().length) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }).observe(el, {attributes: true, attributeFilter: ['class']});
  }, collapsed);
}

try {
  await mkdir('.qa', {recursive: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {if (response.status() >= 400) errors.push(response.url());});
  await page.goto(url);
  await page.locator('.title-webgl[data-phase="settled"]').waitFor();
  const indexed = await (await page.request.get(new URL('/media/grid/index.json', url).href)).json();
  const photos = indexed.filter(photo => /^202[2-6]/.test(photo.capturedAt || ''));
  const rail = page.locator('.time-filter');
  const toggle = rail.locator('.rail-toggle');
  assert.deepEqual(await names(page), photos.map(p => p.name));
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await toggle.hover();
  await page.mouse.down();
  await page.waitForFunction(() => {
    const value = parseFloat(getComputedStyle(document.querySelector('.time-filter circle')).strokeDashoffset);
    return value > .2 && value < .8;
  });
  await page.mouse.up();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'Releasing early cancels opening');
  await observeSpring(rail, false);
  await page.mouse.down();
  await page.waitForFunction(() => document.querySelector('.time-filter .rail-toggle').ariaExpanded === 'true');
  await page.mouse.up();
  await settled(rail);
  let heights = await page.evaluate(() => window.timeHeights);
  assert.ok(Math.max(...heights) > heights.at(-1) + 2, 'Opening overshoots under Reduce Motion');
  await page.locator('.lead-card').screenshot({path: '.qa/time-card.png'});
  assert.equal(await page.locator('.time-summary').textContent(), 'All day');
  for (const key of ['start', 'end']) {
    await page.locator('.time-' + key).click();
    assert.equal(await page.locator('.time-' + key).getAttribute('aria-valuenow'), '0', 'Pressing either overlapping midnight handle must retain its value');
  }
  await drag(page, 'end', 720, async () => {
    assert.deepEqual(await names(page), photos.map(p => p.name), 'Dragging previews without rebuilding the grid');
  });
  await drag(page, 'start', 420);
  let expected = inTime(photos, 420, 720);
  assert.deepEqual(await names(page), expected.map(p => p.name));
  assert.ok(await page.locator('.photo img').evaluateAll(images => images.some(image => image.getAnimations().length)), 'Release triggers the tiling animation');
  await rail.screenshot({path: '.qa/time-day.png'});
  // Cancel an in-progress selection without applying the preview.
  await page.locator('.time-start').hover();
  await page.mouse.down();
  const canceled = await point(page, 600);
  await page.mouse.move(canceled.x, canceled.y, {steps: 4});
  await page.keyboard.press('Escape');
  await page.mouse.up();
  assert.equal(await page.locator('.time-start').getAttribute('aria-valuenow'), '420');
  assert.deepEqual(await names(page), expected.map(p => p.name));
  await drag(page, 'start', 1320);
  await drag(page, 'end', 360);
  expected = inTime(photos, 1320, 360);
  assert.ok(expected.length > 0 && expected.length < photos.length);
  assert.deepEqual(await names(page), expected.map(p => p.name));
  assert.equal(await page.locator('.time-summary').textContent(), 'Across midnight');
  await rail.screenshot({path: '.qa/time-night.png'});
  await page.locator('.time-start').press('End');
  await page.locator('.time-start').press('ArrowRight');
  assert.equal(await page.locator('.time-start').getAttribute('aria-valuenow'), '0');
  await page.locator('.time-start').press('Shift+ArrowUp');
  assert.equal(await page.locator('.time-start').getAttribute('aria-valuenow'), '15');
  await page.locator('.time-start').press('PageUp');
  assert.equal(await page.locator('.time-start').getAttribute('aria-valuenow'), '75');
  await page.locator('.time-reset').click();
  assert.deepEqual(await names(page), photos.map(p => p.name));
  assert.equal(await rail.getAttribute('data-filtered'), null);
  await drag(page, 'start', 120);
  await drag(page, 'end', 300);
  assert.equal(await page.locator('.photo').count(), 0);
  assert.equal(await page.locator('#grid-status').textContent(), 'No images match these filters.');
  await page.locator('.time-reset').click();
  await drag(page, 'start', 420);
  await drag(page, 'end', 1080);
  await open(page, '.date-filter');
  await page.locator('.date-axis').press('Shift+ArrowUp');
  await page.locator('.date-axis').press('ArrowDown');
  await page.locator('.date-axis').press('ArrowDown');
  const dated = photos.filter(p => /^202[34]/.test(p.capturedAt));
  await open(page, '.location-filter');
  await page.locator('.location-search').fill('Seattle');
  const seattle = page.getByRole('radio', {name: 'Seattle area, Washington', exact: true});
  await seattle.check();
  const located = dated.filter(p => p.location?.label === 'Seattle area');
  expected = inTime(located, 420, 1080);
  assert.ok(expected.length > 0);
  assert.deepEqual(await names(page), expected.map(p => p.name));
  assert.equal(await seattle.getAttribute('aria-description'), `${expected.length} images in the selected date and time range`);
  await open(page, '.color-filter');
  await page.locator('.sample-hue').press('Home');
  await page.locator('.sample-field').press('Enter');
  const target = hexToLab(await page.locator('.sample-readout output').textContent());
  const rank = list => list.map(photo => ({photo, distance: Math.min(...photo.palette.map(c => Math.hypot(...hexToLab(c.hex).map((v, i) => v - target[i]))))})).sort((a, b) => a.distance - b.distance).map(x => x.photo.name);
  assert.deepEqual(await names(page), rank(expected));
  await page.locator('.time-reset').click();
  assert.deepEqual(await names(page), rank(located), 'Reset time preserves date, place, and color');
  await open(page, '.theme-filter');
  for (const mode of ['Light', 'Dark', 'Blue']) {
    await page.getByRole('radio', {name: mode, exact: true}).check();
    await settled(rail);
    assert.equal(await rail.evaluate(el => getComputedStyle(el).color), await page.locator('.lead-card').evaluate(el => getComputedStyle(el).color));
    await rail.screenshot({path: `.qa/time-${mode.toLowerCase()}.png`});
  }
  await rail.locator('.rail-grip').press('ArrowRight');
  assert.equal(await rail.getAttribute('popover'), 'manual');
  const grip = await rail.locator('.rail-grip').boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + 7);
  await page.mouse.down();
  await page.mouse.move(1438, 895, {steps: 8});
  await page.mouse.up();
  const bounds = await rail.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 1441 && bounds.y + bounds.height <= 901);
  await drag(page, 'end', 720);
  assert.deepEqual(await names(page), rank(inTime(located, 0, 720)));
  await observeSpring(rail, true);
  await toggle.press('Enter');
  await settled(rail);
  heights = await page.evaluate(() => window.timeHeights);
  assert.ok(Math.min(...heights) < heights.at(-1) - 1, 'Closing rebounds under Reduce Motion');
  assert.equal((await rail.boundingBox()).height, 48);
  assert.equal(await page.locator('#time-body').evaluate(el => el.inert), true);
  assert.deepEqual(errors, []);
  await page.close();

  for (const [width, height] of [[320, 700], [390, 844], [667, 375]]) {
    const mobile = await browser.newPage({viewport: {width, height}, isMobile: true, hasTouch: true});
    await mobile.goto(url);
    await mobile.locator('.title-webgl[data-phase="settled"]').waitFor();
    const shell = mobile.locator('.time-filter');
    const button = await shell.locator('.rail-toggle').boundingBox();
    const cdp = await mobile.context().newCDPSession(mobile);
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: button.x + button.width / 2, y: button.y + button.height / 2}]});
    await mobile.waitForFunction(() => document.querySelector('.time-filter .rail-toggle').ariaExpanded === 'true');
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    await settled(shell);
    await mobile.locator('.time-clock').scrollIntoViewIfNeeded();
    const before = await shell.boundingBox();
    const handle = await mobile.locator('.time-end').boundingBox();
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: handle.x + 22, y: handle.y + 22}]});
    for (const value of [90, 180, 270, 360]) {
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [await point(mobile, value)]});
    }
    assert.equal(await mobile.locator('.photo').count(), photos.length);
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    assert.deepEqual(await names(mobile), inTime(photos, 0, 360).map(p => p.name));
    assert.deepEqual(await shell.boundingBox(), before, 'Touching the clock must not drag its frame');
    assert.equal(await shell.getAttribute('popover'), null);
    await shell.screenshot({path: `.qa/time-${width}.png`});
    await mobile.locator('.time-reset').tap();
    assert.equal(await mobile.locator('.photo').count(), photos.length);
    const bounds = await shell.boundingBox();
    const card = await mobile.locator('.lead-card').boundingBox();
    assert.ok(bounds.x >= card.x && bounds.x + bounds.width <= card.x + card.width + 1);
    await mobile.close();
  }
  console.log('Verified time parsing, hold ring, opening/closing springs, two clock handles, midnight ranges, commit/cancel, keyboard, empty/reset states, combined filters, themes, dragging, and touch at 320/390/667px.');
} finally {await browser.close();}
