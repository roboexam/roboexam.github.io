import assert from 'node:assert/strict';
import test from 'node:test';
import { tracks } from '../app/data/metric-plan.ts';
import { baselineRunPlan } from '../app/data/baseline-run-plan.ts';
import { metricExplanationFor } from '../app/data/metric-explanations.ts';
import { definitionFor, metricsFor, readResult } from '../app/data/track-results.ts';
import { scenarioPlan } from '../app/data/scenario-plan.ts';
import { policyTaskIds } from '../app/data/policy-baselines.ts';
import { acwmDashboardBundle as acwm } from '../app/data/acwm-results.ts';

const selection = (trackId, mode, metricId, modelId) => ({ trackId, mode, metricId, modelId });
test('new T1 and T2 contracts never inherit scores from old metric IDs', () => {
  for (const id of ['T1','T2']) for (const m of metricsFor(id, 'plan')) for (const model of tracks.find(t => t.id === id).models) {
    const r = readResult(selection(id, 'plan', m.id, model.id));
    assert.equal(r.available, false);
    assert.equal(r.primary, '—');
  }
  assert.equal(tracks[0].models.some(m => m.family === 'Judge'), false);
  const spatial = definitionFor(selection('T1','plan','l1a.text_spatial','Cosmos3-Nano'));
  assert.doesNotMatch(spatial.formula, /F1/);
});
test('T1 exposes only the requested VLM baseline roster without invented scores', () => {
  const t1 = tracks.find(track => track.id === 'T1');
  assert.deepEqual(t1.models.map(model => model.id), [
    'Cosmos3-Nano',
    'deepseek-v4.1-flash',
    'internal-mimo-v2.6-pro',
    'kimi-k3',
    'glm-5.3-flash',
    'minimax-h3.1-preview',
  ]);
  assert.equal(t1.models.some(model => model.family === 'VLA'), false);
  for (const model of t1.models) {
    assert.equal(readResult(selection('T1','history',t1.metrics[0].id,model.id)).available, false);
  }
});
test('T2 historical runs retain their values and exact provenance', () => {
  for (const [modelId, model] of Object.entries(acwm.models)) {
    const r = readResult(selection('T2','history','PSNR',modelId));
    assert.equal(r.primary, model.values.PSNR.primary);
    assert.equal(r.version, model.resultVersion);
    assert.equal(r.protocol, model.protocol);
  }
  const historical = definitionFor(selection('T2','history','PSNR','CtrlWorld'));
  const current = definitionFor(selection('T2','plan','PSNR','CtrlWorld'));
  assert.match(historical.formula, /pooled split MSE/);
  assert.match(current.formula, /mean_future_frame/);
});
test('T2 publishes the current Wan-Move and EnerVerse-AC baseline roster', () => {
  const models = tracks.find(track => track.id === 'T2').models.map(model => model.id);
  const runs = baselineRunPlan.filter(run => run.track === 'T2');
  assert.deepEqual(models.slice(-2), ['Wan-Move', 'EnerVerse-AC']);
  assert.deepEqual(runs.slice(-2).map(run => run.baseline), ['Wan-Move', 'EnerVerse-AC']);
  assert.equal(runs.length, 7);
  assert.equal(baselineRunPlan.length, 24);
  assert.equal(runs.at(-1).trainingCards, '待确认');
});
test('T4 keeps RGB-only XVLA and excludes depth-dependent X-WAM', () => {
  const models = tracks.find(track => track.id === 'T4').models.map(model => model.id);
  const runs = baselineRunPlan.filter(run => run.track === 'T4');
  assert.ok(models.includes('XVLA'));
  assert.equal(models.includes('X-WAM'), false);
  assert.ok(runs.some(run => run.baseline === 'XVLA'));
  assert.equal(runs.some(run => run.baseline === 'X-WAM'), false);
  assert.equal(runs.length, 7);
});
test('hardware and planned models cannot open a simulation result', () => {
  for (const trackId of ['T3','T4']) {
    const r = readResult(selection(trackId,'plan','TSR','Pelican-VLA'));
    assert.equal(r.version, undefined);
    assert.equal(r.primary, '—');
  }
  for (const m of tracks[3].metrics) {
    const r = readResult(selection('T4','plan',m.id,'Pi0.5'));
    assert.equal(r.version, undefined);
    assert.equal(r.available, false);
  }
  const measured = readResult(selection('T3','plan','TSR','Pi0.5'));
  assert.equal(measured.primary, '9.17%');
  assert.match(measured.version, /five-model-recovery-v7/);
  const recovery = readResult({ trackId: 'T3', mode: 'plan', metricId: 'TSR', modelId: 'Pi0.5', taskId: 'all', setting: 'recovery' });
  assert.equal(recovery.primary, '9.24%');
  assert.equal(recovery.sampleCount, 119);
});
test('all displayed metric plans have bilingual explanations and explicit input/output contracts', () => {
  for (const track of tracks) {
    assert.equal(new Set(track.metrics.map(m => m.id)).size, track.metrics.length);
    assert.doesNotMatch(track.scoreGuide.en, /[\u4e00-\u9fff]/);
    assert.match(track.scoreGuide.zh, /[\u4e00-\u9fff]/);
    for (const metric of track.metrics) {
      const info = definitionFor(selection(track.id,'plan',metric.id,track.models[0].id));
      assert.ok(info, `${track.id} ${metric.id} missing definition`);
      for (const key of ['definition','formula','evidence','unit']) assert.ok(info[key], `${metric.id} missing ${key}`);
      assert.doesNotMatch(JSON.stringify(info), /[\u4e00-\u9fff]/);
      const copy = metricExplanationFor(track.id, metric.id, info);
      for (const section of ['definition','input','output']) {
        assert.ok(copy[section].en.length > 8, `${metric.id} missing English ${section}`);
        assert.ok(copy[section].zh.length > 8, `${metric.id} missing Chinese ${section}`);
        assert.doesNotMatch(copy[section].en, /[\u4e00-\u9fff]/);
        assert.match(copy[section].zh, /[\u4e00-\u9fff]/);
      }
    }
  }
  assert.equal(tracks[1].metrics.length, 18);
  assert.equal(tracks[1].metrics.find(m => m.id === 'AF-DIV').direction, 'Report');
  assert.equal(tracks[2].metrics.find(m => m.id === 'SPARC').direction, '→ 0');
  assert.ok(tracks[0].metrics.some(m => m.id === 'l1c.semantic_nlcs'));
  assert.ok(tracks[2].metrics.some(m => m.id === 'GOAL_RETENTION'));
});

test('leaderboard results expose episode count and cohort instead of hiding protocol differences', () => {
  const id = readResult({ trackId: 'T3', mode: 'plan', metricId: 'TSR', modelId: 'G05', taskId: 'stack_bowls', setting: 'id' });
  const visual = readResult({ trackId: 'T3', mode: 'plan', metricId: 'TSR', modelId: 'HyVLA', taskId: 'stack_bowls', setting: 'visual' });
  assert.equal(id.sampleCount, 5);
  assert.equal(id.cohort, 'id · 5/5 episodes');
  assert.equal(visual.sampleCount, 5);
  assert.equal(visual.cohort, 'visual · 5/5 episodes');
  const acwmResult = readResult(selection('T2', 'history', 'MS', 'Cosmos Predict 2.5'));
  assert.equal(acwmResult.sampleCount, 73);
  assert.equal(acwmResult.cohort, 'heldout73');
});

test('policy baselines use the official fixed 24-task, 120-episode summaries', () => {
  assert.equal(policyTaskIds.length, 24);
  assert.equal(new Set(policyTaskIds).size, 24);
  assert.ok(policyTaskIds.every((id) => scenarioPlan.some((scene) => scene.id === id)));
  const tsr = readResult({ trackId: 'T3', mode: 'plan', metricId: 'TSR', modelId: 'XVLA', taskId: 'all' });
  const score = readResult({ trackId: 'T3', mode: 'plan', metricId: 'TASK_SCORE', modelId: 'XVLA', taskId: 'all' });
  const collision = readResult({ trackId: 'T3', mode: 'plan', metricId: 'COLLISION_RATE', modelId: 'XVLA', taskId: 'all' });
  assert.equal(tsr.primary, '7.50%');
  assert.equal(tsr.sampleCount, 120);
  assert.match(tsr.cohort, /24 tasks/);
  assert.equal(score.primary, '11.42');
  assert.equal(collision.available, false);
  assert.equal(collision.primary, 'N/A');
});
