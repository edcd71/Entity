import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--enable-unsafe-swiftshader']});
const url = 'http://127.0.0.1:4173/app/grid.html';
const surfaces = {light: 'rgb(246, 245, 240)', dark: 'rgb(21, 21, 23)', blue: 'rgb(32, 71, 223)'};
const inks = {light: 'rgb(23, 23, 27)', dark: 'rgb(246, 245, 240)', blue: 'rgb(255, 255, 255)'};
async function settled(rail) {
  await rail.evaluate(el => Promise.allSettled(el.getAnimations({subtree: true}).map(animation => animation.finished)));
}
async function assertMode(page, mode) {
  assert.equal(await page.locator('html').getAttribute('data-theme'), mode);
  assert.equal(await page.locator('.lead-card').evaluate(el => getComputedStyle(el).backgroundColor), surfaces[mode]);
  assert.equal(await page.locator('.lead-card').evaluate(el => getComputedStyle(el).color), inks[mode]);
  assert.equal(await page.getByRole('radio', {name: new RegExp('^' + mode + '$', 'i')}).isChecked(), true);
}
try {
  await mkdir('.qa', {recursive: true});
  const context = await browser.newContext({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url);
  await page.locator('.title-webgl[data-phase="settled"]').waitFor();
  await assertMode(page, 'blue');
  const rail = page.locator('.theme-filter');
  const toggle = rail.locator('.rail-toggle');
  const toggleBox = await toggle.boundingBox();
  await page.mouse.move(toggleBox.x + toggleBox.width / 2, toggleBox.y + toggleBox.height / 2);
  await page.mouse.down();
  await page.waitForFunction(() => {
    const ring = document.querySelector('.theme-filter .rail-hold-ring circle');
    const offset = parseFloat(getComputedStyle(ring).strokeDashoffset);
    return offset > .2 && offset < .8;
  });
  await page.mouse.up();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'Short press must cancel');
  await page.mouse.down();
  await page.waitForFunction(() => document.querySelector('.theme-filter .rail-toggle').getAttribute('aria-expanded') === 'true');
  await page.mouse.up();
  await settled(rail);
  const original = await page.locator('.photo').first().elementHandle();
  const canvas = await page.locator('.title-webgl').elementHandle();
  const count = await page.locator('.photo').count();
  for (const mode of ['light', 'dark', 'blue']) {
    await page.getByRole('radio', {name: new RegExp('^' + mode + '$', 'i')}).check();
    await assertMode(page, mode);
    await settled(rail);
    await page.locator('.lead-card').screenshot({path: `.qa/theme-${mode}-desktop.png`});
    assert.equal(await page.evaluate(node => node === document.querySelector('.title-webgl'), canvas), true, 'Theme must update the live Three.js title');
    assert.equal(await page.locator('.title-webgl').getAttribute('data-phase'), 'settled', 'Changing theme must not replay the entrance');
    assert.equal(await page.evaluate(node => node === document.querySelector('.photo'), original), true);
    assert.equal(await page.locator('.photo').count(), count);
  }
  // Native radio keyboard navigation should select and save the mode.
  await page.getByRole('radio', {name: 'Blue', exact: true}).focus();
  await page.keyboard.press('ArrowRight');
  await assertMode(page, 'light');
  assert.equal(await page.evaluate(() => localStorage.getItem('entity-theme')), 'light');
  await page.locator('.photo').first().click();
  await page.locator('.swatch-caption strong').first().waitFor();
  const metadata = page.locator('.photo-metadata');
  assert.equal(await metadata.evaluate(el => getComputedStyle(el).backgroundColor), surfaces.light);
  assert.equal(await metadata.evaluate(el => getComputedStyle(el).color), inks.light);
  const swatches = await page.locator('.swatch-chip').evaluateAll(nodes => nodes.map(node => node.style.backgroundColor));
  await page.keyboard.press('Escape');
  await page.reload({waitUntil: 'domcontentloaded'});
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light', 'Saved mode should apply before the grid mounts');
  await page.locator('.theme-filter:not([disabled])').waitFor();
  await page.locator('.title-webgl[data-phase="settled"]').waitFor();
  await assertMode(page, 'light');
  await page.locator('.theme-filter .rail-toggle').press('Enter');
  await settled(page.locator('.theme-filter'));
  await page.getByRole('radio', {name: 'Dark', exact: true}).check();
  await page.locator('.photo').first().click();
  await page.locator('.swatch-caption strong').first().waitFor();
  assert.deepEqual(await page.locator('.swatch-chip').evaluateAll(nodes => nodes.map(node => node.style.backgroundColor)), swatches, 'Theme must preserve sampled photo colors');
  assert.equal(await metadata.evaluate(el => getComputedStyle(el).backgroundColor), surfaces.dark);
  await page.keyboard.press('Escape');
  // The dialog restores photo focus in its queued close event.
  await page.waitForFunction(() => document.activeElement.matches('.photo'));
  // A moved rail remains usable above the grid.
  await page.locator('.theme-filter .rail-grip').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('.theme-filter').getAttribute('popover'), 'manual');
  await page.getByRole('radio', {name: 'Blue', exact: true}).check();
  await assertMode(page, 'blue');
  const second = await page.context().newPage();
  await second.goto(url);
  await second.evaluate(() => localStorage.setItem('entity-theme', 'light'));
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await assertMode(page, 'light');
  await second.close();
  assert.deepEqual(errors, []);
  await page.close();
  await context.close();

  for (const [width, height] of [[320, 700], [390, 844], [667, 375]]) {
    const mobile = await browser.newPage({viewport: {width, height}, isMobile: true, hasTouch: true});
    await mobile.goto(url);
    await mobile.locator('.title-webgl[data-phase="settled"]').waitFor();
    const mobileRail = mobile.locator('.theme-filter');
    const boxes = await mobile.locator('.control-rail').evaluateAll(rails => rails.map(rail => {
      const {x, y, width, height} = rail.getBoundingClientRect(); return {x, y, width, height};
    }));
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i];
      assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.width <= width && a.y + a.height <= height, JSON.stringify({width, a}));
      for (const b of boxes.slice(i + 1)) assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, 'Collapsed controls must not overlap');
    }
    await mobileRail.locator('.rail-toggle').press('Enter');
    await settled(mobileRail);
    await mobileRail.locator('.theme-option').filter({hasText: 'Light'}).tap();
    await assertMode(mobile, 'light');
    await settled(mobileRail);
    await mobile.locator('.lead-card').screenshot({path: `.qa/theme-light-${width}.png`});
    await mobileRail.locator('.theme-option').filter({hasText: 'Blue'}).tap();
    await assertMode(mobile, 'blue');
    await mobile.close();
  }
  const fallback = await browser.newPage();
  await fallback.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type === 'webgl2' ? null : getContext.call(this, type, ...args); };
  });
  await fallback.goto(url);
  await fallback.locator('.title-fragment').first().waitFor();
  await fallback.locator('.theme-filter .rail-toggle').press('Enter');
  await settled(fallback.locator('.theme-filter'));
  await fallback.getByRole('radio', {name: 'Light', exact: true}).check();
  assert.equal(await fallback.locator('.title-tiles').evaluate(el => getComputedStyle(el).color), inks.light);
  await fallback.close();
  console.log('Verified three themes, press-and-hold, keyboard and touch, live title colors, persistence, detail colors, draggable control, mobile fit, and WebGL fallback.');
} finally {await browser.close();}
