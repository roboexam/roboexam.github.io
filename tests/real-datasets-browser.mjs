// Uses the host's actual catalog and media; no interception or dataset fixtures.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs REAL_DATASETS_TEST_URL=http://127.0.0.1:3327 \
// node tests/real-datasets-browser.mjs
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.REAL_DATASETS_TEST_URL || "http://127.0.0.1:3327";
const screenshots = await mkdtemp(path.join(tmpdir(), "real-datasets-browser-"));
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"],
  ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
const errors = [];
const verified = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  context.setDefaultTimeout(90000);
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  const catalogResponse = await context.request.get(base + "/api/real-datasets");
  assert.equal(catalogResponse.status(), 200);
  const catalog = await catalogResponse.json();
  assert.equal(catalog.schemaVersion, "roboexam.real-datasets.v1");
  assert.ok(catalog.datasets.length > 0, "actual catalog must contain datasets");
  await page.goto(base + "/datasets");
  await page.getByRole("button", { name: /^Real & Ego/ }).click();
  await page.locator(".realDatasetList button").first().waitFor();
  assert.equal(await page.locator(".realDatasetList button").count(), catalog.datasets.length);

  for (const kind of ["robot", "ego"]) {
    const candidates = catalog.datasets.filter(dataset => dataset.kind === kind && dataset.availability === "available");
    assert.ok(candidates.length, `actual ${kind} dataset required`);
    await page.getByRole("button", { name: kind === "robot" ? "Real robot" : "Ego", exact: true }).click();
    const dataset = candidates[0];
    const entriesResponse = await context.request.get(base + "/api/real-datasets?dataset=" + encodeURIComponent(dataset.id));
    assert.equal(entriesResponse.status(), 200);
    const entries = await entriesResponse.json();
    assert.ok(entries.episodes.length > 1, `${dataset.name} requires two actual episodes for switching`);
    await page.locator(".realDatasetList button").filter({ has: page.getByText(dataset.name, { exact: true }) }).click();
    await page.waitForFunction(name => document.querySelector(".realDatasetPanel .rawReviewHeading h3")?.textContent === name, dataset.name);
    const selected = page.locator(".realDatasetPanel .reviewEpisodeControls select");
    await selected.waitFor();
    assert.equal(await selected.locator("option").count(), entries.episodes.length);
    await selected.selectOption(entries.episodes[0].id);
    const episodeResponse = await context.request.get(base + "/api/real-datasets?episode=" + encodeURIComponent(entries.episodes[0].id));
    assert.equal(episodeResponse.status(), 200);
    const episode = await episodeResponse.json();
    assert.equal(episode.datasetId, dataset.id);
    assert.ok(episode.media.length > 0, `${dataset.name} episode has real media`);
    const fastPlayback = episode.media.every(view => view.renditionUrl);
    await page.waitForFunction(id => document.querySelector(".realPlayer")?.dataset.episodeId === id, episode.id);
    await page.waitForFunction(() => [...document.querySelectorAll(".realCameraGrid video")].every(video => video.readyState >= 3));
    assert.equal(await page.locator(".realCameraGrid video").count(), episode.media.length);
    assert.equal(await page.getByRole("combobox", { name: "视频清晰度", exact: true }).inputValue(), fastPlayback ? "fast" : "original");
    await page.getByRole("combobox", { name: "样本播放速度", exact: true }).selectOption("2");
    assert.ok(await page.locator(".realCameraGrid video").evaluateAll(videos => videos.every(video => video.playbackRate === 2)));
    await page.locator(".actionTracePanel").waitFor();
    assert.equal(await page.locator(".actionTracePanel.traceUnavailable").count(), 0, `${dataset.name} action trace must be available`);
    const mediaResponse = await context.request.get(new URL(fastPlayback ? episode.media[0].renditionUrl : episode.media[0].url, base).href, { headers: { range: "bytes=0-31" } });
    assert.equal(mediaResponse.status(), 206);
    assert.equal((await mediaResponse.body()).length, 32);
    const before = await page.locator(".realCameraGrid video").evaluateAll(videos => videos.map(video => video.currentTime));
    await page.getByRole("button", { name: "播放所有相机", exact: true }).click();
    await page.waitForFunction(times => [...document.querySelectorAll(".realCameraGrid video")].every((video, index) => video.currentTime > times[index] + .15), before);
    await page.getByRole("button", { name: "暂停所有相机", exact: true }).click();
    const seek = Math.min(.5, episode.durationSeconds / 2);
    await page.getByRole("slider", { name: "样本播放进度", exact: true }).fill(String(seek));
    await page.waitForFunction(({ media, seek, fastPlayback }) => [...document.querySelectorAll(".realCameraGrid video")].every((video, index) =>
      Math.abs(video.currentTime - (fastPlayback ? 0 : media[index].startSeconds) - seek) < .2), { media: episode.media, seek, fastPlayback });
    await page.screenshot({ path: path.join(screenshots, kind + "-desktop.png"), fullPage: true });
    await page.getByRole("button", { name: "下一条 Real & Ego 样本", exact: true }).click();
    await page.waitForFunction(id => document.querySelector(".realPlayer")?.dataset.episodeId === id, entries.episodes[1].id);
    assert.equal(await selected.inputValue(), entries.episodes[1].id);
    await page.waitForFunction(() => [...document.querySelectorAll(".realCameraGrid video")].every(video => video.paused));
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.screenshot({ path: path.join(screenshots, `${kind}-mobile-${width}.png`), fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `horizontal overflow at ${width}px`);
      assert.equal(await selected.inputValue(), entries.episodes[1].id);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    verified.push({ kind, dataset: dataset.name, datasetId: dataset.id, episodeId: episode.id, cameras: episode.media.length });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, datasets: catalog.datasets.length, verified, screenshots,
    checks: "actual catalog, both kinds, source-bound media range, playback, episode-relative seek, dataset/episode switching, desktop/mobile" }));
  await context.close();
} finally { await browser.close(); }
