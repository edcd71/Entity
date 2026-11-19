import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--enable-unsafe-swiftshader'],
});
try {
  await mkdir('.qa', {recursive: true});
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
    await page.addInitScript(() => {
      window.titleDraws = 0;
      for (const method of ['drawArrays', 'drawElements']) {
        const draw = WebGL2RenderingContext.prototype[method];
        WebGL2RenderingContext.prototype[method] = function (...args) {
          if (this.canvas.matches('.title-webgl')) window.titleDraws++;
          return draw.apply(this, args);
        };
      }
      const observer = new MutationObserver(() => {
        const canvas = document.querySelector('.title-webgl');
        if (!canvas) return;
        observer.disconnect();
        window.titleFollowsGrid = !document.querySelector('.lead-reveal') && !document.getAnimations().some(animation => animation.effect.target.matches('.photo img'));
      });
      observer.observe(document, {childList: true, subtree: true});
    });
    await page.goto('http://127.0.0.1:4173/app/grid.html');
    await page.locator('.title-webgl[data-phase="assembling"]').waitFor();
    await page.locator('.lead-card').screenshot({path: `.qa/title-three-assembling-${reducedMotion}.png`});
    await page.locator('.title-webgl[data-phase="settled"]').waitFor();
    assert.equal(await page.evaluate(() => window.titleFollowsGrid), true);
    const heading = page.getByRole('heading', {name: 'Entity', exact: true});
    assert.equal(await heading.textContent(), 'Entity');
    assert.equal(await heading.getAttribute('data-motion'), 'full');
    const draws = await page.evaluate(() => window.titleDraws);
    assert.ok(draws > 5, 'The title must actually render through WebGL');
    await page.waitForTimeout(180);
    assert.equal(await page.evaluate(() => window.titleDraws), draws, 'Settled title must not render continuously');
    const beforePointer = await page.locator('.lead-card').screenshot({path: `.qa/title-three-1440-${reducedMotion}.png`});
    const bounds = await heading.boundingBox();
    await page.mouse.move(bounds.x + bounds.width * .4, bounds.y + bounds.height * .45);
    await page.waitForFunction(before => window.titleDraws > before + 8, draws);
    const afterPointer = await page.locator('.lead-card').screenshot({path: `.qa/title-three-pointer-${reducedMotion}.png`});
    assert.equal(beforePointer.equals(afterPointer), false, 'Explicit full motion should enable pointer tilt with either system preference');
    await page.mouse.move(1000, 800);
    await page.locator('.title-webgl[data-phase="settled"]').waitFor();
    await page.emulateMedia({reducedMotion: reducedMotion === 'reduce' ? 'no-preference' : 'reduce'});
    await page.locator('.title-webgl[data-phase="settled"]').waitFor();
    await page.emulateMedia({reducedMotion});
    for (const [width, height] of [[390, 844], [667, 375], [1440, 900]]) {
      await page.setViewportSize({width, height});
      await page.waitForFunction(() => {
        const title = document.querySelector('.lead-card h1');
        const canvas = title.querySelector('.title-webgl');
        return canvas?.dataset.phase === 'settled' && canvas.getBoundingClientRect().width < title.getBoundingClientRect().width * 1.4;
      });
      await page.locator('.lead-card').screenshot({path: `.qa/title-three-${width}-${reducedMotion}.png`});
      assert.equal(await heading.textContent(), 'Entity');
    }
    await page.locator('.date-filter .rail-toggle').press('Enter');
    await page.locator('.end-node').press('ArrowDown');
    assert.equal(await page.locator('#date-summary').textContent(), '2022 – 2025');
    assert.equal(await page.locator('.title-webgl').getAttribute('data-phase'), 'settled');
    await page.locator('.photo').first().click();
    await page.locator('#full-photo').evaluate(image => image.decode());
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('dialog').evaluate(dialog => dialog.open), false);
    assert.deepEqual(errors, []);
    // A lost GPU context must restore the tiled DOM title rather than leave it blank.
    await page.locator('.title-webgl').evaluate(canvas => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
    await page.locator('.title-fragment').first().waitFor();
    assert.equal(await page.locator('.title-webgl').count(), 0);
    assert.equal(await heading.textContent(), 'Entity');
    console.log(`${reducedMotion}: WebGL assembly, readable title, pointer behavior, idle rendering, resize, filtering, detail, and context-loss fallback passed.`);
    await page.close();
  }
  const fallback = await browser.newPage();
  await fallback.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === 'webgl2' ? null : getContext.call(this, type, ...args);
    };
  });
  await fallback.goto('http://127.0.0.1:4173/app/grid.html');
  await fallback.locator('.title-fragment').first().waitFor();
  assert.equal(await fallback.getByRole('heading', {name: 'Entity', exact: true}).count(), 1);
  assert.ok(await fallback.locator('.photo').count() > 900);
  console.log('WebGL-unavailable fallback passed.');
  await fallback.close();
} finally {await browser.close();}
