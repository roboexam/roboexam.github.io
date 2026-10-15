import { acwmDashboardBundle } from "./acwm-results.ts";
import { vlaWamDashboardBundle } from "./vla-wam-results.ts";

export type LeaderboardModelId = "Pi0.5" | "FastWAM" | "Cosmos Predict 2.5" | "CtrlWorld";
export type LeaderboardFamily = "VLA" | "WAM" | "ACWM";
export type LeaderboardLevelId = "L2" | "L3" | "L4";

type ScoreTransform =
  | "relative-lower"
  | "relative-higher"
  | "negative-magnitude-lower"
  | "event-rate-lower"
  | "native-rate"
  | "native-progress"
  | "display-only";

export type LeaderboardMetricRule = {
  id: string;
  label: string;
  group: string;
  weight: number;
  transform: ScoreTransform;
  scoringNote: string;
};

export type LeaderboardLevelDefinition = {
  id: LeaderboardLevelId;
  title: string;
  shortTitle: string;
  scope: string;
  protocol: string;
  split: string;
  scoreVersion: string;
  normalizationModelIds: LeaderboardModelId[];
  eligibleModelIds: LeaderboardModelId[];
  rules: LeaderboardMetricRule[];
};

export type LeaderboardMetricScore = {
  id: string;
  label: string;
  group: string;
  weight: number;
  rawDisplay: string;
  rawAux: string;
  subscore: number | null;
  included: boolean;
  inclusionNote: string;
};

export type LeaderboardModelScore = {
  modelId: LeaderboardModelId;
  family: LeaderboardFamily;
  totalScore: number | null;
  activeWeight: number;
  availableWeight: number;
  metrics: Record<string, LeaderboardMetricScore>;
};

export type LeaderboardLevelResult = {
  definition: LeaderboardLevelDefinition;
  activeWeight: number;
  deferredWeight: number;
  models: LeaderboardModelScore[];
};

export const leaderboardModelMetadata: Record<LeaderboardModelId, { family: LeaderboardFamily }> = {
  "Pi0.5": { family: "VLA" },
  FastWAM: { family: "WAM" },
  "Cosmos Predict 2.5": { family: "ACWM" },
  CtrlWorld: { family: "ACWM" },
};

const l2Rules: LeaderboardMetricRule[] = [
  { id: "LSPARC", label: "左臂 EE 平滑度", group: "运动平滑度", weight: 10, transform: "negative-magnitude-lower", scoringNote: "SPARC 越接近 0 越好；按绝对值作为 loss 归一化。" },
  { id: "RSPARC", label: "右臂 EE 平滑度", group: "运动平滑度", weight: 10, transform: "negative-magnitude-lower", scoringNote: "SPARC 越接近 0 越好；按绝对值作为 loss 归一化。" },
  { id: "LPATH", label: "左臂 EE 路径", group: "末端路径与节奏", weight: 10, transform: "relative-lower", scoringNote: "同任务、同窗口下累计路径越短通常越经济。" },
  { id: "RPATH", label: "右臂 EE 路径", group: "末端路径与节奏", weight: 10, transform: "relative-lower", scoringNote: "同任务、同窗口下累计路径越短通常越经济。" },
  { id: "LSPEED", label: "左臂 EE 速度", group: "末端路径与节奏", weight: 0, transform: "display-only", scoringNote: "没有单调优劣方向，只作为动作节奏诊断。" },
  { id: "RSPEED", label: "右臂 EE 速度", group: "末端路径与节奏", weight: 0, transform: "display-only", scoringNote: "没有单调优劣方向，只作为动作节奏诊断。" },
  { id: "LJPL", label: "左臂关节路径", group: "关节与姿态效率", weight: 10, transform: "relative-lower", scoringNote: "同 embodiment 与窗口下越短通常越经济。" },
  { id: "RJPL", label: "右臂关节路径", group: "关节与姿态效率", weight: 10, transform: "relative-lower", scoringNote: "同 embodiment 与窗口下越短通常越经济。" },
  { id: "LOPL", label: "左臂姿态路径", group: "关节与姿态效率", weight: 10, transform: "relative-lower", scoringNote: "同任务与窗口下旋转总量越小通常越经济。" },
  { id: "ROPL", label: "右臂姿态路径", group: "关节与姿态效率", weight: 10, transform: "relative-lower", scoringNote: "同任务与窗口下旋转总量越小通常越经济。" },
  { id: "TJPL", label: "双臂关节路径总量", group: "关节与姿态效率", weight: 0, transform: "display-only", scoringNote: "由左右臂分项派生；展示但不重复计权。" },
  { id: "TOPL", label: "双臂姿态路径总量", group: "关节与姿态效率", weight: 0, transform: "display-only", scoringNote: "由左右臂分项派生；展示但不重复计权。" },
  { id: "TAE", label: "任务遵从事件", group: "安全与任务遵从", weight: 8, transform: "event-rate-lower", scoringNote: "按每 episode 事件率计分；0.1 events/episode 为当前 v0 归一化上界。" },
  { id: "SLIP", label: "物体滑落事件", group: "安全与任务遵从", weight: 4, transform: "event-rate-lower", scoringNote: "按每 episode 事件率计分；零事件得 100。" },
  { id: "ENV_COLL", label: "环境碰撞事件", group: "安全与任务遵从", weight: 4, transform: "event-rate-lower", scoringNote: "按每 episode 事件率计分；零事件得 100。" },
  { id: "SELF_COLL", label: "自碰撞事件", group: "安全与任务遵从", weight: 4, transform: "event-rate-lower", scoringNote: "按每 episode 事件率计分；零事件得 100。" },
];

const l3Rules: LeaderboardMetricRule[] = [
  { id: "MSE", label: "均方误差", group: "Paired Future Fidelity", weight: 10, transform: "relative-lower", scoringNote: "预测与 paired GT 的像素误差，越低越好。" },
  { id: "M-MSE", label: "运动掩码均方误差", group: "Paired Future Fidelity", weight: 15, transform: "relative-lower", scoringNote: "提高真实运动区域权重，越低越好。" },
  { id: "PSNR", label: "峰值信噪比", group: "Paired Future Fidelity", weight: 0, transform: "display-only", scoringNote: "由 split MSE 派生；展示但不与 MSE 重复计权。" },
  { id: "SSIM", label: "结构相似性", group: "Paired Future Fidelity", weight: 10, transform: "relative-higher", scoringNote: "局部结构、亮度与对比度越相似越好。" },
  { id: "JEPA", label: "JEPA 表征相似度", group: "感知与时序质量", weight: 10, transform: "relative-higher", scoringNote: "heldout73 集合级表征分布相似度，越高越好。" },
  { id: "IQ", label: "图像质量", group: "感知与时序质量", weight: 5, transform: "relative-higher", scoringNote: "无参考技术画质，越高越好；不代表 action correctness。" },
  { id: "MS", label: "运动平滑度", group: "感知与时序质量", weight: 10, transform: "relative-higher", scoringNote: "固定 FPS 下的时间连续性，越高越好。" },
  { id: "TA", label: "轨迹准确度", group: "具身运动与 Action", weight: 20, transform: "relative-higher", scoringNote: "预测与 GT 的主要二维机器人轨迹越接近越好。" },
  { id: "INTERACT", label: "交互质量", group: "具身运动与 Action", weight: 10, transform: "relative-higher", scoringNote: "固定 VLM judge 的物理交互合理性评分。" },
  { id: "AF", label: "动作跟随度", group: "具身运动与 Action", weight: 10, transform: "relative-higher", scoringNote: "同一首帧三 action 组的 action sensitivity；当前输入不足。" },
];

const l4Rules: LeaderboardMetricRule[] = [
  { id: "TSR", label: "任务成功率", group: "任务结果与进展", weight: 60, transform: "native-rate", scoringNote: "原生 task checker 的成功率直接映射到 0–100。" },
  { id: "SCORE_DIST", label: "原生进展分布", group: "任务结果与进展", weight: 25, transform: "native-progress", scoringNote: "由 RoboDojo 原生 score 分布计算期望值，再映射到 0–100。" },
  { id: "SR95", label: "成功率 95% 区间", group: "任务结果与进展", weight: 0, transform: "display-only", scoringNote: "只表达统计不确定性，不是独立能力分。" },
  { id: "SET", label: "成功回合完成时间", group: "成功效率", weight: 15, transform: "relative-lower", scoringNote: "只在成功 episode 上比较；必须与 TSR 联读。" },
];

export const leaderboardLevelDefinitions: LeaderboardLevelDefinition[] = [
  {
    id: "L2",
    title: "Action & Rollout Quality",
    shortTitle: "动作与 Rollout",
    scope: "VLA / WAM · 相同 stack_bowls、100 独立 seed 与 VLA Phase 1 action/rollout 协议",
    protocol: vlaWamDashboardBundle.protocol,
    split: "all100 independent seeds",
    scoreVersion: "leaderboard-l2-v0.1-20260819",
    normalizationModelIds: ["Pi0.5", "FastWAM"],
    eligibleModelIds: ["Pi0.5", "FastWAM"],
    rules: l2Rules,
  },
  {
    id: "L3",
    title: "Action-Conditioned Prediction",
    shortTitle: "动作条件预测",
    scope: "ACWM · 相同 stack_bowls_corrected_v2、视频协议与 heldout73 主报告 split",
    protocol: acwmDashboardBundle.protocol,
    split: acwmDashboardBundle.primarySplit,
    scoreVersion: "leaderboard-l3-v0.1-20260819",
    normalizationModelIds: ["Cosmos Predict 2.5", "CtrlWorld"],
    eligibleModelIds: ["Cosmos Predict 2.5", "CtrlWorld"],
    rules: l3Rules,
  },
  {
    id: "L4",
    title: "Long-Horizon Closed Loop",
    shortTitle: "长程闭环",
    scope: "VLA / WAM · 相同 stack_bowls、100 独立 seed 与原生 RoboDojo outcome/score",
    protocol: vlaWamDashboardBundle.protocol,
    split: "all100 independent seeds",
    scoreVersion: "leaderboard-l4-v0.1-20260819",
    normalizationModelIds: ["Pi0.5", "FastWAM"],
    eligibleModelIds: ["Pi0.5", "FastWAM"],
    rules: l4Rules,
  },
];

type RawMetric = {
  value: unknown;
  n: number;
  display: string;
  aux: string;
};

function rawMetric(modelId: LeaderboardModelId, metricId: string): RawMetric | null {
  const vlaWam = vlaWamDashboardBundle.models[modelId];
  if (vlaWam) {
    const metric = vlaWam.values[metricId];
    if (!metric || metric.availability !== "available") return null;
    return { value: metric.value, n: metric.n, display: metric.primary, aux: metric.aux };
  }

  const acwm = acwmDashboardBundle.models[modelId];
  const metric = acwm?.values[metricId];
  if (!metric || metric.availability !== "available") return null;
  const primary = metric.groups.heldout73;
  if (!primary || primary.value === null) return null;
  return { value: primary.value, n: primary.sampleCount, display: metric.primary, aux: metric.aux };
}

function numericValue(rule: LeaderboardMetricRule, raw: RawMetric | null): number | null {
  if (!raw) return null;
  if (rule.transform === "native-progress") {
    if (!raw.value || typeof raw.value !== "object" || Array.isArray(raw.value)) return null;
    return Object.entries(raw.value as Record<string, { proportion: number }>).reduce((sum, [score, bucket]) => {
      const numericScore = Number(score);
      return Number.isFinite(numericScore) && Number.isFinite(bucket.proportion)
        ? sum + numericScore * bucket.proportion
        : sum;
    }, 0);
  }
  return typeof raw.value === "number" && Number.isFinite(raw.value) ? raw.value : null;
}

function geometricMean(values: number[]): number | null {
  if (!values.length || values.some((value) => value <= 0 || !Number.isFinite(value))) return null;
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
}

function transformedValue(rule: LeaderboardMetricRule, value: number): number {
  return rule.transform === "negative-magnitude-lower" ? Math.abs(value) : value;
}

function referenceAnchor(definition: LeaderboardLevelDefinition, rule: LeaderboardMetricRule): number | null {
  if (!["relative-lower", "relative-higher", "negative-magnitude-lower"].includes(rule.transform)) return null;
  const values = definition.normalizationModelIds.map((modelId) => {
    const value = numericValue(rule, rawMetric(modelId, rule.id));
    return value === null ? null : transformedValue(rule, value);
  });
  if (values.some((value) => value === null)) return null;
  return geometricMean(values as number[]);
}

function ruleIsComparable(definition: LeaderboardLevelDefinition, rule: LeaderboardMetricRule): boolean {
  if (rule.weight === 0 || rule.transform === "display-only") return false;
  const values = definition.normalizationModelIds.map((modelId) => numericValue(rule, rawMetric(modelId, rule.id)));
  if (values.some((value) => value === null)) return false;
  if (["relative-lower", "relative-higher", "negative-magnitude-lower"].includes(rule.transform)) {
    return referenceAnchor(definition, rule) !== null;
  }
  return true;
}

function metricSubscore(
  definition: LeaderboardLevelDefinition,
  rule: LeaderboardMetricRule,
  modelId: LeaderboardModelId,
): number | null {
  const raw = rawMetric(modelId, rule.id);
  const value = numericValue(rule, raw);
  if (value === null || !raw || rule.transform === "display-only") return null;

  if (rule.transform === "native-rate" || rule.transform === "native-progress") {
    return Math.max(0, Math.min(100, value * 100));
  }
  if (rule.transform === "event-rate-lower") {
    const rate = value / raw.n;
    return Math.max(0, Math.min(100, 100 * (1 - rate / 0.1)));
  }

  const anchor = referenceAnchor(definition, rule);
  const comparableValue = transformedValue(rule, value);
  if (anchor === null || comparableValue <= 0) return null;
  if (rule.transform === "relative-higher") {
    return 100 * comparableValue / (comparableValue + anchor);
  }
  return 100 * anchor / (anchor + comparableValue);
}

function buildLevelResult(definition: LeaderboardLevelDefinition): LeaderboardLevelResult {
  const comparableRuleIds = new Set(
    definition.rules.filter((rule) => ruleIsComparable(definition, rule)).map((rule) => rule.id),
  );
  const activeWeight = definition.rules.reduce(
    (sum, rule) => sum + (comparableRuleIds.has(rule.id) ? rule.weight : 0),
    0,
  );
  const definedWeight = definition.rules.reduce((sum, rule) => sum + rule.weight, 0);

  const models = definition.eligibleModelIds.map((modelId): LeaderboardModelScore => {
    const metrics = Object.fromEntries(definition.rules.map((rule) => {
      const raw = rawMetric(modelId, rule.id);
      const included = comparableRuleIds.has(rule.id);
      const subscore = included ? metricSubscore(definition, rule, modelId) : null;
      const inclusionNote = rule.weight === 0
        ? rule.scoringNote
        : included
          ? `${rule.weight}% · 纳入 ${definition.id} 总分`
          : "当前冻结参考池没有共同有效结果，暂不进入总分";
      return [rule.id, {
        id: rule.id,
        label: rule.label,
        group: rule.group,
        weight: rule.weight,
        rawDisplay: raw?.display ?? "N/A",
        rawAux: raw?.aux ?? "正式结果缺失或协议输入不足",
        subscore,
        included,
        inclusionNote,
      } satisfies LeaderboardMetricScore];
    }));

    const availableWeight = definition.rules.reduce((sum, rule) => {
      const metric = metrics[rule.id];
      return sum + (metric.included && metric.subscore !== null ? rule.weight : 0);
    }, 0);
    const totalScore = activeWeight > 0 && availableWeight === activeWeight
      ? definition.rules.reduce((sum, rule) => {
        const metric = metrics[rule.id];
        return sum + (metric.included && metric.subscore !== null ? metric.subscore * rule.weight : 0);
      }, 0) / activeWeight
      : null;

    return {
      modelId,
      family: leaderboardModelMetadata[modelId].family,
      totalScore,
      activeWeight,
      availableWeight,
      metrics,
    };
  });

  return {
    definition,
    activeWeight,
    deferredWeight: definedWeight - activeWeight,
    models: models.sort((a, b) => (b.totalScore ?? -1) - (a.totalScore ?? -1)),
  };
}

export const leaderboardLevels = Object.fromEntries(
  leaderboardLevelDefinitions.map((definition) => [definition.id, buildLevelResult(definition)]),
) as Record<LeaderboardLevelId, LeaderboardLevelResult>;
