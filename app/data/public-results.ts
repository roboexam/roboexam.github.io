/**
 * Curated public snapshot of RoboExam evaluations.
 *
 * T1–T3 values are copied from the versioned dashboard bundles named below.
 * Models without a complete published cohort are intentionally omitted. T2
 * exposes a frozen, direction-aware composite alongside its native metrics.
 */
export const publicResults = {
  verifiedOn: "November 5, 2026",
  t1: {
    // UniBench-24 board unibench24-v3-5models-final-20261112 (scoring v3: harder VQA with grasp-usable
    // thresholds, C2/C3 process checks, own-task progress); 391 cases per model.
    version: "t1-unibench24-v3-5models-final-20261112",
    taskCount: 24,
    settings: ["ID", "V-OOD", "S-OOD", "B-OOD", "Recovery"],
    models: [
      {
        rank: 1,
        name: "GPT-6.1-sol (xhigh)",
        overall: 45.58,
        subtask: 34.50,
        vqa: 71.43,
        settings: [45.82, 44.44, 49.50, 44.42, 31.82],
      },
      {
        rank: 2,
        name: "DeepSeek-V4.1-Flash (high)",
        overall: 34.36,
        subtask: 20.86,
        vqa: 65.86,
        settings: [32.92, 32.81, 36.21, 36.12, 20.00],
      },
      {
        rank: 3,
        name: "MiniMax-M3.1-Flash (high)",
        overall: 28.84,
        subtask: 17.04,
        vqa: 56.37,
        settings: [28.09, 29.13, 28.48, 31.08, 15.00],
      },
      {
        rank: 4,
        name: "GLM-5.3-Flash (high)",
        overall: 28.27,
        subtask: 15.05,
        vqa: 59.12,
        settings: [27.25, 27.85, 28.92, 29.83, 13.94],
      },
      {
        rank: 5,
        name: "GPT-6-Luna (xhigh)",
        overall: 24.82,
        subtask: 10.40,
        vqa: 58.46,
        settings: [22.23, 23.37, 26.47, 23.57, 15.61],
      },
    ],
  },
  t2: {
    version: "latest3-ab600-20261105-v1",
    taskCount: 24,
    regimes: 5,
    casesPerModel: 600,
    scoreVersion: "t2-composite-v1",
    scoreNote: "Composite score · equal-weight mean of nine direction-aware metrics",
    models: [
      {
        name: "Ctrl-World",
        checkpoint: "instructionv2 · 50k",
        composite: 50.76,
        psnr: 21.334,
        ssim: 0.775,
        jepa: 0.291,
        jedi: 3.0837,
        motionSmoothness: 1.7112,
        motionMse: 0.031457,
        subjectConsistency: 0.6231,
        positionMae: 15.749,
        rotationMae: 9.082,
      },
      {
        name: "LingBot-VA",
        checkpoint: "instructionv2 · 50k",
        composite: 58.17,
        psnr: 23.673,
        ssim: 0.839,
        jepa: 0.659,
        jedi: 1.0408,
        motionSmoothness: 1.6675,
        motionMse: 0.022624,
        subjectConsistency: 0.6184,
        positionMae: 13.544,
        rotationMae: 7.390,
      },
      {
        name: "Motus",
        checkpoint: "instructionv3 · 40k",
        composite: 41.45,
        psnr: 18.030,
        ssim: 0.762,
        jepa: 0.407,
        jedi: 2.2453,
        motionSmoothness: 1.5810,
        motionMse: 0.078923,
        subjectConsistency: 0.5697,
        positionMae: 97.348,
        rotationMae: 28.164,
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
    status: "Measured",
    models: [
      { name: "Pi0.5", score: "22.0%" },
      { name: "OpenWAM", score: "30.0%" },
      { name: "FastWAM", score: "12.0%" },
    ],
  },
} as const;
