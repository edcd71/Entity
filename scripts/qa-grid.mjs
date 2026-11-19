import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

function waitForPartialRing(page) {
  return page.waitForFunction(() => {
    const ring = document.querySelector('.rail-hold-ring circle');
    const remaining = parseFloat(getComputedStyle(ring).strokeDashoffset);
    return remaining > .2 && remaining < .8;
  }, null, {timeout: 2000});
}

async function assertTileReveal(page, reduced) {
  const tiles = await page.evaluate(() => document.getAnimations()
    .filter(({effect}) => effect.target.matches('.photo img'))
    .map(({effect}) => {
      const image = effect.target;
      const {left, right} = image.parentElement.getBoundingClientRect();
      const frames = effect.getKeyframes();
      const {delay, easing} = effect.getTiming();
      return {
        visible: left < innerWidth && right > 0 && !image.closest('[hidden]'),
        delay,
        placesTile: easing.startsWith('steps(') && Number(frames[0].opacity) === 0 && Number(frames.at(-1).opacity) === 1,
        unfolds: frames[0].transform?.includes('rotateY(90deg)') && frames.at(-1).transform?.includes('rotateY(0deg)'),
      };
    }));
  assert.ok(new Set(tiles.map(tile => tile.delay)).size > 1, 'Visible thumbnails should enter in sequence');
  assert.ok(tiles.every(tile => tile.visible && (reduced ? tile.placesTile : tile.unfolds)));
}

function measureNextFold(button) {
  return button.evaluate(toggle => new Promise(resolve => {
    const rail = toggle.closest('.date-filter');
    const observer = new MutationObserver(() => {
      observer.disconnect();
      const transition = rail.getAnimations().find(animation => animation.transitionProperty === 'height');
      const {duration, easing} = transition?.effect.getTiming() ?? {duration: 0};
      const heights = [];
      function sample() {
        const bounds = rail.getBoundingClientRect();
        heights.push(bounds.height);
        if (rail.getAnimations({subtree: true}).length) requestAnimationFrame(sample);
        else resolve({heights, duration, easing, room: rail.parentElement.getBoundingClientRect().bottom - bounds.top});
      }
      requestAnimationFrame(sample);
    });
    observer.observe(toggle, {attributes: true, attributeFilter: ['aria-expanded']});
  }));
}

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--enable-unsafe-swiftshader'],
});
try {
  await mkdir('.qa', {recursive: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(response.url()); });
  await page.goto('http://127.0.0.1:4173/?light=moonlight', {waitUntil: 'domcontentloaded'});
  await page.getByRole('link', {name: 'Photo grid'}).click();
  const manifest = await (await page.request.get(new URL('/media/grid/index.json', page.url()).href)).json();
  const inRange = (start, end) => manifest.filter(photo => {
    const month = photo.capturedAt?.slice(0, 7);
    return month && month >= start && month <= end;
  });
  const eligible = inRange('2022-01', '2026-12');
  const visibleTiles = '.photo-list .photo';
  const tiles = page.locator(visibleTiles);
  async function assertMetadata(view, photo) {
    const metadata = view.getByRole('complementary', {name: 'Image metadata'});
    const filename = metadata.locator('details').filter({has: view.locator('summary', {hasText: /^System$/})})
      .locator('dt').filter({hasText: /^FileName$/}).locator('+ dd');
    await filename.filter({hasText: photo.name}).waitFor();
    assert.equal(await filename.textContent(), photo.name);
    const record = await (await view.request.get(new URL(photo.metadataUrl, view.url()).href)).json();
    const shown = await metadata.locator('details').evaluateAll(groups => Object.fromEntries(groups.map(group =>
      [group.querySelector('summary').textContent, Object.fromEntries([...group.querySelectorAll('dt')].map(key =>
        [key.textContent, key.nextElementSibling.textContent]))])));
    for (const [key, value] of Object.entries(record.ExifTool)) {
      const split = key.indexOf(':');
      const text = typeof value === 'string' && value !== '' ? value : JSON.stringify(value, null, 2);
      assert.equal(shown[split < 0 ? 'Source' : key.slice(0, split)][key.slice(split + 1)], text, key);
    }
  }
  async function assertEightRows(view) {
    const rects = await view.locator(visibleTiles).evaluateAll(tiles => tiles.slice(0, 9).map(tile => {
      const {x, y} = tile.getBoundingClientRect();
      return {x, y};
    }));
    assert.equal(new Set(rects.slice(0, 8).map(rect => rect.x)).size, 1);
    assert.equal(new Set(rects.slice(0, 8).map(rect => rect.y)).size, 8);
    assert.ok(rects[8].x > rects[0].x && rects[8].y === rects[0].y);
  }
  async function assertFullBleed(view) {
    const card = view.locator('.lead-card');
    await card.scrollIntoViewIfNeeded();
    const cover = await card.boundingBox();
    const viewport = view.viewportSize();
    assert.equal(cover.x, 0);
    assert.equal(cover.y, 0);
    assert.equal(cover.height, viewport.height);
    const scroller = view.locator('#photos');
    assert.equal((await scroller.boundingBox()).width, viewport.width);
    const first = await view.locator(visibleTiles).first().boundingBox();
    assert.equal(first.x, cover.width);
    const second = await view.locator(visibleTiles).nth(1).boundingBox();
    assert.ok(Math.abs(second.y - first.y - first.height) < 1);
    const rail = card.locator('.date-filter');
    const picker = await rail.boundingBox();
    const width = await rail.getAttribute('popover') === 'manual' ? viewport.width : cover.width;
    assert.ok(picker.x >= 0 && picker.x + picker.width <= width && picker.y >= 0 && picker.y + picker.height <= viewport.height);
  }
  await tiles.first().waitFor();
  const card = page.locator('#photos > .lead-card:first-child');
  assert.equal(await card.getByRole('heading', {name: 'Entity', level: 1}).count(), 1);
  const cover = await card.boundingBox();
  const firstTile = await tiles.first().boundingBox();
  const lastRow = await tiles.nth(7).boundingBox();
  assert.ok(cover.x + cover.width <= firstTile.x && cover.y === firstTile.y);
  assert.ok(Math.abs(cover.y + cover.height - lastRow.y - lastRow.height) < 1);
  assert.equal(await tiles.count(), eligible.length);
  await assertEightRows(page);
  await assertFullBleed(page);
  assert.equal(await tiles.first().getAttribute('tabindex'), '0');
  await tiles.first().locator('img').evaluate(img => img.decode());
  await page.waitForLoadState('networkidle');
  await page.screenshot({path: '.qa/grid-desktop.png'});
  const scroll = () => page.locator('#photos').evaluate(el => el.scrollLeft);
  await page.mouse.move(firstTile.x + firstTile.width / 2, firstTile.y + firstTile.height / 2);
  await page.mouse.wheel(0, 680);
  await page.waitForFunction(() => document.querySelector('#photos').scrollLeft >= 650);
  const scrolledCover = await card.boundingBox();
  assert.ok(scrolledCover.x + scrolledCover.width <= 0);
  const wheeled = await scroll();
  await page.mouse.wheel(420, 0);
  await page.waitForFunction(before => document.querySelector('#photos').scrollLeft > before + 300, wheeled);

  await tiles.first().focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await tiles.nth(8).evaluate(tile => tile === document.activeElement), true);
  await page.keyboard.press('End');
  assert.equal(await tiles.last().evaluate(el => el === document.activeElement), true);
  const atEnd = await scroll();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('dialog').evaluate(el => el.open), true);
  await page.locator('#full-photo').evaluate(img => img.decode());
  assert.equal(await page.locator('#full-photo').getAttribute('alt'), eligible.at(-1).name);
  await assertMetadata(page, eligible.at(-1));
  const columns = page.locator('.photo-layout > *');
  const imageBox = await columns.nth(0).boundingBox();
  const colorsBox = await columns.nth(1).boundingBox();
  const metaBox = await columns.nth(2).boundingBox();
  assert.equal(imageBox.x, 0);
  assert.ok([imageBox, colorsBox, metaBox].every(box => box.y === 0 && box.height === page.viewportSize().height));
  assert.ok(Math.abs(imageBox.width - colorsBox.x) < 1 && Math.abs(colorsBox.x + colorsBox.width - metaBox.x) < 1);
  assert.equal(await columns.nth(2).evaluate(el => getComputedStyle(el).backgroundColor),
    await card.evaluate(el => getComputedStyle(el).backgroundColor));
  await page.locator('.swatch-caption strong').first().waitFor();
  const sampled = await page.locator('.swatch-caption strong').allTextContents();
  assert.ok(sampled.length && sampled.every(hex => /^#[0-9A-F]{6}$/.test(hex)));
  const indexed = (await (await page.request.get(new URL(eligible.at(-1).metadataUrl, page.url()).href)).json())['Preview palette'];
  if (indexed) assert.deepEqual(sampled, [...new Set(indexed.palette.map(color => color.hex))]);
  const image = await page.locator('#full-photo').boundingBox();
  assert.ok(image.width >= imageBox.width - 1 && image.height >= imageBox.height - 1);
  await page.screenshot({path: '.qa/grid-detail-desktop.png'});
  for (const [index, box] of [imageBox, colorsBox, metaBox].entries()) {
    const positions = () => columns.evaluateAll(nodes => nodes.map(node => [node.scrollLeft, node.scrollTop]));
    const before = await positions();
    await page.mouse.move(box.x + box.width / 2, box.height / 2);
    await page.mouse.wheel(0, 150);
    await page.waitForFunction(({index, before}) => {
      const pane = document.querySelector('.photo-layout').children[index];
      return pane.scrollLeft !== before[0] || pane.scrollTop !== before[1];
    }, {index, before: before[index]});
    const after = await positions();
    assert.deepEqual(after.filter((_, i) => i !== index), before.filter((_, i) => i !== index));
  }
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await assertMetadata(page, eligible.at(-1));
  await page.keyboard.press('Escape');
  assert.equal(await tiles.last().evaluate(el => el === document.activeElement), true);
  assert.equal(await scroll(), atEnd);

  const shell = page.locator('.date-filter');
  assert.ok((await shell.boundingBox()).x + 66 < 0);
  await card.scrollIntoViewIfNeeded();
  assert.match(await shell.evaluate(el => getComputedStyle(el).backgroundColor), /\/ 0\.88\)$/);
  assert.equal(await shell.evaluate(el => getComputedStyle(el).opacity), '1');
  assert.equal(await shell.locator('.rail-cap').evaluate(el => getComputedStyle(el).backgroundColor), await card.evaluate(el => getComputedStyle(el).backgroundColor));
  const beforeMove = await shell.boundingBox();
  assert.equal(beforeMove.width, 66);
  const grip = await page.locator('.date-filter .rail-grip').boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 600, grip.y + grip.height / 2 - 48, {steps: 6});
  await page.mouse.up();
  const afterMove = await shell.boundingBox();
  assert.equal(afterMove.x, beforeMove.x + 600);
  assert.equal(afterMove.y, beforeMove.y - 48);
  assert.ok(afterMove.x > cover.width);
  await page.mouse.move(700, 100);
  await page.mouse.wheel(0, 750);
  await page.waitForFunction(() => document.querySelector('#photos').scrollLeft >= 740);
  assert.deepEqual(await shell.boundingBox(), afterMove);
  assert.ok(await shell.evaluate(el => {
    const {x, y} = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(x + 32, y + 8));
  }));
  assert.equal(await tiles.count(), eligible.length);
  const toggle = page.locator('.date-filter .rail-toggle');
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  assert.equal((await shell.boundingBox()).height, 48);
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  const caret = await toggle.boundingBox();
  const caretX = caret.x + caret.width / 2, caretY = caret.y + caret.height / 2;
  const remainingRing = () => toggle.locator('circle').evaluate(el => parseFloat(getComputedStyle(el).strokeDashoffset));
  await page.mouse.move(caretX, caretY);
  await page.mouse.down();
  await waitForPartialRing(page);
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await page.mouse.up();
  assert.equal(await remainingRing(), 1);
  await page.waitForTimeout(550);
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await page.mouse.down();
  await page.mouse.move(caretX - caret.width, caretY);
  await page.waitForTimeout(580);
  await page.mouse.up();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await page.mouse.move(caretX, caretY);
  const desktopOpen = measureNextFold(toggle);
  await page.mouse.down();
  await page.waitForFunction(() => document.querySelector('.date-filter .rail-toggle').getAttribute('aria-expanded') === 'true');
  assert.equal(await remainingRing(), 0);
  await page.mouse.up();
  assert.equal(await remainingRing(), 1);
  const opening = await desktopOpen;
  assert.equal(opening.duration, 480);
  assert.ok(Math.max(...opening.heights) > opening.heights.at(-1) + 5, 'Rail must visibly overshoot on open with Reduce Motion enabled');
  const axis = page.locator('.date-axis');
  assert.equal(await axis.locator('.date-tick').count(), 5);
  const rail = await axis.boundingBox();
  const trackX = rail.x + rail.width / 2;
  const yearY = year => Math.max(rail.y + 5, Math.min(rail.y + rail.height - 5, rail.y + rail.height * (2026 - year) / 4));
  async function dragYear(from, to) {
    await page.mouse.move(trackX, yearY(from));
    await page.mouse.down();
    await page.mouse.move(trackX, yearY(to), {steps: 12});
    await page.mouse.up();
  }
  await dragYear(2022, 2023);
  await assertTileReveal(page, true);
  await dragYear(2026, 2024);
  assert.equal(await page.locator('#date-summary').textContent(), '2023 – 2024');
  const filtered = inRange('2023-01', '2024-12');
  assert.deepEqual(await tiles.locator('img').evaluateAll(images => images.map(image => image.alt)), filtered.map(photo => photo.name));
  assert.equal(await scroll(), 0);
  await tiles.last().click();
  assert.equal(await page.locator('#full-photo').getAttribute('alt'), filtered.at(-1).name);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#full-photo').getAttribute('alt'), filtered.at(-1).name);
  await page.keyboard.press('Escape');
  await axis.focus();
  await axis.press('Shift+ArrowUp');
  await axis.press('ArrowDown');
  assert.equal(await page.locator('#date-summary').textContent(), '2024');
  assert.equal(await tiles.count(), inRange('2024-01', '2024-12').length);
  await dragYear(2024, 2023);
  assert.equal(await page.locator('#date-summary').textContent(), '2023 – 2024');
  await axis.press('Shift+PageDown');
  await axis.press('PageUp');
  assert.equal(await tiles.count(), eligible.length);
  await page.mouse.move(trackX, yearY(2024));
  await page.mouse.wheel(0, 1);
  await page.waitForFunction(() => document.querySelector('.end-node').getAttribute('aria-valuenow') === '2025');
  assert.equal(await scroll(), 0);
  await page.screenshot({path: '.qa/grid-rail08-expanded.png'});
  await page.mouse.move(caretX, caretY);
  const desktopClose = measureNextFold(toggle);
  await page.mouse.down();
  await page.waitForFunction(() => document.querySelector('.date-filter .rail-toggle').getAttribute('aria-expanded') === 'false');
  await page.mouse.up();
  const closing = await desktopClose;
  assert.equal(closing.duration, 480);
  assert.equal(closing.heights.at(-1), 48);
  assert.ok(Math.min(...closing.heights) < 47.9, 'Rail must rebound on close with Reduce Motion enabled');
  await toggle.press('Enter');
  assert.equal(await page.locator('#date-summary').textContent(), '2022 – 2025');

  const mobile = await browser.newPage({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, reducedMotion: 'no-preference'});
  await mobile.goto(page.url());
  const firstPhoto = mobile.locator(visibleTiles).first();
  await firstPhoto.locator('img').evaluate(img => img.decode());
  await mobile.waitForLoadState('networkidle');
  await mobile.screenshot({path: '.qa/grid-mobile.png'});
  await assertEightRows(mobile);
  await assertFullBleed(mobile);
  const input = await mobile.context().newCDPSession(mobile);
  await input.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: 330, y: 350}]});
  for (const x of [275, 210, 145, 75]) {
    await input.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x, y: 350}]});
  }
  await input.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await mobile.waitForFunction(() => document.querySelector('#photos').scrollLeft > 100);
  assert.equal(await mobile.locator('dialog').evaluate(el => el.open), false);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth === innerWidth), true);
  await firstPhoto.tap();
  await mobile.locator('#full-photo').evaluate(img => img.decode());
  await mobile.getByRole('button', {name: 'Colors', exact: true}).tap();
  await mobile.waitForFunction(() => Math.abs(document.querySelector('.photo-palette').getBoundingClientRect().x) < 1);
  await mobile.locator('.swatch-caption strong').first().waitFor();
  assert.match(await mobile.locator('.swatch-caption strong').first().textContent(), /^#[0-9A-F]{6}$/);
  await mobile.getByRole('button', {name: 'Metadata', exact: true}).tap();
  await mobile.waitForFunction(() => Math.abs(document.querySelector('.photo-metadata').getBoundingClientRect().x) < 1);
  await assertMetadata(mobile, eligible[0]);
  await mobile.screenshot({path: '.qa/grid-metadata-mobile.png'});
  assert.equal(await mobile.getByRole('button', {name: 'Close', exact: true}).count(), 0);
  await mobile.getByRole('button', {name: 'Image', exact: true}).tap();
  await mobile.locator('#full-photo').tap();
  assert.equal(await mobile.locator('dialog').evaluate(el => el.open), false);
  await mobile.locator('.lead-card').scrollIntoViewIfNeeded();
  // Sample real animation frames after the same long press a visitor uses.
  async function holdAndMeasure(open) {
    const samples = measureNextFold(mobile.locator('.date-filter .rail-toggle'));
    const caret = await mobile.locator('.date-filter .rail-toggle').boundingBox();
    await input.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: caret.x + caret.width / 2, y: caret.y + caret.height / 2}]});
    await waitForPartialRing(mobile);
    await mobile.waitForFunction(value => document.querySelector('.date-filter .rail-toggle').getAttribute('aria-expanded') === value, String(open));
    await input.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    return samples;
  }
  const opened = await holdAndMeasure(true);
  const settled = opened.heights.at(-1);
  const peak = Math.max(...opened.heights);
  assert.equal(opened.duration, 480);
  assert.equal(opened.easing, 'cubic-bezier(0.18, 1.42, 0.32, 1)');
  assert.ok(peak > settled + (settled - 48) * .035 && peak <= opened.room + 1);
  assert.ok(Math.min(...opened.heights.slice(opened.heights.indexOf(peak))) >= settled - .1);
  const mobileRail = await mobile.locator('.date-axis').boundingBox();
  const mobileX = mobileRail.x + mobileRail.width / 2;
  await input.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: mobileX, y: mobileRail.y + mobileRail.height - 5}]});
  await input.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: mobileX, y: mobileRail.y + mobileRail.height / 2}]});
  await input.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  assert.equal(await mobile.locator('.start-node').getAttribute('aria-valuenow'), '2024');
  await assertTileReveal(mobile, false);
  assert.equal(await mobile.locator(visibleTiles).count(), inRange('2024-01', '2026-12').length);
  const closed = await holdAndMeasure(false);
  const minimum = Math.min(...closed.heights);
  assert.equal(closed.duration, 480);
  assert.equal(closed.easing, 'cubic-bezier(0.2, 1.12, 0.34, 1)');
  assert.equal(closed.heights.at(-1), 48);
  assert.ok(minimum < 47.9 && minimum >= 48 - (settled - 48) * .004 - .1);
  assert.ok(Math.max(...closed.heights.slice(closed.heights.indexOf(minimum))) <= 48.1);
  const mobileGrip = await mobile.locator('.date-filter .rail-grip').boundingBox();
  const mobileShell = mobile.locator('.date-filter');
  const touch = {x: mobileGrip.x + mobileGrip.width / 2, y: mobileGrip.y + mobileGrip.height / 2};
  await input.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [touch]});
  await input.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: touch.x + 16, y: touch.y + 16}]});
  await input.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: 389, y: 843}]});
  await input.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  assert.deepEqual(await mobileShell.boundingBox(), {x: 324, y: 796, width: 66, height: 48});
  await mobile.locator('.date-filter .rail-grip').press('ArrowLeft');
  assert.equal((await mobileShell.boundingBox()).x, 308);
  await mobile.setViewportSize({width: 844, height: 390});
  await assertEightRows(mobile);
  await assertFullBleed(mobile);
  const rotated = await mobileShell.boundingBox();
  assert.equal(rotated.y + rotated.height, 390);
  await mobile.locator('.date-filter .rail-toggle').press('Enter');
  await mobile.waitForFunction(() => !document.querySelector('.date-filter').getAnimations({subtree: true}).length);
  const openAtEdge = await mobileShell.boundingBox();
  assert.ok(openAtEdge.height > 200 && openAtEdge.y + openAtEdge.height <= 390);
  const openGrip = await mobile.locator('.date-filter .rail-grip').boundingBox();
  await input.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: openGrip.x + 32, y: openGrip.y + 7}]});
  await input.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: 1, y: 1}]});
  await input.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  const upperLeft = await mobileShell.boundingBox();
  assert.equal(upperLeft.x, 0);
  assert.equal(upperLeft.y, 0);
  assert.equal(await mobile.locator('.date-filter .rail-toggle').getAttribute('aria-expanded'), 'true');
  assert.equal(await page.getByRole('link', {name: 'Nebula'}).count(), 0);
  assert.deepEqual(errors, []);
  console.log(`Verified window-wide rail dragging, viewport edges and rotation, hold-to-open, and filtering across ${eligible.length} dated images.`);
} finally {
  await browser.close();
}
