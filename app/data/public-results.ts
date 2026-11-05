/**
 * Curated public snapshot of RoboExam evaluations.
 *
 * T1–T3 values are copied from the versioned dashboard bundles named below.
 * Models without a complete published cohort are intentionally omitted. T4
 * publishes its confirmed hardware methods and protocol while scores remain
 * unavailable until synchronized trials and review are complete.
 */
export const publicResults = {
  verifiedOn: "November 5, 2026",
  t1: {
    version: "t1-unibench24-final-20261102-v1",
    taskCount: 24,
    settings: ["ID", "V-OOD", "S-OOD", "B-OOD", "Recovery"],
    models: [
      {
        rank: 1,
        name: "GPT-6.1-sol (xhigh)",
        overall: 43.52,
        subtask: 29.59,
        vqa: 76.02,
        settings: [45.18, 40.66, 45.54, 41.13, 31.82],
      },
      {
        rank: 2,
        name: "DeepSeek-V4.1-Flash (high)",
        overall: 31.08,
        subtask: 15.45,
        vqa: 67.55,
        settings: [30.35, 28.76, 30.43, 31.60, 20.00],
      },
      {
        rank: 3,
        name: "GLM-5.3-Flash (high)",
        overall: 23.88,
        subtask: 10.81,
        vqa: 54.37,
        settings: [24.81, 23.09, 23.48, 22.05, 13.79],
      },
    ],
  },
  t2: {
    version: "latest3-ab600-20261105-v1",
    taskCount: 24,
    regimes: 5,
    casesPerModel: 600,
    models: [
      {
        name: "Ctrl-World",
        checkpoint: "instructionv2 · 50k",
        psnr: 21.334,
        ssim: 0.775,
        jepa: 0.291,
        positionMae: 15.749,
      },
      {
        name: "LingBot-VA",
        checkpoint: "instructionv2 · 50k",
        psnr: 23.673,
        ssim: 0.839,
        jepa: 0.659,
        positionMae: 13.544,
      },
      {
        name: "Motus",
        checkpoint: "instructionv3 · 40k",
        psnr: 18.030,
        ssim: 0.762,
        jepa: 0.407,
        positionMae: 97.348,
      },
    ],
  },
  t3: {
    version: "benchmark-policy-20261104-scoring-efficiency-v4",
    taskCount: 24,
    episodesPerModel: 480,
    settings: ["ID", "V-OOD", "S-OOD", "B-OOD"],
    models: [
      {
        name: "G05",
        taskSuccess: [25.00, 15.00, 30.00, 15.83],
        subtask: [29.54, 21.08, 35.88, 21.99],
      },
      {
        name: "HyVLA",
        taskSuccess: [5.00, 5.83, 8.33, 12.50],
        subtask: [7.79, 7.75, 11.29, 18.03],
      },
      {
        name: "XVLA",
        taskSuccess: [5.83, 2.50, 1.67, 8.33],
        subtask: [9.75, 4.42, 3.75, 14.49],
      },
    ],
  },
  t4: {
    metric: "Task success rate ↑ · 3 task families",
    detail: "Button sequencing · dual-arm towel folding · semantic placement",
    models: [
      { name: "Pi0.5 / XPolicyLab", score: null },
      { name: "FastWAM", score: null },
      { name: "OpenWAM", score: null },
      { name: "HyVLA", score: null },
      { name: "LingBot-VLA", score: null },
      { name: "LingBot-VA", score: null },
      { name: "XVLA", score: null },
      { name: "AHA-WAM", score: null },
    ],
  },
} as const;
