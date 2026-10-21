import type { T1BenchmarkMetric } from "../../data/t1-benchmark-results";

const presentations: Record<string, { label: string; summary: string }> = {
  overall: { label: "Overall", summary: "Combine task execution and visual reasoning." },
  vqa: { label: "VQA", summary: "Understand the scene, the task and the plan." },
  subtask: { label: "Subtask", summary: "Complete the task's native intermediate milestones." },
  success: { label: "Success", summary: "Finish the complete task successfully." },
  a: { label: "Perception", summary: "Recognize objects and their spatial arrangement." },
  b: { label: "Understanding", summary: "Understand goals, constraints and interactions." },
  c: { label: "Reasoning", summary: "Plan the task, track milestones and choose the next action." },
  a1: { label: "Recognition", summary: "Identify objects, counts and visual attributes." },
  a2: { label: "Localization", summary: "Locate objects in three-dimensional space." },
  a3: { label: "Relations", summary: "Identify relative positions and spatial arrangements." },
  b1: { label: "Goals", summary: "Match task goals to the correct objects and targets." },
  b3: { label: "Constraints", summary: "Identify rules for support, handover and task completion." },
  b_interaction: { label: "Interaction", summary: "Identify the object parts used for an interaction." },
  c1: { label: "Planning", summary: "Produce a complete plan with the required action order." },
  c2: { label: "Task Tracking", summary: "Identify which milestones have been completed at a checkpoint." },
  c3: { label: "Next Action", summary: "Choose a legal next action, object and target parameters." },
  peak: { label: "Peak Progress", summary: "Highest recorded native progress across the saved scenes." },
  count: { label: "Counting", summary: "Count the required objects in the scene." },
  color: { label: "Color", summary: "Identify the required object colors." },
};

export function metricDisplayLabel(metric: T1BenchmarkMetric): string {
  return presentations[metric.id]?.label ?? metric.label;
}

export function metricSummary(metric: T1BenchmarkMetric): string {
  return presentations[metric.id]?.summary ?? metric.definition;
}

/** Replace internal capability codes in explanatory text without changing the stored rule. */
export function metricDisplayFormula(formula: string): string {
  return formula.replace(/\b(?:B_interaction_semantics|[ABC][123]?)\b/g, (id) => {
    const key = id === "B_interaction_semantics" ? "b_interaction" : id.toLowerCase();
    return presentations[key]?.label ?? id;
  });
}
