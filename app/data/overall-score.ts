import type { TrackId } from "./metric-plan";

export const OVERALL_SETTINGS = [
  "id",
  "visual",
  "semantic",
  "behavioral",
  "recovery",
] as const;

export type OverallSetting = (typeof OVERALL_SETTINGS)[number];
export type OverallReportMode = "plan" | "history";

export const OVERALL_SETTING_WEIGHTS: Readonly<Record<OverallSetting, number>> = {
  id: 0.2,
  visual: 0.2,
  semantic: 0.2,
  behavioral: 0.2,
  recovery: 0.2,
};

export type AdmittedSettingScore = {
  trackId: TrackId;
  reportMode: OverallReportMode;
  modelId: string;
  sceneId: string;
  setting: OverallSetting;
  score100: number;
  protocolVersion: string;
  sourceHash: string;
};

export type OverallScorecard = {
  overall: number | null;
  settingScores: Record<OverallSetting, number | null>;
  settingCoverage: Record<OverallSetting, number>;
  requiredSceneCount: number;
  eligible: boolean;
  reason: "complete" | "no_scenes" | "missing_setting" | "invalid_record";
};

export type OverallScoreInput = {
  trackId: TrackId;
  reportMode: OverallReportMode;
  modelId: string;
  sceneIds: readonly string[];
  records: readonly AdmittedSettingScore[];
};

/*
 * Formal setting scores are exporter-owned. A score is admitted only after
 * metric normalization and capability-dimension macro averaging have produced
 * a 0–100 value for one unique scene. Raw dashboard metric strings never enter
 * this array.
 */
export const admittedSettingScores: readonly AdmittedSettingScore[] = [];

function emptySettingRecord<T>(value: T): Record<OverallSetting, T> {
  return Object.fromEntries(
    OVERALL_SETTINGS.map((setting) => [setting, value]),
  ) as Record<OverallSetting, T>;
}

export function calculateOverallScore(input: OverallScoreInput): OverallScorecard {
  const sceneIds = [...new Set(input.sceneIds.filter(Boolean))];
  const settingScores = emptySettingRecord<number | null>(null);
  const settingCoverage = emptySettingRecord(0);

  if (sceneIds.length === 0) {
    return {
      overall: null,
      settingScores,
      settingCoverage,
      requiredSceneCount: 0,
      eligible: false,
      reason: "no_scenes",
    };
  }

  const selectedScenes = new Set(sceneIds);
  const matching = input.records.filter(
    (record) =>
      record.trackId === input.trackId &&
      record.reportMode === input.reportMode &&
      record.modelId === input.modelId &&
      selectedScenes.has(record.sceneId),
  );

  const protocolVersions = new Set(matching.map((record) => record.protocolVersion));
  let invalidRecord =
    protocolVersions.size > 1 ||
    matching.some(
      (record) =>
        !OVERALL_SETTINGS.includes(record.setting) ||
        record.protocolVersion.trim().length === 0 ||
        record.sourceHash.trim().length === 0,
    );

  for (const setting of OVERALL_SETTINGS) {
    const rows = matching.filter((record) => record.setting === setting);
    const byScene = new Map<string, AdmittedSettingScore>();

    for (const row of rows) {
      if (
        byScene.has(row.sceneId) ||
        !Number.isFinite(row.score100) ||
        row.score100 < 0 ||
        row.score100 > 100 ||
        row.protocolVersion.trim().length === 0 ||
        row.sourceHash.trim().length === 0
      ) {
        invalidRecord = true;
        continue;
      }
      byScene.set(row.sceneId, row);
    }

    settingCoverage[setting] = byScene.size;
    if (byScene.size !== sceneIds.length) continue;

    const values = sceneIds.map((sceneId) => byScene.get(sceneId)?.score100);
    if (values.some((value) => value === undefined)) continue;
    settingScores[setting] =
      values.reduce<number>((sum, value) => sum + (value ?? 0), 0) / sceneIds.length;
  }

  if (invalidRecord) {
    return {
      overall: null,
      settingScores,
      settingCoverage,
      requiredSceneCount: sceneIds.length,
      eligible: false,
      reason: "invalid_record",
    };
  }

  if (OVERALL_SETTINGS.some((setting) => settingScores[setting] === null)) {
    return {
      overall: null,
      settingScores,
      settingCoverage,
      requiredSceneCount: sceneIds.length,
      eligible: false,
      reason: "missing_setting",
    };
  }

  const weightedScore = OVERALL_SETTINGS.reduce(
    (sum, setting) =>
      sum + (settingScores[setting] ?? 0) * OVERALL_SETTING_WEIGHTS[setting],
    0,
  );

  return {
    overall: Math.round((weightedScore + Number.EPSILON) * 100) / 100,
    settingScores,
    settingCoverage,
    requiredSceneCount: sceneIds.length,
    eligible: true,
    reason: "complete",
  };
}
