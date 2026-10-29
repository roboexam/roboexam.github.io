export type BaselineTrack = "T2" | "T3" | "T4";
export type BaselineRunStatus = "running" | "failed" | "planned" | "pilot" | "stopped" | "succeeded";

export type BaselineRun = {
  id: string;
  track: BaselineTrack;
  baseline: string;
  trainingJob: string;
  trainingCards: string;
  evaluationJob: string;
  evaluationCards: string;
  owner: string;
  status: BaselineRunStatus;
  note: string;
};

/**
 * Planning registry for the current T2–T4 runs.
 *
 * This is deliberately separate from the formal score bundles: a job being
 * listed here records an execution plan or AIHC observation, not a benchmark
 * result. Paths and final checkpoints remain in the schedule document.
 */
export const baselineRunPlan: BaselineRun[] = [
  {
    id: "E1", track: "T2", baseline: "Cosmos Predict 2.5 / 2B",
    trainingJob: "待提交", trainingCards: "32", evaluationJob: "待提交", evaluationCards: "32",
    owner: "待定", status: "planned", note: "clean24 需重新跑；旧 32-card proxy。",
  },
  {
    id: "E2", track: "T2", baseline: "CtrlWorld",
    trainingJob: "job-9ttd4kz1tgyk", trainingCards: "16", evaluationJob: "待提交", evaluationCards: "32",
    owner: "weixiaobao", status: "failed", note: "train22；2026-10-29 最新 clean2400 retry 读回 Failed；当前无评测任务。",
  },
  {
    id: "E3", track: "T2", baseline: "Cosmos3-Nano ACWM",
    trainingJob: "job-fbqeyxxqukdj", trainingCards: "16", evaluationJob: "job-k5fnlh8pfvrv", evaluationCards: "8",
    owner: "weixiaobao", status: "succeeded", note: "train22；训练 ManualTermination；2026-10-29 recursive evaluation 已完成。",
  },
  {
    id: "E4", track: "T2", baseline: "Pelican-Unify 1.0（ACWM）",
    trainingJob: "待提交", trainingCards: "16", evaluationJob: "待提交", evaluationCards: "32",
    owner: "待定", status: "planned", note: "ACWM qualification；不作为 XPolicyLab policy baseline。",
  },
  {
    id: "E5", track: "T2", baseline: "IRASim / Bridge action-conditioned",
    trainingJob: "待提交", trainingCards: "16", evaluationJob: "待提交", evaluationCards: "32",
    owner: "待定", status: "planned", note: "7D action → 80D camera-EE adapter 待验证。",
  },
  {
    id: "E6", track: "T2", baseline: "Wan-Move",
    trainingJob: "待提交", trainingCards: "8", evaluationJob: "待提交", evaluationCards: "32",
    owner: "待定", status: "planned", note: "先确认低层 action 条件接口；无 action 时只作 Level-1 对照。",
  },
  {
    id: "E25", track: "T2", baseline: "EnerVerse-AC",
    trainingJob: "待提交", trainingCards: "待确认", evaluationJob: "待提交", evaluationCards: "32",
    owner: "待定", status: "planned", note: "新增 ACWM baseline；训练入口、action conditioning 和 clean24 配置待确认。",
  },
  {
    id: "E7", track: "T3", baseline: "Pi0.5 / XPolicyLab",
    trainingJob: "job-gw5edw7r0hng", trainingCards: "8", evaluationJob: "job-vodyg0t82m89", evaluationCards: "4×A800",
    owner: "weixiaobao", status: "running", note: "train22；2026-10-29 训练 Running；Isaac pilot 已 Succeeded（当前 spp8），需按 TAA+64 spp 正式重跑。",
  },
  {
    id: "E8", track: "T3", baseline: "FastWAM",
    trainingJob: "待提交", trainingCards: "8", evaluationJob: "待提交", evaluationCards: "8",
    owner: "待定", status: "planned", note: "Wan2.2 + ActionDiT；默认 joint，camera-EE adapter 待确认。",
  },
  {
    id: "E9", track: "T3", baseline: "OpenWAM",
    trainingJob: "job-o7g280dz73xi", trainingCards: "8", evaluationJob: "待提交", evaluationCards: "8",
    owner: "weixiaobao", status: "succeeded", note: "train22；2026-10-29 AIHC 读回 Succeeded；clean24 训练已完成。",
  },
  {
    id: "E10", track: "T3", baseline: "HyVLA",
    trainingJob: "job-7xprj38hacsl", trainingCards: "8", evaluationJob: "待提交", evaluationCards: "8",
    owner: "weixiaobao", status: "running", note: "train22；2026-10-29 AIHC 读回 Running；PRETRAIN 和真机协议待验。",
  },
  {
    id: "E11", track: "T3", baseline: "G05",
    trainingJob: "job-r2osj4szcsbc", trainingCards: "8", evaluationJob: "待提交", evaluationCards: "8",
    owner: "weixiaobao", status: "running", note: "train22；2026-10-29 AIHC 读回 Running；仅 RoboDojo 仿真训练，real 为 evaluation-only。",
  },
  {
    id: "E12", track: "T3", baseline: "DM0.5 / OpenDM",
    trainingJob: "job-z8vn3y7oemyq", trainingCards: "8", evaluationJob: "待提交", evaluationCards: "8",
    owner: "weixiaobao", status: "running", note: "train22；2026-10-29 AIHC 读回 Running；仿真 arx_x5，默认 14D joint。",
  },
  {
    id: "E13", track: "T3", baseline: "LingBot-VA2.0",
    trainingJob: "job-zskd6wiie2qq", trainingCards: "8", evaluationJob: "job-dfqtiqknppfq", evaluationCards: "8",
    owner: "weixiaobao", status: "succeeded", note: "train22；训练 Failed；2026-10-29 resumed recursive evaluation 已完成。",
  },
  {
    id: "E14", track: "T3", baseline: "XVLA",
    trainingJob: "job-onz1i7m4ufy1", trainingCards: "8", evaluationJob: "待提交", evaluationCards: "8",
    owner: "weixiaobao", status: "succeeded", note: "train22；2026-10-29 AIHC 读回 Succeeded；需要继续核验产物与 X-VLA-Pt base provenance。",
  },
  {
    id: "E15", track: "T3", baseline: "AHA-WAM（新增）",
    trainingJob: "待提交", trainingCards: "8", evaluationJob: "待提交", evaluationCards: "8",
    owner: "待定", status: "planned", note: "XPolicyLab adapter 已有；当前无 clean24 job。",
  },
  {
    id: "E16", track: "T3", baseline: "Pelican-Unify（policy）",
    trainingJob: "待提交", trainingCards: "8", evaluationJob: "待提交", evaluationCards: "8",
    owner: "待定", status: "planned", note: "当前精简稿保留；XPolicyLab adapter、action schema 和 RoboDojo 评测协议待验收。",
  },
  {
    id: "E17", track: "T4", baseline: "Pi0.5 / XPolicyLab",
    trainingJob: "job-vil9lsl4mw7p", trainingCards: "8", evaluationJob: "待提交", evaluationCards: "robot station",
    owner: "yichenguo", status: "running", note: "2026-10-29 真机训练正在合并后的 8-card 节点运行；不复用 E7 checkpoint。",
  },
  {
    id: "E18", track: "T4", baseline: "FastWAM",
    trainingJob: "job-9hgxrjabeyli", trainingCards: "8", evaluationJob: "待提交", evaluationCards: "robot station",
    owner: "yichenguo", status: "running", note: "2026-10-29 真机 real3 独立训练正在 train22 运行；真实 action adapter 待验。",
  },
  {
    id: "E19", track: "T4", baseline: "OpenWAM",
    trainingJob: "待提交（T4 独立）", trainingCards: "8", evaluationJob: "待提交", evaluationCards: "robot station",
    owner: "待定", status: "planned", note: "可从 OpenWAM base/released checkpoint warm-start，仍独立训练。",
  },
  {
    id: "E20", track: "T4", baseline: "HyVLA",
    trainingJob: "job-hrg119uxrex9", trainingCards: "8", evaluationJob: "待提交", evaluationCards: "robot station",
    owner: "yichenguo", status: "failed", note: "2026-10-29 真机 real3 独立训练在 train22 读回 Failed；PRETRAIN 与标定待复核。",
  },
  {
    id: "E21", track: "T4", baseline: "LingBot-VA2.0",
    trainingJob: "待提交（T4 独立）", trainingCards: "8", evaluationJob: "待提交", evaluationCards: "robot station",
    owner: "待定", status: "planned", note: "真实 latent pipeline 和部署待验。",
  },
  {
    id: "E22", track: "T4", baseline: "XVLA",
    trainingJob: "待提交（T4 独立）", trainingCards: "8", evaluationJob: "待提交", evaluationCards: "robot station",
    owner: "待定", status: "planned", note: "需确认 real camera 和控制频率。",
  },
  {
    id: "E24", track: "T4", baseline: "Pelican-Unify（policy）",
    trainingJob: "待提交（T4 独立）", trainingCards: "8", evaluationJob: "待提交", evaluationCards: "robot station",
    owner: "待定", status: "planned", note: "独立 base 初始化；XPolicyLab adapter、action schema 和真机部署待验收。",
  },
];

export const sharedEvaluationJobs = [
  { job: "job-xx6075i5hhye", cards: "1", note: "benchmark2027_BOOD3_pilot_v1；ManualTermination；未调度、无 Pod。" },
  { job: "job-7ah9u1xfg3f5", cards: "1", note: "benchmark2027_eval24_pilot_wxb_v1；Succeeded。" },
];
