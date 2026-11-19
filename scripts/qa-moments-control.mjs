import assert from 'node:assert/strict';
import {mkdir, readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {buildMoments} from '../app/moments.js';
import {hexToLab} from '../app/color-pad.js';

const photos = JSON.parse(await readFile(new URL('../media/grid/index.json', import.meta.url))).filter(p => /^202[2-6]/.test(p.capturedAt || ''));
const moments = buildMoments(photos);
const minute = photo => Number(photo.capturedAt.slice(11, 13)) * 60 + Number(photo.capturedAt.slice(14, 16));
const chosen = moments.find(m => m.photos.length >= 8 && m.place === 'Seattle area' && !m.photos[0].capturedAt.startsWith('2022') && new Set(m.photos.map(minute)).size > 1);
assert.ok(chosen, 'A real multi-photo outing with varied capture times is needed for the integration check');
const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--enable-unsafe-swiftshader']});
const settled = rail => rail.evaluate(el => Promise.allSettled(el.getAnimations({subtree: true}).map(a => a.finished)));
const names = page => page.locator('.photo img').evaluateAll(images => images.map(image => image.alt));
const choice = (page, moment) => page.locator(`.moment-list input[value="${moment.id}"]`);
const checkNames = async (page, expected) => assert.deepEqual(await names(page), expected.map(p => p.name));
async function open(page, selector) {
  const rail = page.locator(selector), toggle = rail.locator('.rail-toggle');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.press('Enter');
  await settled(rail);
}
async function springSamples(rail, collapsed) {
  await rail.evaluate((el, collapsed) => {
    window.momentHeights = [];
    new MutationObserver((_, observer) => {
      if (el.classList.contains('collapsed') !== collapsed) return;
      observer.disconnect();
      const sample = () => {
        window.momentHeights.push(el.getBoundingClientRect().height);
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
  await page.goto('http://127.0.0.1:4173/app/grid.html');
  await page.locator('.title-webgl[data-phase="settled"]').waitFor();
  await checkNames(page, photos);
  assert.equal(await page.locator('.control-dock > fieldset').count(), 10);
  const rail = page.locator('.moments-filter'), toggle = rail.locator('.rail-toggle');
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await toggle.hover();
  await page.mouse.down();
  await page.waitForFunction(() => {
    const offset = parseFloat(getComputedStyle(document.querySelector('.moments-filter circle')).strokeDashoffset);
    return offset > .2 && offset < .8;
  });
  await page.mouse.up();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await springSamples(rail, false);
  await page.mouse.down();
  await page.waitForFunction(() => document.querySelector('.moments-filter .rail-toggle').ariaExpanded === 'true');
  await page.mouse.up();
  await settled(rail);
  let heights = await page.evaluate(() => window.momentHeights);
  assert.ok(Math.max(...heights) > heights.at(-1) + 2, 'Opening should visibly overshoot under Reduce Motion');
  assert.equal(await page.locator('.moment-list input').count(), moments.length);
  assert.equal(await page.locator('.moment-list input').first().getAttribute('value'), moments.at(-1).id);
  await rail.screenshot({path: '.qa/moments-blue.png'});
  await page.locator('.lead-card').screenshot({path: '.qa/moments-card.png'});

  await page.locator('.moment-search').fill('Seattle');
  await choice(page, chosen).check();
  await checkNames(page, chosen.photos);
  assert.equal(await rail.evaluate(el => el.hasAttribute('data-filtered')), true);
  assert.ok(await page.locator('.photo img').evaluateAll(images => images.some(image => image.getAnimations().length)), 'Selecting a moment animates its images');
  await page.waitForFunction(() => !document.getAnimations().some(a => a.effect.target.matches('.photo img')));
  await page.locator('.photo').first().click();
  assert.equal(await page.locator('#full-photo').getAttribute('alt'), chosen.photos[0].name);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#full-photo').getAttribute('alt'), chosen.photos[1].name);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement.matches('.photo'));

  // Counts track the other filters; a selected moment remains available even
  // when the date range excludes it, so it can always be cleared.
  await open(page, '.date-filter');
  await page.locator('.date-axis').press('PageDown');
  await checkNames(page, []);
  assert.equal(await choice(page, chosen).isVisible(), true);
  assert.equal(await choice(page, chosen).isChecked(), true);
  assert.match(await choice(page, chosen).getAttribute('aria-description'), /^0 of /);
  await page.getByRole('radio', {name: 'All moments', exact: true}).check();
  await checkNames(page, photos.filter(p => p.capturedAt.startsWith('2022')));
  await page.locator('.date-axis').press('PageUp');
  await choice(page, chosen).check();
  await open(page, '.location-filter');
  await page.locator('.location-search').fill('Seattle');
  await page.getByRole('radio', {name: 'Seattle area, Washington', exact: true}).check();
  const inPlace = chosen.photos.filter(p => p.location?.label === 'Seattle area');
  await checkNames(page, inPlace);
  await open(page, '.time-filter');
  const cutoff = Math.floor((Math.min(...inPlace.map(minute)) + Math.max(...inPlace.map(minute))) / 2);
  const end = page.locator('.time-end');
  await end.press('Home');
  for (let h = 0; h < Math.floor(cutoff / 60); h++) await end.press('PageUp');
  for (let q = 0; q < Math.floor(cutoff % 60 / 15); q++) await end.press('Shift+ArrowUp');
  for (let m = 0; m < cutoff % 15; m++) await end.press('ArrowUp');
  const expected = inPlace.filter(p => minute(p) <= cutoff);
  assert.ok(expected.length > 0 && expected.length < inPlace.length);
  await checkNames(page, expected);
  assert.match(await choice(page, chosen).getAttribute('aria-description'), new RegExp('^' + expected.length + ' of '));
  await open(page, '.color-filter');
  await page.locator('.sample-hue').press('Home');
  await page.locator('.sample-field').press('Enter');
  const target = hexToLab(await page.locator('.sample-readout output').textContent());
  const rank = list => list.map(photo => ({photo, distance: Math.min(...photo.palette.map(c => Math.hypot(...hexToLab(c.hex).map((v, i) => v - target[i]))))})).sort((a, b) => a.distance - b.distance).map(x => x.photo);
  await checkNames(page, rank(expected));
  await page.getByRole('radio', {name: 'All moments', exact: true}).check();
  await checkNames(page, rank(photos.filter(p => p.location?.label === 'Seattle area' && minute(p) <= cutoff)));
  assert.equal(await rail.getAttribute('data-filtered'), null);
  await page.locator('.moment-search').fill('no-such-moment');
  assert.equal(await page.locator('.moment-empty').isVisible(), true);
  assert.equal(await page.getByRole('radio', {name: 'All moments', exact: true}).isVisible(), true);
  await page.locator('.moment-search').fill('');
  await page.locator('.clear-color').click();
  await page.locator('.time-reset').click();
  await page.getByRole('radio', {name: 'All locations', exact: true}).check();
  await open(page, '.theme-filter');
  for (const mode of ['Light', 'Dark', 'Blue']) {
    await page.getByRole('radio', {name: mode, exact: true}).check();
    await settled(rail);
    assert.equal(await rail.evaluate(el => getComputedStyle(el).color), await page.locator('.lead-card').evaluate(el => getComputedStyle(el).color));
    await rail.screenshot({path: `.qa/moments-${mode.toLowerCase()}.png`});
  }
  await rail.locator('.rail-grip').press('ArrowRight');
  assert.equal(await rail.getAttribute('popover'), 'manual');
  await choice(page, moments.at(-1)).check();
  await checkNames(page, moments.at(-1).photos);
  await springSamples(rail, true);
  await toggle.press('Enter');
  await settled(rail);
  heights = await page.evaluate(() => window.momentHeights);
  assert.ok(Math.min(...heights) < heights.at(-1) - 1, 'Closing should rebound');
  assert.equal((await rail.boundingBox()).height, 48);
  assert.equal(await page.locator('#moments-body').evaluate(el => el.inert), true);
  assert.deepEqual(errors, []);
  await page.close();

  for (const [width, height] of [[320, 700], [390, 844], [667, 375]]) {
    const mobile = await browser.newPage({viewport: {width, height}, isMobile: true, hasTouch: true});
    await mobile.goto('http://127.0.0.1:4173/app/grid.html');
    await mobile.locator('.title-webgl[data-phase="settled"]').waitFor();
    const shell = mobile.locator('.moments-filter');
    await shell.locator('.rail-toggle').scrollIntoViewIfNeeded();
    const button = await shell.locator('.rail-toggle').boundingBox();
    const cdp = await mobile.context().newCDPSession(mobile);
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: button.x + 12, y: button.y + 12}]});
    await mobile.waitForFunction(() => document.querySelector('.moments-filter .rail-toggle').ariaExpanded === 'true');
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    await settled(shell);
    await choice(mobile, moments.at(-1)).tap();
    await checkNames(mobile, moments.at(-1).photos);
    const list = shell.locator('.moment-list');
    await list.scrollIntoViewIfNeeded();
    const bounds = await list.boundingBox(), before = await shell.boundingBox();
    const x = bounds.x + bounds.width / 2, y = Math.min(height - 10, bounds.y + bounds.height - 10);
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]});
    for (const delta of [15, 30, 45, 60]) await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x, y: y - delta}]});
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    await mobile.waitForFunction(() => document.querySelector('.moment-list').scrollTop > 15);
    assert.deepEqual(await shell.boundingBox(), before, 'Scrolling moments must not drag the frame');
    await shell.screenshot({path: `.qa/moments-${width}.png`});
    const card = await mobile.locator('.lead-card').boundingBox();
    const frame = await shell.boundingBox();
    assert.ok(frame.x >= card.x && frame.x + frame.width <= card.x + card.width + 1);
    await mobile.getByRole('radio', {name: 'All moments', exact: true}).tap();
    await checkNames(mobile, photos);
    await mobile.close();
  }
  console.log('Verified Moments hold ring and springs, selection/reset, stable grouping under combined filters, counts, search, details, themes, dragging, and touch at 320/390/667px.');
} finally {await browser.close();}
