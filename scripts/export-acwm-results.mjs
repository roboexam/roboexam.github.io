import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acwmPublishConfig, acwmResultRegistry } from "./acwm-result-registry.mjs";

const EPISODE_METRICS = {
  MSE: { field: "mse", direction: "lower", unit: "mean squared error" },
  "M-MSE": { field: "masked_mse", direction: "lower", unit: "weighted mean squared error" },
  PSNR: { field: "psnr", direction: "higher", unit: "dB" },
  SSIM: { field: "ssim", direction: "higher", unit: "score" },
  IQ: { field: "image_quality", direction: "higher", unit: "normalized score" },
  MS: { field: "motion_smoothness", direction: "higher", unit: "evaluator score" },
  TA: { field: "trajectory_accuracy", direction: "higher", unit: "trajectory score" },
};
const EXPECTED_SCHEMA = "benchmark2027_cosmos25_acwm_official8_summary_v1";
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_SHA1 = /^[a-f0-9]{40}$/;

function finite(value, label) {
  assert.equal(Number.isFinite(value), true, `${label} must be finite`);
  return value;
}

function close(actual, expected, label, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function loadJson(file) {
  const bytes = await readFile(file);
  return { document: JSON.parse(bytes.toString("utf8")), sha256: sha256(bytes) };
}

function validateMainResult(document, label) {
  assert.equal(document.schema_version, EXPECTED_SCHEMA, `${label} schema`);
  assert.equal(document.status, "PASS", `${label} status`);
  assert.equal(document.primary_group, "heldout73", `${label} primary split`);
  assert.equal(document.secondary_group, "all100", `${label} secondary split`);
  assert.equal(document.per_episode.length, 100, `${label} episode count`);

  const ids = document.per_episode.map((episode) => episode.sample_id);
  assert.equal(new Set(ids).size, 100, `${label} sample IDs must be distinct`);
  assert.deepEqual(
    [...ids].sort(),
    Array.from({ length: 100 }, (_, index) => `stack_bowls_${String(index + 1).padStart(3, "0")}`),
    `${label} sample ID set`,
  );
  assert.equal(
    document.per_episode.filter((episode) => episode.heldout73).length,
    73,
    `${label} heldout73 count`,
  );

  for (const episode of document.per_episode) {
    assert.equal(typeof episode.episode, "string");
    assert.equal(typeof episode.training_membership, "string");
    for (const { field } of Object.values(EPISODE_METRICS)) {
      finite(episode[field], `${label} ${episode.sample_id} ${field}`);
    }
    assert.equal("jepa_similarity" in episode, false, `${label} JEPA must remain group-level`);
  }

  for (const [groupId, expectedCount] of [["heldout73", 73], ["all100", 100]]) {
    const group = document.groups[groupId];
    assert.equal(group.sample_count, expectedCount, `${label} ${groupId} sample count`);
    const episodes = document.per_episode.filter((episode) => groupId === "all100" || episode.heldout73);
    for (const [metricId, { field }] of Object.entries(EPISODE_METRICS)) {
      const actual = finite(group.metrics[field], `${label} ${groupId} ${field}`);
      if (metricId === "PSNR") {
        close(actual, 10 * Math.log10(1 / (group.metrics.mse + 1e-8)), `${label} ${groupId} PSNR`);
      } else if (metricId === "M-MSE") {
        const episodeValues = episodes.map((episode) => episode[field]);
        assert.ok(
          actual >= Math.min(...episodeValues) && actual <= Math.max(...episodeValues),
          `${label} ${groupId} weighted M-MSE must remain inside the episode range`,
        );
      } else {
        close(actual, mean(episodes.map((episode) => episode[field])), `${label} ${groupId} ${field}`);
      }
    }
    finite(group.metrics.jepa_similarity, `${label} ${groupId} JEPA`);
  }
}

function validateInputManifest(document, mainResult, label) {
  assert.equal(document.episodes.length, 100, `${label} input-manifest count`);
  assert.deepEqual(
    document.episodes.map((episode) => episode.sample_id).sort(),
    mainResult.per_episode.map((episode) => episode.sample_id).sort(),
    `${label} input-manifest IDs`,
  );
  assert.equal(document.groups.heldout73, 73, `${label} input heldout73 count`);
  assert.equal(document.groups.all100, 100, `${label} input all100 count`);
  assert.match(document.upstream.acwm_phys_commit, GIT_SHA1, `${label} ACWM-Phys revision`);
  assert.match(document.upstream.worldarena_commit, GIT_SHA1, `${label} WorldArena revision`);
}

function validateInteraction(document, mainResult) {
  assert.equal(document.schema_version, "benchmark2027_worldarena_interaction_quality_v1");
  assert.equal(document.status, "PASS");
  assert.equal(document.error_count, 0);
  assert.equal(document.per_episode.length, 100);
  const mainById = new Map(mainResult.per_episode.map((episode) => [episode.sample_id, episode]));
  assert.equal(new Set(document.per_episode.map((episode) => episode.sample_id)).size, 100);

  for (const episode of document.per_episode) {
    const main = mainById.get(episode.sample_id);
    assert.ok(main, `unknown Interaction sample_id: ${episode.sample_id}`);
    assert.equal(episode.episode, main.episode, `${episode.sample_id} episode join`);
    assert.equal(episode.heldout73, main.heldout73, `${episode.sample_id} split join`);
    assert.equal(episode.training_membership, main.training_membership, `${episode.sample_id} membership join`);
    assert.equal(episode.error, null, `${episode.sample_id} Interaction error`);
    assert.match(episode.video_sha256, SHA256);
    const score = episode.metrics.Interaction_Quality;
    finite(score.score, `${episode.sample_id} Interaction raw score`);
    finite(score.score_normalized, `${episode.sample_id} Interaction normalized score`);
    assert.equal(typeof score.reason, "string");
    close(score.score_normalized, score.score / 5, `${episode.sample_id} Interaction normalization`);
  }

  for (const [groupId, expectedCount] of [["heldout73", 73], ["all100", 100]]) {
    const records = document.per_episode.filter((episode) => groupId === "all100" || episode.heldout73);
    assert.equal(document.aggregates[groupId].sample_count, expectedCount);
    close(
      document.aggregates[groupId].interaction_quality,
      mean(records.map((episode) => episode.metrics.Interaction_Quality.score_normalized)),
      `Interaction ${groupId} aggregate`,
    );
  }
}

function validateActionFollowing(document) {
  assert.equal(document.schema_version, "benchmark2027_worldarena_action_following_input_audit_v1");
  assert.equal(document.status, "NOT_RUN_INPUT_MISSING");
  assert.equal(document.episode_count, 100);
  assert.equal(document.distinct_initial_frame_count, 100);
  assert.equal(document.eligible_initial_frame_group_count, 0);
  assert.deepEqual(document.eligible_groups, []);
}

function groupValues(mainResult, field) {
  return Object.fromEntries(
    [["heldout73", mainResult.groups.heldout73], ["all100", mainResult.groups.all100]].map(
      ([groupId, group]) => [groupId, { sampleCount: group.sample_count, value: group.metrics[field] }],
    ),
  );
}

function publishedMedia(mediaEntries, mediaPrefix, sampleId) {
  const number = sampleId.slice(-3);
  const predictionPath = `acwm/${mediaPrefix}-stack-bowls-${number}-pred.mp4`;
  const groundTruthPath = `acwm/${mediaPrefix}-stack-bowls-${number}-gt.mp4`;
  const prediction = mediaEntries.get(predictionPath);
  const groundTruth = mediaEntries.get(groundTruthPath);
  if (!prediction || !groundTruth) return null;
  return {
    prediction: { url: `/media/${predictionPath}`, sha256: prediction.sha256 },
    groundTruth: { url: `/media/${groundTruthPath}`, sha256: groundTruth.sha256 },
  };
}

function metricResult(mainResult, metricId, specification) {
  const groups = groupValues(mainResult, specification.field);
  return {
    availability: "available",
    granularity: "episode",
    direction: specification.direction,
    unit: specification.unit,
    primary: groups.heldout73.value.toFixed(8),
    aux: `heldout73 · all100 ${groups.all100.value.toFixed(8)}`,
    status: "OK",
    groups,
  };
}

function buildModel(entry, sources, mediaEntries) {
  const { main, inputManifest, interaction, actionFollowing } = sources;
  const values = Object.fromEntries(
    Object.entries(EPISODE_METRICS).map(([metricId, specification]) => [
      metricId,
      metricResult(main.document, metricId, specification),
    ]),
  );
  const jepaGroups = groupValues(main.document, "jepa_similarity");
  values.JEPA = {
    availability: "available",
    granularity: "distribution",
    direction: "higher",
    unit: "similarity",
    primary: jepaGroups.heldout73.value.toFixed(8),
    aux: `heldout73 · all100 ${jepaGroups.all100.value.toFixed(8)} · split-level`,
    status: "OK",
    groups: jepaGroups,
  };

  if (interaction) {
    const groups = Object.fromEntries(
      [["heldout73", interaction.document.aggregates.heldout73], ["all100", interaction.document.aggregates.all100]].map(
        ([groupId, group]) => [
          groupId,
          { sampleCount: group.sample_count, value: group.interaction_quality },
        ],
      ),
    );
    values.INTERACT = {
      availability: "available",
      granularity: "judge_episode",
      direction: "higher",
      unit: "normalized judge score",
      primary: groups.heldout73.value.toFixed(8),
      aux: `heldout73 · all100 ${groups.all100.value.toFixed(8)}`,
      status: "OK",
      groups,
    };
  } else {
    values.INTERACT = {
      availability: "not_run",
      granularity: "judge_episode",
      direction: "higher",
      unit: "normalized judge score",
      primary: "NOT_RUN",
      aux: "官方 Qwen3-VL Interaction Quality 尚未运行",
      status: "NOT_RUN",
      groups: { heldout73: { sampleCount: 73, value: null }, all100: { sampleCount: 100, value: null } },
    };
  }

  const af = actionFollowing?.document;
  values.AF = {
    availability: "input_missing",
    granularity: "counterfactual_group",
    direction: "higher",
    unit: "group score",
    primary: "INPUT_MISSING",
    aux: "缺同一首帧下 3 条不同有效 action 的三视频组",
    status: "INPUT_MISSING",
    groups: { heldout73: { sampleCount: 0, value: null }, all100: { sampleCount: 0, value: null } },
    missingEvidence: {
      episodeCount: af?.episode_count ?? main.document.per_episode.length,
      distinctInitialFrameCount: af?.distinct_initial_frame_count ?? main.document.per_episode.length,
      eligibleGroupCount: af?.eligible_initial_frame_group_count ?? 0,
      requirement:
        af?.official_requirement ??
        "three valid action-conditioned predictions sharing one identical initial frame",
    },
  };

  const interactionById = new Map(
    (interaction?.document.per_episode ?? []).map((episode) => [episode.sample_id, episode]),
  );
  const samples = main.document.per_episode.map((episode) => {
    const judgeEpisode = interactionById.get(episode.sample_id);
    const judge = judgeEpisode?.metrics.Interaction_Quality;
    return {
      id: episode.sample_id,
      episodeId: episode.episode,
      heldout73: episode.heldout73,
      trainingMembership: episode.training_membership,
      values: Object.fromEntries(
        Object.entries(EPISODE_METRICS).map(([metricId, specification]) => [
          metricId,
          episode[specification.field].toFixed(8),
        ]).concat(judge ? [["INTERACT", judge.score_normalized.toFixed(8)]] : []),
      ),
      media: publishedMedia(mediaEntries, entry.mediaPrefix, episode.sample_id),
      interaction: judge
        ? {
            rawScore: judge.score,
            normalizedScore: judge.score_normalized,
            reason: judge.reason,
            instruction: judgeEpisode.instruction,
            sampledFrameCount: judgeEpisode.sampled_frame_count,
            sourceVideoSha256: judgeEpisode.video_sha256,
            error: judgeEpisode.error,
          }
        : null,
    };
  });

  const availableCount = Object.values(values).filter((metric) => metric.availability === "available").length;
  return {
    modelId: entry.modelId,
    displayName: entry.displayName,
    task: entry.task,
    resultVersion: entry.resultVersion,
    status: `${availableCount} / 10 complete`,
    completed: `${availableCount} / 10`,
    protocol: "39 valid / 42 stored frames · 320×256 · 25/6 FPS",
    values,
    samples,
    provenance: {
      result: { schemaVersion: main.document.schema_version, sha256: main.sha256 },
      inputManifest: { schemaVersion: inputManifest.document.schema_version, sha256: inputManifest.sha256 },
      interaction: interaction
        ? { schemaVersion: interaction.document.schema_version, sha256: interaction.sha256 }
        : null,
      actionFollowing: actionFollowing
        ? { schemaVersion: actionFollowing.document.schema_version, sha256: actionFollowing.sha256 }
        : null,
    },
  };
}

function assertNoServerPaths(value, location = "bundle") {
  if (typeof value === "string") {
    assert.equal(value.startsWith("/mnt/"), false, `${location} exposes a server path`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoServerPaths(item, `${location}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => assertNoServerPaths(item, `${location}.${key}`));
  }
}

const AVAILABILITY_STATUSES = new Map([
  ["available", new Set(["OK"])],
  ["not_run", new Set(["NOT_RUN"])],
  ["input_missing", new Set(["INPUT_MISSING"])],
  ["evaluator_failed", new Set(["EVALUATOR_FAILED"])],
  ["partial", new Set(["PARTIAL"])],
  ["unsupported", new Set(["UNSUPPORTED"])],
]);

export function validatePublishedBundle(bundle) {
  assert.equal(bundle.schemaVersion, "unibench.dashboard.acwm.v1");
  assert.match(bundle.mediaManifestSha256, SHA256);
  assert.deepEqual(Object.keys(bundle.models).sort(), ["Cosmos Predict 2.5", "CtrlWorld"]);
  for (const [modelName, model] of Object.entries(bundle.models)) {
    assert.equal(model.samples.length, 100, `${modelName} published sample count`);
    assert.equal(new Set(model.samples.map((sample) => sample.id)).size, 100, `${modelName} unique samples`);
    assert.equal(model.samples.filter((sample) => sample.heldout73).length, 73, `${modelName} heldout73`);
    assert.equal(model.values.JEPA.granularity, "distribution");
    assert.equal(model.values.AF.granularity, "counterfactual_group");
    assert.equal(model.values.AF.availability, "input_missing");
    assert.equal(model.values.AF.groups.all100.value, null);
    for (const [metricId, metric] of Object.entries(model.values)) {
      const legalStatuses = AVAILABILITY_STATUSES.get(metric.availability);
      assert.ok(legalStatuses, `${modelName} ${metricId} availability`);
      assert.equal(
        legalStatuses.has(metric.status),
        true,
        `${modelName} ${metricId} status must match availability`,
      );
    }
    for (const sample of model.samples) {
      assert.equal("JEPA" in sample.values, false, `${modelName} must not publish episode JEPA`);
      assert.equal("AF" in sample.values, false, `${modelName} must not publish episode AF`);
    }
    const completed = Object.values(model.values).filter((metric) => metric.availability === "available").length;
    assert.equal(model.completed, `${completed} / 10`, `${modelName} completion`);
  }
  assert.equal(bundle.models["Cosmos Predict 2.5"].values.INTERACT.availability, "not_run");
  assert.equal(bundle.models.CtrlWorld.values.INTERACT.availability, "available");
  assert.equal(
    bundle.models.CtrlWorld.samples.filter((sample) => sample.interaction).length,
    100,
    "CtrlWorld Interaction join",
  );
  assertNoServerPaths(bundle);
  return bundle;
}

export async function buildPublishedBundle() {
  const mediaManifest = await loadJson(acwmPublishConfig.mediaManifestFile);
  const mediaEntries = new Map(mediaManifest.document.files.map((entry) => [entry.path, entry]));
  const models = {};
  const sourceRevisions = {};

  for (const entry of acwmResultRegistry) {
    const main = await loadJson(entry.resultFile);
    const inputManifest = await loadJson(entry.inputManifestFile);
    validateMainResult(main.document, entry.displayName);
    validateInputManifest(inputManifest.document, main.document, entry.displayName);
    sourceRevisions["ACWM-Phys"] ??= inputManifest.document.upstream.acwm_phys_commit;
    sourceRevisions.WorldArena ??= inputManifest.document.upstream.worldarena_commit;

    let interaction = null;
    if (entry.interactionFile) {
      interaction = await loadJson(entry.interactionFile);
      validateInteraction(interaction.document, main.document);
    }
    let actionFollowing = null;
    if (entry.actionFollowingFile) {
      actionFollowing = await loadJson(entry.actionFollowingFile);
      validateActionFollowing(actionFollowing.document);
    }
    models[entry.displayName] = buildModel(
      entry,
      { main, inputManifest, interaction, actionFollowing },
      mediaEntries,
    );
  }

  return validatePublishedBundle({
    schemaVersion: "unibench.dashboard.acwm.v1",
    bundleVersion: acwmPublishConfig.bundleVersion,
    generatedBy: "scripts/export-acwm-results.mjs",
    primarySplit: "heldout73 (70 unseen + 3 test)",
    protocol: "1 condition + 38 future frames · 39 valid / 42 stored · 320×256 · 25/6 FPS · cam_head",
    sourceRevisions,
    mediaManifestSha256: mediaManifest.sha256,
    models,
  });
}

async function main() {
  const serialized = `${JSON.stringify(await buildPublishedBundle(), null, 2)}\n`;
  if (process.argv.includes("--check")) {
    const current = await readFile(acwmPublishConfig.outputFile, "utf8");
    assert.equal(current, serialized, "published ACWM bundle is stale; run npm run export:acwm");
    console.log("Published ACWM bundle matches the allowlisted formal results.");
    return;
  }
  await mkdir(path.dirname(acwmPublishConfig.outputFile), { recursive: true });
  await writeFile(acwmPublishConfig.outputFile, serialized);
  console.log(`Published ACWM bundle: ${acwmPublishConfig.outputFile}`);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
