import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import catalog from "../app/data/generated/home-demos.json" with { type: "json" };
import registry from "../scripts/home-demo-media.json" with { type: "json" };
import wall from "../app/data/generated/hero-wall.json" with { type: "json" };
import { resolveHomeDemoMedia } from "../app/api/home-demo-media/[file]/route.ts";

const clips = [...catalog.featured, ...catalog.strip];
const wallMedia = wall.columns.flatMap((column) => [column.video, column.poster]);

test("homepage demo catalog is browser-safe and fully allowlisted", () => {
  assert.equal(catalog.schema, "roboexam.home-demos.v1");
  assert.doesNotMatch(JSON.stringify(catalog), /\/mnt\/|lerobot_data_v3|\.\.\//, "no host paths reach the browser");
  assert.ok(catalog.featured.length >= 1 && catalog.strip.length >= 1);
  for (const clip of clips) {
    for (const media of [clip.video, clip.poster]) {
      const item = registry[media.file];
      assert.ok(item, `${media.file} is allowlisted`);
      assert.equal(item.sha256, media.sha256);
      assert.equal(item.size, media.bytes);
      assert.equal(media.file, `${media.sha256}.${media.file.endsWith(".jpg") ? "jpg" : "mp4"}`);
    }
    assert.ok(clip.speed >= 2 && clip.duration > 0);
    assert.ok(catalog.rigs.some((rig) => rig.id === clip.rig) && catalog.tasks.some((task) => task.id === clip.task));
  }
  assert.equal(catalog.totals.episodes, catalog.rigs.reduce((sum, rig) => sum + rig.episodes, 0));
  assert.equal(catalog.totals.datasets, catalog.rigs.reduce((sum, rig) => sum + rig.datasets, 0));
});

test("hero wall has one column per track, all allowlisted in versioned bundles", () => {
  assert.equal(wall.schema, "roboexam.hero-wall.v1");
  assert.deepEqual(wall.columns.map((column) => column.track), ["T1", "T2", "T3", "T4"]);
  assert.doesNotMatch(JSON.stringify(wall), /\/mnt\/|\.\.\//);
  for (const media of wallMedia) {
    assert.equal(registry[media.file]?.sha256, media.sha256);
    assert.equal(registry[media.file]?.size, media.bytes);
  }
  for (const [file, item] of Object.entries(registry)) {
    assert.match(item.relative, /^[a-z0-9][a-z0-9-]*\/[a-f0-9]{64}\.(mp4|jpg)$/);
    assert.equal(item.relative.split("/")[1], file);
  }
});

test("media route rejects unknown, malformed and traversal requests", async () => {
  const bundle = process.cwd();
  for (const file of ["../package.json", "x.mp4", `${"0".repeat(64)}.mp4`, `${Object.keys(registry)[0]}/..`, Object.keys(registry)[0].replace(/\.(mp4|jpg)$/, ".png")]) {
    assert.equal(await resolveHomeDemoMedia(file, bundle).catch(() => null), null, file);
  }
});

test("media route serves allowlisted files when the bundle is mounted", { skip: !existsSync(process.env.DASHBOARD_HOME_DEMO_ROOT ?? "/mnt/gyc_ckp/benchmark2027/data/generated/dashboard-home-demos") }, async () => {
  for (const media of [...clips.slice(0, 3).map((clip) => clip.video), ...wallMedia]) {
    const resolved = await resolveHomeDemoMedia(media.file);
    assert.ok(resolved, media.file);
    assert.equal(resolved.size, media.bytes);
    assert.equal(resolved.type, media.file.endsWith(".jpg") ? "image/jpeg" : "video/mp4");
  }
});
