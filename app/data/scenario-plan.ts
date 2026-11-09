// Proposal metadata only. Episode manifests and generated catalog tags are immutable here.
// Current 24-scene assignments: Feishu “仿真批量方案V2”, scheme A, 2026-11-04.
// Historical catalog entries remain discoverable; coverage uses only simulationV2ScenarioIds.
export const scenarioTags = {
  G: { label: 'Object grounding', rule: 'The instruction requires choosing objects by identity, category, or attribute.' },
  R: { label: 'Spatial goals', rule: 'Success checks an object–region or object–object spatial relation.' },
  F: { label: 'Functional interaction', rule: 'A functional part or interaction is required; ordinary grasping alone is insufficient.' },
  P: { label: 'Pose alignment', rule: 'Success requires a specified pose or insertion tolerance, beyond reaching a region.' },
  T: { label: 'Temporal & stage control', rule: 'History dependence, task-level order or prerequisite stages, or a task-specific hold/event window is required. Generic pick-and-place steps and final spatial order alone do not qualify.' },
  M: { label: 'Multiple objects', rule: 'Several target objects must satisfy the goal. Props and repeated actions do not count as extra targets.' },
} as const;
export type ScenarioTag = keyof typeof scenarioTags;
export const temporalSubtypes = {
  history: { code: 'T-H', label: 'History dependence' },
  sequence: { code: 'T-S', label: 'Order & prerequisite stages' },
  duration: { code: 'T-D', label: 'Hold duration & event timing' },
} as const;
export type TemporalRequirement = { subtype: keyof typeof temporalSubtypes; scope: 'planned' | 'candidate'; reason: string };
export type PhysicalSetting = 'Rigid objects' | 'Precision insertion' | 'Fluid' | 'Deformable' | 'Tool-mediated' | 'Dynamic target';
export type ScopedTag = { tag: ScenarioTag; scope: 'candidate' | 'variant'; reason: string };
export type Scenario = { id: string; name: string; tags: ScenarioTag[]; scoped: ScopedTag[]; physical: PhysicalSetting; note: string; temporal: TemporalRequirement[] };
const history = (reason = 'Audit all model-visible cameras and state for current-observation shortcuts.'): TemporalRequirement => ({subtype:'history',scope:'candidate',reason});
const sequence = (reason = 'Freeze the temporal checker and record stage transitions.', scope: TemporalRequirement['scope'] = 'candidate'): TemporalRequirement => ({subtype:'sequence',scope,reason});
const duration = (reason: string): TemporalRequirement => ({subtype:'duration',scope:'planned',reason});
function scene(id: string, name: string, tags: ScenarioTag[], physical: PhysicalSetting, note: string, scoped: ScopedTag[] = [], temporal: TemporalRequirement[] = []): Scenario {
  return { id, name, tags, physical, note, scoped, temporal };
}
export const scenarioPlan: Scenario[] = [
  scene('imitate_sorting_sequence','Imitate Sorting Sequence',['G','T','M'],'Rigid objects','Validate demonstration playback and the 69 seen orders; hold out five complete orders.',[],[history(),sequence('Reproduce the actual demonstrated object order.')]),
  scene('classify_objects_by_language','Classify Objects by Language',['G','R','M'],'Rigid objects','Basket positions specify destinations, not execution order. Score per object.'),
  scene('pour_by_language','Pour by Language',['G','R','F','M'],'Fluid','Historical three-bottle task; the current 24-scene plan uses Pour Liquid into Cup.',[{tag:'T',scope:'candidate',reason:'Validate trigger-query stages before claiming temporal coverage.'}],[sequence()]),
  scene('arrange_largest_number','Arrange Largest Number',['G','R','P','M'],'Rigid objects','Training/ID use four or five digits in descending order; behavioral holdout uses unseen four-digit sets, with free grasp order.'),
  scene('sort_nesting_dolls_by_size','Sort Nesting Dolls by Size',['G','R','M'],'Rigid objects','Final size order only; count transfer remains unspecified.'),
  scene('solve_equation','Solve Equation',['G','R','P'],'Rigid objects','Single equation in ID; validate the three-equation checker and budget.',[{tag:'M',scope:'variant',reason:'Only the three-equation behavioral variant has multiple answer targets.'}]),
  scene('play_tic_tac_toe','Tic-Tac-Toe',['G','R','P','T','M'],'Rigid objects','Alternate legal moves to fill the board; this is not a win-rate test.',[],[sequence('Alternate legal board moves.','planned')]),
  scene('board_pattern_placement','Board Pattern Placement',[],'Rigid objects','Separate proposed task; freeze patterns, splits, and stopping rules.',(['R','P','M'] as const).map(tag => ({tag,scope:'candidate',reason:'The new pattern-placement protocol is not yet frozen.'}))),
  scene('pack_objects_into_box','Pack Objects into Box',['R','M'],'Rigid objects','Check the left-facing pose as well as containment; review P eligibility.'),
  scene('hang_mugs','Hang Mugs',['F','P','M'],'Rigid objects','Cup handles must match hooks; new geometry needs functional landmarks.'),
  scene('make_toast','Make Toast',['F','P','M'],'Precision insertion','Two slices in slots, then the lever; no claim about actual cooking.',[{tag:'T',scope:'candidate',reason:'Verify that the lever follows insertion.'}],[sequence()]),
  scene('cover_blocks','Cover Blocks',['G','R','T','M'],'Rigid objects','Cover left-to-right; training/ID use RGB, GBR, BRG and behavioral holdout uses RBG, GRB, BGR.',[],[history(),sequence('Check the actual cover and uncover events, not only the final state.')]),
  scene('press_by_number','Press by Number',['G','F','T'],'Rigid objects','Count left red presses, confirm blue, then count right red presses and confirm; repeated presses do not imply M.',[],[history('Verify that visible button state, counters, and observations do not reveal the press count.'),sequence('Both count-and-confirm stages follow the fixed left-then-right program.')]),
  scene('play_stacking_toy','Play Stacking Toy',['G','F','P','T','M'],'Precision insertion','Complete each whole shape group before starting the next; validate the ordered-group event checker.',[],[sequence('The current instruction explicitly specifies the shape-group program.')]),
  scene('fold_clothes','Fold Clothes',['R','T'],'Deformable','Follow the current three-part fold program; six-program feasibility and behavioral eligibility remain conditional.',[],[sequence('Check the instructed sleeve/body fold events and allowed layered terminal state.')]),
  scene('store_tools_in_toolbox','Store Tools in Toolbox',['G','R','F','P','M'],'Rigid objects','Shape-slot storage, not tool use; review F against the functional-part rule.'),
  scene('stack_bowls','Stack Bowls',['R','M'],'Rigid objects','No fixed bowl order; a terminal stack is not a long-duration stability test.'),
  scene('sweep_blocks','Sweep Blocks',['F','M'],'Tool-mediated','The final checker does not independently verify the required handover.'),
  scene('pour_liquid_into_cup','Pour Liquid into Cup',['R','F','T'],'Fluid','Single bottle and cup: align, pour, then return upright; retain native fluid thresholds, without importing the retired three-bottle program.',[],[sequence('Alignment, liquid transfer, and return upright are task-specific dependent stages.','planned')]),
  scene('plug_in_charger','Plug in Charger',['F','P'],'Precision insertion','Pose and insertion depth do not establish electrical connection.'),
  scene('pick_from_conveyor_by_image','Pick from Conveyor by Image',['G','R'],'Dynamic target','Resolve the basket-vs-target 8 cm lift mismatch before collection.'),
  scene('push_T','Push T',['R','P'],'Rigid objects','Rigid T-shaped block; enforce the no-lifting rule.'),
  scene('stack_blocks','Stack Blocks',['R','M'],'Rigid objects','Textures are incidental; no prescribed block order or attribute selection.'),
  scene('match_and_pick_from_conveyor','Match and Pick from Conveyor',['G','T'],'Dynamic target','Remember the first reference and lift the later matching target; no basket or placement requirement.',[],[history('The departed reference identity must not be recoverable from the current frame, hidden target labels, or fixed-slot shortcuts.')]),
  scene('swap_blocks','Swap Blocks',['R','T','M'],'Rigid objects','Construct identical visible layouts with different confirmed stages.',[],[history(),sequence()]),
  scene('swap_T','Swap T',['R','P','M'],'Rigid objects','Remember initial poses; visible target markers would change the task.',[{tag:'T',scope:'candidate',reason:'Initial poses must require history rather than visible target markers.'}],[history()]),
  scene('insert_tubes','Insert Tubes',['F','P','M'],'Precision insertion','All three tubes must be inserted; no prescribed temporal order.'),
  scene('insert_key','Insert Key',['F','P','T'],'Precision insertion','One key; handover and insert-before-turn need process evidence beyond terminal depth/pose.',[],[sequence('Insertion must establish the prerequisite for turning; verify recorded process events.')]),
  scene('build_tower','Build Tower',['R','P','T','M'],'Rigid objects','Supports precede boards and upper layers; equivalent support placements remain freely ordered.',[],[sequence('Validate task-level partial-order dependencies, without prescribing an arbitrary total order.','planned')]),
  scene('fill_pen_holder','Fill Pen Holder',['F','P','M'],'Precision insertion','Final depth and pose do not verify continuous support by the other hand.'),
  scene('put_bottles_into_dustbin','Put Bottles into Dustbin',['R','M'],'Rigid objects','Handover is optional per episode and not independently checked.'),
  scene('clear_keyboard_then_close_laptop','Clear Keyboard, Then Close Laptop',['F','T','M'],'Rigid objects','Release the single keyboard obstacle fully on the mouse mat and let it settle before closing the lid.',[],[sequence('Clearance and stable release must precede lid closure.','planned')]),
  scene('find_category_outlier','Find Category Outlier',['G'],'Rigid objects','Select the object whose category differs from the remaining objects.'),
  scene('hold_button_until_cue','Hold Button Until Cue',['F','P','T'],'Tool-mediated','Use the mallet head within 1.5 cm of center; hold until the color cue and release within one second.',[],[sequence('A valid hold precedes the cue and release.','planned'),duration('Maintain uninterrupted contact until the cue, then release within the frozen time window.')]),
  scene('hold_water_mug','Hold Water Mug',['F','P','T'],'Fluid','Hold the mug 8–12 cm above its initial height for one continuous second; retain the 8-degree tilt and native fluid constraints.',[],[duration('The task requires one continuous second of valid height, grasp, tilt, and water retention.')]),
  scene('mirror_pair_layout','Mirror Pair Layout',['G','R','P','M'],'Rigid objects','Place paired objects in the registered mirrored arrangement.'),
  scene('pack_mixed_objects_into_box_v1','Pack Mixed Objects into Box',['R','T','M'],'Rigid objects','Follow the specified four-role packing program; no fixed slot or left-facing pose requirement.',[],[sequence('Actual release and stable placement events must follow the instructed four-object program.')]),
  scene('place_between_references','Place Between References',['R'],'Rigid objects','Move one figurine into the midpoint region defined by the two initial reference centers; no object selection or fine orientation goal.'),
  scene('set_button_colors','Set Button Colors',['G','F'],'Rigid objects','Observe red→blue→green cycles and reach both target colors; either button order is allowed.',[{tag:'M',scope:'variant',reason:'Only episodes requiring changes to both buttons measure multiple-object completion.'}]),
];

export const simulationV2ScenarioIds = [
  'imitate_sorting_sequence', 'classify_objects_by_language', 'pour_liquid_into_cup',
  'arrange_largest_number', 'solve_equation', 'pack_mixed_objects_into_box_v1',
  'hang_mugs', 'cover_blocks', 'press_by_number', 'play_stacking_toy',
  'store_tools_in_toolbox', 'fold_clothes', 'stack_bowls', 'match_and_pick_from_conveyor',
  'push_T', 'insert_key', 'build_tower', 'find_category_outlier', 'set_button_colors',
  'place_between_references', 'mirror_pair_layout', 'clear_keyboard_then_close_laptop',
  'hold_water_mug', 'hold_button_until_cue',
] as const;
export const simulationV2Plan = simulationV2ScenarioIds.map(id => scenarioPlan.find(scene => scene.id === id)!);
// Planned scene coverage, including explicitly scoped variants; not accepted episode counts.
export const scenarioTagCoverage = Object.fromEntries(
  (Object.keys(scenarioTags) as ScenarioTag[]).map(tag => [tag, simulationV2Plan.filter(scene => tagsForScenario(scene).includes(tag)).length]),
) as Record<ScenarioTag, number>;
export function scenarioFor(id: string) { return scenarioPlan.find(scene => scene.id === id); }
export function tagsForScenario(scene: Scenario, scope: 'all' | 'base' = 'all'): ScenarioTag[] {
  return [...new Set([...scene.tags, ...(scope === 'all' ? scene.scoped.map(t => t.tag) : [])])];
}
export function matchesScenario(scene: Scenario, tags: ScenarioTag[], scope: 'all' | 'base', query: string, physical = 'all') {
  return tags.every(tag => tagsForScenario(scene, scope).includes(tag))
    && (physical === 'all' || scene.physical === physical)
    && `${scene.name} ${scene.id} ${scene.note}`.toLowerCase().includes(query.trim().toLowerCase());
}
