import assert from 'node:assert/strict';

export const regimes = ['ID', 'V', 'S', 'B', 'REC'];
export const shaPattern = /^[a-f0-9]{64}$/;

export function assertCohort(rows) {
  assert.equal(rows.length, 600, '600 cases required');
  assert.equal(new Set(rows.map(r => r.id)).size, 600, 'duplicate case ID');
  const tasks = new Set(rows.map(r => r.task));
  assert.equal(tasks.size, 24, '24 tasks required');
  for (const task of tasks) for (const family of regimes) {
    assert.equal(rows.filter(r => r.task === task && r.family === family).length, 5, `cohort ${task}/${family}`);
  }
}

export function validateBundle(bundle) {
  assert.equal(bundle.schema, 'roboexam.acwm600.v1');
  assert.equal(bundle.protocol, 'FIXED_ACTION_SELF_RECURSIVE_REPLAY_T0_ONLY');
  assert.equal(bundle.gridSeconds, 0.16);
  assert.equal(bundle.excludeT0, true);
  assert.equal(bundle.models.length, 3);
  assert.equal(new Set(bundle.models.map(m => m.id)).size, 3);
  for (const model of bundle.models) {
    assert.match(model.sha256, shaPattern);
    assertCohort(model.cases);
    for (const group of Object.values(model.groups)) {
      for (const value of Object.values(group.a)) assert.ok(value === null || Number.isFinite(value));
      assert.equal(group.a3Scope, 'set');
      for (const reader of ['v4', 'v5']) {
        assert.match(group.b[reader].sourceSha256, shaPattern);
        assert.ok(group.b[reader].armFrames > 0);
        for (const metric of ['position', 'rotation']) {
          const entry = group.b[reader][metric];
          assert.equal(entry.valid, entry.expected, 'partial B coverage');
          assert.equal(entry.expected, group.b[reader].armFrames);
          assert.ok(Number.isFinite(entry.mae) && entry.mae >= 0);
        }
      }
    }
    for (const row of model.cases) {
      assert.match(row.predictionSha256, shaPattern);
      assert.match(row.timeSha256, shaPattern);
      assert.equal(row.a.A3, undefined, 'A3 cannot be a case score');
      for (const val of Object.values(row.a)) assert.ok(val === null || Number.isFinite(val));
      for (const reader of ['v4', 'v5']) {
        assert.ok(row.b[reader].armFrames > 0);
        assert.ok(Number.isFinite(row.b[reader].position.mae));
        assert.ok(Number.isFinite(row.b[reader].rotation.mae));
      }
    }
  }
  assert.ok(!JSON.stringify(bundle).includes('/mnt/'), 'browser bundle exposes source paths');
  return bundle;
}
