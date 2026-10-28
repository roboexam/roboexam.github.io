import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const bundle = JSON.parse(await readFile(new URL("app/data/generated/l1-minimal-results.json", root), "utf8"));
const { l1MetricContracts, l1MetricContractSource, l1MetricDocumentWhitelist } = await import(new URL("scripts/l1-metric-contracts.mjs", root));

test("publishes the evidence-backed Cosmos3 Level 1 result", () => {
  assert.equal(bundle.schemaVersion, "unibench.dashboard.l1-minimal.v1");
  assert.equal(bundle.counts.plannedTasks, 3);
  assert.equal(bundle.counts.plannedEpisodes, 9);
  assert.equal(bundle.counts.readyEpisodes, 9);
  assert.equal(bundle.counts.modelPredictions, 48);
  assert.equal(bundle.counts.frozenMetrics, 12);
  assert.equal(bundle.dimensions.length, 4);
  assert.equal(bundle.samples.length, 48);
  assert.equal(bundle.results.parseFailures, 0);
  assert.equal(bundle.results.level1Score, 53.899444);
  assert.deepEqual(bundle.dimensions.map((dimension) => dimension.metrics.length), [3, 3, 3, 3]);
  assert.ok(bundle.dimensions.every((dimension) => Number.isFinite(dimension.score)));
  for (const metric of bundle.dimensions.flatMap((dimension) => dimension.metrics)) {
    assert.ok(metric.methodClass.length > 0);
    assert.ok(metric.ownership.length > 0);
    assert.ok(metric.why.length > 0);
    assert.ok(metric.method.length > 0);
    assert.ok(metric.runCalculation.includes("="));
    assert.match(metric.citation.url, /^https:\/\//);
  }
  assert.equal(bundle.protocol.model, "Cosmos3-Nano");
  assert.equal(bundle.protocol.runId, "l1-minimal-benchmark-cosmos3-nano-20260901-retry1");
  const stack = bundle.tasks.find((task) => task.id === "stack_bowls");
  assert.deepEqual(stack.episodes.map((episode) => episode.outcome), ["success", "partial", "failure"]);
  assert.deepEqual(stack.episodes.map((episode) => episode.completedCount), [2, 1, 0]);
  assert.deepEqual(stack.episodes.map((episode) => episode.nativeProcessScore), [100, 15, 0]);
  for (const task of bundle.tasks.filter((task) => task.id !== "stack_bowls")) {
    assert.equal(task.status, "golden_ready");
    assert.equal(task.episodes.length, 3);
    assert.deepEqual(task.episodes.map((episode) => episode.outcome), ["success", "partial", "failure"]);
    assert.ok(task.episodes.every((episode) => episode.evidence.commonPrefixDecodedHashesExact));
  }
  for (const sample of bundle.samples) {
    assert.equal(sample.status, "ok");
    assert.ok(sample.media.length > 0);
    assert.ok(sample.metrics.length === 3);
    assert.ok(sample.groundTruthEvidence.length > 0);
    assert.ok(sample.metrics.every((metric) => metric.calculation.inputs.length > 0));
    assert.ok(sample.metrics.every((metric) => metric.calculation.substitution.length > 0));
    assert.ok(sample.metrics.every((metric) => metric.calculation.result.length > 0));
  }
  const decomposition = bundle.samples.filter((sample) => sample.dimensionId === "decomposition");
  assert.equal(decomposition.length, 3);
  assert.ok(decomposition.every((sample) => !sample.prompt.includes("Canonical subtask labels")));
});

test("keeps L1 results and audited definitions behind generated adapters", async () => {
  const [adapter, phase1Adapter, wrapper, view, exporter, phase1Exporter, mediaRoute] = await Promise.all([
    readFile(new URL("app/data/l1-minimal-results.ts", root), "utf8"),
    readFile(new URL("app/data/l1-phase1-provisional.ts", root), "utf8"),
    readFile(new URL("app/components/l1-minimal-benchmark.tsx", root), "utf8"),
    readFile(new URL("app/components/l1/l1-results-page.tsx", root), "utf8"),
    readFile(new URL("scripts/export-l1-minimal-results.mjs", root), "utf8"),
    readFile(new URL("scripts/export-l1-phase1-provisional.mjs", root), "utf8"),
    readFile(new URL("app/api/l1-minimal-media/[...segments]/route.ts", root), "utf8"),
  ]);
  assert.match(adapter, /generated\/l1-minimal-results\.json/);
  assert.match(phase1Adapter, /generated\/l1-phase1-provisional\.json/);
  assert.match(wrapper, /L1ResultsPage/);
  assert.match(view, /phase1\.run\.id/);
  assert.match(view, /sourceHashes\["summary\.provisional\.json"\]/);
  assert.doesNotMatch(view, /processScore:\s*100/);
  assert.match(exporter, /golden_capture_summary\.json|sourceSummary/);
  assert.match(exporter, /scores\/aggregate\.json/);
  assert.match(exporter, /l1MetricContracts/);
  assert.match(phase1Exporter, /readPinned/);
  assert.match(phase1Exporter, /internal_development_only/);
  assert.match(phase1Exporter, /cross_layer_total/);
  assert.doesNotMatch(view, /53\.899444/);
  assert.match(mediaRoute, /image\/png/);
  assert.match(mediaRoute, /segments\[0\] === "samples"/);
});

test("renders Phase 1 provisional semantics without publishing a Level 1 total", async () => {
  const [page, matrix, detail, narratives, dashboard] = await Promise.all([
    readFile(new URL("app/components/l1/l1-results-page.tsx", root), "utf8"),
    readFile(new URL("app/components/l1/metric-matrix.tsx", root), "utf8"),
    readFile(new URL("app/components/l1/metric-detail.tsx", root), "utf8"),
    readFile(new URL("app/components/l1/metric-narratives.ts", root), "utf8"),
    readFile(new URL("app/dashboard-client.tsx", root), "utf8"),
  ]);
  assert.match(page, /Stack Bowls derived questions/);
  assert.match(page, /No readout head/);
  assert.match(page, /Phase 1 provisional/);
  assert.match(page, /cross_layer_total = forbidden/);
  assert.match(page, /searchParams\.set\("sample"/);
  assert.match(page, /searchParams\.set\("run"/);
  assert.doesNotMatch(page, /LEVEL 1 SCORE|level1Score/);
  assert.match(matrix, /— pending/);
  assert.match(matrix, /not scored as zero/);
  assert.match(matrix, /BLEU-1 至 BLEU-4/);
  assert.match(detail, /Phase 1 provisional 模型结果/);
  assert.match(detail, /Phase 1 逐题证据 · 输入、GT、Cosmos 回答精确绑定/);
  assert.match(detail, /ACTUAL PHASE 1 INPUT/);
  assert.match(detail, /input\.question/);
  assert.match(detail, /input\.media\.map/);
  assert.match(detail, /l1-phase1-evidence\/index/);
  assert.match(detail, /COSMOS3-NANO ACTUAL RESPONSE/);
  assert.match(detail, /GROUND TRUTH/);
  assert.match(detail, /该指标缺少合法 GT、合同或 scorer/);
  assert.doesNotMatch(detail, /historical minimal packet|example\?\.media\[0\]|narrative\.question/);
  assert.match(detail, /不进入静态前端 bundle/);
  assert.match(detail, /为什么它会出现在看板/);
  assert.match(detail, /它的计算方法从哪里来/);
  assert.match(detail, /文档定义与本轮执行怎样对应/);
  assert.match(detail, /定义与 evaluator 谱系，不代替本轮执行合同/);
  assert.match(detail, /definitionSource\.documentRevision/);
  assert.match(narratives, /metric\.source_note/);
  assert.doesNotMatch(narratives, /stackBowlsQuestions/);
  assert.match(dashboard, /<LeaderboardView/);
  assert.doesNotMatch(dashboard, /selection\.trackId === 'T1' && selection\.mode === 'history'|PilotEvidence|bundle\.run\.predictionSha256/);
});

test("publishes the four-layer candidate audit without promoting weak evidence", () => {
  const audit = bundle.candidateAudit;
  assert.equal(audit.metrics.length, 29);
  assert.equal(audit.schemaVersion, "benchmark2027-l1-metric-contracts-v0.2-doc-r264");
  assert.deepEqual(audit.definitionSource, l1MetricContractSource);
  assert.deepEqual(Object.keys(audit.layers), ["L1-A", "L1-B", "L1-C", "L1-D"]);
  assert.equal(audit.model, "Cosmos3-Nano");
  assert.equal(audit.layerScores["L1-B"], null);
  assert.match(audit.coverageWarning, /不发布 Level 1 总分/);
  assert.equal(audit.partialLevel1Score, null);
  assert.equal(audit.defaultSelectedMetricIds.length, 8);
  assert.ok(audit.metrics.every((metric) => metric.score_eligible === (metric.evidence_grade === "E3")));
  assert.ok(audit.metrics.filter((metric) => metric.evidence_grade !== "E3").every((metric) => metric.score === null && metric.blocker));
  assert.ok(Object.values(audit.perTask).every((task) => task.layer_scores["L1-B"] === null));
  assert.ok(Object.values(audit.perTask).every((task) => task.partial_level_1_score === null));
  assert.deepEqual(audit.metrics.filter((metric) => metric.metric_id.startsWith("l1c.bleu")).map((metric) => metric.score), [null, null, null, null]);
  assert.deepEqual(
    ["E3", "E2", "E1", "E0"].map((grade) => audit.metrics.filter((metric) => metric.evidence_grade === grade).length),
    [8, 3, 14, 4],
  );
});

test("matches every Level 1 metric to the audited Feishu definition instead of inferred semantics", () => {
  const audit = bundle.candidateAudit;
  assert.equal(l1MetricContracts.length, 29);
  assert.equal(l1MetricDocumentWhitelist.length, 29);
  assert.deepEqual(
    audit.metrics.map((metric) => metric.metric_id),
    l1MetricDocumentWhitelist.map((metric) => metric.metric_id),
  );
  for (const metric of audit.metrics) {
    assert.ok(metric.name.length > 0);
    assert.ok(metric.origin.length > 0);
    assert.ok(metric.source.length > 0);
    assert.ok(metric.document_section.length > 0);
    assert.ok(metric.document_heading.length > 0);
    assert.ok(metric.source_note.length > 0);
    assert.ok(metric.input_contract.length > 0);
    assert.ok(metric.output_contract.length > 0);
    assert.ok(metric.calculation.length > 0);
    assert.ok(metric.why_considered.length > 0);
    assert.ok(metric.need.length > 0);
    assert.ok(metric.question.length > 0);
    assert.ok(metric.answer_example.length > 0);
    assert.equal(metric.plain_scoring.length, 3);
    assert.ok(metric.explains.length > 0);
  }
  const byId = Object.fromEntries(audit.metrics.map((metric) => [metric.metric_id, metric]));
  assert.equal(byId["l1a.roa"].name, "RoA · Relative Orientation Accuracy");
  assert.match(byId["l1a.roa"].calculation, /最短环形差/);
  assert.match(byId["l1a.roa"].answer_example, /o'clock/);
  assert.equal(byId["l1a.mra"].name, "MRA · Distance / Size Relative Accuracy");
  assert.match(byId["l1a.mra"].calculation, /prediction-GT/);
  assert.equal(byId["l1a.pio_s1"].name, "PIO S1 Repo-Code Box IoU");
  assert.equal(byId["l1b.pio_s2"].name, "PIO S2 Repo-Code Box IoU");
  assert.match(byId["l1a.pio_s1"].source, /^Point-It-Out/);
  assert.match(byId["l1b.pio_s2"].output_contract, /bbox/);
  assert.match(byId["l1a.refspatial"].source, /^RoboRefer \/ RefSpatial-Bench/);
  assert.equal(byId["l1d.recovery_plan_score"].name, "Recovery Plan Quality");
  assert.match(byId["l1d.recovery_plan_score"].source_note, /不定义一个臆造的加权总分/);
  assert.ok(audit.metrics.filter((metric) => /内部|标准/.test(metric.origin)).every((metric) => /非外部 benchmark/.test(metric.source)));
  assert.doesNotMatch(JSON.stringify(audit.metrics.map((metric) => metric.source)), /Benchmark2027 (task|structured|normalized|failure|frozen|temporal|recovery)/);
  assert.doesNotMatch(JSON.stringify(audit.metrics), /Relative Object Accuracy|对象级阈值命中率/);
});
