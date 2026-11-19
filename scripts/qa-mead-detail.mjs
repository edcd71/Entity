import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--enable-unsafe-swiftshader']});
const url = 'http://127.0.0.1:4173/app/grid.html';
const defaults = {enabled: true, amount: 80, lines: 45, palette: 'daylight'};
const errors = [];
function watch(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
  page.on('response', response => {if (response.status() >= 400) errors.push(response.url());});
}
async function loaded(page) {
  await page.goto(url);
  await page.locator('.photo').first().waitFor();
  await page.locator('.title-webgl[data-phase="settled"]').waitFor();
}
async function painted(page) {
  await page.waitForFunction(() => {
    const image = document.querySelector('#full-photo');
    return image.dataset.mead === 'true' && image.complete && image.naturalWidth > 320 && !image.parentElement.hasAttribute('aria-busy');
  }, null, {timeout: 45000});
}
async function original(page, source) {
  await page.waitForFunction(source => {
    const image = document.querySelector('#full-photo');
    return image.getAttribute('src') === source && !image.dataset.mead && !image.parentElement.hasAttribute('aria-busy') && image.complete;
  }, source);
}
async function fingerprint(page, source) {
  return page.evaluate(async source => {
    const image = source ? new Image() : document.querySelector('#full-photo');
    if (source) image.src = source;
    await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, 64, 64);
    return {width: image.naturalWidth, height: image.naturalHeight, pixels: [...ctx.getImageData(0, 0, 64, 64).data]};
  }, source);
}
try {
  await mkdir('.qa', {recursive: true});
  const context = await browser.newContext({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
  await context.addInitScript(() => {
    window.detailURLs = new Set();
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => {const url = create(blob); window.detailURLs.add(url); return url;};
    URL.revokeObjectURL = url => {window.detailURLs.delete(url); revoke(url);};
  });
  const control = await context.newPage(), page = await context.newPage();
  watch(control); watch(page);
  await loaded(control); await loaded(page);
  const photos = await page.evaluate(async () => (await (await fetch('/media/grid/index.json')).json()).filter(photo => /^202[2-6]/.test(photo.capturedAt || '')));
  const first = photos[0], source = first.preview || first.thumbnail;
  await page.locator('.photo').first().click(); await original(page, source);
  const before = await fingerprint(page);
  await page.locator('.swatch-caption strong').first().waitFor();
  const palette = await page.locator('.swatch-caption strong').allTextContents();
  const metadata = await page.locator('.photo-metadata').textContent();
  // Changes from another Entity window must update an already-open detail view.
  const rail = control.locator('.mead-filter');
  await rail.locator('.rail-toggle').press('Enter');
  await rail.evaluate(el => Promise.allSettled(el.getAnimations({subtree: true}).map(a => a.finished)));
  await control.getByRole('radio', {name: 'Syd Mead on', exact: true}).check(); await painted(page);
  const day = await fingerprint(page);
  assert.deepEqual([day.width, day.height], [before.width, before.height], 'Use the entire native preview, not an enlarged or cropped grid tile');
  assert.notDeepEqual(day.pixels, before.pixels);
  assert.deepEqual(await page.locator('.swatch-caption strong').allTextContents(), palette);
  assert.equal(await page.locator('.photo-metadata').textContent(), metadata);
  assert.equal(await page.locator('#full-photo').getAttribute('data-pixel-art'), null);
  await page.screenshot({path: '.qa/mead-detail-daylight.png'});
  const bounds = await page.locator('.photo-image').boundingBox(), imageBounds = await page.locator('#full-photo').boundingBox();
  assert.equal(bounds.x, 0); assert.equal(bounds.y, 0);
  assert.ok(imageBounds.width >= bounds.width && imageBounds.height >= bounds.height, 'Full bleed image column');
  // The same current controls apply to the full-size renderer.
  await control.getByRole('radio', {name: 'Neon palette', exact: true}).check();
  await painted(page);
  const neon = await fingerprint(page); assert.notDeepEqual(neon.pixels, day.pixels);
  await page.screenshot({path: '.qa/mead-detail-neon.png'});
  await control.locator('#mead-lines').press('End'); await painted(page);
  assert.notDeepEqual((await fingerprint(page)).pixels, neon.pixels);
  await control.locator('#mead-amount').press('Home'); await original(page, source);
  assert.deepEqual((await fingerprint(page)).pixels, before.pixels);
  await control.locator('#mead-amount').press('End'); await painted(page);
  // In-flight work must not overwrite the selected photo or a disabled effect.
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.photo-image').getAttribute('aria-busy') === 'true');
  await control.getByRole('radio', {name: 'Syd Mead off', exact: true}).check();
  await original(page, photos[1].preview || photos[1].thumbnail);
  await page.waitForTimeout(600);
  await original(page, photos[1].preview || photos[1].thumbnail);
  assert.equal(await page.evaluate(() => window.detailURLs.size), 0);
  await control.getByRole('radio', {name: 'Syd Mead on', exact: true}).check();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await painted(page);
  assert.equal(await page.locator('#full-photo').getAttribute('alt'), photos[3].name);
  const fourth = await fingerprint(page, photos[3].preview || photos[3].thumbnail), displayed = await fingerprint(page);
  assert.deepEqual([displayed.width, displayed.height], [fourth.width, fourth.height]);
  assert.equal(await page.evaluate(() => window.detailURLs.size), 1);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#full-photo').hasAttribute('src') && window.detailURLs.size === 0);
  // Close during a fresh render, then reopen; stale blobs/work cannot leak through.
  await page.locator('.photo').first().click(); await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#photo-viewer').open);
  await page.locator('.photo').nth(1).click(); await painted(page);
  assert.equal(await page.locator('#full-photo').getAttribute('alt'), photos[1].name);
  await page.locator('#full-photo').click();
  await page.waitForFunction(() => !document.querySelector('#photo-viewer').open && window.detailURLs.size === 0);
  await context.close();

  // Native mobile columns plus worker-unavailable fallback. Clear indexed palette
  // in the fallback case to also verify sampling reads the source, not the effect.
  for (const fallback of [false, true]) {
    const mobileContext = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, reducedMotion: 'reduce'});
    await mobileContext.addInitScript(({defaults, fallback}) => {
      localStorage.setItem('entity-syd-mead', JSON.stringify(defaults));
      if (fallback) window.Worker = class {constructor() {throw new Error('Worker unavailable for QA');}};
    }, {defaults, fallback});
    const mobile = await mobileContext.newPage(); watch(mobile);
    if (fallback) {
      await mobile.route('**/media/grid/index.json', async route => {
        const response = await route.fetch(), entries = await response.json();
        entries[0].palette = [];
        await route.fulfill({response, json: entries});
      });
      await mobile.route('**' + first.metadataUrl, async route => {
        const response = await route.fetch(), record = await response.json();
        delete record['Preview palette'];
        await route.fulfill({response, json: record});
      });
    }
    await loaded(mobile);
    await mobile.locator('.photo').first().tap(); await painted(mobile);
    const result = await fingerprint(mobile);
    assert.deepEqual([result.width, result.height], [before.width, before.height]);
    assert.deepEqual(result.pixels, day.pixels, 'Mobile and worker fallback produce the same full-size treatment');
    await mobile.screenshot({path: `.qa/mead-detail-mobile${fallback ? '-fallback' : ''}.png`});
    await mobile.getByRole('button', {name: 'Colors', exact: true}).tap();
    await mobile.waitForFunction(() => Math.abs(document.querySelector('.photo-palette').getBoundingClientRect().x) < 1);
    await mobile.locator('.swatch-caption strong').first().waitFor();
    const sampled = await mobile.locator('.swatch-caption strong').allTextContents();
    await mobile.getByRole('button', {name: 'Metadata', exact: true}).tap();
    await mobile.waitForFunction(() => Math.abs(document.querySelector('.photo-metadata').getBoundingClientRect().x) < 1);
    assert.ok((await mobile.locator('.photo-metadata').textContent()).includes(first.name));
    await mobile.getByRole('button', {name: 'Image', exact: true}).tap();
    await mobile.locator('#full-photo').tap();
    await mobile.waitForFunction(() => !document.querySelector('#photo-viewer').open);
    if (fallback) {
      await mobile.evaluate(() => localStorage.removeItem('entity-syd-mead'));
      // Init script seeds saved settings, so disable through the actual control.
      await mobile.locator('.lead-card').scrollIntoViewIfNeeded();
      await mobile.locator('.mead-filter .rail-toggle').press('Enter');
      await mobile.getByRole('radio', {name: 'Syd Mead off', exact: true}).check();
      await mobile.locator('.photo').first().tap(); await original(mobile, source);
      await mobile.locator('.swatch-caption strong').first().waitFor();
      assert.deepEqual(await mobile.locator('.swatch-caption strong').allTextContents(), sampled, 'Fallback palette sampling stays original');
    }
    await mobileContext.close();
  }
  assert.deepEqual(errors, []);
  console.log('Verified full-resolution detail effect, palettes/strength/linework, live cross-window updates, zero/off restoration, rapid navigation/close cancellation, blob cleanup, original metadata/colors, mobile columns, and worker fallback.');
} finally {await browser.close();}
