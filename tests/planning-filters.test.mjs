import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tracks } from '../app/data/metric-plan.ts';
import { evidenceLabels, facetsFor, initialMetricFilters, matchesMetric, protocolLabels } from '../app/data/metric-facets.ts';
import { readResult, metricsFor } from '../app/data/track-results.ts';
import { matchesScenario, scenarioFor, scenarioPlan, scenarioTags, tagsForScenario } from '../app/data/scenario-plan.ts';

const catalog = JSON.parse(readFileSync(new URL('../app/data/generated/explorer-dataset.json',import.meta.url)));
const metric = (track,id) => tracks.find(t => t.id === track).metrics.find(m => m.id === id);
const facet = (track,id) => facetsFor(track,metric(track,id));

test('every current report and the T2 archive remain reachable with valid facets', () => {
  for (const t of tracks) for (const mode of t.id === 'T2' ? ['plan','history'] : ['plan']) {
    const entries = metricsFor(t.id,mode);
    const all = entries.filter(m => matchesMetric(m,facetsFor(t.id,m,mode),initialMetricFilters));
    assert.equal(all.length,entries.length);
    for (const m of all) {
      const f = facetsFor(t.id,m,mode);
      assert.ok(f.dimension && f.group && protocolLabels[f.protocol]);
      assert.ok(f.evidence.length && f.evidence.every(e => evidenceLabels[e]));
      assert.doesNotMatch(f.group,/ · (candidate|pending|diagnostic)$/);
    }
  }
});
test('protocol and evidence facets preserve documented metric requirements', () => {
  assert.ok(facet('T1','l1c.epr').evidence.includes('symbolic'));
  assert.equal(facet('T1','l1b.situational').protocol,'alternative');
  assert.equal(facet('T1','l1c.cpe').protocol,'pending');
  assert.equal(facet('T3','INSTRUCTION_PRIDE').protocol,'pending');
  assert.equal(facet('T3','ACTION_EFFICIENCY').protocol,'pending');
  assert.ok(facet('T3','LJPL').evidence.includes('motion'));
  assert.ok(facet('T4','RECOVERY_SR').evidence.includes('manual'));
});
test('metric filters intersect dimensions, evidence, protocol, and search without manufacturing results', () => {
  const m = metric('T2','CEE'); const f = facet('T2','CEE');
  const filter = {...initialMetricFilters,dimension:'D · Intervention outcome',evidence:'paired',protocol:'planned',query:'effect'};
  assert.ok(matchesMetric(m,f,filter));
  assert.equal(matchesMetric(m,f,{...filter,evidence:'manual'}),false);
  assert.equal(matchesMetric(m,f,{...filter,dimension:'A · Video quality'}),false);
  assert.equal(readResult({trackId:'T2',mode:'plan',metricId:m.id,modelId:'CtrlWorld'}).available,false);
  assert.equal(readResult({trackId:'T4',mode:'plan',metricId:'TSR',modelId:'Pi0.5'}).primary,'—');
});
test('all proposed scenarios are unique and cover the local catalog without mutating it', () => {
  assert.equal(scenarioPlan.length,31);
  assert.equal(new Set(scenarioPlan.map(s => s.id)).size,31);
  for (const t of catalog.tasks) assert.ok(scenarioFor(t.id),t.id);
  assert.equal(scenarioPlan.filter(s => !catalog.tasks.some(t => t.id === s.id)).length,5);
  for (const s of scenarioPlan) {
    const tags = tagsForScenario(s);
    assert.equal(tags.length,new Set(tags).size,s.id);
    assert.ok(tags.every(tag => scenarioTags[tag]));
  }
  assert.ok(catalog.tasks.find(t => t.id === 'insert_key').tags.includes('M'));
  assert.ok(!scenarioFor('insert_key').tags.includes('M'));
});
test('history is conditional, multi-object is not memory, and spatial order is not temporal order', () => {
  assert.ok(scenarioPlan.every(s => !s.tags.includes('H')));
  assert.equal(scenarioPlan.filter(s => s.scoped.some(t => t.tag === 'H')).length,6);
  assert.ok(scenarioFor('cover_blocks').tags.includes('S'));
  assert.ok(scenarioFor('imitate_sorting_sequence').tags.includes('S'));
  assert.ok(!tagsForScenario(scenarioFor('press_by_number')).includes('M'));
  for (const id of ['arrange_largest_number','sort_nesting_dolls_by_size','insert_tubes','classify_objects_by_language']) assert.ok(!tagsForScenario(scenarioFor(id)).includes('S'),id);
  assert.ok(!tagsForScenario(scenarioFor('solve_equation'),'base').includes('M'));
  assert.ok(tagsForScenario(scenarioFor('solve_equation')).includes('M'));
});
test('scenario filters use AND and exclude conditional assignments in base-only mode', () => {
  const cover = scenarioFor('cover_blocks');
  assert.ok(matchesScenario(cover,['H','M'],'all','cover'));
  assert.equal(matchesScenario(cover,['H','M'],'base','cover'),false);
  assert.equal(matchesScenario(cover,['H','P'],'all',''),false);
  assert.equal(matchesScenario(cover,['M'],'all','','Fluid'),false);
  assert.equal(scenarioPlan.filter(s => matchesScenario(s,['H'],'base','')).length,0);
});
