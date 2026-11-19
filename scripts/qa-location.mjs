import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {hexToLab} from '../app/color-pad.js';

const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--enable-unsafe-swiftshader']});
const url = 'http://127.0.0.1:4173/app/grid.html';
const settled = rail => rail.evaluate(el => Promise.allSettled(el.getAnimations({subtree: true}).map(a => a.finished)));
const names = page => page.locator('.photo img').evaluateAll(images => images.map(image => image.alt));
async function choose(page, label) {
  await page.locator('.location-search').fill(label === 'All locations' ? '' : label);
  await page.getByRole('radio', {name: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(,|$)')}).check();
}
async function range(page, first, last) {
  const toggle = page.locator('.date-filter .rail-toggle');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.press('Enter');
  await settled(page.locator('.date-filter'));
  const axis = page.locator('.date-axis');
  await axis.press('PageUp');
  await axis.press('Shift+PageDown');
  for (let year = 2022; year < first; year++) await axis.press('Shift+ArrowUp');
  for (let year = 2026; year > last; year--) await axis.press('ArrowDown');
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
  const rail = page.locator('.location-filter');
  const toggle = rail.locator('.rail-toggle');
  assert.deepEqual(await names(page), photos.map(p => p.name));
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await toggle.hover();
  await page.mouse.down();
  await page.waitForFunction(() => {
    const value = parseFloat(getComputedStyle(document.querySelector('.location-filter circle')).strokeDashoffset);
    return value > .2 && value < .8;
  });
  await page.mouse.up();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await rail.evaluate(el => {
    window.locationHeights = [];
    new MutationObserver((_, observer) => {
      if (el.classList.contains('collapsed')) return;
      observer.disconnect();
      const sample = () => {
        window.locationHeights.push(el.getBoundingClientRect().height);
        if (el.getAnimations().length) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }).observe(el, {attributes: true, attributeFilter: ['class']});
  });
  await page.mouse.down();
  await page.waitForFunction(() => document.querySelector('.location-filter .rail-toggle').ariaExpanded === 'true');
  await page.mouse.up();
  await settled(rail);
  const heights = await page.evaluate(() => window.locationHeights);
  assert.ok(Math.max(...heights) > heights.at(-1) + 2, 'Opening should visibly overshoot and settle, including with Reduce Motion');
  await rail.screenshot({path: '.qa/location-blue.png'});
  const seattle = photos.filter(p => p.location?.label === 'Seattle area');
  await choose(page, 'Seattle area');
  assert.deepEqual(await names(page), seattle.map(p => p.name));
  assert.equal(await rail.evaluate(el => el.hasAttribute('data-filtered')), true);
  await page.waitForFunction(() => !document.getAnimations().some(a => a.effect.target.matches('.photo img')));
  await page.locator('.photo').first().click();
  assert.equal(await page.locator('#full-photo').getAttribute('alt'), seattle[0].name);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#full-photo').getAttribute('alt'), seattle[1].name);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement.matches('.photo'));
  await range(page, 2023, 2024);
  const subset = seattle.filter(p => p.capturedAt.slice(0, 4) >= '2023' && p.capturedAt.slice(0, 4) <= '2024');
  assert.deepEqual(await names(page), subset.map(p => p.name));
  assert.equal(await page.getByRole('radio', {name: 'Seattle area, Washington', exact: true}).getAttribute('aria-description'), `${subset.length} images in the selected date range`);
  await page.locator('.color-filter .rail-toggle').press('Enter');
  await settled(page.locator('.color-filter'));
  await page.locator('.sample-hue').press('Home');
  await page.locator('.sample-field').press('Enter');
  const target = hexToLab(await page.locator('.sample-readout output').textContent());
  const expected = subset.map(photo => ({photo, distance: Math.min(...photo.palette.map(c => Math.hypot(...hexToLab(c.hex).map((v, i) => v - target[i]))))})).sort((a, b) => a.distance - b.distance);
  assert.deepEqual(await names(page), expected.map(x => x.photo.name));
  await page.locator('.clear-color').click();
  await range(page, 2022, 2026);
  await choose(page, 'No location');
  assert.deepEqual(await names(page), photos.filter(p => !p.location).map(p => p.name));
  const written = photos.find(p => p.location?.source === 'metadata');
  await choose(page, written.location.label);
  assert.deepEqual(await names(page), photos.filter(p => p.location?.id === written.location.id).map(p => p.name));
  const emptyYear = [2022, 2023, 2024, 2025, 2026].find(year => !photos.some(p => p.location?.id === written.location.id && p.capturedAt.startsWith(String(year))));
  await range(page, emptyYear, emptyYear);
  assert.equal(await page.locator('.photo').count(), 0);
  assert.equal(await page.locator('#grid-status').textContent(), 'No images match this place and date range.');
  await choose(page, 'All locations');
  assert.equal(await page.locator('.photo').count(), photos.filter(p => p.capturedAt.startsWith(String(emptyYear))).length);
  await range(page, 2022, 2026);
  await page.locator('.location-search').fill('no-such-place-xyz');
  assert.equal(await rail.locator('.location-empty').isVisible(), true);
  assert.equal(await page.getByRole('radio', {name: 'All locations', exact: true}).isVisible(), true);
  assert.equal(await page.locator('.photo').count(), photos.length, 'Searching only narrows the place choices');
  await page.locator('.location-search').fill('');
  await page.locator('.theme-filter .rail-toggle').press('Enter');
  await settled(page.locator('.theme-filter'));
  for (const mode of ['Light', 'Dark', 'Blue']) {
    await page.getByRole('radio', {name: mode, exact: true}).check();
    await settled(rail);
    assert.equal(await rail.evaluate(el => getComputedStyle(el).color), await page.locator('.lead-card').evaluate(el => getComputedStyle(el).color));
    await rail.screenshot({path: `.qa/location-${mode.toLowerCase()}.png`});
  }
  await rail.locator('.rail-grip').press('ArrowRight');
  assert.equal(await rail.getAttribute('popover'), 'manual');
  await choose(page, 'Seattle area');
  assert.deepEqual(await names(page), seattle.map(p => p.name));
  await toggle.press('Enter');
  await settled(rail);
  assert.equal((await rail.boundingBox()).height, 48);
  assert.equal(await page.locator('.location-options').evaluate(el => el.closest('[inert]') !== null), true);
  assert.deepEqual(errors, []);
  await page.close();

  for (const [width, height] of [[320, 700], [390, 844], [667, 375]]) {
    const mobile = await browser.newPage({viewport: {width, height}, isMobile: true, hasTouch: true});
    await mobile.goto(url);
    await mobile.locator('.title-webgl[data-phase="settled"]').waitFor();
    const shell = mobile.locator('.location-filter');
    const button = await shell.locator('.rail-toggle').boundingBox();
    const cdp = await mobile.context().newCDPSession(mobile);
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: button.x + button.width / 2, y: button.y + button.height / 2}]});
    await mobile.waitForFunction(() => document.querySelector('.location-filter .rail-toggle').ariaExpanded === 'true');
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    await settled(shell);
    const search = shell.locator('.location-search');
    await search.fill('Seattle');
    await mobile.getByRole('radio', {name: 'Seattle area, Washington', exact: true}).tap();
    assert.deepEqual(await names(mobile), seattle.map(p => p.name));
    await search.fill('');
    await shell.locator('.location-options').scrollIntoViewIfNeeded();
    const list = await shell.locator('.location-options').boundingBox();
    const before = await shell.boundingBox();
    const x = list.x + list.width / 2;
    const startY = Math.min(height - 20, list.y + list.height - 10);
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y: startY}]});
    for (const delta of [20, 40, 60, 80]) await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x, y: startY - delta}]});
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    await mobile.waitForFunction(() => document.querySelector('.location-options').scrollTop > 15);
    assert.deepEqual(await shell.boundingBox(), before, 'Swiping the list must not drag the control');
    await shell.screenshot({path: `.qa/location-${width}.png`});
    await shell.locator('.rail-grip').press('ArrowRight');
    assert.equal(await shell.getAttribute('popover'), 'manual');
    await choose(mobile, 'All locations');
    assert.equal(await mobile.locator('.photo').count(), photos.length);
    await mobile.close();
  }
  console.log('Verified location metadata coverage, filtering with dates and color, counts, empty/reset states, search, details, themes, spring motion, dragging, and native mobile list scrolling.');
} finally {await browser.close();}
