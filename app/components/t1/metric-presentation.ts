import type { T1BenchmarkMetric } from "../../data/t1-benchmark-results";
import type { BilingualText } from "../../data/metric-explanations";

type Presentation = { label: string; summary: string; summaryZh: string };
export type T1QaTemplate = {
  source: string;
  sourceId: string;
  question: string;
  questionZh: string;
  answerFormat: string;
  representativeMetric?: string;
};

const presentations: Record<string, Presentation> = {
  overall: { label: "Overall", summary: "Combine task execution and visual reasoning.", summaryZh: "综合衡量原生任务执行与视觉问答推理表现。" },
  vqa: { label: "VQA", summary: "Understand the scene, the task and the plan.", summaryZh: "衡量模型对场景、任务目标、过程状态和行动计划的理解。" },
  subtask: { label: "Subtask", summary: "Complete the task's native intermediate milestones.", summaryZh: "衡量原生任务中间里程碑的完成程度。" },
  success: { label: "Success", summary: "Finish the complete task successfully.", summaryZh: "衡量完整任务是否通过原生最终成功检查。" },
  a: { label: "Perception", summary: "Recognize objects and their spatial arrangement.", summaryZh: "综合衡量物体识别、三维定位与空间关系理解。" },
  b: { label: "Understanding", summary: "Understand goals, constraints and interactions.", summaryZh: "综合衡量任务目标、约束条件与交互部位理解。" },
  c: { label: "Reasoning", summary: "Plan the task, track milestones and choose the next action.", summaryZh: "综合衡量完整规划、里程碑跟踪与下一动作选择。" },
  a1: { label: "Recognition", summary: "Identify objects, counts and visual attributes.", summaryZh: "识别物体、数量及可见属性。" },
  a2: { label: "Localization", summary: "Locate objects in three-dimensional space.", summaryZh: "在统一坐标系中定位目标物体的三维中心。" },
  a3: { label: "Relations", summary: "Identify relative positions and spatial arrangements.", summaryZh: "识别物体之间的相对位置与空间排列。" },
  b1: { label: "Goals", summary: "Match task goals to the correct objects and targets.", summaryZh: "把任务目标与正确的物体、目标区域和最终关系对应起来。" },
  b3: { label: "Constraints", summary: "Identify rules for support, handover and task completion.", summaryZh: "识别支撑、交接、顺序和完成条件等任务约束。" },
  b_interaction: { label: "Interaction", summary: "Identify the object parts used for an interaction.", summaryZh: "识别完成交互时必须接触、对齐或进入的物体部位。" },
  c1: { label: "Planning", summary: "Produce a complete plan with the required action order.", summaryZh: "生成包含必要动作、依赖关系和执行顺序的完整高层计划。" },
  c2: { label: "Task Tracking", summary: "Identify which milestones have been completed at a checkpoint.", summaryZh: "在过程检查点列出截至当前已经完成的全部公开里程碑。" },
  c3: { label: "Next Action", summary: "Choose a legal next action, object and target parameters.", summaryZh: "在当前状态下选择合法的下一技能、对象和参数。" },
  count: { label: "Counting", summary: "Count the required objects in the scene.", summaryZh: "统计场景中指定物体的数量。" },
  color: { label: "Color", summary: "Identify the required object colors.", summaryZh: "识别指定物体的可见颜色。" },
};

const processQuestion = "Using the task instruction, the full public milestone and action definitions, and your conversation and observations up to this checkpoint: (C2) list all public milestones that have successfully been reached so far; an earlier milestone remains in this historical list after later actions. (C3) give one currently valid next high-level action under the public action definitions.";
const processQuestionZh = "根据任务指令、公开里程碑与动作定义，以及截至当前检查点的对话和观测：（C2）列出目前已成功到达的全部公开里程碑；（C3）给出一个当前合法的下一高层动作。";
const processAnswer = '{"completed_subtasks":["<PUBLIC_STAGE_ID>"],"next_action":{"skill":"<PUBLIC_SKILL_ID>","object":"<PUBLIC_OBJECT_ID>","parameter":{"target":"<PUBLIC_TARGET_ID>"}}}';

const qaTemplates: Record<string, T1QaTemplate> = {
  a1: {
    source: "ID24 VQA v2", sourceId: "arrange_largest_number.revised.total_digit_count",
    question: "Based on the provided images, how many digit blocks need to be placed on the pads?",
    questionZh: "根据提供的图像，需要把多少个数字块放到垫板上？",
    answerFormat: '{"count":<integer>}',
  },
  a2: {
    source: "ID24 VQA v2", sourceId: "arrange_largest_number.revised.visible_digit_positions",
    question: "Based on the provided images, robot state, and calibration, estimate the overall center coordinates [x, y, z] of each digit block in the environment_origin frame, in meters.",
    questionZh: "根据图像、机器人状态和标定信息，估计每个数字块在 environment_origin 坐标系中的中心坐标 [x, y, z]（米）。",
    answerFormat: '{"objects":[{"object":"<public object ID>","center_m":[<x>,<y>,<z>]}],"frame":"environment_origin"}',
  },
  a3: {
    source: "ID24 VQA v2", sourceId: "build_tower.revised.board_relative_position",
    question: "Based on the head-camera image, what is the vertical image-plane relation of the longer of the two central boards to the shorter board?",
    questionZh: "根据头部相机图像，两块中央木板中较长木板相对较短木板的垂直图像关系是什么？",
    answerFormat: '{"answer":"<allowed relation>"}',
  },
  b1: {
    source: "ID24 VQA v2", sourceId: "build_tower.revised.construction_targets",
    question: "According to the task instruction, which objects in the scene are intended as the materials for the tower?",
    questionZh: "根据任务指令，场景中的哪些物体是搭塔所需的材料？",
    answerFormat: '{"answer":["<allowed target>","..."]}',
  },
  b3: {
    source: "ID24 VQA v2", sourceId: "build_tower.revised.board_support",
    question: "When a board is used as an elevated layer of the tower, where must the support blocks be relative to it?",
    questionZh: "当木板作为塔的高层结构时，支撑块必须位于木板的什么位置？",
    answerFormat: '{"answer":"<allowed constraint option>"}',
  },
  b_interaction: {
    source: "ID24 VQA v2", sourceId: "hang_mugs.revised.hanging_part",
    question: "To complete hanging a mug, which part or feature of a mug must engage with a rack hook?",
    questionZh: "要完成挂杯，杯子的哪个部位或特征必须与杯架挂钩接合？",
    answerFormat: '{"answer":"<allowed interaction part>"}',
  },
  c1: {
    source: "ID24 VQA v2", sourceId: "build_tower.revised.complete_plan",
    question: "Give a complete high-level plan to finish this task.",
    questionZh: "给出完成该任务的完整高层计划。",
    answerFormat: '{"steps":[{"id":"<step id>","action":"<public action>","object":"<public object>","goal":"<public goal>"}],"dependencies":[],"order":"sequential"}',
  },
  c2: {
    source: "ID24 process C2/C3", sourceId: "joint_c2c3_v1",
    question: processQuestion, questionZh: processQuestionZh, answerFormat: processAnswer,
  },
  c3: {
    source: "ID24 process C2/C3", sourceId: "joint_c2c3_v1",
    question: processQuestion, questionZh: processQuestionZh, answerFormat: processAnswer,
  },
};

const aggregateExamples: Record<string, string> = { vqa: "c1", a: "a1", b: "b1", c: "c1" };
export const t1VqaMetricIds = ["vqa", "a", "b", "c", ...Object.keys(qaTemplates)] as const;

const ioContracts: Record<string, { input: BilingualText; output: BilingualText }> = {
  overall: {
    input: { en: "Published Subtask and VQA scores from the same model and frozen evaluation scope.", zh: "同一模型、同一冻结评测范围内发布的 Subtask 与 VQA 分数。" },
    output: { en: "One 0–100 Overall score: 70% Subtask + 30% VQA.", zh: "一个 0–100 的 Overall 总分：70% Subtask + 30% VQA。" },
  },
  subtask: {
    input: { en: "Native intermediate-milestone outcomes for every eligible task and process slot.", zh: "每个合格任务与过程槽位的原生中间里程碑结果。" },
    output: { en: "A 0–100 milestone-completion score aggregated over the frozen scope.", zh: "在冻结范围内汇总的 0–100 里程碑完成分数。" },
  },
  success: {
    input: { en: "Native terminal outcome and final task-checker result for each valid episode.", zh: "每个有效 episode 的原生终止结果与最终任务检查结果。" },
    output: { en: "A 0–100 complete-task success percentage.", zh: "一个 0–100 的完整任务成功率。" },
  },
};

export function metricDisplayLabel(metric: Pick<T1BenchmarkMetric, "id" | "label">): string {
  return presentations[metric.id]?.label ?? metric.label;
}

export function metricSummary(metric: Pick<T1BenchmarkMetric, "id" | "definition">): string {
  return presentations[metric.id]?.summary ?? metric.definition;
}

export function metricSummaryZh(metricId: string): string {
  return presentations[metricId]?.summaryZh ?? "按正式指标定义和冻结评测协议解释。";
}

export function metricQaTemplate(metricId: string): T1QaTemplate | null {
  const representativeMetric = aggregateExamples[metricId];
  const template = qaTemplates[representativeMetric ?? metricId];
  return template ? { ...template, ...(representativeMetric ? { representativeMetric } : {}) } : null;
}

export function metricIoContract(metricId: string) {
  return ioContracts[metricId] ?? null;
}

/** Replace internal capability codes in explanatory text without changing the stored rule. */
export function metricDisplayFormula(formula: string): string {
  return formula.replace(/\b(?:B_interaction_semantics|[ABC][123]?)\b/g, (id) => {
    const key = id === "B_interaction_semantics" ? "b_interaction" : id.toLowerCase();
    return presentations[key]?.label ?? id;
  });
}
