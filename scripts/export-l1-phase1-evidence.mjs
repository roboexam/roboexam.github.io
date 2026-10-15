import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { l1MetricContracts } from "./l1-metric-contracts.mjs";
import { l1Phase1ProvisionalRegistry } from "./l1-phase1-provisional-registry.mjs";

const checkOnly = process.argv.includes("--check");
const buildRequested = process.argv.includes("--build");
assert.notEqual(checkOnly, buildRequested, "choose exactly one of --check or --build");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseJsonl(bytes, label) {
  return bytes.toString("utf8").split("\n").filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${label} line ${index + 1} is invalid JSON`, { cause: error });
    }
  });
}

async function readPinned(absolutePath, expectedSha256, label) {
  const bytes = await readFile(absolutePath);
  assert.equal(sha256(bytes), expectedSha256, `${label} hash drift`);
  return bytes;
}

function compactGeometry(groundTruth) {
  const geometry = groundTruth.geometry;
  assert.ok(geometry && typeof geometry === "object");
  return {
    targetObjectId: geometry.target_object_id,
    targetBbox2d: geometry.target_bbox_2d,
    targetPoint2d: geometry.target_point_2d,
    instanceId: geometry.instance_id,
    instanceMaskSha256: geometry.instance_mask_sha256,
  };
}

function metricGroundTruth(metricId, groundTruth) {
  switch (metricId) {
    case "l1a.direct":
    case "l1a.pio_s1":
    case "l1a.refspatial":
      return compactGeometry(groundTruth);
    case "l1a.mra":
      return groundTruth.geometry.metric_reasoning;
    case "l1a.roa":
      return groundTruth.geometry.relative_orientation;
    case "l1a.object_state_f1":
      return { objects: groundTruth.scene_graph.objects };
    case "l1a.llm_alignment":
      return groundTruth.scene_graph;
    case "l1a.text_spatial_f1":
      return { relations: groundTruth.scene_graph.relations };
    case "l1b.situational":
      return {
        allowedTargetObjectIds: groundTruth.situational.allowed_target_object_ids,
        allowedTargetBboxes: groundTruth.situational.allowed_target_bboxes,
        allowedTargetPoints: groundTruth.situational.allowed_target_points,
      };
    case "l1b.area_hit_ratio":
    case "l1b.pio_s2":
      return {
        interactionKind: groundTruth.affordance.interaction_kind,
        interactionPolygon: groundTruth.affordance.task_conditioned_interaction_polygon,
        interactionPolygonPixels: groundTruth.affordance.task_conditioned_interaction_polygon_pixels,
        imageSize: groundTruth.affordance.image_size,
      };
    case "l1b.affordance_similarity":
    case "l1b.affordance_ap":
      return {
        interactionKind: groundTruth.affordance.interaction_kind,
        taskConditionedPoints: groundTruth.affordance.task_conditioned_points,
        taskConditionedPointPixels: groundTruth.affordance.task_conditioned_point_pixels,
        acceptedContactCount: groundTruth.affordance.accepted_contact_count,
        imageSize: groundTruth.affordance.image_size,
      };
    case "l1c.stage_accuracy":
    case "l1c.stage_macro_f1":
      return { stage: groundTruth.task_state.stage };
    case "l1c.next_subgoal_accuracy":
      return { nextSubgoal: groundTruth.task_state.next_subgoal };
    case "l1c.plan_step_f1":
    case "l1c.plan_edit_similarity":
      return { steps: groundTruth.planning.steps };
    case "l1c.dependency_f1":
      return { dependencies: groundTruth.planning.dependencies };
    case "l1c.bleu1":
    case "l1c.bleu2":
    case "l1c.bleu3":
    case "l1c.bleu4":
      return { canonicalText: groundTruth.planning.canonical_text };
    case "l1c.planning_llm_alignment":
      return {
        canonicalText: groundTruth.planning.canonical_text,
        steps: groundTruth.planning.steps,
        dependencies: groundTruth.planning.dependencies,
        allowedSymmetry: groundTruth.planning.allowed_symmetry,
      };
    case "l1d.failure_occurrence_macro_f1":
      return { failurePresent: groundTruth.failure.failure_present };
    case "l1d.failure_type_macro_f1":
      return {
        failurePresent: groundTruth.failure.failure_present,
        failureType: groundTruth.failure.failure_type,
      };
    case "l1d.failure_onset_similarity":
      return {
        failurePresent: groundTruth.failure.failure_present,
        onsetFrame: groundTruth.failure.onset_frame,
      };
    case "l1d.recovery_subgoal_accuracy":
      return {
        subgoalId: groundTruth.recovery.subgoal_id,
        unavailableReason: groundTruth.recovery.unavailable_reason,
      };
    case "l1d.recovery_plan_score":
      return {
        steps: groundTruth.recovery.steps,
        allowedAlternatives: groundTruth.recovery.allowed_alternatives,
        unavailableReason: groundTruth.recovery.unavailable_reason,
      };
    default:
      throw new Error(`missing GT formatter for ${metricId}`);
  }
}

function gtTier(reviewStatus, terminalState) {
  if (terminalState === "contract_pending" || terminalState === "not_applicable") return "contract_pending";
  if (/pending_human|pending.*signoff/i.test(reviewStatus)) return "provisional_machine_gt";
  return "frozen_machine_gt";
}

function judgeEvidence(score) {
  if (score.lane !== "judge") return null;
  return {
    verdict: score.audit?.judge_verdict ?? null,
    reason: score.audit?.judge_reason ?? null,
    accuracy: score.audit?.judge_accuracy ?? null,
    completeness: score.audit?.judge_completeness ?? null,
    humanCalibration: score.audit?.judge_human_calibration ?? null,
    rubricVersion: score.scorer?.rubric_version ?? null,
  };
}

function displayGtField(gtField) {
  return gtField
    .replace(/instance_mask_path,?/g, "")
    .replace(/,}/g, "}");
}

function assertSafe(value, label) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /\/mnt\/|\/World\/|instance_mask_path|mask_path|checkpoint|judge_cache_key|judge_prompt_sha256/i, `${label} leaks private provenance`);
}

async function expectedBundle() {
  const [publicBytes, privateBytes, predictionBytes, scoreBytes, judgeBytes] = await Promise.all([
    readPinned(l1Phase1ProvisionalRegistry.publicManifest, l1Phase1ProvisionalRegistry.publicManifestSha256, "public.jsonl"),
    readPinned(l1Phase1ProvisionalRegistry.privateManifest, l1Phase1ProvisionalRegistry.privateManifestSha256, "private.jsonl"),
    readPinned(path.join(l1Phase1ProvisionalRegistry.resultRoot, "predictions.jsonl"), l1Phase1ProvisionalRegistry.expectedSha256["predictions.jsonl"], "predictions.jsonl"),
    readPinned(path.join(l1Phase1ProvisionalRegistry.resultRoot, "all_item_scores.jsonl"), l1Phase1ProvisionalRegistry.expectedSha256["all_item_scores.jsonl"], "all_item_scores.jsonl"),
    readPinned(path.join(l1Phase1ProvisionalRegistry.resultRoot, "judge_results.jsonl"), l1Phase1ProvisionalRegistry.expectedSha256["judge_results.jsonl"], "judge_results.jsonl"),
  ]);
  const publicRows = parseJsonl(publicBytes, "public.jsonl");
  const privateRows = parseJsonl(privateBytes, "private.jsonl");
  const predictionRows = parseJsonl(predictionBytes, "predictions.jsonl");
  const scoreRows = parseJsonl(scoreBytes, "all_item_scores.jsonl");
  const judgeRows = parseJsonl(judgeBytes, "judge_results.jsonl");
  const metricIds = l1MetricContracts.map((metric) => metric.metric_id);
  const byId = (rows, label) => {
    const result = new Map(rows.map((row) => [row.canonical_sample_id, row]));
    assert.equal(result.size, rows.length, `duplicate ${label} canonical_sample_id`);
    return result;
  };
  const publicById = byId(publicRows, "public");
  const privateById = byId(privateRows, "private");
  const predictionById = byId(predictionRows, "prediction");
  assert.deepEqual([...publicById.keys()].sort(), [...privateById.keys()].sort());
  assert.deepEqual([...publicById.keys()].sort(), [...predictionById.keys()].sort());
  assert.equal(scoreRows.length, 2815);
  assert.equal(judgeRows.length, 119, "Judge result count drift");

  const scoreByKey = new Map();
  for (const score of scoreRows) {
    const key = `${score.canonical_sample_id}::${score.metric_id}`;
    assert.equal(scoreByKey.has(key), false, `duplicate item score ${key}`);
    scoreByKey.set(key, score);
  }

  const index = {
    schemaVersion: "unibench.dashboard.l1-phase1-evidence-index.v1",
    bundleVersion: l1Phase1ProvisionalRegistry.bundleVersion,
    runId: path.basename(l1Phase1ProvisionalRegistry.resultRoot),
    testedModel: "nvidia/Cosmos3-Nano",
    sampleCount: publicRows.length,
    membershipCount: scoreRows.length,
    metrics: Object.fromEntries(metricIds.map((metricId) => [metricId, []])),
  };
  const itemFiles = [];
  for (const publicRow of [...publicRows].sort((left, right) => left.canonical_sample_id.localeCompare(right.canonical_sample_id))) {
    const sampleId = publicRow.canonical_sample_id;
    const privateRow = privateById.get(sampleId);
    const prediction = predictionById.get(sampleId);
    assert.ok(privateRow && prediction);
    assert.equal(prediction.model_id, "nvidia/Cosmos3-Nano");
    assert.equal(prediction.collection_status, "ok");
    assert.deepEqual(privateRow.metric_memberships, publicRow.metric_memberships);
    assert.deepEqual(prediction.metric_memberships, publicRow.metric_memberships);
    assert.deepEqual(privateRow.frame_indices, publicRow.frame_indices);
    assert.deepEqual(prediction.frame_indices, publicRow.frame_indices);
    assert.deepEqual(privateRow.media_paths, publicRow.media_paths);
    assert.deepEqual(prediction.media_paths, publicRow.media_paths);
    const memberships = {};
    for (const metricId of publicRow.metric_memberships) {
      assert.ok(metricIds.includes(metricId), `unknown metric ${metricId}`);
      const score = scoreByKey.get(`${sampleId}::${metricId}`);
      assert.ok(score, `missing item score ${sampleId}::${metricId}`);
      assert.equal(score.raw_response, prediction.raw_response, `raw response drift ${sampleId}::${metricId}`);
      assert.deepEqual(score.parsed_response, prediction.parsed_output, `parsed response drift ${sampleId}::${metricId}`);
      const contract = privateRow.evaluator_contracts.find((candidate) => candidate.metric_id === metricId);
      assert.ok(contract, `missing evaluator contract ${sampleId}::${metricId}`);
      memberships[metricId] = {
        metricId,
        evaluationId: score.evaluation_id,
        groundTruth: metricGroundTruth(metricId, score.ground_truth),
        gtField: displayGtField(contract.gt_field),
        gtReviewStatus: privateRow.review_status,
        gtTier: gtTier(privateRow.review_status, score.terminal_state),
        lane: score.lane,
        nativeScore: score.native_score,
        binaryCorrect: score.binary_correct,
        eligible: score.eligible,
        modelFailure: score.model_failure,
        scoreState: score.score_state,
        terminalState: score.terminal_state,
        scorer: score.scorer?.profile ?? null,
        judge: judgeEvidence(score),
      };
      index.metrics[metricId].push({
        canonicalSampleId: sampleId,
        seed: publicRow.seed,
        split: publicRow.split,
        camera: publicRow.camera,
        frameIndices: publicRow.frame_indices,
        terminalState: score.terminal_state,
        nativeScore: score.native_score,
      });
    }
    const item = {
      schemaVersion: "unibench.dashboard.l1-phase1-item-evidence.v1",
      bundleVersion: l1Phase1ProvisionalRegistry.bundleVersion,
      runId: index.runId,
      canonicalSampleId: sampleId,
      episodeBlueprintId: publicRow.episode_blueprint_id,
      seed: publicRow.seed,
      split: publicRow.split,
      taskId: publicRow.task_id,
      queryType: publicRow.query_type,
      promptFamily: publicRow.prompt_family,
      responseSchema: publicRow.response_schema,
      camera: publicRow.camera,
      frameIndices: publicRow.frame_indices,
      instruction: publicRow.instruction,
      question: publicRow.question,
      metricMemberships: publicRow.metric_memberships,
      media: publicRow.media_paths.map((mediaPath, indexPosition) => ({
        url: `/api/l1-phase1-media/samples/${publicRow.media_sha256[mediaPath]}.png`,
        sha256: publicRow.media_sha256[mediaPath],
        frameIndex: publicRow.frame_indices[indexPosition],
      })),
      cosmos: {
        modelId: prediction.model_id,
        collectionStatus: prediction.collection_status,
        rawResponse: prediction.raw_response,
        parsedResponse: prediction.parsed_output,
        parserVersion: prediction.parser_version,
        promptVersion: prediction.prompt_version,
      },
      memberships,
    };
    assertSafe(item, `item ${sampleId}`);
    const bytes = Buffer.from(`${JSON.stringify(item, null, 2)}\n`);
    itemFiles.push({ path: `items/${sampleId}.json`, bytes, sha256: sha256(bytes) });
  }
  for (const samples of Object.values(index.metrics)) {
    samples.sort((left, right) => left.seed - right.seed
      || left.frameIndices[0] - right.frameIndices[0]
      || left.canonicalSampleId.localeCompare(right.canonicalSampleId));
  }
  assert.equal(Object.values(index.metrics).reduce((sum, samples) => sum + samples.length, 0), scoreRows.length);
  assertSafe(index, "index");
  const indexBytes = Buffer.from(`${JSON.stringify(index, null, 2)}\n`);
  const manifest = {
    schemaVersion: "unibench.dashboard.l1-phase1-evidence-manifest.v1",
    bundleVersion: l1Phase1ProvisionalRegistry.bundleVersion,
    sampleCount: publicRows.length,
    membershipCount: scoreRows.length,
    sourceSha256: {
      "public.jsonl": l1Phase1ProvisionalRegistry.publicManifestSha256,
      "private.jsonl": l1Phase1ProvisionalRegistry.privateManifestSha256,
      "predictions.jsonl": l1Phase1ProvisionalRegistry.expectedSha256["predictions.jsonl"],
      "all_item_scores.jsonl": l1Phase1ProvisionalRegistry.expectedSha256["all_item_scores.jsonl"],
      "judge_results.jsonl": l1Phase1ProvisionalRegistry.expectedSha256["judge_results.jsonl"],
    },
    indexSha256: sha256(indexBytes),
    files: itemFiles.map((file) => ({ path: file.path, sha256: file.sha256, bytes: file.bytes.length })),
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  return { indexBytes, itemFiles, manifest, manifestBytes };
}

async function verifyBundle(expected) {
  const root = l1Phase1ProvisionalRegistry.evidenceBundleRoot;
  assert.equal(await readFile(path.join(root, "index.json"), "utf8"), expected.indexBytes.toString("utf8"), "evidence index drift");
  assert.equal(await readFile(path.join(root, "manifest.json"), "utf8"), expected.manifestBytes.toString("utf8"), "evidence manifest drift");
  const stored = (await readdir(path.join(root, "items"))).sort();
  assert.deepEqual(stored, expected.itemFiles.map((file) => path.basename(file.path)).sort(), "evidence item set drift");
  for (const file of expected.itemFiles) {
    const bytes = await readFile(path.join(root, file.path));
    assert.equal(bytes.length, file.bytes.length, `evidence item size drift ${file.path}`);
    assert.equal(sha256(bytes), file.sha256, `evidence item hash drift ${file.path}`);
  }
}

execFileSync(
  "/usr/bin/python3",
  ["/mnt/gyc/benchmark2027/scripts/storage/layout_guard.py", "validate", "generated_dataset", l1Phase1ProvisionalRegistry.evidenceBundleRoot],
  { stdio: "ignore" },
);

const expected = await expectedBundle();
if (checkOnly) {
  await verifyBundle(expected);
  console.log(`L1 Phase 1 item evidence verified: ${expected.manifest.sampleCount} samples, ${expected.manifest.membershipCount} memberships.`);
} else {
  const root = l1Phase1ProvisionalRegistry.evidenceBundleRoot;
  await assert.rejects(stat(root), { code: "ENOENT" }, `refusing to overwrite evidence bundle: ${root}`);
  const temporaryRoot = `${root}.tmp-${process.pid}`;
  try {
    await mkdir(path.join(temporaryRoot, "items"), { recursive: true });
    await writeFile(path.join(temporaryRoot, "index.json"), expected.indexBytes);
    for (const file of expected.itemFiles) await writeFile(path.join(temporaryRoot, file.path), file.bytes);
    await writeFile(path.join(temporaryRoot, "manifest.json"), expected.manifestBytes);
    await rename(temporaryRoot, root);
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
  await verifyBundle(expected);
  console.log(`Built immutable L1 Phase 1 item evidence bundle: ${root}`);
}
