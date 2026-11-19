import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { hexToLab } from '../app/color-pad.js';

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
try {
  const page = await browser.newPage({viewport: {width: 1200, height: 760}, reducedMotion: 'reduce'});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/app/grid.html');
  const manifest = await (await page.request.get(new URL('/media/grid/index.json', page.url()).href)).json();
  const dated = manifest.filter(photo => /^202[2-6]/.test(photo.capturedAt));
  assert.ok(dated.length && dated.every(photo => photo.palette?.length));
  const colors = page.locator('.color-filter:not([disabled])');
  const toggle = colors.getByRole('button', {name: /Long press/});
  const field = colors.locator('.sample-field');
  const output = colors.locator('output');
  const displayed = () => page.locator('.photo-list img').evaluateAll(images => images.map(img => img.alt));
  const expectedOrder = (photos, hex) => {
    const target = hexToLab(hex);
    return photos.map(photo => {
      const distances = photo.palette.map(({hex}) => Math.hypot(...hexToLab(hex).map((v, i) => v - target[i])));
      return {name: photo.name, distance: Math.min(...distances)};
    }).sort((a, b) => a.distance - b.distance).map(item => item.name);
  };
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  const cap = await toggle.boundingBox();
  await page.mouse.move(cap.x + cap.width / 2, cap.y + cap.height / 2);
  await page.mouse.down();
  await page.waitForFunction(() => {
    const ring = document.querySelector('.color-filter .rail-hold-ring circle');
    const offset = parseFloat(getComputedStyle(ring).strokeDashoffset);
    return offset > .2 && offset < .8;
  });
  await page.waitForFunction(() => document.querySelector('.color-filter .rail-toggle').ariaExpanded === 'true');
  await page.mouse.up();
  await page.waitForFunction(() => !document.querySelector('.color-filter').getAnimations({subtree: true}).length);
  assert.deepEqual(await displayed(), dated.map(photo => photo.name));
  await colors.locator('.sample-hue').press('Home');
  const beforeDrag = await displayed();
  const box = await field.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - .1, box.y + .1);
  assert.equal(await colors.locator('.sample-loupe').isVisible(), true);
  const hex = await output.textContent();
  assert.match(hex, /^#FF0[0-9A-F]0[0-9A-F]$/);
  assert.deepEqual(await displayed(), beforeDrag);
  await page.mouse.up();
  assert.equal(await colors.locator('.sample-loupe').isVisible(), false);
  assert.deepEqual(await displayed(), expectedOrder(dated, hex));
  const dateRail = page.locator('.date-filter');
  await dateRail.locator('.rail-toggle').press('Enter');
  await dateRail.locator('.date-axis').press('Shift+ArrowUp');
  const filtered = dated.filter(photo => photo.capturedAt >= '2023');
  const ranked = expectedOrder(filtered, hex);
  assert.deepEqual(await displayed(), ranked);
  await page.locator('.photo-list button').first().click();
  assert.equal(await page.locator('#full-photo').getAttribute('alt'), ranked[0]);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#full-photo').getAttribute('alt'), ranked[1]);
  await page.keyboard.press('Escape');
  await colors.getByRole('button', {name: 'Clear color sort'}).click();
  assert.deepEqual(await displayed(), filtered.map(photo => photo.name));
  await field.press('Shift+ArrowLeft');
  assert.deepEqual(await displayed(), expectedOrder(filtered, await output.textContent()));
  await mkdir('.qa', {recursive: true});
  await colors.screenshot({path: '.qa/color-pad-open.png'});

  const mobile = await browser.newPage({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  await mobile.goto(page.url());
  const pad = mobile.locator('.color-filter:not([disabled])');
  const touchToggle = pad.locator('.rail-toggle');
  const button = await touchToggle.boundingBox();
  const touch = await mobile.context().newCDPSession(mobile);
  const point = {x: button.x + button.width / 2, y: button.y + button.height / 2};
  const sendTouch = (type, ...touchPoints) => touch.send('Input.dispatchTouchEvent', {type, touchPoints});
  await sendTouch('touchStart', point);
  await mobile.waitForFunction(() => document.querySelector('.color-filter .rail-toggle').ariaExpanded === 'true');
  await sendTouch('touchEnd');
  await mobile.waitForFunction(() => !document.querySelector('.color-filter').getAnimations({subtree: true}).length);
  const bounds = await pad.boundingBox();
  const cardBounds = await mobile.locator('.lead-card').boundingBox();
  assert.ok(bounds.x >= cardBounds.x && bounds.x + bounds.width <= cardBounds.x + cardBounds.width);
  for (const other of await mobile.locator('.control-rail:not(.color-filter)').all()) {
    const b = await other.boundingBox();
    assert.ok(bounds.x + bounds.width <= b.x || b.x + b.width <= bounds.x || bounds.y + bounds.height <= b.y || b.y + b.height <= bounds.y, 'Expanded controls must not overlap');
  }
  const mobileField = await pad.locator('.sample-field').boundingBox();
  await sendTouch('touchStart', {x: mobileField.x + 3, y: mobileField.y + 3});
  await sendTouch('touchMove', {x: mobileField.x + 12, y: mobileField.y + 6});
  await sendTouch('touchCancel');
  assert.deepEqual(await mobile.locator('.photo-list img').evaluateAll(images => images.map(img => img.alt)), dated.map(p => p.name));
  await pad.locator('.sample-field').tap();
  const mobileHex = await pad.locator('output').textContent();
  assert.deepEqual(await mobile.locator('.photo-list img').evaluateAll(images => images.map(img => img.alt)), expectedOrder(dated, mobileHex));
  const grip = await pad.locator('.rail-grip').boundingBox();
  await sendTouch('touchStart', {x: grip.x + 32, y: grip.y + 7});
  await sendTouch('touchMove', {x: 380, y: 110});
  await sendTouch('touchEnd');
  assert.equal(await pad.evaluate(el => el.matches(':popover-open')), true);
  await mobile.setViewportSize({width: 844, height: 390});
  const floating = await pad.boundingBox();
  assert.ok(floating.x >= 0 && floating.x + floating.width <= 844 && floating.y + floating.height <= 390);
  assert.deepEqual(errors, []);
  console.log(`Verified actual palette order for ${dated.length} photos, date filtering, detail navigation, reset, loupe, touch and floating pad.`);
} finally {
  await browser.close();
}
