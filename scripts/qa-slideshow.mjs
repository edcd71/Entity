import assert from 'node:assert/strict';
import {mkdir, readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const url = 'http://127.0.0.1:4173/app/grid.html';
const photos = JSON.parse(await readFile(new URL('../media/grid/index.json', import.meta.url)))
  .filter(photo => /^202[2-6]/.test(photo.capturedAt || ''));
const byThumbnail = new Map(photos.map(photo => [photo.thumbnail, photo]));
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--enable-unsafe-swiftshader'],
});
const errors = [];

function watch(page) {
  page.setDefaultTimeout(10_000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
  page.on('response', response => {if (response.status() >= 400) errors.push(response.url());});
}

async function ready(page, count = photos.length) {
  await page.goto(url);
  await page.waitForFunction(count => document.querySelectorAll('.photo').length === count &&
    !document.querySelector('.control-rail:disabled'), count);
}

async function openRail(page, selector, touch = false) {
  const rail = page.locator(selector);
  const toggle = rail.locator('.rail-toggle');
  await toggle.scrollIntoViewIfNeeded();
  if (await toggle.getAttribute('aria-expanded') === 'false') {
    if (touch) {
      const {x, y, width, height} = await toggle.boundingBox();
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: x + width / 2, y: y + height / 2}]});
      await page.waitForFunction(selector => document.querySelector(`${selector} .rail-toggle`).ariaExpanded === 'true', selector);
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
      await cdp.detach();
    } else {
      await toggle.press('Enter');
    }
  }
  await rail.evaluate(element => Promise.allSettled(element.getAnimations({subtree: true}).map(animation => animation.finished)));
  return rail;
}

function slideshow(page) {
  const dialog = page.locator('#slideshow-viewer');
  const button = name => dialog.getByRole('button', {name, exact: true});
  return {
    dialog,
    start: page.locator('.slideshow-filter').getByRole('button', {name: 'Start slideshow', exact: true}),
    play: button('Play slideshow'),
    pause: button('Pause slideshow'),
    previous: button('Previous photo'),
    next: button('Next photo'),
    close: button('Close slideshow'),
    stage: dialog.locator('.slideshow-stage'),
    number: dialog.getByRole('spinbutton', {name: 'Photo number', exact: true}),
    pace: dialog.getByRole('combobox', {name: 'Seconds per photo', exact: true}),
    loop: dialog.getByRole('checkbox', {name: 'Loop', exact: true}),
    thumbs: dialog.locator('.slideshow-strip button:visible'),
  };
}

async function shown(page, number, photo) {
  await page.waitForFunction(({number, name, source}) => {
    const dialog = document.querySelector('#slideshow-viewer');
    const image = dialog.querySelector('#slideshow-photo');
    return dialog.open && dialog.querySelector('input[type="number"]').value === String(number) &&
      image.alt === name && image.getAttribute('src') === source && image.complete && image.naturalWidth > 0;
  }, {number, name: photo.name, source: photo.preview || photo.thumbnail});
}

async function jump(show, number) {
  await show.number.fill(String(number));
  await show.number.press('Enter');
}

async function assertFits(locator, width, height) {
  const bounds = await locator.boundingBox();
  assert.ok(bounds && bounds.x >= -1 && bounds.y >= -1 &&
    bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1,
  `Control ${locator} is clipped at ${width}×${height}`);
}

try {
  await mkdir('.qa', {recursive: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  watch(page);
  await ready(page);
  await page.locator('.title-webgl[data-phase="settled"]').waitFor();
  const show = slideshow(page);
  await openRail(page, '.slideshow-filter');
  await show.start.scrollIntoViewIfNeeded();
  await page.screenshot({path: '.qa/slideshow-rail.png'});
  await show.start.click();
  await show.pause.waitFor();
  await shown(page, 1, photos[0]);
  await show.pause.click();
  assert.equal(await show.pace.inputValue(), '4');
  assert.equal(await show.loop.isChecked(), false);
  assert.equal(await show.previous.isDisabled(), true);
  assert.equal(Number(await show.number.getAttribute('max')), photos.length);
  assert.equal(await show.thumbs.count(), 5);

  await show.thumbs.nth(2).click();
  await shown(page, 3, photos[2]);
  assert.equal(await show.thumbs.locator('img').nth(2).getAttribute('src'), photos[2].thumbnail);
  assert.equal(await show.thumbs.nth(2).getAttribute('aria-current'), 'true');
  await show.next.click();
  await shown(page, 4, photos[3]);
  await show.previous.click();
  await shown(page, 3, photos[2]);
  await jump(show, 6);
  await shown(page, 6, photos[5]);
  await show.number.press('ArrowRight');
  await shown(page, 6, photos[5]);
  await show.stage.press('ArrowLeft');
  await shown(page, 5, photos[4]);
  await page.screenshot({path: '.qa/slideshow-desktop.png'});

  await show.pace.selectOption('2');
  await show.stage.press('Space');
  await show.pause.waitFor();
  await shown(page, 6, photos[5]);
  await show.pause.click();
  await page.waitForTimeout(2_200);
  await shown(page, 6, photos[5]);

  await jump(show, photos.length - 1);
  await shown(page, photos.length - 1, photos.at(-2));
  await show.play.click();
  await shown(page, photos.length, photos.at(-1));
  await show.play.waitFor();
  assert.equal(await show.next.isDisabled(), true);
  await show.play.click();
  await shown(page, 1, photos[0]);
  await show.pause.click();

  await show.loop.check();
  await jump(show, photos.length);
  await shown(page, photos.length, photos.at(-1));
  await show.play.click();
  await shown(page, 1, photos[0]);
  await show.pause.waitFor();
  await page.keyboard.press('Escape');
  await show.dialog.waitFor({state: 'hidden'});
  assert.equal(await show.start.evaluate(button => button === document.activeElement), true);

  await openRail(page, '.date-filter');
  await page.locator('.date-axis').press('PageDown');
  const order = () => page.locator('.photo img').evaluateAll(images => images.map(image => image.getAttribute('src')));
  const dated = await order();
  assert.ok(dated.length > 1 && dated.length < photos.length);
  await openRail(page, '.color-filter');
  await page.locator('.sample-hue').press('Home');
  await page.locator('.sample-field').press('Enter');
  const sorted = await order();
  assert.equal(sorted.length, dated.length);
  assert.notDeepEqual(sorted, dated);
  await show.start.click();
  await shown(page, 1, byThumbnail.get(sorted[0]));
  await show.pause.click();
  assert.equal(Number(await show.number.getAttribute('max')), dated.length);
  await jump(show, dated.length);
  await shown(page, dated.length, byThumbnail.get(sorted.at(-1)));
  await show.close.click();
  await show.dialog.waitFor({state: 'hidden'});
  await page.close();

  // Route a small index that can reliably be filtered to either zero or one result.
  const fixture = await browser.newPage();
  watch(fixture);
  const samples = photos.slice(0, 3).map((photo, index) => ({
    ...photo,
    capturedAt: index === 0 ? '2023-01-01 12:00:00' : `2025-01-0${index} 12:00:00`,
  }));
  await fixture.route('**/media/grid/index.json', route => route.fulfill({json: samples}));
  await ready(fixture, samples.length);
  await openRail(fixture, '.slideshow-filter');
  const sampleShow = slideshow(fixture);
  const preview = new URL(samples[0].preview || samples[0].thumbnail, url).href;
  let releasePreview;
  const previewGate = new Promise(resolve => {releasePreview = resolve;});
  await fixture.route(preview, async route => {
    await previewGate;
    await route.continue();
  }, {times: 1});
  try {
    const requested = fixture.waitForRequest(preview);
    await sampleShow.start.click();
    await requested;
    await sampleShow.pace.selectOption('2');
    await fixture.waitForTimeout(2_200);
    assert.equal(await sampleShow.number.inputValue(), '1', 'Loading the first image does not consume its dwell time');
  } finally {
    releasePreview();
  }
  await shown(fixture, 1, samples[0]);
  await shown(fixture, 2, samples[1]);
  await sampleShow.close.click();
  await openRail(fixture, '.date-filter');
  await fixture.locator('.date-axis').press('PageDown');
  assert.equal(await fixture.locator('.photo').count(), 0);
  assert.equal(await sampleShow.start.isDisabled(), true);
  await fixture.locator('.date-axis').press('ArrowUp');
  assert.equal(await fixture.locator('.photo').count(), 1);
  await sampleShow.start.click();
  await shown(fixture, 1, samples[0]);
  assert.equal(await sampleShow.play.isDisabled(), true);
  assert.equal(await sampleShow.previous.isDisabled(), true);
  assert.equal(await sampleShow.next.isDisabled(), true);
  await fixture.close();

  for (const [width, height] of [[320, 568], [667, 375]]) {
    const mobile = await browser.newPage({viewport: {width, height}, isMobile: true, hasTouch: true, reducedMotion: 'reduce'});
    watch(mobile);
    await ready(mobile);
    await openRail(mobile, '.slideshow-filter', true);
    const touchShow = slideshow(mobile);
    await touchShow.start.tap();
    await shown(mobile, 1, photos[0]);
    await touchShow.pause.tap();
    for (const control of [touchShow.play, touchShow.previous, touchShow.next, touchShow.close, touchShow.number, touchShow.pace, touchShow.loop]) {
      await assertFits(control, width, height);
    }
    await touchShow.next.tap();
    await shown(mobile, 2, photos[1]);
    await mobile.screenshot({path: `.qa/slideshow-mobile-${width}.png`});
    await touchShow.close.tap();
    await touchShow.dialog.waitFor({state: 'hidden'});
    await mobile.close();
  }
  assert.deepEqual(errors, []);
  console.log('Verified slideshow playback, keyboard and thumbnail pagination, interval and looping, filtered order, delayed loading, empty and single results, focus return, and portrait and landscape touch layouts.');
} finally {
  await browser.close();
}
