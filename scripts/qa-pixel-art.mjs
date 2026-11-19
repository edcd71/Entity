import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {quantizePixels} from '../app/pixel-art.js';

const gradient = Uint8ClampedArray.from({length: 1024 * 4}, (_, i) => i % 4 === 3 ? 255 : (i * 29 + Math.floor(i / 16) * 7) % 256);
for (const limit of [8, 16, 32]) {
  const pixels = quantizePixels(gradient.slice(), limit);
  const colors = new Set();
  for (let i = 0; i < pixels.length; i += 4) {colors.add(pixels.slice(i, i + 3).join(',')); assert.equal(pixels[i + 3], 255);}
  assert.ok(colors.size <= limit && colors.size > 1);
}
const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--enable-unsafe-swiftshader']});
const url = 'http://127.0.0.1:4173/app/grid.html';
const settled = rail => rail.evaluate(el => Promise.allSettled(el.getAnimations({subtree: true}).map(a => a.finished)));
async function open(page, selector) {
  const rail = page.locator(selector);
  if (await rail.locator('.rail-toggle').getAttribute('aria-expanded') === 'false') await rail.locator('.rail-toggle').press('Enter');
  await settled(rail);
}
async function ready(page) {
  await page.waitForFunction(() => {
    const visible = [...document.querySelectorAll('.photo img')].filter(img => {const r = img.getBoundingClientRect(); const grid = document.querySelector('#photos').getBoundingClientRect(); return r.right > grid.left && r.left < grid.right;});
    return visible.length > 0 && visible.every(img => img.dataset.pixelArt === 'true' && img.complete && img.naturalWidth);
  });
}
async function bitmap(image) {
  return image.evaluate(img => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    for (let i = 0; i < pixels.length; i += 4) colors.add(pixels.slice(i, i + 3).join(','));
    return {width: canvas.width, height: canvas.height, colors: colors.size, src: img.src, rendering: getComputedStyle(img).imageRendering};
  });
}
async function spring(page, collapsed) {
  await page.locator('.pixel-filter').evaluate((rail, collapsed) => {
    window.pixelHeights = [];
    new MutationObserver((_, observer) => {
      if (rail.classList.contains('collapsed') !== collapsed) return;
      observer.disconnect();
      const sample = () => {window.pixelHeights.push(rail.getBoundingClientRect().height); if (rail.getAnimations().length) requestAnimationFrame(sample);};
      requestAnimationFrame(sample);
    }).observe(rail, {attributes: true, attributeFilter: ['class']});
  }, collapsed);
}
try {
  await mkdir('.qa', {recursive: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
  page.on('response', response => {if (response.status() >= 400) errors.push(response.url());});
  await page.goto(url);
  await page.locator('.title-webgl[data-phase="settled"]').waitFor();
  assert.equal(await page.locator('.control-dock > fieldset').count(), 10);
  const count = await page.locator('.photo').count();
  const originalSources = await page.locator('.photo img').evaluateAll(images => images.map(img => img.src));
  const rail = page.locator('.pixel-filter'), toggle = rail.locator('.rail-toggle');
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await toggle.hover(); await page.mouse.down();
  await page.waitForFunction(() => {const v = parseFloat(getComputedStyle(document.querySelector('.pixel-filter circle')).strokeDashoffset); return v > .2 && v < .8;});
  await page.mouse.up();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await spring(page, false);
  await page.mouse.down();
  await page.waitForFunction(() => document.querySelector('.pixel-filter .rail-toggle').ariaExpanded === 'true');
  await page.mouse.up(); await settled(rail);
  let heights = await page.evaluate(() => window.pixelHeights);
  assert.ok(Math.max(...heights) > heights.at(-1) + 2, 'Opening uses the shared spring');
  assert.equal(await page.locator('.pixel-size').isDisabled(), true);
  await page.getByRole('radio', {name: 'Pixel art', exact: true}).check();
  await ready(page);
  const image = page.locator('.photo img').first();
  const initial = await bitmap(image);
  assert.ok(initial.colors <= 16 && initial.width < 50);
  assert.equal(initial.rendering, 'pixelated');
  assert.equal(await page.locator('.photo').count(), count);
  await page.screenshot({path: '.qa/pixel-art-grid.png'});
  await rail.screenshot({path: '.qa/pixel-art-control.png'});
  await page.locator('.pixel-size').press('End');
  await page.waitForFunction(src => document.querySelector('.photo img').src !== src, initial.src);
  await image.evaluate(img => img.decode());
  assert.ok((await bitmap(image)).width < initial.width);
  await page.getByRole('radio', {name: '8 colors', exact: true}).check();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('entity-pixel-art')).colors === 8);
  // Wait for the new palette, not merely the control's state.
  await page.waitForFunction(() => {
    const img = document.querySelector('.photo img'); if (!img.complete) return false;
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0); const p = ctx.getImageData(0, 0, c.width, c.height).data;
    const colors = new Set(); for (let i = 0; i < p.length; i += 4) colors.add(p.slice(i, i + 3).join(','));
    return colors.size <= 8;
  });
  // Hover retains the block treatment; scrolling still clears its lifted tiles.
  await page.locator('.photo').nth(18).hover();
  await page.waitForFunction(() => document.querySelectorAll('.three-hover').length > 0);
  assert.equal(await page.locator('.three-hover img:not([data-pixel-art])').count(), 0);
  await page.screenshot({path: '.qa/pixel-art-hover.png'});
  await page.mouse.wheel(0, 700);
  await page.waitForFunction(() => document.querySelector('#photos').scrollLeft > 100);
  assert.equal(await page.locator('.three-hover').count(), 0);
  await ready(page);
  // Newly exposed columns convert lazily, and offscreen work remains bounded.
  assert.ok(await page.locator('.photo img[data-pixel-art]').count() < count);
  await page.locator('#photos').evaluate(grid => grid.scrollLeft = 0);
  await open(page, '.date-filter');
  await page.locator('.date-axis').press('PageDown');
  await ready(page);
  assert.ok(await page.locator('.photo').count() < count);
  await page.locator('.date-axis').press('PageUp');
  await ready(page);
  await page.locator('.photo').first().click();
  await page.locator('#full-photo').evaluate(img => img.decode());
  assert.ok((await page.locator('#full-photo').getAttribute('src')).startsWith('/media/'));
  assert.equal(await page.locator('#full-photo').getAttribute('data-pixel-art'), null);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement.matches('.photo'));
  await open(page, '.theme-filter');
  for (const mode of ['Light', 'Dark', 'Blue']) {
    await page.getByRole('radio', {name: mode, exact: true}).check();
    assert.equal(await rail.evaluate(el => getComputedStyle(el).color), await page.locator('.lead-card').evaluate(el => getComputedStyle(el).color));
  }
  await rail.locator('.rail-grip').press('ArrowRight');
  assert.equal(await rail.getAttribute('popover'), 'manual');
  await rail.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await settled(rail);
  await spring(page, true);
  await toggle.press('Enter'); await settled(rail);
  heights = await page.evaluate(() => window.pixelHeights);
  assert.ok(Math.min(...heights) < heights.at(-1) - .5, 'Closing rebounds: ' + JSON.stringify(heights));
  await page.reload(); await ready(page);
  await open(page, '.pixel-filter');
  assert.equal(await page.getByRole('radio', {name: 'Pixel art', exact: true}).isChecked(), true);
  assert.equal(await page.locator('.pixel-size').inputValue(), '16');
  await page.getByRole('radio', {name: 'Original', exact: true}).check();
  assert.equal(await page.locator('.photo img[data-pixel-art]').count(), 0);
  assert.deepEqual(await page.locator('.photo img').evaluateAll(images => images.map(img => img.src)), originalSources);
  assert.deepEqual(errors, []);
  await page.close();
  for (const [width, height] of [[320, 700], [390, 844], [667, 375]]) {
    const mobile = await browser.newPage({viewport: {width, height}, isMobile: true, hasTouch: true});
    await mobile.goto(url); await mobile.locator('.photo').first().waitFor();
    const shell = mobile.locator('.pixel-filter');
    await shell.locator('.rail-toggle').scrollIntoViewIfNeeded();
    const bounds = await shell.locator('.rail-toggle').boundingBox();
    const cdp = await mobile.context().newCDPSession(mobile);
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: bounds.x + 12, y: bounds.y + 12}]});
    await mobile.waitForFunction(() => document.querySelector('.pixel-filter .rail-toggle').ariaExpanded === 'true');
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    await settled(shell);
    await mobile.getByRole('radio', {name: 'Pixel art', exact: true}).check();
    await ready(mobile);
    const frame = await shell.boundingBox(), card = await mobile.locator('.workspace-controls').boundingBox();
    assert.ok(frame.x >= card.x && frame.x + frame.width <= card.x + card.width + 1);
    await shell.screenshot({path: `.qa/pixel-art-${width}.png`});
    await mobile.getByRole('radio', {name: 'Original', exact: true}).check();
    await mobile.close();
  }
  console.log('Verified pixel palettes, global toggle, size, lazy scrolling, hover, filtering, original detail, themes, persistence, restore, hold ring, springs, dragging, and mobile layouts.');
} finally {await browser.close();}
