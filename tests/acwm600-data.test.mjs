import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateBundle } from '../scripts/acwm600-contract.mjs';
import { buildSummary } from '../scripts/export-acwm600-results.mjs';

const data = JSON.parse(readFileSync(new URL('../app/data/generated/acwm600-results.json', import.meta.url), 'utf8'));
test('complete ACWM600 cohort, reader coverage and set-only A3', () => validateBundle(data));
test('initial-page summary preserves exact formal aggregates and reader identities', () => {
  const summary = JSON.parse(readFileSync(new URL('../app/data/generated/acwm600-summary.json', import.meta.url), 'utf8'));
  assert.deepEqual(summary, buildSummary(data));
  assert.deepEqual(summary.readers, data.readers);
  for (let i = 0; i < data.models.length; i++) {
    assert.deepEqual(summary.models[i].groups, data.models[i].groups);
    assert.equal(summary.models[i].caseCount, 600);
    assert.equal('cases' in summary.models[i], false);
  }
});
test('reject duplicate IDs, incomplete cohorts, NaNs, per-case A3 and source path leaks', () => {
  for (const mutate of [
    d => { d.models[0].cases[1].id = d.models[0].cases[0].id; },
    d => { d.models[0].cases.pop(); },
    d => { d.models[0].groups.ALL.a.A1 = NaN; },
    d => { d.models[0].groups.ALL.b.v5.position.valid--; },
    d => { d.models[0].cases[0].a.A3 = 0; },
    d => { d.models[0].cases[0].predictionSha256 = '/mnt/private'; },
  ]) {
    const changed = structuredClone(data); mutate(changed);
    assert.throws(() => validateBundle(changed));
  }
});
test('case B denominators reproduce every formal pooled group for both readers', () => {
  for (const model of data.models) for (const [scope, group] of Object.entries(model.groups)) {
    const rows = model.cases.filter(row => scope === 'ALL' || (scope.startsWith('task/') ? row.task === scope.slice(5) : row.family === scope.slice(7)));
    assert.equal(rows.length, group.count);
    for (const reader of ['v4', 'v5']) for (const metric of ['position', 'rotation']) {
      const valid = rows.reduce((sum, row) => sum + row.b[reader][metric].valid, 0);
      const mean = rows.reduce((sum, row) => sum + row.b[reader][metric].mae * row.b[reader][metric].valid, 0) / valid;
      assert.equal(valid, group.b[reader][metric].valid);
      assert.ok(Math.abs(mean - group.b[reader][metric].mae) < 1e-8, `${model.id}/${scope}/${reader}/${metric}`);
    }
  }
});
