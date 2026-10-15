import assert from 'node:assert/strict';
import test from 'node:test';
import { tracks } from '../app/data/metric-plan.ts';
import { definitionFor, metricsFor, readResult } from '../app/data/track-results.ts';
import { l1Phase1ProvisionalBundle as pilot } from '../app/data/l1-phase1-provisional.ts';
import { acwmDashboardBundle as acwm } from '../app/data/acwm-results.ts';
import { vlaWamDashboardBundle as policy } from '../app/data/vla-wam-results.ts';

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
  for (const model of t1.models.slice(1)) {
    assert.equal(readResult(selection('T1','history',pilot.metrics[0].metricId,model.id)).available, false);
  }
});
test('historical runs retain their values, true zeros, and exact provenance', () => {
  for (const m of pilot.metrics) {
    const r = readResult(selection('T1','history',m.metricId,'Cosmos3-Nano'));
    assert.equal(r.primary, m.score === null ? '—' : `${m.score.toFixed(2)}%`);
    assert.equal(r.version, pilot.run.id);
  }
  assert.equal(readResult(selection('T1','history','l1a.mra','Cosmos3-Nano')).primary, '0.00%');
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
  assert.equal(measured.primary, policy.models['Pi0.5'].values.TSR.primary);
  assert.equal(measured.version, policy.models['Pi0.5'].resultVersion);
});
test('all displayed metric plans have English definitions and distinct IDs', () => {
  for (const track of tracks) {
    assert.equal(new Set(track.metrics.map(m => m.id)).size, track.metrics.length);
    for (const metric of track.metrics) {
      const info = definitionFor(selection(track.id,'plan',metric.id,track.models[0].id));
      assert.ok(info, `${track.id} ${metric.id} missing definition`);
      for (const key of ['definition','formula','evidence','unit']) assert.ok(info[key], `${metric.id} missing ${key}`);
      assert.doesNotMatch(JSON.stringify(info), /[\u4e00-\u9fff]/);
    }
  }
  assert.equal(tracks[1].metrics.length, 18);
  assert.equal(tracks[1].metrics.find(m => m.id === 'AF-DIV').direction, 'Report');
  assert.ok(tracks[0].metrics.some(m => m.id === 'l1c.semantic_nlcs'));
  assert.ok(tracks[2].metrics.some(m => m.id === 'RECOVERY_FINAL_SR'));
});
