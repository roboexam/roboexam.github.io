export type TrackId = "T1" | "T2" | "T3" | "T4";
type Source = "vlm" | "acwm" | "policy" | "real";
export type MetricDefinition = { id: string; label: string; group: string; direction: string; note?: string; diagnostic?: boolean };
export type TrackDefinition = {
  id: TrackId;
  title: string;
  subtitle: string;
  question: string;
  scoreGuide: { en: string; zh: string };
  source: Source;
  models: { id: string; family: string; status: string }[];
  metrics: MetricDefinition[];
};

const t1Metrics: MetricDefinition[] = [
  { id: "l1a.object_facts.counting", label: "Object facts · Counting", group: "A1 · Object facts", direction: "↑" },
  { id: "l1a.object_facts.category", label: "Object facts · Category", group: "A1 · Object facts", direction: "↑" },
  { id: "l1a.object_facts.color", label: "Object facts · Color", group: "A1 · Object facts", direction: "↑" },
  { id: "l1a.object_facts.material", label: "Object facts · Material", group: "A1 · Object facts", direction: "↑" },
  { id: "l1a.object_facts.shape", label: "Object facts · Shape", group: "A1 · Object facts", direction: "↑" },
  { id: "l1a.object_facts.state", label: "Object facts · State", group: "A1 · Object facts", direction: "↑" },
  { id: "l1a.direct", label: "Direct grounding · Acc@0.5", group: "A2 · Explicit target localization", direction: "↑" },
  { id: "l1a.blink", label: "BLINK visual correspondence", group: "A2 · Explicit target localization", direction: "↑" },
  { id: "l1a.vsr_topological", label: "VSR topological accuracy", group: "A3 · Spatial structure · candidate", direction: "↑", note: "Candidate protocol; choose VSR or text spatial cognition before release" },
  { id: "l1a.text_spatial", label: "Text spatial cognition", group: "A3 · Spatial structure · candidate", direction: "↑", note: "Candidate protocol; choose one qualitative spatial track" },
  { id: "l1a.mra", label: "MRA · Relative accuracy", group: "A3 · Spatial structure", direction: "↑" },
  { id: "l1a.roa", label: "RoA · Relative orientation", group: "A3 · Spatial structure · pending", direction: "↑", note: "Pending admissible object-to-object angle subset", diagnostic: true },
  { id: "l1b.reference_mcq", label: "Reference comprehension · MCQ", group: "B1 · Task-conditioned target · candidate", direction: "↑", note: "Candidate protocol; choose MCQ or situational grounding" },
  { id: "l1b.situational", label: "Situational grounding · Acc@0.5", group: "B1 · Task-conditioned target · candidate", direction: "↑", note: "Candidate protocol; choose MCQ or situational grounding" },
  { id: "l1b.affordance", label: "Object affordance accuracy", group: "B2 · Interaction and placement", direction: "↑" },
  { id: "l1b.free_space", label: "Free-space reference accuracy", group: "B2 · Interaction and placement", direction: "↑" },
  { id: "l1b.pac_constraint", label: "Constraint understanding", group: "B3 · Constraints and local effects", direction: "↑" },
  { id: "l1b.hypothetical_paired", label: "Hypothetical paired accuracy", group: "B3 · Constraints and local effects", direction: "↑" },
  { id: "l1b.counterfactual_paired", label: "Counterfactual paired accuracy", group: "B3 · Constraints and local effects", direction: "↑" },
  { id: "l1c.epr", label: "Plan executability rate", group: "C1 · Global task planning", direction: "↑", note: "Symbolic audit subset" },
  { id: "l1c.cgs", label: "Conditional goal success", group: "C1 · Global task planning", direction: "↑", note: "Symbolic audit subset" },
  { id: "l1c.cpe", label: "Conditional plan efficiency", group: "C1 · Global task planning · pending", direction: "↑", note: "Pending frozen optimal-cost contract" },
  { id: "l1c.as_f1", label: "Action-semantic F1", group: "C1 · Global task planning", direction: "↑" },
  { id: "l1c.poa", label: "Pairwise order accuracy", group: "C1 · Global task planning", direction: "↑" },
  { id: "l1c.stage_accuracy", label: "Stage accuracy", group: "C2 · Current task state", direction: "↑" },
  { id: "l1c.stage_macro_f1", label: "Stage macro F1", group: "C2 · Current task state", direction: "↑" },
  { id: "l1c.bf1_at_5", label: "Boundary F1@5", group: "C2 · Current task state · diagnostic", direction: "↑", diagnostic: true },
  { id: "l1c.mmae", label: "Mean boundary error", group: "C2 · Current task state · diagnostic", direction: "↓", diagnostic: true },
  { id: "l1c.next_action_accuracy", label: "Next-action accuracy", group: "C3 · Next-step decision", direction: "↑" },
  { id: "l1c.sscs", label: "Single-step component score", group: "C3 · Next-step decision", direction: "↑" },
  {"id":"l1c.semantic_nlcs","label":"Semantic nLCS","group":"C1 · Global task planning","direction":"↑","diagnostic":true,"note":"Auxiliary comparison"},
  {"id":"l1c.psa","label":"Plan selection accuracy","group":"C1 · Global task planning","direction":"↑","note":"Optional candidate format"},
];
const acwmMetrics: MetricDefinition[] = [
  { id: "PSNR", label: "PSNR", group: "A · Video quality", direction: "↑" },
  { id: "SSIM", label: "SSIM", group: "A · Video quality", direction: "↑" },
  { id: "JEPA", label: "JEPA similarity", group: "A · Video quality", direction: "↑" },
  { id: "MS", label: "Motion smoothness", group: "A · Video quality", direction: "↑" },
  { id: "M-MSE", label: "Motion-masked MSE", group: "A · Video quality", direction: "↓" },
  { id: "SUBJECT", label: "Subject consistency", group: "A · Video quality", direction: "↑" },
  { id: "ROBOT_NADE", label: "Robot nADE", group: "B · Action following", direction: "↓" },
  { id: "RMFA", label: "RMFA", group: "B · Action following", direction: "↑" },
  { id: "LAC", label: "Local action calibration", group: "B · Action following", direction: "↑" },
  { id: "AF-DIV", label: "WorldArena AF-div", group: "B · Action following", direction: "Report", diagnostic: true },
  { id: "OBJECT_NADE", label: "Object nADE", group: "C · Physical response", direction: "↓" },
  { id: "EVENT_F1", label: "Event F1@δ", group: "C · Physical response", direction: "↑" },
  { id: "NO_CONTACT", label: "No-contact grounding", group: "C · Physical response", direction: "↑" },
  { id: "PRIMITIVE", label: "Primitive fidelity", group: "C · Physical response", direction: "↑" },
  { id: "CEE", label: "Counterfactual effect error", group: "D · Intervention outcome", direction: "↓" },
  { id: "P-OACC", label: "Paired outcome accuracy", group: "D · Intervention outcome", direction: "↑" },
  { id: "BRIER", label: "Outcome Brier score", group: "D · Intervention outcome", direction: "↓", diagnostic: true },
  { id: "BOUNDARY", label: "Failure boundary error", group: "D · Intervention outcome", direction: "↓", diagnostic: true },
];
const policyMotion: MetricDefinition[] = [
  { id: "TSR", label: "Task success rate", group: "Outcome", direction: "↑" },
  { id: "TASK_SCORE", label: "Subtask completion rate", group: "Outcome", direction: "↑", note: "Percentage of registered subtask progress completed" },
  { id: "FIRST_TARGET_SELECTION", label: "First target selection accuracy", group: "L1 · Action correctness", direction: "↑" },
  { id: "ALL_TARGET_SELECTION", label: "All target selection accuracy", group: "L1 · Action correctness", direction: "↑" },
  { id: "GRASP_STABILITY", label: "Grasp stability rate", group: "L1 · Action correctness", direction: "↑", note: "Established grasps divided by established plus invalid grasp attempts" },
  { id: "DROP_RATE", label: "Transport drop rate", group: "L1 · Action correctness", direction: "↓", note: "Drops divided by legal releases plus drops" },
  { id: "LOCAL_SUCCESS_ONCE", label: "Local success once", group: "L2 · Closed-loop effectiveness", direction: "↑" },
  { id: "LOCAL_SUCCESS_AT_END", label: "Local success at end", group: "L2 · Closed-loop effectiveness", direction: "↑" },
  { id: "DROP_AFTER_SUCCESS", label: "Drop-after-success rate", group: "L2 · Closed-loop effectiveness", direction: "↓" },
  { id: "SPARC", label: "SPARC", group: "L2 · Motion and efficiency", direction: "→ 0" },
  { id: "EE_DISPLACEMENT", label: "End-effector net displacement", group: "L2 · Motion and efficiency", direction: "Report" },
  { id: "PATH_LENGTH", label: "End-effector path length", group: "L2 · Motion and efficiency", direction: "Report" },
  { id: "SET", label: "Time-to-success", group: "L2 · Motion and efficiency", direction: "↓" },
  { id: "PATH_EFFICIENCY", label: "Path efficiency", group: "L2 · Motion and efficiency", direction: "↑" },
  { id: "TIME_EFFICIENCY", label: "Time efficiency", group: "L2 · Motion and efficiency", direction: "↑" },
  { id: "STAGE_TRANSITION", label: "Stage transition accuracy", group: "L3 · Stateful execution", direction: "↑" },
  { id: "GOAL_RETENTION", label: "Completed-goal retention", group: "L3 · Stateful execution", direction: "↑" },
  { id: "COLLISION_RATE", label: "Collision rate", group: "X · Safety and robustness", direction: "↓", note: "Pending complete collision telemetry and an allowed-contact contract" },
  { id: "ROBUSTNESS", label: "Robustness retention", group: "X · Safety and robustness", direction: "↑", note: "Pending matched nominal and perturbed cohorts" },
];
const realWorldMetrics: MetricDefinition[] = [
  { id: "TSR", label: "Task success rate", group: "Task outcome", direction: "↑" },
  { id: "SUBGOAL_PROGRESS", label: "Subgoal progress score", group: "Task outcome", direction: "↑", note: "Planned; protocol-defined subgoals and manual/event review" },
  { id: "HUMAN_EVAL", label: "Human safety and task rubric", group: "Manual review", direction: "↑", diagnostic: true, note: "Three independent evaluators; reported separately from capability" },
  { id: "HUMAN_INTERVENTION", label: "Human intervention count", group: "Manual review", direction: "↓", diagnostic: true, note: "Manual event log; no capability score" },
  { id: "SET", label: "Time-to-success", group: "Manual review", direction: "↓", diagnostic: true, note: "Manual timing; report only when a timing contract is frozen" },
  {"id":"GOAL_RETENTION","label":"Completed-Goal Retention","group":"Progress and recovery","direction":"↑","note":"Requires a frozen video-review or operator-log rubric"},
  {"id":"RECOVERY_SR","label":"Error Recovery Success Rate","group":"Progress and recovery","direction":"↑","note":"Requires a frozen video-review or operator-log rubric"},
  {"id":"RECOVERY_TIME","label":"Recovery Time","group":"Progress and recovery","direction":"↓","note":"Requires a frozen video-review or operator-log rubric"},
  {"id":"RECOVERY_RETRIES","label":"Recovery Retries","group":"Progress and recovery","direction":"↓","note":"Requires a frozen video-review or operator-log rubric"},
  {"id":"RECOVERY_FINAL_SR","label":"Post-Error Final SR","group":"Progress and recovery","direction":"↑","note":"Requires a frozen video-review or operator-log rubric"},
  {"id":"RETRY_COUNT","label":"Retry Count","group":"Manual safety review","direction":"↓","note":"Requires a frozen video-review or operator-log rubric"},
  {"id":"COLLISION_RATE","label":"Collision Rate","group":"Manual safety review","direction":"↓","note":"Requires a frozen video-review or operator-log rubric"},
  {"id":"SAFETY_STOP_RATE","label":"Safety-Stop Rate","group":"Manual safety review","direction":"↓","note":"Requires a frozen video-review or operator-log rubric"},
  {"id":"DANGEROUS_CONTACT","label":"Dangerous Contact Rate","group":"Manual safety review","direction":"↓","note":"Requires a frozen video-review or operator-log rubric"},
  {"id":"HUMAN_TERMINATION","label":"Manual Termination Rate","group":"Manual safety review","direction":"↓","note":"Requires a frozen video-review or operator-log rubric"},
];

export const tracks: TrackDefinition[] = [
  {
    id: "T1", title: "Embodied Agency", subtitle: "VLM agents through a shared harness", question: "Ground observations, track task state, plan, and emit structured next actions.", source: "vlm",
    scoreGuide: {
      en: "0–100; higher is better. Execution across ID, OOD, and Recovery is primary. VQA is supporting evidence, not task success.",
      zh: "0–100 分，越高越好。ID、OOD 与失败恢复中的执行表现为主，VQA 仅作为辅助证据，不等同于任务成功。",
    },
    models: [
      { id: "gpt-6-1-sol", family: "VLM", status: "Validated · 5 settings" },
      { id: "deepseek-v4-1-flash", family: "VLM", status: "Validated · 5 settings" },
      { id: "glm-5-3-flash", family: "VLM", status: "Validated · 5 settings" },
      { id: "claude-opus-5-5", family: "VLM", status: "Validated · ID" },
      { id: "qwen3-8-27b", family: "VLM", status: "Validated · ID" },
    ], metrics: t1Metrics,
  },
  {
    id: "T2", title: "Physical Foresight", subtitle: "Action-conditioned world models", question: "Predict the consequences of interventions and distinguish actions that advance the task.", source: "acwm",
    scoreGuide: {
      en: "Metrics keep their native units and directions; there is no official cross-metric total yet. JEPA is split-level and Motion Smoothness is not bounded to 0–1.",
      zh: "各指标保留原始单位与方向，目前没有正式跨指标总分。JEPA 是集合级分数，Motion Smoothness 也不限定在 0–1。",
    },
    models: [
      { id: "Cosmos Predict 2.5", family: "ACWM", status: "Published result" },
      { id: "CtrlWorld", family: "ACWM", status: "Published result" },
    ], metrics: acwmMetrics,
  },
  {
    id: "T3", title: "Simulation Deployment", subtitle: "Policy models in simulation", question: "Complete long-horizon tasks while preserving safe, stable, interpretable execution.", source: "policy",
    scoreGuide: {
      en: "Task Success Rate is the headline 0–100% outcome; intermediate 100% metrics are not task success. Compare only the same task, protocol, and episode count N.",
      zh: "任务成功率是主要的 0–100% 结果；中间指标的 100% 不代表任务成功。模型比较必须使用相同任务、协议和 episode 数 N。",
    },
    models: [
      { id: "G05", family: "VLA", status: "Benchmark complete · 480 episodes" },
      { id: "HyVLA", family: "VLA", status: "Benchmark complete · 480 episodes" },
      { id: "XVLA", family: "VLA", status: "Benchmark complete · 480 episodes" },
    ], metrics: policyMotion,
  },
  {
    id: "T4", title: "Real-World Deployment", subtitle: "Policy models on hardware", question: "Complete standardized hardware tasks while separating task outcome from manual safety review.", source: "real",
    scoreGuide: {
      en: "No formal hardware score is published yet. Future headline reporting uses task success; progress, intervention, and safety remain separate evidence.",
      zh: "目前尚未发布正式真机分数。后续以任务成功率为主要结果，进度、人工干预和安全证据分别报告。",
    },
    models: [], metrics: realWorldMetrics,
  },
];

for (const track of tracks) {
  const cleanGroup = (metric: MetricDefinition) => metric.group.replace(/ · (candidate|pending|diagnostic)$/, '');
  const order = track.id === 'T3' ? [
    'Outcome', 'L1 · Action correctness', 'L2 · Closed-loop effectiveness',
    'L2 · Motion and efficiency', 'L3 · Stateful execution',
    'X · Safety and robustness',
  ] : [...new Set(track.metrics.map(cleanGroup))];
  track.metrics.sort((a, b) => order.indexOf(cleanGroup(a)) - order.indexOf(cleanGroup(b)));
}
