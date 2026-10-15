// Run against a built preview; credentials stay in the environment, never in output.
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs AUTH_SESSION_SECRET=... node tests/curated-browser-smoke.mjs
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.CURATED_TEST_URL || 'http://127.0.0.1:3317';
assert.ok(process.env.AUTH_SESSION_SECRET);
const payload = `browser-review.${Math.floor(Date.now() / 1000) + 600}`;
const value = `${payload}.${createHmac('sha256', process.env.AUTH_SESSION_SECRET).update(payload).digest('hex')}`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  context.setDefaultTimeout(60000);
  await context.addCookies([{ name: 'unibench_session', value, url: base }]);
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const nav = document.querySelector('.researchNavItem');
    return nav && Object.keys(nav).some(k => k.startsWith('__reactProps$'));
  });
  await page.getByRole('button', { name: '数据集', exact: true }).click();
  await page.locator('.curatedGrid video').first().waitFor();
  // Chromium may defer offscreen video loading, especially across the public Funnel.
  await page.locator('.curatedGrid').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll('.curatedGrid video').length === 2 && [...document.querySelectorAll('.curatedGrid video')].every(v => v.readyState >= 2), null, { timeout: 60000 });
  const clean = page.locator('.curatedCard-clean');
  const recovery = page.locator('.curatedCard-recovery');
  assert.equal(await page.locator('.curatedCard').count(), 3);
  assert.equal(await page.locator('.curatedCard-ood video').count(), 0);
  const rects = await page.locator('.curatedCard').evaluateAll(es => es.map(e => ({ x:e.getBoundingClientRect().x, y:e.getBoundingClientRect().y })));
  assert.equal(rects[0].y, rects[2].y); assert.ok(rects[0].x < rects[1].x && rects[1].x < rects[2].x);
  const video = clean.locator('video');
  await video.evaluate(v => v.play());
  await page.waitForFunction(() => document.querySelector('.curatedCard-clean video').currentTime > .3);
  await video.evaluate(v => v.pause());
  await clean.getByRole('slider').fill('10');
  await page.waitForFunction(() => Math.abs(document.querySelector('.curatedCard-clean video').currentTime - 10) < .2);
  const firstSrc = await video.getAttribute('src');
  await clean.getByRole('button', { name:'左腕相机', exact:true }).click();
  assert.notEqual(await clean.locator('video').getAttribute('src'), firstSrc);
  await clean.getByRole('button', { name:'Clean / Success 下一条', exact:true }).click();
  assert.equal(await clean.getByRole('button', { name:'头部相机', exact:true }).getAttribute('aria-pressed'), 'true');
  await recovery.getByLabel('错误类型').selectOption('wrong_object');
  const options = await recovery.getByRole('combobox', { name:'Failure Recovery 选择 episode' }).locator('option').allTextContents();
  assert.ok(options.length > 0 && options.every(t => t.includes('拿错物体')));
  const request = context.request;
  const small = await request.get(`${base}${firstSrc}`, { headers:{range:'bytes=0-1023'} });
  assert.equal(small.status(), 206); assert.equal((await small.body()).length,1024);
  const suffix = await request.get(`${base}${firstSrc}`, { headers:{range:'bytes=-128'} });
  assert.equal(suffix.status(),206); assert.equal((await suffix.body()).length,128);
  assert.equal((await request.head(`${base}${firstSrc}`)).status(),200);
  assert.equal((await request.get(`${base}${firstSrc}`, { headers:{range:'bytes=999999999999-'} })).status(),416);
  assert.equal((await request.get(`${base}/api/curated-media/${'0'.repeat(64)}.mp4`)).status(),404);
  const anonymous = await browser.newContext();
  assert.ok([307,401].includes((await anonymous.request.get(`${base}${firstSrc}`, {maxRedirects:0})).status()));
  await anonymous.close();
  const output = await mkdtemp(path.join(tmpdir(), 'curated-browser-review-'));
  await page.evaluate(() => window.scrollTo({ top:0, behavior:'instant' }));
  await page.screenshot({ path:path.join(output,'desktop.png'), fullPage:true });
  await page.getByLabel('选择任务', {exact:true}).selectOption('hang_mugs');
  await page.waitForFunction(() => document.querySelectorAll('.curatedGrid video').length === 1);
  assert.equal(await recovery.locator('video').count(),0);
  await page.getByLabel('选择任务', {exact:true}).selectOption('store_tools_in_toolbox');
  await page.waitForFunction(() => document.querySelectorAll('.curatedGrid video').length === 2);
  assert.equal(await clean.getByRole('button', {name:'头部相机',exact:true}).getAttribute('aria-pressed'),'true');
  for (const width of [390,320]) {
    await page.setViewportSize({width,height:844});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
    const cards = await page.locator('.curatedCard').evaluateAll(es => es.map(e => e.getBoundingClientRect().y));
    assert.ok(cards[0] < cards[1] && cards[1] < cards[2]);
    await page.screenshot({path:path.join(output,`mobile-${width}.png`),fullPage:true});
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed:true, screenshots:output, checks:'task/category/episode/camera switching, real playback/seek, media auth/ranges, desktop/mobile layout' }));
} finally { await browser.close(); }
