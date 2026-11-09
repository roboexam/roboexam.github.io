import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tracks } from '../app/data/metric-plan.ts';
import { evidenceLabels, facetsFor, initialMetricFilters, matchesMetric, protocolLabels } from '../app/data/metric-facets.ts';
import { readResult, metricsFor } from '../app/data/track-results.ts';
import { matchesScenario, scenarioFor, scenarioPlan, scenarioTags, scenarioTagCoverage, simulationV2Plan, simulationV2ScenarioIds, tagsForScenario } from '../app/data/scenario-plan.ts';

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
  assert.equal(facet('T3','ROBUSTNESS').protocol,'planned');
  assert.ok(facet('T3','ROBUSTNESS').evidence.includes('paired'));
  assert.ok(facet('T3','SPARC').evidence.includes('motion'));
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
  assert.equal(scenarioPlan.length,39);
  assert.equal(new Set(scenarioPlan.map(s => s.id)).size,39);
  for (const t of catalog.tasks) assert.ok(scenarioFor(t.id),t.id);
  assert.equal(scenarioPlan.filter(s => !catalog.tasks.some(t => t.id === s.id)).length,13);
  for (const s of scenarioPlan) {
    const tags = tagsForScenario(s);
    assert.equal(tags.length,new Set(tags).size,s.id);
    assert.ok(tags.every(tag => scenarioTags[tag]));
  }
  assert.ok(catalog.tasks.find(t => t.id === 'insert_key').tags.includes('M'));
  assert.ok(!scenarioFor('insert_key').tags.includes('M'));
});
test('scheme A covers exactly the final 24 scenes with six main requirement tags', () => {
  assert.deepEqual(Object.keys(scenarioTags), ['G','R','F','P','T','M']);
  assert.equal(simulationV2ScenarioIds.length,24);
  assert.equal(new Set(simulationV2ScenarioIds).size,24);
  assert.ok(simulationV2Plan.every(Boolean));
  assert.deepEqual(scenarioTagCoverage, {G:12,R:13,F:10,P:11,T:13,M:14});
  assert.ok(!simulationV2ScenarioIds.includes('pour_by_language'));
  assert.ok(!simulationV2ScenarioIds.includes('pick_from_conveyor_by_image'));
  assert.deepEqual(tagsForScenario(scenarioFor('place_between_references')),['R']);
  assert.deepEqual(tagsForScenario(scenarioFor('pack_mixed_objects_into_box_v1')),['R','T','M']);
  assert.deepEqual(tagsForScenario(scenarioFor('pour_liquid_into_cup')),['R','F','T']);
  assert.deepEqual(tagsForScenario(scenarioFor('hold_button_until_cue')),['F','P','T']);
});
test('temporal subtypes retain conditional memory without inventing it for visible multi-object progress', () => {
  assert.equal(scenarioPlan.filter(s => s.temporal.some(t => t.subtype === 'history')).length,6);
  const memoryScenes=simulationV2Plan.filter(s => s.temporal.some(t => t.subtype === 'history'));
  assert.deepEqual(memoryScenes.map(s => s.id),['imitate_sorting_sequence','cover_blocks','press_by_number','match_and_pick_from_conveyor']);
  assert.ok(memoryScenes.every(s => s.tags.includes('T') && s.temporal.filter(t => t.subtype === 'history').every(t => t.scope === 'candidate')));
  for (const id of ['pour_liquid_into_cup','play_stacking_toy','fold_clothes','build_tower','hold_water_mug']) assert.ok(scenarioFor(id).tags.includes('T'),id);
  assert.ok(scenarioFor('hold_water_mug').temporal.some(t => t.subtype === 'duration'));
  assert.ok(!scenarioFor('hold_water_mug').temporal.some(t => t.subtype === 'history'));
  assert.ok(!tagsForScenario(scenarioFor('press_by_number')).includes('M'));
  for (const id of ['arrange_largest_number','sort_nesting_dolls_by_size','insert_tubes','classify_objects_by_language','set_button_colors','mirror_pair_layout','stack_bowls']) assert.ok(!tagsForScenario(scenarioFor(id)).includes('T'),id);
  assert.ok(!tagsForScenario(scenarioFor('solve_equation'),'base').includes('M'));
  assert.ok(tagsForScenario(scenarioFor('solve_equation')).includes('M'));
  assert.ok(!tagsForScenario(scenarioFor('set_button_colors'),'base').includes('M'));
  assert.ok(tagsForScenario(scenarioFor('set_button_colors')).includes('M'));
});
test('scenario filters use AND and exclude conditional assignments in base-only mode', () => {
  const cover = scenarioFor('cover_blocks');
  assert.ok(matchesScenario(cover,['T','M'],'all','cover'));
  assert.ok(matchesScenario(cover,['T','M'],'base','cover'));
  assert.equal(matchesScenario(cover,['T','P'],'all',''),false);
  assert.equal(matchesScenario(cover,['M'],'all','','Fluid'),false);
  assert.ok(matchesScenario(scenarioFor('make_toast'),['T'],'all',''));
  assert.equal(matchesScenario(scenarioFor('make_toast'),['T'],'base',''),false);
});
