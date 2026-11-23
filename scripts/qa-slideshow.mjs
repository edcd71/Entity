import assert from 'node:assert/strict';
import {mkdir, readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const url = 'http://127.0.0.1:4173/app/grid.html';
const photos = JSON.parse(await readFile(new URL('../media/grid/index.json', import.meta.url)))
  .filter(photo => /^202[2-6]/.test(photo.capturedAt || ''));
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--enable-unsafe-swiftshader'],
});

try {
  await mkdir('.qa', {recursive: true});
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
  await page.goto(url);
  await page.waitForFunction(count => document.querySelectorAll('.photo').length === count &&
    !document.querySelector('.slideshow-filter:disabled'), photos.length);

  const rail = page.locator('.slideshow-filter');
  const start = rail.getByRole('button', {name: 'On', exact: true});
  await rail.locator('.rail-toggle').press('Enter');
  await start.click();
  const dialog = page.locator('#slideshow-viewer');
  const image = dialog.locator('#slideshow-photo');
  await image.evaluate(element => element.decode());
  assert.equal(await image.getAttribute('src'), photos[0].preview || photos[0].thumbnail);
  assert.equal(await dialog.locator('button').count(), 0);
  assert.equal(await dialog.locator('.slideshow-progress').count(), 1);
  assert.equal(await dialog.locator('progress').count(), 0);
  assert.equal(await dialog.locator('.slideshow-swatches').count(), 0);
  assert.equal(await dialog.locator('.slideshow-header').count(), 0);
  await page.screenshot({path: '.qa/slideshow-minimal.png'});

  await page.waitForFunction(source => document.querySelector('#slideshow-photo').getAttribute('src') === source,
    photos[1].preview || photos[1].thumbnail, {timeout: 8000});
  await page.keyboard.press('Escape');
  await dialog.waitFor({state: 'hidden'});
  assert.equal(await start.evaluate(button => button === document.activeElement), true);
  assert.deepEqual(errors, []);
  console.log('Verified slideshow On control, automatic photo advance, circular timing indicator, and Escape return to the grid.');
} finally {
  await browser.close();
}
