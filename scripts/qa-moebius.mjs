import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {applyMoebiusEffect} from '../app/moebius-effect.js';

const source = Uint8ClampedArray.from({length: 32 * 32 * 4}, (_, i) => i % 4 === 3 ? 255 : (i * 17 + Math.floor(i / 24) * 23) % 256);
const original = source.slice();
const day = applyMoebiusEffect(source, 32, 32);
assert.deepEqual(source, original, 'The effect must not mutate its source');
assert.deepEqual(applyMoebiusEffect(source, 32, 32, {amount: 0}), source);
assert.deepEqual(applyMoebiusEffect(source, 32, 32), day, 'Grain is deterministic');
assert.notDeepEqual(day, source);
assert.notDeepEqual(day, applyMoebiusEffect(source, 32, 32, {palette: 'cosmic'}));
assert.notDeepEqual(applyMoebiusEffect(source, 32, 32, {lines: 0}), applyMoebiusEffect(source, 32, 32, {lines: 100}));
for (let i = 3; i < day.length; i += 4) assert.equal(day[i], source[i]);

const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--enable-unsafe-swiftshader']});
const url = 'http://127.0.0.1:4173/app/grid.html';
const settled = rail => rail.evaluate(el => Promise.allSettled(el.getAnimations({subtree: true}).map(a => a.finished)));
async function open(page, selector) {
  const rail = page.locator(selector);
  if (await rail.locator('.rail-toggle').getAttribute('aria-expanded') === 'false') await rail.locator('.rail-toggle').press('Enter');
  await settled(rail);
}
async function ready(page, pixel = false) {
  await page.waitForFunction(pixel => {
    const images = [...document.querySelectorAll('.photo img')].filter(img => {const r = img.getBoundingClientRect(); const grid = document.querySelector('#photos').getBoundingClientRect(); return r.right > grid.left && r.left < grid.right;});
    return images.length > 0 && images.every(img => img.dataset.moebius === 'true' && (img.dataset.pixelArt === 'true') === pixel && img.complete && img.naturalWidth);
  }, pixel);
}
async function changed(page, action) {
  const before = await page.locator('.photo img').first().getAttribute('src');
  await action();
  await page.waitForFunction(src => document.querySelector('.photo img')?.src !== src && document.querySelector('.photo img').complete, before);
}
async function spring(page, collapsed) {
  await page.locator('.moebius-filter').evaluate((rail, collapsed) => {
    window.moebiusHeights = [];
    new MutationObserver((_, observer) => {
      if (rail.classList.contains('collapsed') !== collapsed) return;
      observer.disconnect();
      const sample = () => {window.moebiusHeights.push(rail.getBoundingClientRect().height); if (rail.getAnimations().length) requestAnimationFrame(sample);};
      requestAnimationFrame(sample);
    }).observe(rail, {attributes: true, attributeFilter: ['class']});
  }, collapsed);
}
try {
  await mkdir('.qa', {recursive: true});
  const context = await browser.newContext({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
  const page = await context.newPage();
  const errors = [], workers = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
  page.on('response', response => {if (response.status() >= 400) errors.push(response.url());});
  page.on('worker', worker => workers.push(worker.url()));
  await page.goto(url); await page.locator('.title-webgl[data-phase="settled"]').waitFor();
  const count = await page.locator('.photo').count();
  const sources = await page.locator('.photo img').evaluateAll(images => images.map(img => img.src));
  assert.equal(await page.locator('.control-dock > fieldset').count(), 10);
  const rail = page.locator('.moebius-filter'), toggle = rail.locator('.rail-toggle');
  await toggle.click(); assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await toggle.hover(); await page.mouse.down();
  await page.waitForFunction(() => {const n = parseFloat(getComputedStyle(document.querySelector('.moebius-filter circle')).strokeDashoffset); return n > .2 && n < .8;});
  await page.mouse.up(); assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await spring(page, false);
  await page.mouse.down(); await page.waitForFunction(() => document.querySelector('.moebius-filter .rail-toggle').ariaExpanded === 'true');
  await page.mouse.up(); await settled(rail);
  let heights = await page.evaluate(() => window.moebiusHeights);
  assert.ok(Math.max(...heights) > heights.at(-1) + 2);
  await page.screenshot({path: '.qa/moebius-original.png'});
  await page.getByRole('radio', {name: 'Moebius on', exact: true}).check(); await ready(page);
  assert.ok(workers.some(url => url.endsWith('/app/effect-worker.js')));
  assert.equal(await page.locator('.photo').count(), count);
  await page.screenshot({path: '.qa/moebius-desert.png'});
  await rail.screenshot({path: '.qa/moebius-control.png'});
  const desertSources = await page.locator('.photo img').evaluateAll(images => images.filter(img => {const r = img.getBoundingClientRect(); const grid = document.querySelector('#photos').getBoundingClientRect(); return r.right > grid.left && r.left < grid.right;}).map(img => ({name: img.alt, src: img.src})));
  await changed(page, () => page.getByRole('radio', {name: 'Cosmic palette', exact: true}).check());
  await page.waitForFunction(before => before.every(({name, src}) => {const img = [...document.querySelectorAll('.photo img')].find(img => img.alt === name); return img && img.src !== src && img.complete;}), desertSources);
  await page.screenshot({path: '.qa/moebius-cosmic.png'});
  await changed(page, () => page.locator('#moebius-lines').press('End'));
  await changed(page, () => page.locator('#moebius-amount').press('Home'));
  await changed(page, () => page.locator('#moebius-amount').press('End'));
  // Rapid parameter changes and disabling must not permit an old worker result to win.
  await page.locator('#moebius-amount').evaluate(input => {for (const value of [5, 95, 20, 80]) {input.value = value; input.dispatchEvent(new Event('input', {bubbles: true}));}});
  await page.getByRole('radio', {name: 'Moebius off', exact: true}).check();
  await page.waitForTimeout(250);
  assert.deepEqual(await page.locator('.photo img').evaluateAll(images => images.map(img => img.src)), sources);
  await page.getByRole('radio', {name: 'Moebius on', exact: true}).check(); await ready(page);
  await open(page, '.pixel-filter');
  await page.getByRole('radio', {name: 'Pixel art', exact: true}).check(); await ready(page, true);
  await page.screenshot({path: '.qa/moebius-with-pixel.png'});
  // Each layer remains independent, with a consistent Mead -> Moebius -> Pixel order.
  await open(page, '.mead-filter');
  await page.getByRole('radio', {name: 'Syd Mead on', exact: true}).check();
  await page.waitForFunction(() => {const img = document.querySelector('.photo img'); return img.dataset.mead === 'true' && img.dataset.moebius === 'true' && img.dataset.pixelArt === 'true';});
  await page.locator('.photo').first().click();
  await page.waitForFunction(() => document.querySelector('#full-photo').dataset.mead === 'true');
  await page.keyboard.press('Escape');
  await page.getByRole('radio', {name: 'Syd Mead off', exact: true}).check();
  await page.waitForFunction(() => {const img = document.querySelector('.photo img'); return !img.dataset.mead && img.dataset.moebius === 'true' && img.dataset.pixelArt === 'true';});

  await page.getByRole('radio', {name: 'Moebius off', exact: true}).check();
  await page.waitForFunction(() => document.querySelector('.photo img').dataset.pixelArt === 'true' && !document.querySelector('.photo img').hasAttribute('data-moebius'));
  await page.getByRole('radio', {name: 'Moebius on', exact: true}).check(); await ready(page, true);
  await page.getByRole('radio', {name: 'Original', exact: true}).check(); await ready(page);
  // Normal texture filtering is retained for the painted images during hover.
  await page.locator('.photo').nth(18).hover();
  await page.waitForFunction(() => document.querySelectorAll('.three-hover').length > 0);
  assert.equal(await page.locator('.three-hover img:not([data-moebius])').count(), 0);
  await page.mouse.wheel(0, 700);
  await page.waitForFunction(() => document.querySelector('#photos').scrollLeft > 100);
  assert.equal(await page.locator('.three-hover').count(), 0);
  await ready(page);
  assert.ok(await page.locator('.photo img[data-moebius]').count() < count);
  await page.locator('#photos').evaluate(grid => grid.scrollLeft = 0);
  await open(page, '.date-filter'); await page.locator('.date-axis').press('PageDown'); await ready(page);
  assert.ok(await page.locator('.photo').count() < count);
  await page.locator('.date-axis').press('PageUp'); await ready(page);
  await page.locator('.photo').first().click(); await page.locator('#full-photo').evaluate(img => img.decode());
  assert.ok((await page.locator('#full-photo').getAttribute('src')).startsWith('/media/'));
  assert.equal(await page.locator('#full-photo').getAttribute('data-moebius'), null);
  await page.keyboard.press('Escape'); await page.waitForFunction(() => document.activeElement.matches('.photo'));
  await open(page, '.theme-filter');
  for (const mode of ['Light', 'Dark', 'Blue']) {
    await page.getByRole('radio', {name: mode, exact: true}).check();
    assert.equal(await rail.evaluate(el => getComputedStyle(el).color), await page.locator('.lead-card').evaluate(el => getComputedStyle(el).color));
  }
  await rail.locator('.rail-grip').press('ArrowRight');
  assert.equal(await rail.getAttribute('popover'), 'manual');
  await rail.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); await settled(rail);
  await spring(page, true); await toggle.press('Enter'); await settled(rail);
  heights = await page.evaluate(() => window.moebiusHeights);
  assert.ok(Math.min(...heights) < heights.at(-1) - .5);
  await page.reload(); await ready(page); await open(page, '.moebius-filter');
  assert.equal(await page.getByRole('radio', {name: 'Cosmic palette', exact: true}).isChecked(), true);
  const sibling = await page.context().newPage(); await sibling.goto(url); await ready(sibling);
  await page.getByRole('radio', {name: 'Moebius off', exact: true}).check();
  await sibling.waitForFunction(() => !document.querySelector('#photos').hasAttribute('data-moebius'));
  assert.deepEqual(await page.locator('.photo img').evaluateAll(images => images.map(img => img.src)), sources);
  assert.deepEqual(errors, []);
  await sibling.close(); await page.close();
  for (const [width, height] of [[320, 700], [390, 844], [667, 375]]) {
    const mobile = await browser.newPage({viewport: {width, height}, isMobile: true, hasTouch: true});
    if (width === 320) await mobile.addInitScript(() => {window.Worker = class {constructor() {throw new Error('Worker unavailable for fallback check');}};});
    await mobile.goto(url); await mobile.locator('.photo').first().waitFor();
    const shell = mobile.locator('.moebius-filter'); await shell.locator('.rail-toggle').scrollIntoViewIfNeeded();
    const box = await shell.locator('.rail-toggle').boundingBox();
    const cdp = await mobile.context().newCDPSession(mobile);
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: box.x + 12, y: box.y + 12}]});
    await mobile.waitForFunction(() => document.querySelector('.moebius-filter .rail-toggle').ariaExpanded === 'true');
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []}); await settled(shell);
    await mobile.getByRole('radio', {name: 'Moebius on', exact: true}).check(); await ready(mobile);
    const frame = await shell.boundingBox(), card = await mobile.locator('.workspace-controls').boundingBox();
    assert.ok(frame.x >= card.x && frame.x + frame.width <= card.x + card.width + 1);
    await shell.screenshot({path: `.qa/moebius-${width}.png`});
    await mobile.locator('#photos').evaluate(grid => grid.scrollLeft = 600); await ready(mobile);
    await mobile.screenshot({path: `.qa/moebius-grid-${width}.png`});
    await mobile.getByRole('radio', {name: 'Moebius off', exact: true}).check();
    await mobile.close();
  }
  console.log('Verified Moebius rendering, worker/fallback, strength/lines/palettes, effect layering, stale-work cancellation, filters, hover/scrolling, grid-only detail scope, persistence/sync, springs, dragging, themes, and mobile touch.');
} finally {await browser.close();}
