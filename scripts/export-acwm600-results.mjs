import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { models, readerSha, version, v5Root, quickRoot } from './acwm600-registry.mjs';
import { assertCohort, validateBundle } from './acwm600-contract.mjs';

const sources = [];
function load(path, expectedSha, logicalId) {
  const bytes = readFileSync(path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (expectedSha) assert.equal(sha256, expectedSha, `source hash: ${logicalId || path}`);
  if (logicalId) sources.push({ id: logicalId, sha256 });
  return { data: JSON.parse(bytes), sha256 };
}
function bStats(stats, sourceSha256) {
  const out = { armFrames: stats.N_arm_frames, sourceSha256 };
  for (const [metric, unit] of [['position', 'mm'], ['rotation', 'deg']]) {
    const arms = ['left', 'right'].map(arm => stats.arms[arm][metric]);
    const expected = arms.reduce((sum, a) => sum + a.N_all, 0);
    const valid = arms.reduce((sum, a) => sum + a.N_valid, 0);
    assert.equal(valid, expected, 'do not turn partial reader coverage into a complete score');
    // Frozen reports pool frames; weighting by arm-frame count preserves their denominator.
    const mae = arms.reduce((sum, a) => sum + a.all_frame_metrics[`MAE_${unit}`] * a.N_valid, 0) / valid;
    out[metric] = { mae, valid, expected };
  }
  return out;
}
function groupA(a, key) {
  const group = a.groups[key];
  const setKey = key === 'ALL' ? key : key.split('/')[1];
  const set = a.A3_sets[setKey];
  const values = Object.fromEntries(Object.entries(group).map(([id, result]) => {
    assert.equal(result.N_scored, result.N_expected, `A coverage ${key}/${id}`);
    assert.equal(result.N_pending, 0);
    return [id, result.score];
  }));
  assert.equal(set.N_scored, set.N_expected);
  assert.equal(set.per_case_score, false);
  values.JEPA = set.result.jepa_similarity;
  values.JEDi = set.result.jedi_distance;
  return { a: values, a3Scope: 'set', count: group.A1.N_expected };
}
export function buildBundle() {
  sources.length = 0;
  const acceptance = load(`${v5Root}/acceptance.json`, null, 'acceptance').data;
  assert.equal(acceptance.status, 'COMPLETE_A_AND_V5_B');
  assert.equal(acceptance.prediction_generation, 0);
  assert.equal(acceptance.A_and_v4_prior_hashes_unchanged, true);
  const manifest = load(`${v5Root}/input_manifest.json`, null, 'v5-input-manifest').data;
  assert.equal(manifest.anypos_sha256, readerSha.v5);
  const quick = load(`${quickRoot}/input_manifest.json`, null, 'v5-quick-reuse-manifest').data;
  assert.equal(quick.anypos_sha256, readerSha.v5);
  const b5 = load(`${v5Root}/results/B_v5_report.json`, acceptance.B_report.sha256, 'v5-B-report');
  assert.equal(b5.data.reader_sha256, readerSha.v5);
  assert.equal(b5.data.N_pairs, 1800);
  assert.equal(b5.data.exclude_t0, true);
  assert.equal(b5.data.common_grid_seconds, 0.16);
  const exported = models.map(model => {
    const input = manifest.rows.filter(row => row.model === model.id);
    assertCohort(input);
    const a = load(`${model.aRoot}/results/dimension_A_only_report_current.json`, null, `${model.id}/A-report`);
    assert.equal(a.data.comparison_grid_seconds, 0.16);
    assert.equal(a.data.exclude_t0, true);
    const aManifest = load(a.data.metric_manifest.path, a.data.metric_manifest.sha256, `${model.id}/A-manifest`).data;
    const aRows = new Map(aManifest.rows.map(row => [row.id, row]));
    const v4 = load(`${model.v4Root}/results/unified_report_current.json`, null, `${model.id}/v4-B-report`);
    const configName = model.id === 'ctrl_world' ? 'metric_config_current.json' : 'metric_config.json';
    const v4Config = load(`${model.v4Root}/${configName}`, null, `${model.id}/v4-config`).data;
    assert.equal(v4Config.anypos_config.anypos_sha256, readerSha.v4);
    const v4Manifest = load(v4Config.manifest, null, `${model.id}/v4-manifest`).data;
    const v4Inputs = new Map(v4Manifest.rows.map(row => [row.id, row]));
    assert.equal(v4.data.counts.B, 600);
    assert.equal(v4.data.common_time_grid_seconds, 0.16);
    assert.equal(v4.data.t0_excluded, true);
    const v4Cases = new Map(v4.data.cases.map(row => [row.id, row]));
    assert.equal(v4Cases.size, 600);
    const groups = {};
    for (const key of Object.keys(a.data.groups)) {
      const oldKey = key.replace('task/', 'scene/');
      groups[key] = { ...groupA(a.data, key), b: {
        v5: bStats(b5.data.pooled[model.id].common016[key], b5.sha256),
        v4: bStats(v4.data.B[oldKey], v4.sha256),
      }};
    }
    const cases = input.map(row => {
      const old = v4Cases.get(row.id);
      assert.ok(old && old.task === row.task && old.family === row.family, `v4 case join ${row.id}`);
      const aRow = aRows.get(row.id);
      assert.equal(aRow.generation_result.sha256, row.original_generation_result.sha256, 'A and B prediction identity');
      const gen = load(row.original_generation_result.path, row.original_generation_result.sha256).data;
      assert.equal(gen.checkpoint_sha256 ?? gen.checkpoint_identity?.model_sha256 ?? gen.checkpoint_identity?.sha256, model.sha256);
      assert.equal(gen.future_gt_used ?? gen.future_GT_used, false);
      const oldInput = v4Inputs.get(row.id);
      const oldGeneration = load(oldInput.generation_result.path, oldInput.generation_result.sha256).data;
      assert.equal(oldGeneration.prediction.sha256, row.prediction.sha256, 'v4/v5 prediction bytes');
      assert.equal(oldGeneration.time.sha256, row.time.sha256, 'v4/v5 recorded time');
      const pixel = load(`${model.aRoot}/cases/${row.id}/pixels.json`).data;
      assert.equal(pixel.generation_result.sha256, row.original_generation_result.sha256);
      const a4 = load(`${model.aRoot}/cases/${row.id}/A4/result.json`).data;
      const a6 = load(`${model.aRoot}/cases/${row.id}/A6/result.json`).data;
      const resultRef = b5.data.cases.find(c => c.model === model.id && c.id === row.id).result;
      const result = load(resultRef.path, resultRef.sha256).data;
      if (result.reader_sha256) assert.equal(result.reader_sha256, readerSha.v5);
      else {
        // The nine accepted quick pairs predate the per-result reader field; require their frozen receipt.
        const receipt = manifest.qualified_quick_reuse.find(r => r.id === row.id && r.model === model.id);
        assert.equal(receipt?.source.sha256, resultRef.sha256, 'unqualified result without reader identity');
      }
      assert.equal(result.id, row.id);
      assert.equal(result.model, model.id);
      assert.equal(result.prediction_result.sha256, row.original_generation_result.sha256);
      return { id: row.id, task: row.task, family: row.family,
        predictionSha256: row.prediction.sha256, timeSha256: row.time.sha256,
        generationSha256: row.original_generation_result.sha256,
        a: { A1: pixel.pixel_metrics.psnr, A2: pixel.pixel_metrics.ssim, A4: a4.result.score, A5: pixel.pixel_metrics.mmse, A6: a6.result.score },
        b: { v5: bStats(result.common016_stats, resultRef.sha256), v4: bStats(old.B_common_stats, v4.sha256) },
      };
    }).sort((a, b) => a.id.localeCompare(b.id));
    return { id: model.id, label: model.label, checkpoint: model.checkpoint, sha256: model.sha256, groups, cases };
  });
  const caseIds = exported[0].cases.map(row => row.id);
  for (const model of exported) assert.deepEqual(model.cases.map(row => row.id), caseIds, 'cross-model cohort mismatch');
  return validateBundle({ schema: 'roboexam.acwm600.v1', version, protocol: manifest.protocol,
    split: 'frozen clean24 evaluation cohort · 24 tasks × 5 regimes × 5 cases',
    gridSeconds: 0.16, excludeT0: true, readers: readerSha,
    evaluator: manifest.source_files.map(ref => ({ id: ref.path.split('/').at(-1), sha256: ref.sha256 })),
    readerLimitedTasks: manifest.TASK_LIMITED_tasks,
    readerLimits: manifest.training_reader_limits,
    acceptedAt: new Date(acceptance.time * 1000).toISOString(), models: exported, sources });
}
const target = resolve(dirname(fileURLToPath(import.meta.url)), `../app/data/generated/acwm600-results.json`);
const summaryTarget = resolve(dirname(target), 'acwm600-summary.json');
export function buildSummary(data) {
  return { ...data, fullBundleSha256: createHash('sha256').update(JSON.stringify(data) + '\n').digest('hex'),
    models: data.models.map(({ cases, ...model }) => ({ ...model, caseCount: cases.length })) };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = buildBundle();
  for (const [path, value] of [[target, data], [summaryTarget, buildSummary(data)]]) {
    const json = JSON.stringify(value) + '\n';
    if (process.argv.includes('--check')) assert.equal(readFileSync(path, 'utf8'), json, `regenerate ${path.split('/').at(-1)}`);
    else if (!existsSync(path) || readFileSync(path, 'utf8') !== json) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, json); }
  }
  console.log(`ACWM600 ${process.argv.includes('--check') ? 'verified' : 'exported'}: full 3 × 600 results + unchanged aggregate summary, A + B(v5/v4)`);
}
