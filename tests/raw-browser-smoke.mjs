// Run against an isolated built preview; fixtures never write to the public mount.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs RAW_TEST_URL=http://127.0.0.1:3327 \
// node --experimental-strip-types tests/raw-browser-smoke.mjs
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRawReviewReader } from "../app/data/raw-review.server.ts";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.RAW_TEST_URL || "http://127.0.0.1:3327";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"],
  ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
const fixtures = await mkdtemp(path.join(tmpdir(), "raw-browser-fixture-"));
const screenshots = await mkdtemp(path.join(tmpdir(), "raw-browser-screenshots-"));
const errors = [];
async function ready(page) {
  await page.waitForFunction(() => !!document.querySelector(".researchNavItem") &&
    Object.keys(document.querySelector(".researchNavItem")).some(key => key.startsWith("__reactProps$")));
}
async function selected(page) {
  return page.getByRole("combobox", { name: /选择样本/ }).inputValue();
}
async function fixtureEpisode(relative) {
  const folder = path.join(fixtures, relative);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "episode_manifest.json"), JSON.stringify({ instruction: relative, scene_seed: 7 }));
  return folder;
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  context.setDefaultTimeout(60000);
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base + "/login");
  assert.equal(new URL(page.url()).pathname, "/");
  await ready(page);
  await page.getByRole("button", { name: "Datasets", exact: true }).click();
  await page.locator(".rawReviewCrossLink").waitFor();
  const catalog = await (await context.request.get(base + "/api/raw-review")).json();
  assert.ok(catalog.tasks.length > 0 && catalog.count > 0);
  assert.equal(await page.getByLabel("选择公盘场景").locator("option").count(), catalog.tasks.length);
  await page.getByLabel("选择公盘场景").selectOption("arrange_largest_number");
  await page.locator(".rawReviewFolders button").filter({ hasText: /^clean_official/ }).click();
  await page.locator(".rawReviewPanel").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll(".syncStage video").length === 3 &&
    [...document.querySelectorAll(".syncStage video")].every(video => video.readyState >= 1)).catch(async error => {
      console.error(await page.locator(".rawReviewPanel").innerText());
      console.error(await page.locator("video").evaluateAll(videos => videos.map(video => ({ src: video.src, state: video.readyState, error: video.error?.message }))));
      throw error;
    });
  const episodeId = await selected(page);
  const sources = await page.locator(".syncStage video").evaluateAll(videos => videos.map(video => video.getAttribute("src")));
  await page.getByRole("button", { name: /^Play arrange_largest_number/ }).click();
  await page.waitForFunction(() => [...document.querySelectorAll(".syncStage video")].every(video => video.currentTime > .2));
  await page.getByRole("button", { name: /^Pause arrange_largest_number/ }).click();
  await page.getByRole("slider").fill("1");
  await page.waitForFunction(() => [...document.querySelectorAll(".syncStage video")].every(video => Math.abs(video.currentTime - 1) < .2));
  const range = await context.request.get(base + sources[0], { headers: { range: "bytes=0-31" } });
  assert.equal(range.status(), 206); assert.equal((await range.body()).length, 32);
  assert.equal((await context.request.head(base + sources[0])).status(), 200);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: path.join(screenshots, "datasets-desktop.png"), fullPage: true });
  await page.getByRole("link", { name: "在 Review 质检此样本 →" }).click();
  await page.locator(".reviewNotes").waitFor();
  assert.equal(await selected(page), episodeId);
  assert.deepEqual(await page.locator(".syncStage video").evaluateAll(videos => videos.map(video => video.getAttribute("src"))), sources);
  await page.getByLabel("问题与时间点").fill("raw browser smoke note");
  await page.getByRole("button", { name: "保存本条记录", exact: true }).click();
  await page.getByRole("button", { name: "下一条样本", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".reviewNotes textarea")?.value === "");
  assert.notEqual(await selected(page), episodeId);
  await page.getByRole("button", { name: "上一条样本", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".reviewNotes textarea")?.value === "raw browser smoke note");
  await page.getByLabel("选择公盘场景").selectOption("build_tower");
  await page.waitForFunction(() => document.querySelector(".reviewTaskHeading small")?.textContent === "build_tower" &&
    document.querySelector(".rawReviewCrossLink")?.getAttribute("href")?.includes("task=build_tower"));
  assert.notEqual(await selected(page), episodeId);
  await page.getByRole("link", { name: "在 Datasets 查看此样本 →" }).click();
  await page.locator(".rawReviewCrossLink").waitFor();
  assert.equal(await page.getByLabel("选择公盘场景").inputValue(), "build_tower");
  await page.getByRole("button", { name: /^Coverage/ }).click();
  const buildTask = catalog.tasks.find(task => task.name === "build_tower");
  assert.equal(await page.getByRole("button", { name: "Browse build_tower episodes", exact: true }).innerText(), String(buildTask.count));
  await page.getByRole("button", { name: "Browse build_tower episodes", exact: true }).click();
  await page.locator(".rawReviewCrossLink").waitFor();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({ path: path.join(screenshots, `datasets-mobile-${width}.png`), fullPage: true });
    const overflow = await page.evaluate(() => [...document.querySelectorAll("body *")].filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.right > innerWidth + 1 && getComputedStyle(element).position !== "absolute" &&
        !element.closest(".rawReviewFolders");
    }).map(element => ({ tag: element.tagName, className: String(element.className), width: element.getBoundingClientRect().width })).slice(0, 15));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}: ${JSON.stringify(overflow)}; screenshots: ${screenshots}`);
  }
  await context.close();

  // Exercise real directory scans through intercepted HTTP responses, including
  // mutations, missing roots, polling and recovery without touching public data.
  const reader = createRawReviewReader({ root: fixtures, refreshMs: 50 });
  await fixtureEpisode("alpha/clean/episode_1");
  await fixtureEpisode("alpha/clean/episode_2");
  const live = await browser.newContext();
  live.setDefaultTimeout(60000);
  let unavailable = false;
  await live.route("**/api/raw-review*", async route => {
    const url = new URL(route.request().url());
    if (url.pathname !== "/api/raw-review") return route.continue();
    if (unavailable) return route.fulfill({ status: 503, json: { error: "raw_unavailable" } });
    const value = url.searchParams.has("episode") ? await reader.episode(url.searchParams.get("episode")) :
      url.searchParams.has("task") ? await reader.task(url.searchParams.get("task")) : await reader.catalog(url.searchParams.get("refresh") === "1");
    await route.fulfill({ status: value ? 200 : 404, json: value || { error: "not_found" } });
  });
  const dynamic = await live.newPage();
  dynamic.on("pageerror", error => errors.push(error.message));
  await dynamic.goto(base + "/datasets");
  await dynamic.locator(".rawReviewCrossLink").waitFor();
  await fixtureEpisode("beta/new_category/nested/episode_3");
  await dynamic.getByRole("button", { name: "刷新", exact: true }).click();
  await dynamic.waitForFunction(() => document.querySelectorAll('[aria-label="选择公盘场景"] option').length === 2);
  await dynamic.getByLabel("选择公盘场景").selectOption("beta");
  await dynamic.waitForFunction(() => document.querySelector(".reviewInstruction")?.textContent === "beta/new_category/nested/episode_3");
  await rm(path.join(fixtures, "beta"), { recursive: true });
  // Polling must discover the removal without another click.
  await dynamic.waitForFunction(() => document.querySelectorAll('[aria-label="选择公盘场景"] option').length === 1);
  await dynamic.waitForFunction(() => document.querySelector(".reviewInstruction")?.textContent === "alpha/clean/episode_1");
  await rm(path.join(fixtures, "alpha/clean/episode_1"), { recursive: true });
  await dynamic.waitForFunction(() => document.querySelector(".reviewInstruction")?.textContent === "alpha/clean/episode_2");
  await dynamic.getByRole("link", { name: "在 Review 质检此样本 →" }).click();
  await dynamic.locator(".reviewNotes").waitFor();
  await dynamic.getByLabel("问题与时间点").fill("keep unsaved notes during mount outage");
  unavailable = true;
  await dynamic.getByRole("button", { name: "刷新", exact: true }).click();
  await dynamic.getByText("目录统计为上次扫描结果", { exact: false }).waitFor();
  assert.equal(await dynamic.getByLabel("问题与时间点").inputValue(), "keep unsaved notes during mount outage");
  unavailable = false;
  await dynamic.getByRole("button", { name: "刷新", exact: true }).click();
  await dynamic.waitForFunction(() => document.querySelectorAll(".reviewError").length === 0);
  await live.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, tasks: catalog.tasks.length, entries: catalog.count, screenshots,
    checks: "login redirect, anonymous access, shared counts, playback/seek/range, exact cross-page identity, task/episode switching, notes, desktop/mobile, directory add/remove, polling, outage/recovery" }));
} finally {
  await browser.close();
  await rm(fixtures, { recursive: true, force: true });
}
