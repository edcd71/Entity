import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--enable-unsafe-swiftshader']});
const url = 'http://127.0.0.1:4173/app/grid.html';
const errors = [];
function watch(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => {if (msg.type() === 'error') errors.push(msg.text());});
  page.on('response', response => {if (response.status() >= 400) errors.push(response.url());});
}
const settled = locator => locator.evaluate(el => Promise.allSettled(el.getAnimations({subtree: true}).map(a => a.finished)));
async function ready(page) {
  await page.goto(url);
  await page.waitForFunction(() => document.querySelectorAll('.photo').length > 0 && !document.querySelector('.control-rail:disabled') && !document.documentElement.classList.contains('grid-loading'));
}
async function open(page, name, expanded = true) {
  const rail = page.locator(`.${name}-filter`), button = rail.locator('.rail-toggle');
  await button.scrollIntoViewIfNeeded();
  if ((await button.getAttribute('aria-expanded') === 'true') !== expanded) await button.press('Enter');
  await settled(rail);
  return rail;
}
async function dock(page, state) {
  await page.waitForFunction(state => document.querySelector('.workspace').dataset.cardState === state, state);
  await settled(page.locator('.workspace'));
}
async function painted(page) {
  await page.waitForFunction(() => {
    const grid = document.querySelector('#photos').getBoundingClientRect();
    const visible = [...document.querySelectorAll('.photo img')].filter(img => {const r = img.getBoundingClientRect(); return r.right > grid.left && r.left < grid.right;});
    return visible.length && visible.every(img => img.dataset.moebius === 'true' && img.complete);
  });
}
try {
  await mkdir('.qa', {recursive: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 900}}); watch(page);
  await ready(page); await page.locator('.title-webgl[data-phase="settled"]').waitFor();
  const surface = page.locator('.workspace-controls'), scroller = page.locator('.control-scroll'), grid = page.locator('#photos'), splitter = page.locator('.workspace-splitter');
  const geometry = () => page.evaluate(() => ['.lead-card', '.workspace-splitter', '.workspace-controls', '#photos'].map(s => document.querySelector(s).getBoundingClientRect().toJSON()));
  const initial = await geometry();
  assert.equal(initial[0].x, 0);
  for (let i = 1; i < initial.length; i++) assert.ok(Math.abs(initial[i].x - initial[i - 1].right) < 1);
  assert.equal(initial[3].right, 1440);
  assert.equal(await page.locator('.lead-card .control-rail').count(), 0);
  assert.equal(await surface.locator('.control-dock > fieldset').count(), 10);
  assert.equal(await grid.evaluate(el => getComputedStyle(el).gridTemplateRows.split(' ').length), 8);
  await page.screenshot({path: '.qa/workspace-open.png'});
  for (const name of ['date', 'time', 'color', 'location', 'moments', 'slideshow', 'pixel', 'mead', 'moebius', 'theme']) {
    const rail = await open(page, name);
    assert.equal(await rail.locator('.rail-body').evaluate(el => el.inert), false);
    const box = await rail.boundingBox(), frame = await surface.boundingBox();
    assert.ok(box.x >= frame.x && box.x + box.width <= frame.x + frame.width);
    await open(page, name, false);
  }
  // Opening/closing still overshoots its resting height with the shared spring.
  const date = page.locator('.date-filter');
  await date.locator('.rail-toggle').scrollIntoViewIfNeeded();
  await date.evaluate(rail => {
    window.heights = [];
    const observe = new MutationObserver(() => {
      observe.disconnect();
      const sample = () => {window.heights.push(rail.getBoundingClientRect().height); if (rail.getAnimations().length) requestAnimationFrame(sample);};
      requestAnimationFrame(sample);
    });
    observe.observe(rail, {attributes: true, attributeFilter: ['class']});
  });
  await open(page, 'date');
  const heights = await page.evaluate(() => window.heights);
  assert.ok(Math.max(...heights) > heights.at(-1) + 2);
  const total = await page.locator('.photo').count();
  await page.locator('.date-axis').press('PageDown');
  const filtered = await page.locator('.photo').count(); assert.ok(filtered < total);
  await open(page, 'moebius'); await page.getByRole('radio', {name: 'Moebius on', exact: true}).check(); await painted(page);
  await open(page, 'time'); await open(page, 'moments');
  assert.ok(await scroller.evaluate(el => el.scrollHeight > el.clientHeight));
  await scroller.evaluate(el => el.scrollTop = 0);
  const railBox = await surface.boundingBox();
  await page.mouse.move(railBox.x + 5, 380); await page.mouse.wheel(0, 450);
  await page.waitForFunction(() => document.querySelector('.control-scroll').scrollTop > 100);
  assert.equal(await grid.evaluate(el => el.scrollLeft), 0, 'Rail wheel must not scroll photos');
  const railScroll = await scroller.evaluate(el => el.scrollTop);
  const gridBox = await grid.boundingBox();
  await page.mouse.move(gridBox.x + 80, 420); await page.mouse.wheel(0, 420);
  await page.waitForFunction(() => document.querySelector('#photos').scrollLeft > 100);
  assert.equal(await scroller.evaluate(el => el.scrollTop), railScroll, 'Grid wheel must not scroll controls');
  assert.equal((await surface.boundingBox()).x, railBox.x);
  const gridScroll = await grid.evaluate(el => el.scrollLeft);
  await splitter.click(); await dock(page, 'docked');
  const snapped = await geometry();
  assert.equal(snapped[2].x, 0, 'Controls snap exactly to browser left');
  assert.ok(snapped[3].width > initial[3].width + 400);
  assert.equal(await page.locator('.photo').count(), filtered);
  assert.equal(await grid.evaluate(el => el.scrollLeft), gridScroll);
  assert.equal(await page.locator('.lead-card').evaluate(el => el.inert), true);
  await painted(page); await page.screenshot({path: '.qa/workspace-docked.png'});
  await splitter.click(); await dock(page, 'open');
  assert.ok(Math.abs((await geometry())[0].width - initial[0].width) < 1);
  // Pointer drag, cancellation, and keyboard resize all use the same splitter.
  let handle = await splitter.boundingBox();
  await page.mouse.move(handle.x + 6, 450); await page.mouse.down(); await page.mouse.move(30, 450, {steps: 10}); await page.mouse.up(); await dock(page, 'docked');
  await page.reload(); await page.waitForFunction(() => document.querySelectorAll('.photo').length > 0); await dock(page, 'docked');
  await splitter.press('End'); await dock(page, 'open');
  const width = Number(await splitter.getAttribute('aria-valuenow'));
  await splitter.press('ArrowRight'); await settled(page.locator('.workspace'));
  assert.equal(Number(await splitter.getAttribute('aria-valuenow')), width + 24);
  handle = await splitter.boundingBox();
  await page.mouse.move(handle.x + 6, 400); await page.mouse.down(); await page.mouse.move(handle.x - 100, 400);
  await page.keyboard.press('Escape'); await page.mouse.up();
  assert.equal(Number(await splitter.getAttribute('aria-valuenow')), width + 24);
  await splitter.press('Home'); await dock(page, 'docked');
  await page.setViewportSize({width: 667, height: 375}); await dock(page, 'docked');
  await page.setViewportSize({width: 1440, height: 900}); await dock(page, 'docked');
  // Full-size view and hover use the photo pane's new viewport.
  await grid.evaluate(el => el.scrollLeft = 0); await painted(page);
  await page.locator('.photo').first().hover();
  await page.waitForFunction(() => document.querySelector('.three-hover'));
  const canvas = await page.locator('.grid-hover').boundingBox(), photosBox = await grid.boundingBox();
  assert.equal(canvas.x, photosBox.x); assert.equal(canvas.width, photosBox.width);
  await page.mouse.wheel(0, 150); await page.waitForFunction(() => !document.querySelector('.three-hover'));
  await page.locator('.photo').first().click(); await page.locator('#full-photo').evaluate(img => img.decode());
  assert.ok(await page.locator('#photo-viewer').evaluate(el => el.open));
  await page.keyboard.press('Escape');
  const theme = await open(page, 'theme');
  for (const mode of ['Light', 'Dark', 'Blue']) {
    await page.getByRole('radio', {name: mode, exact: true}).check();
    assert.equal(await surface.evaluate(el => getComputedStyle(el).color), await theme.evaluate(el => getComputedStyle(el).color));
  }
  await open(page, 'pixel'); await page.locator('.pixel-filter .rail-grip').press('ArrowRight');
  assert.equal(await page.locator('.pixel-filter').getAttribute('popover'), 'manual');
  await page.close();
  for (const [width, height] of [[320, 700], [390, 844], [667, 375]]) {
    const mobile = await browser.newPage({viewport: {width, height}, isMobile: true, hasTouch: true, reducedMotion: 'reduce'}); watch(mobile);
    await ready(mobile); await dock(mobile, 'docked');
    assert.equal((await mobile.locator('.workspace-controls').boundingBox()).x, 0);
    assert.ok((await mobile.locator('#photos').boundingBox()).width > width - 110);
    const input = await mobile.context().newCDPSession(mobile);
    const swipe = async (x, y, dx, dy) => {
      await input.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]});
      for (let i = 1; i <= 8; i++) await input.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x + dx * i / 8, y: y + dy * i / 8}]});
      await input.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    };
    await open(mobile, 'date'); await open(mobile, 'time');
    await mobile.locator('.control-scroll').evaluate(el => el.scrollTop = 0);
    await swipe(20, Math.min(230, height - 70), 0, -160);
    await mobile.waitForFunction(() => document.querySelector('.control-scroll').scrollTop > 30);
    assert.equal(await mobile.locator('.control-rail[popover]').count(), 0, 'Touch scroll must not float a control');
    assert.equal(await mobile.locator('#photos').evaluate(el => el.scrollLeft), 0);
    await open(mobile, 'date', false); await open(mobile, 'time', false);
    await settled(mobile.locator('.workspace'));
    await swipe(width - 20, height * .45, -110, 0);
    await mobile.waitForFunction(() => document.querySelector('#photos').scrollLeft > 30);
    await mobile.locator('.workspace-splitter').tap(); await dock(mobile, 'open');
    assert.ok((await mobile.locator('.workspace-splitter').boundingBox()).x < width - 12);
    assert.equal(await mobile.locator('.workspace-controls').evaluate(el => el.inert), true);
    await mobile.locator('.workspace-splitter').tap(); await dock(mobile, 'docked');
    await open(mobile, 'moebius'); await mobile.getByRole('radio', {name: 'Moebius on', exact: true}).check(); await painted(mobile);
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), width);
    await mobile.screenshot({path: `.qa/workspace-mobile-${width}.png`});
    await mobile.close();
  }
  assert.deepEqual(errors, []);
  console.log('Verified workspace order, rail/grid independent wheel and touch scrolling, all ten controls, spring, filters/effects, snap/restore/drag/cancel/keyboard/persistence, hover clipping, detail, themes, floating grips, and 320/390/667 px layouts.');
} finally {await browser.close();}
