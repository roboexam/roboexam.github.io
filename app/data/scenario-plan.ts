// Proposal metadata only. Episode manifests and generated catalog tags are immutable here.
// Source: UniEmbodied-Bench (RoboExam).md, “仿真批量方案 V1” and “任务场景轴-v2”.
export const scenarioTags = {
  G: { label: 'Object grounding', rule: 'The instruction requires choosing objects by identity, category, or attribute.' },
  R: { label: 'Spatial goals', rule: 'Success checks an object–region or object–object spatial relation.' },
  F: { label: 'Functional interaction', rule: 'A functional part or interaction is required; ordinary grasping alone is insufficient.' },
  P: { label: 'Pose alignment', rule: 'Success requires a specified pose or insertion tolerance, beyond reaching a region.' },
  S: { label: 'Order & stages', rule: 'The temporal order or stage transition must be checked. Final spatial order alone is insufficient.' },
  M: { label: 'Multiple objects', rule: 'Several target objects must satisfy the goal. Props and repeated actions do not count as extra targets.' },
  H: { label: 'History dependence', rule: 'A past observation is necessary and the current observation cannot reveal the answer. All current H assignments are candidates.' },
} as const;
export type ScenarioTag = keyof typeof scenarioTags;
export type PhysicalSetting = 'Rigid objects' | 'Precision insertion' | 'Fluid' | 'Deformable' | 'Tool-mediated' | 'Dynamic target';
export type ScopedTag = { tag: ScenarioTag; scope: 'candidate' | 'variant'; reason: string };
export type Scenario = { id: string; name: string; tags: ScenarioTag[]; scoped: ScopedTag[]; physical: PhysicalSetting; note: string };
const history = (reason = 'Audit all model-visible cameras and state for current-observation shortcuts.'): ScopedTag => ({tag:'H',scope:'candidate',reason});
const sequence = (reason = 'Freeze the temporal checker and record stage transitions.'): ScopedTag => ({tag:'S',scope:'candidate',reason});
function scene(id: string, name: string, tags: ScenarioTag[], physical: PhysicalSetting, note: string, scoped: ScopedTag[] = []): Scenario {
  return { id, name, tags, physical, note, scoped };
}
export const scenarioPlan: Scenario[] = [
  scene('imitate_sorting_sequence','Imitate Sorting Sequence',['G','S','M'],'Rigid objects','Validate the paired demonstration and hold out complete orders.',[history()]),
  scene('classify_objects_by_language','Classify Objects by Language',['G','R','M'],'Rigid objects','Basket positions specify destinations, not execution order. Score per object.'),
  scene('pour_by_language','Pour by Language',['G','R','F','M'],'Fluid','Check the trigger-query stages; native fluid success is not zero spill.',[sequence()]),
  scene('arrange_largest_number','Arrange Largest Number',['G','R','P','M'],'Rigid objects','Separate five-digit length transfer from the unseen ascending rule.'),
  scene('sort_nesting_dolls_by_size','Sort Nesting Dolls by Size',['G','R','M'],'Rigid objects','Final size order only; count transfer remains unspecified.'),
  scene('solve_equation','Solve Equation',['G','R','P'],'Rigid objects','Single equation in ID; validate the three-equation checker and budget.',[{tag:'M',scope:'variant',reason:'Only the three-equation behavioral variant has multiple answer targets.'}]),
  scene('play_tic_tac_toe','Tic-Tac-Toe',['G','R','P','S','M'],'Rigid objects','Alternate legal moves to fill the board; this is not a win-rate test.'),
  scene('board_pattern_placement','Board Pattern Placement',[],'Rigid objects','Separate proposed task; freeze patterns, splits, and stopping rules.',(['R','P','M'] as const).map(tag => ({tag,scope:'candidate',reason:'The new pattern-placement protocol is not yet frozen.'}))),
  scene('pack_objects_into_box','Pack Objects into Box',['R','M'],'Rigid objects','Check the left-facing pose as well as containment; review P eligibility.'),
  scene('hang_mugs','Hang Mugs',['F','P','M'],'Rigid objects','Cup handles must match hooks; new geometry needs functional landmarks.'),
  scene('make_toast','Make Toast',['F','P','M'],'Precision insertion','Two slices in slots, then the lever; no claim about actual cooking.',[sequence()]),
  scene('cover_blocks','Cover Blocks',['G','R','S','M'],'Rigid objects','Cover left-to-right; hold out full uncover orders and audit occlusion.',[history()]),
  scene('press_by_number','Press by Number',['G','F','S'],'Rigid objects','Parameterize count and stage order; repeated presses do not imply M.',[history('Verify that visible button state, counters, and observations do not reveal the press count.')]),
  scene('play_stacking_toy','Play Stacking Toy',['G','F','P','M'],'Precision insertion','The ordered-group variant needs an S checker before claiming sequence coverage.'),
  scene('fold_clothes','Fold Clothes',['R'],'Deformable','Specific long-sleeve keypoints; review stage checks before adding S.'),
  scene('store_tools_in_toolbox','Store Tools in Toolbox',['G','R','F','P','M'],'Rigid objects','Shape-slot storage, not tool use; review F against the functional-part rule.'),
  scene('stack_bowls','Stack Bowls',['R','M'],'Rigid objects','No fixed bowl order; a terminal stack is not a long-duration stability test.'),
  scene('sweep_blocks','Sweep Blocks',['F','M'],'Tool-mediated','The final checker does not independently verify the required handover.'),
  scene('pour_liquid_into_cup','Pour Liquid into Cup',['R','F'],'Fluid','Use the native valid-fluid and residual thresholds; report spills separately.'),
  scene('plug_in_charger','Plug in Charger',['F','P'],'Precision insertion','Pose and insertion depth do not establish electrical connection.'),
  scene('pick_from_conveyor_by_image','Pick from Conveyor by Image',['G','R'],'Dynamic target','Resolve the basket-vs-target 8 cm lift mismatch before collection.'),
  scene('push_T','Push T',['R','P'],'Rigid objects','Rigid T-shaped block; enforce the no-lifting rule.'),
  scene('stack_blocks','Stack Blocks',['R','M'],'Rigid objects','Textures are incidental; no prescribed block order or attribute selection.'),
  scene('match_and_pick_from_conveyor','Match and Pick from Conveyor',['G'],'Dynamic target','Verify that the first target disappears without identity or timing leaks.',[history()]),
  scene('swap_blocks','Swap Blocks',['R','S','M'],'Rigid objects','Construct identical visible layouts with different confirmed stages.',[history()]),
  scene('swap_T','Swap T',['R','P','M'],'Rigid objects','Remember initial poses; visible target markers would change the task.',[history()]),
  scene('insert_tubes','Insert Tubes',['F','P','M'],'Precision insertion','All three tubes must be inserted; no prescribed temporal order.'),
  scene('insert_key','Insert Key',['F','P'],'Precision insertion','One key; separately check handover and insert-before-turn if scored.',[sequence()]),
  scene('build_tower','Build Tower',['R','P','M'],'Rigid objects','Verify staged support geometry; avoid broad material-stability claims.'),
  scene('fill_pen_holder','Fill Pen Holder',['F','P','M'],'Precision insertion','Final depth and pose do not verify continuous support by the other hand.'),
  scene('put_bottles_into_dustbin','Put Bottles into Dustbin',['R','M'],'Rigid objects','Handover is optional per episode and not independently checked.'),
];
export function scenarioFor(id: string) { return scenarioPlan.find(scene => scene.id === id); }
export function tagsForScenario(scene: Scenario, scope: 'all' | 'base' = 'all'): ScenarioTag[] {
  return [...scene.tags, ...(scope === 'all' ? scene.scoped.map(t => t.tag) : [])];
}
export function matchesScenario(scene: Scenario, tags: ScenarioTag[], scope: 'all' | 'base', query: string, physical = 'all') {
  return tags.every(tag => tagsForScenario(scene, scope).includes(tag))
    && (physical === 'all' || scene.physical === physical)
    && `${scene.name} ${scene.id} ${scene.note}`.toLowerCase().includes(query.trim().toLowerCase());
}
