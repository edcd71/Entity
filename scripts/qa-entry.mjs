import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const photos = JSON.parse(await readFile(new URL('../media/grid/index.json', import.meta.url))).filter(p => /^202[2-6]/.test(p.capturedAt || ''));
const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--enable-unsafe-swiftshader']});
try {
  const page = await browser.newPage({viewport: {width: 1350, height: 800}});
  const errors = [];
  page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {if (response.url().startsWith('http://127.0.0.1:4173/') && response.status() >= 400) errors.push(response.url());});
  const file = new URL('../app/grid.html', import.meta.url).href;
  const http = 'http://127.0.0.1:4173/app/grid.html';
  for (const [source, target] of [[file, http], [file + '?light=moonlight#photos', http + '?light=moonlight#photos'], [http, http]]) {
    await page.goto(source, {waitUntil: 'commit'});
    await page.waitForURL(target);
    await page.waitForFunction(count => document.querySelectorAll('.photo').length === count && !document.querySelector('.control-rail:disabled'), photos.length);
    await page.locator('.title-webgl[data-phase="settled"]').waitFor();
    assert.equal(page.url(), target);
    assert.equal(await page.locator('.lead-card').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(32, 71, 223)');
    assert.equal(await page.locator('#grid-status').textContent(), photos.length.toLocaleString('en-US') + ' images');
  }
  await page.locator('.time-filter .rail-toggle').press('Enter');
  await page.locator('.time-filter').evaluate(el => Promise.allSettled(el.getAnimations({subtree: true}).map(a => a.finished)));
  await page.locator('.time-end').press('PageUp');
  const morning = photos.filter(photo => Number(photo.capturedAt.slice(11, 13)) * 60 + Number(photo.capturedAt.slice(14, 16)) <= 60);
  assert.equal(await page.locator('.photo').count(), morning.length);
  await page.locator('.time-reset').click();
  assert.equal(await page.locator('.photo').count(), photos.length);
  await page.locator('.lead-card').screenshot({path: '.qa/file-open-after.png'});

  await page.goto(new URL('../index.html', import.meta.url).href + '?light=ember#stage', {waitUntil: 'commit'});
  await page.waitForURL('http://127.0.0.1:4173/?light=ember#stage');
  await page.locator('#stage canvas').waitFor();
  assert.deepEqual(errors, []);
  console.log(`Verified file launches redirect to HTTP, preserve query/hash, load ${photos.length} photos and working controls, and retain the sphere entry route.`);
} finally {await browser.close();}
