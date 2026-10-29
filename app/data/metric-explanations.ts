import type { MetricInfo } from "./metric-definitions";
import type { TrackId } from "./metric-plan";

export type BilingualText = { en: string; zh: string };
export type MetricExplanation = {
  definition: BilingualText;
  input: BilingualText;
  output: BilingualText;
};

const zhNames: Record<string, string> = {
  "l1a.object_facts.counting": "物体事实·计数",
  "l1a.object_facts.category": "物体事实·类别",
  "l1a.object_facts.color": "物体事实·颜色",
  "l1a.object_facts.material": "物体事实·材质",
  "l1a.object_facts.shape": "物体事实·形状",
  "l1a.object_facts.state": "物体事实·状态",
  "l1a.direct": "直接目标定位准确率",
  "l1a.blink": "BLINK 视觉对应",
  "l1a.vsr_topological": "VSR 拓扑关系准确率",
  "l1a.text_spatial": "文本空间认知",
  "l1a.mra": "距离/尺寸相对准确率",
  "l1a.roa": "相对朝向准确率",
  "l1b.reference_mcq": "任务指代选择准确率",
  "l1b.situational": "情境目标定位准确率",
  "l1b.affordance": "物体可供性准确率",
  "l1b.free_space": "自由空间指代准确率",
  "l1b.pac_constraint": "约束理解准确率",
  "l1b.hypothetical_paired": "成对假设问答准确率",
  "l1b.counterfactual_paired": "成对反事实问答准确率",
  "l1c.epr": "计划可执行率",
  "l1c.cgs": "条件目标成功率",
  "l1c.cpe": "条件计划效率",
  "l1c.as_f1": "动作语义 F1",
  "l1c.poa": "成对顺序准确率",
  "l1c.semantic_nlcs": "语义归一化最长公共子序列",
  "l1c.psa": "计划选择准确率",
  "l1c.stage_accuracy": "当前阶段准确率",
  "l1c.stage_macro_f1": "阶段宏平均 F1",
  "l1c.bf1_at_5": "边界 F1@5",
  "l1c.mmae": "平均边界误差",
  "l1c.next_action_accuracy": "下一动作准确率",
  "l1c.sscs": "单步组件得分",
  PSNR: "峰值信噪比",
  SSIM: "结构相似度",
  JEPA: "JEPA 表征相似度",
  MS: "运动平滑度",
  "M-MSE": "运动区域加权均方误差",
  SUBJECT: "主体一致性",
  ROBOT_NADE: "机器人归一化平均位移误差",
  RMFA: "机器人区域光流对齐",
  LAC: "局部动作校准",
  "AF-DIV": "动作条件分歧度",
  OBJECT_NADE: "物体归一化平均位移误差",
  EVENT_F1: "事件 F1",
  NO_CONTACT: "无接触条件验证",
  PRIMITIVE: "交互原语保真度",
  CEE: "反事实效果误差",
  "P-OACC": "成对结果准确率",
  BRIER: "结果 Brier 分数",
  BOUNDARY: "失败边界误差",
  TSR: "任务成功率",
  TASK_SCORE: "子任务完成得分",
  FIRST_TARGET_SELECTION: "首次目标选择准确率",
  ALL_TARGET_SELECTION: "全部目标选择准确率",
  SR95: "成功率 95% 区间",
  AC: "产物一致性",
  N: "有效样本数",
  SCORE_DIST: "原生进度分布",
  TARGET_SELECTION: "目标选择准确率",
  INTENTION_SCORE: "意图得分",
  ATTRIBUTE_GROUNDING: "属性/类别指代准确率",
  ACTION_ACCURACY: "动作类型准确率",
  SKILL_ACCURACY: "技能准确率",
  OBJECT_ACCURACY: "对象准确率",
  PARAMETER_ACCURACY: "参数准确率",
  ACTION_EXACT_MATCH: "结构化动作精确匹配率",
  INSTRUCTION_PRIDE: "PRIDE 指令鲁棒性",
  INSTRUCTION_SR: "指令条件成功率",
  LOCAL_SUCCESS_ONCE: "局部阶段曾成功率",
  LOCAL_SUCCESS_AT_END: "局部阶段末端保持成功率",
  DROP_AFTER_SUCCESS: "成功后失效率",
  GRASP_STABILITY: "抓取稳定率",
  DROP_RATE: "搬运掉落率",
  SPARC: "SPARC 运动平滑度",
  PATH_LENGTH: "末端轨迹运动长度",
  CONTACT_LOSS: "接触丢失率",
  CONTACT_STABILITY: "接触稳定率",
  COLLISION_RATE: "碰撞率",
  SAFETY_STOP_RATE: "安全停止率",
  RETRY_COUNT: "重试次数",
  LSPARC: "左末端 SPARC 平滑度",
  RSPARC: "右末端 SPARC 平滑度",
  JERK: "积分平方加加速度",
  PEAK_SPEED: "末端峰值速度",
  LPATH: "左末端路径长度",
  RPATH: "右末端路径长度",
  EE_DISPLACEMENT: "末端净位移",
  PATH_EFFICIENCY: "路径效率",
  TIME_EFFICIENCY: "时间效率",
  ACTION_EFFICIENCY: "动作效率",
  SET: "成功耗时",
  LOCAL_TIME: "局部完成时间",
  POLICY_QUERIES: "策略查询次数",
  EXECUTION_STEPS: "执行步数",
  LSPEED: "左末端平均速度",
  RSPEED: "右末端平均速度",
  LJPL: "左臂关节路径长度",
  RJPL: "右臂关节路径长度",
  LOPL: "左末端姿态路径长度",
  ROPL: "右末端姿态路径长度",
  TJPL: "双臂总关节路径长度",
  TOPL: "双臂总姿态路径长度",
  SUBTASK_SCORE: "子任务/谓词完成度",
  STAGE_MACRO_F1: "阶段宏平均 F1",
  FAILURE_STAGE: "失败阶段分布",
  STAGE_TRANSITION: "阶段转移准确率",
  GOAL_RETENTION: "已完成目标保持率",
  CHAIN_SR: "任务链成功率",
  AVG_COMPLETED_LENGTH: "平均连续完成长度",
  RECOVERY_SR: "错误恢复成功率",
  STAGE_COMPLETION: "阶段完成率",
  STAGE_REACH: "阶段到达率",
  STAGE_BF1: "阶段边界 F1",
  STAGNATION: "阶段停滞率",
  REPETITION: "冗余阶段重复次数",
  RECOVERY_TIME: "恢复时间",
  RECOVERY_STEPS: "恢复步数",
  RECOVERY_RETRIES: "恢复重试次数",
  RECOVERY_FINAL_SR: "错误后最终成功率",
  ROBUSTNESS: "鲁棒性保持率",
  ROBUSTNESS_AUC: "鲁棒性曲线面积",
  GENERALIZATION_GAP: "已见—未见泛化差距",
  COMPOSITION_GAP: "原子—组合任务差距",
  SIM2REAL_GAP: "仿真—真机成功率差距",
  CROSS_EMBODIMENT_GAP: "跨本体成功率差距",
  ROBUSTNESS_DROP: "成功率绝对下降",
  ROBUSTNESS_REL_DROP: "成功率相对下降",
  TAE: "任务偏离事件数",
  SLIP: "物体滑移事件数",
  ENV_COLL: "环境碰撞事件数",
  SELF_COLL: "自碰撞事件数",
  DANGEROUS_CONTACT: "危险接触率",
  OUT_OF_BOUNDS: "工作空间越界率",
  SPEED_LIMIT_VIOLATION: "速度超限率",
  ACCEL_LIMIT_VIOLATION: "加速度超限率",
  FORCE_LIMIT_VIOLATION: "力/力矩超限率",
  ACTION_JITTER: "动作抖动",
  RETRY_COST: "重试/干预成本",
  SELF_COLLISION_RATE: "自碰撞率",
  HUMAN_INTERVENTION: "人工干预次数",
  HUMAN_TERMINATION: "人工终止率",
  IPS: "每秒迭代数",
  WT: "墙钟时间",
  SUBGOAL_PROGRESS: "子目标进度分数",
  HUMAN_EVAL: "人工安全与任务评分",
};

const zhDefinitions: Record<string, string> = {
  PSNR: "衡量对齐后的预测未来帧与真值帧在像素层面的保真度。",
  SSIM: "衡量预测与真值帧在亮度、对比度和局部结构上的一致程度。",
  JEPA: "衡量整组预测视频与真值视频在冻结表征空间中的分布相似度。",
  MS: "衡量预测视频随时间的连续性，关注闪烁、跳变和形状断裂。",
  "M-MSE": "只在真值运动区域加权统计预测像素误差。",
  SUBJECT: "衡量机器人、物体身份和场景布局在预测视频中的持续一致性。",
  ROBOT_NADE: "衡量预测视频中机器人轨迹相对真值的归一化位置误差。",
  RMFA: "衡量机器人区域内预测光流与真值光流的对齐程度。",
  LAC: "检验模型能否正确区分小幅与大幅动作变化带来的局部视频响应。",
  "AF-DIV": "报告同一初始状态下不同有效动作产生的预测未来差异，仅作敏感性诊断。",
  OBJECT_NADE: "衡量干预后任务相关物体预测轨迹相对真值的归一化误差。",
  EVENT_F1: "衡量预测交互事件的类型、对象和发生时间是否与真值匹配。",
  NO_CONTACT: "检验无接触动作中机器人是否按要求运动且目标物体保持稳定。",
  PRIMITIVE: "衡量预测未来是否保留正确的交互原语及对应运动。",
  CEE: "衡量改变干预后，预测效果变化与真实效果变化之间的误差。",
  "P-OACC": "要求同一配对中的成功分支和失败分支都被正确区分。",
  BRIER: "衡量多次生成得到的结果概率与真实结果之间的校准误差。",
  BOUNDARY: "衡量预测失败阈值与真实干预失败阈值之间的距离。",
  TSR: "统计有效 episode 中通过最终任务检查的比例。",
  TASK_SCORE: "按照任务注册的子任务及其冻结权重，统计 episode 已完成的任务进度得分。",
  FIRST_TARGET_SELECTION: "统计每个可评估 episode 的首次目标选择是否命中当前任务状态下的合法目标。",
  ALL_TARGET_SELECTION: "统计所有可评估目标选择事件中命中当前合法目标的比例。",
  SR95: "给出任务成功率在当前样本量下的不确定性区间。",
  AC: "检查结果所需产物是否完整且可追溯。",
  N: "统计冻结评测队列中可用于该指标计算的有效 episode 数。",
  SET: "统计成功 episode 从开始到满足最终任务条件所需的时间。",
  SCORE_DIST: "展示原生 episode 分数分布，用于观察部分进度和失败位置。",
  SUBTASK_SCORE: "衡量 episode 中已达到的必需子目标或任务谓词比例。",
  GRASP_STABILITY: "统计可评估抓取尝试中成功建立抓取的比例；未确定抓取不进入分母。",
  DROP_RATE: "统计已解析搬运结束事件中，掉落相对合法释放与掉落总数的比例。",
  SPARC: "基于末端速度频谱衡量运动平滑度，并按冻结的机械臂与 episode 聚合口径汇总。",
  PATH_LENGTH: "统计已注册末端在 episode 内实际运动路径的累计长度。",
  RECOVERY_SR: "统计预先定义为可恢复的错误中，在预算内成功恢复的比例。",
  SUBGOAL_PROGRESS: "统计真机试验中已完成的协议子目标占全部必需子目标的比例。",
  HUMAN_EVAL: "由三名独立评审者按冻结量表评价真机任务完成与安全表现。",
};

const t4Definitions: Record<string, string> = {
  TSR: "统计有效真机试验中完成最终任务的比例。",
  SET: "统计成功真机试验从开始到完成任务所需的时间。",
  GOAL_RETENTION: "统计真机试验中已完成目标在观察区间内仍保持成立的比例。",
  RECOVERY_SR: "统计真机试验中可恢复错误被成功纠正的比例。",
  HUMAN_INTERVENTION: "统计为保证真机试验安全或继续执行所需的人工干预次数。",
};

function directionZh(direction: string): string {
  const value = direction.toLowerCase();
  if (value.includes("closer to zero")) return "通常越接近 0 越平滑";
  if (value.includes("higher")) return "越高越好";
  if (value.includes("lower")) return "越低越好";
  if (value.includes("distribution")) return "报告分布，不设单一排名方向";
  if (value.includes("report") || value.includes("no ranking")) return "仅报告，不设统一优劣方向";
  return "按冻结指标协议解释";
}

function inputZh(trackId: TrackId, evidence: string): string {
  if (trackId === "T1") return "题目所需的图像、任务指令、标注或符号任务状态。";
  if (trackId === "T2") return "动作条件下的预测与真值视频，以及所需轨迹、事件或配对标注。";
  if (trackId === "T4") return "同步真机视频、任务清单、操作员事件日志、时间戳及所需人工评审记录。";
  if (/trajectory|position|velocity|motion|path|joint|timing/i.test(evidence)) {
    return "有效仿真 episode 的带时间戳运动、位姿或控制轨迹，并保留任务结果。";
  }
  if (/paired|matched|perturb|instruction variant/i.test(evidence)) {
    return "同一协议下可对齐的成对或分组仿真 episode，以及对应条件与任务结果。";
  }
  return "有效仿真 episode 的任务结果，以及所需的状态、事件、动作或产物记录。";
}

export function metricExplanationFor(trackId: TrackId, metricId: string, info: MetricInfo): MetricExplanation {
  const zhName = zhNames[metricId] ?? info.name;
  const zhDefinition = (trackId === "T4" ? t4Definitions[metricId] : undefined) ??
    zhDefinitions[metricId] ??
    `用于衡量「${zhName}」，按冻结公式和评测范围汇总。`;
  return {
    definition: { en: info.definition, zh: zhDefinition },
    input: { en: info.inputs ?? info.evidence, zh: inputZh(trackId, info.inputs ?? info.evidence) },
    output: {
      en: `${info.name} (${info.unit}); ${info.direction}.`,
      zh: `${zhName}；单位或形式：${info.unit}；${directionZh(info.direction)}。`,
    },
  };
}
