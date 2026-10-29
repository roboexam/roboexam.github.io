import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("uses the public RoboExam shell and direct anonymous routing", async () => {
  const [layout, page, packageJson, worker, login, proxy] = await Promise.all([
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("worker/index.ts", root), "utf8"),
    readFile(new URL("app/login/page.tsx", root), "utf8"),
    readFile(new URL("proxy.ts", root), "utf8"),
  ]);

  assert.match(layout, /title:\s*"RoboExam · Planned CVPR 2027 Workshop"/);
  assert.match(layout, /<html lang="en">/);
  assert.match(page, /DashboardClient/);
  assert.match(packageJson, /"node":\s*">=22\.13\.0"/);
  assert.match(worker, /RoboExam dashboard/);
  assert.match(login, /redirect\("\/"\)/);
  assert.match(proxy, /NextResponse\.next/);
  assert.doesNotMatch(layout + page + worker, /UniEmbodied-Bench|Unified Embodied Evaluation|Research preview|ICLR 2027/);
});

test("keeps the four leaderboard tracks and metric adapters wired", async () => {
  const [dashboard, leaderboard, leaderboardView, acwm, vlm, policy, realWorld] = await Promise.all([
    readFile(new URL("app/dashboard-client.tsx", root), "utf8"),
    readFile(new URL("app/data/metric-plan.ts", root), "utf8"),
    readFile(new URL("app/components/leaderboard-view.tsx", root), "utf8"),
    readFile(new URL("app/data/acwm-results.ts", root), "utf8"),
    readFile(new URL("app/data/vlm-results.ts", root), "utf8"),
    readFile(new URL("app/data/vla-wam-results.ts", root), "utf8"),
    readFile(new URL("app/data/l1-phase1-provisional.ts", root), "utf8"),
  ]);

  for (const track of ["T1", "T2", "T3", "T4"]) assert.match(leaderboard, new RegExp(`id: "${track}"`));
  for (const title of ["Embodied Agency", "Physical Foresight", "Simulation Deployment", "Real-World Deployment"]) {
    assert.match(leaderboard, new RegExp(title));
  }
  assert.match(leaderboard, /VLM agents through a shared harness/);
  assert.doesNotMatch(dashboard, /Perceive and reason without acting/);
  for (const metric of ["l1a.object_facts.counting", "l1c.next_action_accuracy", "PSNR", "CEE", "TARGET_SELECTION", "RECOVERY_SR", "HUMAN_INTERVENTION"]) {
    assert.ok(leaderboard.includes(metric), `missing metric ${metric}`);
  }
  assert.match(dashboard, /<LeaderboardView/);
  assert.doesNotMatch(dashboard, /BaselineRunPlan/);
  assert.match(leaderboardView, /<BaselineRunPlan/);
  assert.match(leaderboardView, /trackId === "T1" \? "ALL" : trackId/);
  assert.doesNotMatch(leaderboardView, /Previous protocols|previousT1Protocols|setPreviousT1Protocols/);
  assert.match(dashboard, /metricExplanationFor/);
  assert.match(dashboard, /<ScenarioBrowser/);
  assert.match(dashboard, /<CapabilitySpectrum/);
  for (const capability of ["State Grounding", "Task Memory", "Predictive Imagination", "Action–Effect Reasoning", "Closed-Loop Execution", "Recovery & Safety", "Generalization"]) {
    assert.match(dashboard, new RegExp(capability.replace(/[&–]/g, ".")));
  }
  assert.doesNotMatch(dashboard, /One robot|Head \+ cameras|Build history|IterationCounter/);
  const scenarios = await readFile(new URL("app/components/scenario-browser.tsx", root), "utf8");
  const simulationDatasets = await readFile(new URL("app/data/simulation-datasets.server.ts", root), "utf8");
  assert.match(scenarios, /<SimulationDatasetBrowser/);
  assert.match(scenarios, /<RealDatasetBrowser/);
  assert.match(scenarios, /Task-aligned simulation episodes/);
  assert.match(scenarios, /100 Training episodes/);
  assert.doesNotMatch(scenarios, /Coverage|Scenario inventory|useRawCatalog/);
  assert.doesNotMatch(scenarios, /<RawDataBrowser|curatedDataset|<DatasetExplorer/);
  assert.match(simulationDatasets, /policy_mix24_clean2400_sdk_ee20_25hz_instruction_20261029_v2/);
  assert.match(simulationDatasets, /evaluation24_sdk_ee20_25hz_episode_mp4_instruction_20261029_v3/);
  assert.doesNotMatch(scenarios, /<BaselineExplorer|OodValidationPanel/);
  assert.doesNotMatch(dashboard, /\x27Metrics\x27|Metric guide/);
  assert.match(dashboard, /<ExplainabilityView/);
  assert.match(acwm, /generated\/acwm-results\.json/);
  assert.match(vlm, /generated\/vlm-results\.json/);
  assert.match(policy, /generated\/vla-wam-results\.json/);
  assert.match(realWorld, /generated\/l1-phase1-provisional\.json/);
});

test("keeps public copy in English and does not resurrect the retired brand", async () => {
  const files = await Promise.all([
    readFile(new URL("app/dashboard-client.tsx", root), "utf8"),
    readFile(new URL("app/components/leaderboard-view.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
  ]);
  const source = files.join("\n");
  assert.doesNotMatch(source, /UniEmbodied-Bench|Unified Embodied Evaluation|Research preview|ICLR 2027/);
});

test("serves host-mounted media through a dev-only Vite bridge", async () => {
  const [vite, bridge] = await Promise.all([
    readFile(new URL("vite.config.ts", root), "utf8"),
    readFile(new URL("build/local-media-vite-plugin.ts", root), "utf8"),
  ]);
  assert.match(vite, /localMedia\(\)/);
  assert.match(bridge, /apply:\s*"serve"/);
  for (const route of ["curated-media", "ood-media", "review-media", "video-renditions", "episode-media",
    "l1-minimal-media", "l1-phase1-media", "real-datasets", "real-datasets-media", "real-datasets-trace"]) {
    assert.match(bridge, new RegExp(route));
  }
});

test("real action traces default to the managed PyArrow runtime", async () => {
  const reader = await readFile(new URL("app/data/real-action-trace.server.ts", root), "utf8");
  assert.match(reader, /runtime\/caches\/dashboard_raw_action_traces\/v1\/python\/bin\/python/);
  assert.doesNotMatch(reader, /process\.env\.UNIBENCH_TRACE_PYTHON/);
});

test("keeps setting-resolved leaderboards and dataset OOD evidence wired", async () => {
  const [leaderboard, scenarios, explorer, player, card, styles, overall] = await Promise.all([
    readFile(new URL("app/components/leaderboard-view.tsx", root), "utf8"),
    readFile(new URL("app/components/scenario-browser.tsx", root), "utf8"),
    readFile(new URL("app/components/dataset-explorer.tsx", root), "utf8"),
    readFile(new URL("app/components/synchronized-camera-player.tsx", root), "utf8"),
    readFile(new URL("app/components/curated-episode-card.tsx", root), "utf8"),
    readFile(new URL("app/dataset-archive.css", root), "utf8"),
    readFile(new URL("app/data/overall-score.ts", root), "utf8"),
  ]);
  for (const setting of ["ID", "V-OOD", "S-OOD", "B-OOD", "Recovery"]) {
    assert.match(leaderboard, new RegExp(`short: "${setting}"`));
  }
  assert.match(leaderboard, /models\.map\(\(model\) => \{/);
  assert.match(leaderboard, /Capability tags/);
  assert.match(leaderboard, /tagsForScenario/);
  assert.match(leaderboard, /className="overallScoreHead"/);
  assert.match(overall, /id:\s*0\.2/);
  assert.match(overall, /visual:\s*0\.2/);
  assert.match(overall, /semantic:\s*0\.2/);
  assert.match(overall, /behavioral:\s*0\.2/);
  assert.match(overall, /recovery:\s*0\.2/);
  assert.match(overall, /reason:\s*"missing_setting"/);
  assert.doesNotMatch(leaderboard, /EmbodimentRanking/);
  assert.doesNotMatch(leaderboard, /Macro view|equal scene weighting|missing scenes stay missing/);
  assert.doesNotMatch(leaderboard, /Scope & protocol|Scores are macro views|Score \+ validated-scene coverage/);
  assert.doesNotMatch(leaderboard, /result\.coverage|Coverage/);
  assert.doesNotMatch(leaderboard, /BaselineExplorer|Recorded model evidence|View rollouts/);
  assert.doesNotMatch(scenarios, /OOD validation|Model rollouts/);
  for (const regime of ["id", "visual", "semantic", "behavioral", "recovery"]) {
    assert.match(explorer, new RegExp(`id: "${regime}"`));
  }
  assert.doesNotMatch(explorer, /listAllMatching|<TaskRow/);
  assert.match(card, /traceId=\{episode\.id\}/);
  assert.match(card, /Instruction · 任务指令/);
  assert.match(styles, /\.regimeRail \{ display: grid; grid-template-columns: repeat\(5/);
  assert.match(styles, /\.syncPlayerWithTrace \{ display: grid; grid-template-columns: repeat\(2/);
  assert.match(player, /"cam_head", "cam_left_wrist", "cam_right_wrist"/);
  assert.match(player, /360p · Faster/);
  assert.match(player, /480p · Original/);
  assert.match(player, /video resolution/);
  assert.match(styles, /\.syncView-cam_head \{ grid-column: 1 \/ -1/);
  assert.doesNotMatch(leaderboard, /LeaderboardRanking|Scorecard pending|No synthetic placement/);
});
