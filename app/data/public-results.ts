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
