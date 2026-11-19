import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--enable-unsafe-swiftshader']});
const url = 'http://127.0.0.1:4173/app/grid.html';
async function atPhoto(page, index = 19) {
  const button = page.locator('.photo').nth(index);
  await button.locator('img').evaluate(image => image.decode());
  const box = await button.boundingBox();
  // Hover resumes only after scrolling settles and the pointer moves again.
  await page.waitForTimeout(240);
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5);
  await page.mouse.move(box.x + box.width * .65, box.y + box.height * .35);
  await page.locator('.grid-hover:not([hidden])[data-phase="settled"]').waitFor();
  return button;
}
async function assertRestored(page) {
  await page.waitForFunction(() => !document.querySelector('.three-hover') && !document.querySelector('.grid-hover:not([hidden])'));
  assert.equal(await page.locator('.photo img').evaluateAll(images => images.every(image => getComputedStyle(image).opacity === '1')), true);
}
async function assertScrollHoverPauses(page) {
  await atPhoto(page);
  const x = 900, y = 420;
  for (const [dx, dy] of [[0, 65], [65, 0]]) {
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(dx, dy);
      await page.waitForTimeout(25);
      await page.mouse.move(x + i % 2, y);
      await page.waitForTimeout(35);
      assert.equal(await page.locator('.three-hover').count(), 0, 'Pointer jitter during scrolling must not lift photos');
      assert.equal(await page.locator('.grid-hover:not([hidden])').count(), 0);
    }
  }
  await page.waitForTimeout(240);
  // Scrolling changes the hit target even when the physical cursor is still.
  await page.evaluate(({x, y}) => document.elementFromPoint(x, y).dispatchEvent(
    new PointerEvent('pointermove', {bubbles: true, pointerType: 'mouse', clientX: x, clientY: y})
  ), {x: x + 1, y});
  await assertRestored(page);
  await page.mouse.move(x + 12, y + 12);
  await page.locator('.grid-hover:not([hidden])[data-phase="settled"]').waitFor();
  // A native smooth scroll models the scroll events after wheel input ends.
  const start = await page.locator('#photos').evaluate(grid => {
    const start = grid.scrollLeft;
    grid.scrollBy({left: 600, behavior: 'smooth'});
    return start;
  });
  await page.waitForFunction(start => document.querySelector('#photos').scrollLeft > start, start);
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(30);
    await page.mouse.move(x + i % 2, y);
    await page.waitForTimeout(20);
    assert.equal(await page.locator('.three-hover').count(), 0, 'Momentum scrolling must keep photos in the grid');
  }
  await page.waitForTimeout(600);
  await assertRestored(page);
  await page.locator('#photos').evaluate(grid => grid.scrollLeft = 0);
  await atPhoto(page);
  // Wheel input also pauses hover at the edge, where no scroll event fires.
  await page.mouse.wheel(0, -100);
  await page.mouse.move(x, y);
  await page.waitForTimeout(50);
  await assertRestored(page);
}
try {
  await mkdir('.qa', {recursive: true});
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
    await page.addInitScript(() => {
      window.hoverDraws = 0;
      for (const name of ['drawArrays', 'drawElements']) {
        const original = WebGL2RenderingContext.prototype[name];
        WebGL2RenderingContext.prototype[name] = function (...args) {
          if (this.canvas.matches('.grid-hover')) window.hoverDraws++;
          return original.apply(this, args);
        };
      }
    });
    await page.goto(url);
    await page.locator('.title-webgl[data-phase="settled"]').waitFor();
    assert.equal(await page.locator('.grid-hover').count(), 0, 'Load grid WebGL only when needed');
    await page.locator('.photo img').evaluateAll(images => Promise.all(images.filter(image => image.getBoundingClientRect().left < innerWidth).map(image => image.decode())));
    const clip = {x: 680, y: 225, width: 405, height: 338};
    const imageLayout = () => page.locator('.photo img').evaluateAll(images => images.slice(0, 56).map(image => {
      const {x, y, width, height} = image.getBoundingClientRect();
      const style = getComputedStyle(image);
      return {x, y, width, height, source: image.currentSrc, fit: style.objectFit, crop: style.objectPosition};
    }));
    const originalLayout = await imageLayout();
    const before = await page.screenshot({clip, path: `.qa/grid-hover-before-${reducedMotion}.png`});
    const photo = await atPhoto(page);
    const name = await photo.locator('img').getAttribute('alt');
    const active = await page.locator('.three-hover').count();
    assert.ok(active >= 4 && active <= 24, 'Only the local group should lift');
    assert.equal(await page.locator('.grid-hover').count(), 1);
    assert.equal(await page.locator('.grid-hover').evaluate(canvas => getComputedStyle(canvas).pointerEvents), 'none');
    const during = await page.screenshot({clip, path: `.qa/grid-hover-${reducedMotion}.png`});
    assert.equal(before.equals(during), false, 'The rendered hover must visibly change the tiles');
    const draws = await page.evaluate(() => window.hoverDraws);
    assert.ok(draws > 30);
    await page.waitForTimeout(160);
    assert.equal(await page.evaluate(() => window.hoverDraws), draws, 'Do not draw continuously while the pointer is still');
    // The overlay must leave the native image button accessible and clickable.
    assert.equal(await photo.getByRole('img', {name, exact: true}).count(), 1);
    await photo.click();
    await page.locator('#full-photo').evaluate(image => image.decode());
    assert.equal(await page.locator('#full-photo').getAttribute('alt'), name);
    await assertRestored(page);
    await page.keyboard.press('Escape');
    await atPhoto(page);
    await page.mouse.move(50, 750);
    await assertRestored(page);
    // Escape correctly restores keyboard focus. Match the original unfocused
    // state before comparing image pixels, excluding its intentional outline.
    await page.locator('.photo:focus').evaluate(button => button.blur());
    await page.screenshot({clip, path: `.qa/grid-hover-restored-${reducedMotion}.png`});
    assert.deepEqual(await imageLayout(), originalLayout, 'Restored photos must retain their source, geometry, and crop');
    // Rapidly traversing columns must still use one bounded renderer.
    for (const index of [3, 11, 27, 35, 43, 19]) {
      const box = await page.locator('.photo').nth(index).boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      assert.ok(await page.locator('.three-hover').count() <= 24);
    }
    await page.mouse.wheel(0, 420);
    await page.waitForFunction(() => document.querySelector('#photos').scrollLeft > 300);
    await assertRestored(page);
    await page.locator('#photos').evaluate(grid => {grid.scrollLeft = 0;});
    await assertScrollHoverPauses(page);
    await atPhoto(page);
    await page.locator('.date-filter .rail-toggle').press('Enter');
    await page.locator('.end-node').press('ArrowDown');
    await page.waitForFunction(() => !document.getAnimations().length);
    await assertRestored(page);
    assert.equal(await page.locator('#date-summary').textContent(), '2022 – 2025');
    const filtered = await atPhoto(page);
    const filteredName = await filtered.locator('img').getAttribute('alt');
    await filtered.click();
    assert.equal(await page.locator('#full-photo').getAttribute('alt'), filteredName);
    await page.keyboard.press('Escape');
    await atPhoto(page);
    await page.setViewportSize({width: 1024, height: 768});
    await assertRestored(page);
    await atPhoto(page, 11);
    await page.locator('.theme-filter .rail-toggle').press('Enter');
    for (const mode of ['Light', 'Dark', 'Blue']) {
      await page.getByRole('radio', {name: mode, exact: true}).check();
      await atPhoto(page, 11);
      assert.equal(await page.locator('html').getAttribute('data-theme'), mode.toLowerCase());
    }
    assert.deepEqual(errors, []);
    await page.locator('.grid-hover').evaluate(canvas => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
    await assertRestored(page);
    assert.equal(await page.locator('.grid-hover').count(), 0);
    assert.equal(await page.locator('.title-webgl').count(), 1, 'Loss of the hover context must not affect the title');
    await page.locator('.photo').first().click();
    assert.equal(await page.locator('dialog').evaluate(dialog => dialog.open), true);
    console.log(`${reducedMotion}: shared 3D hover, bounded resources, idle rendering, unchanged rest state, click-through, scrolling with pointer movement, momentum, filters, resize, and GPU fallback passed.`);
    await page.close();
  }
  const mobile = await browser.newPage({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  await mobile.goto(url);
  await mobile.locator('.title-webgl[data-phase="settled"]').waitFor();
  const first = mobile.locator('.photo').first();
  await first.tap();
  assert.equal(await mobile.locator('dialog').evaluate(dialog => dialog.open), true);
  await mobile.keyboard.press('Escape');
  const cdp = await mobile.context().newCDPSession(mobile);
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: 365, y: 400}]});
  for (const x of [325, 275, 225, 175, 125, 75]) await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x, y: 400}]});
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await mobile.waitForFunction(() => document.querySelector('#photos').scrollLeft > 100);
  assert.equal(await mobile.locator('.grid-hover').count(), 0, 'Touch should not allocate a hover renderer');
  await mobile.close();
  const fallback = await browser.newPage();
  await fallback.goto(url);
  await fallback.locator('.title-webgl[data-phase="settled"]').waitFor();
  await fallback.evaluate(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {return type === 'webgl2' ? null : original.call(this, type, ...args);};
  });
  await fallback.locator('.photo').first().hover();
  await fallback.waitForTimeout(500);
  await assertRestored(fallback);
  await fallback.locator('.photo').first().click();
  assert.equal(await fallback.locator('dialog').evaluate(dialog => dialog.open), true);
  await fallback.close();
  console.log('Native touch gestures and WebGL-unavailable fallback passed.');
} finally {await browser.close();}
