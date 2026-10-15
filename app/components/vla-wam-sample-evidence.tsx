"use client";

import { useState } from "react";
import { vlaWamSampleBundle, type VlaWamSample } from "../data/vla-wam-samples";

const purePredictionMetrics = new Set(["MUSIQ", "Motion", "Scene", "HSD", "NDTW", "DYN"]);

const metricPlan: Record<string, { input: string; compute: string; note: string }> = {
  AC: { input: "This episode outcome, trajectory, metadata, and hash", compute: "Check that all four artifact classes exist, parse, and align by episode_id", note: "One pass/fail contribution per episode; the cohort aggregate counts all 100." },
  N: { input: "Valid episode_id and seed", compute: "Verify that the seed is unique and the episode is eligible for this metric", note: "N is evidence volume, not a capability score." },
  TSR: { input: "Official success boolean", compute: "Record kᵢ=1 (success) or 0 (failure) for this item", note: "Final TSR = Σkᵢ / N." },
  SR95: { input: "This item success boolean", compute: "Add this item kᵢ to the cohort success count k", note: "The Beta interval is a 100-episode cohort result; no independent item interval exists." },
  SCORE_DIST: { input: "Native RoboDojo score", compute: "Add this item to the score=1, 0.15, or 0 bucket", note: "The final distribution is count / N per bucket." },
  SET: { input: "success and duration_s", compute: "Keep duration_s only for successful items; failures do not enter the mean", note: "Report mean ± sample std over the successful subset." },
  IPS: { input: "step_count and instrumented wall time", compute: "step_count ÷ episode_loop_s", note: "Compute the mean and sample standard deviation per episode." },
  WT: { input: "Monotonic-clock wall_total_s", compute: "Sum phases inside the frozen timing boundary", note: "Per episode; excludes queueing and model loading." },
  LSPARC: { input: "Left end-effector velocity sequence", compute: "Compute normalized velocity spectral arc length", note: "Closer to 0 is usually smoother." },
  RSPARC: { input: "Right end-effector velocity sequence", compute: "Compute normalized velocity spectral arc length", note: "Closer to 0 is usually smoother." },
  LPATH: { input: "Left EE position sequence", compute: "Sum Euclidean distances between adjacent positions", note: "A short path can also mean failure or no motion; read with TSR." },
  RPATH: { input: "Right EE position sequence", compute: "Sum Euclidean distances between adjacent positions", note: "A short path can also mean failure or no motion; read with TSR." },
  LSPEED: { input: "Left EE velocity sequence", compute: "Average per-step linear speed magnitude", note: "Speed describes motion tempo and has no monotonic preference." },
  RSPEED: { input: "Right EE velocity sequence", compute: "Average per-step linear speed magnitude", note: "Speed describes motion tempo and has no monotonic preference." },
  LJPL: { input: "Left joint position sequence", compute: "Sum L2 distances between adjacent joint vectors", note: "Compare only with the same embodiment, action mode, and time window." },
  RJPL: { input: "Right joint position sequence", compute: "Sum L2 distances between adjacent joint vectors", note: "Compare only with the same embodiment, action mode, and time window." },
  TJPL: { input: "This item left and right arm Joint Path Length", compute: "left JPL + right JPL", note: "Sum within each episode, then aggregate across episodes." },
  LOPL: { input: "Left EE quaternion sequence", compute: "Sum adjacent quaternion rotation angles 2·acos(|rₜ₊₁·rₜ|)", note: "Coordinate frame and quaternion order must be fixed." },
  ROPL: { input: "Right EE quaternion sequence", compute: "Sum adjacent quaternion rotation angles 2·acos(|rₜ₊₁·rₜ|)", note: "Coordinate frame and quaternion order must be fixed." },
  TOPL: { input: "This item left and right arm Orientation Path Length", compute: "left OPL + right OPL", note: "Sum within each episode, then aggregate across episodes." },
  TAE: { input: "Versioned task-adherence state transitions in the event trace", compute: "Count target-dropped, workspace-escape, and other event onsets", note: "Count each continuous state once; zero is valid only with complete telemetry." },
  SLIP: { input: "Gripper-object holding/contact state transitions", compute: "Count previous_holding ∧ ¬current_holding onsets", note: "Without holding telemetry, mark unavailable; never fill zero." },
  ENV_COLL: { input: "Robot-link and scene-geometry contact pairs", compute: "Count newly appearing environment-contact onsets", note: "Count continuous contact once." },
  SELF_COLL: { input: "Non-permitted robot-link contact pairs", compute: "Deduplicate unordered pairs and count new self-contact onsets", note: "Exclude adjacent links and the allowed-contact whitelist." },
  TMC: { input: "task_id and versioned task registry", compute: "Read the stack_bowls task attribute label M(0)", note: "This is a task-level label inherited by each sample, not a model score." },
  ROBUSTNESS: { input: "At least two controlled conditions on the same seed/layout", compute: "Compute N, SR, SR95, and successful time per condition.", note: "Only one condition is present, so robustness cannot be inferred from this episode." },
};

function valueFor(id: string, sample: VlaWamSample) {
  const side = id.startsWith("L") ? sample.trajectory.left : sample.trajectory.right;
  const values: Record<string, { value: string; raw: string }> = {
    AC: { value: "PASS", raw: "1 / 1 artifact group valid" },
    N: { value: "1 episode", raw: `seed ${sample.seed} is unique in the frozen cohort` },
    TSR: { value: sample.success ? "1" : "0", raw: `success=${String(sample.success)}` },
    SR95: { value: `kᵢ=${sample.success ? 1 : 0}`, raw: "single Bernoulli contribution" },
    SCORE_DIST: { value: sample.score.toFixed(2), raw: `bucket score=${sample.score}` },
    SET: { value: sample.durationSeconds === null ? "Excluded" : `${sample.durationSeconds.toFixed(2)} s`, raw: sample.success ? "success=true" : "success=false" },
    IPS: { value: `${sample.timing.iterationsPerSecond.toFixed(3)} steps/s`, raw: `${sample.stepCount} steps / ${(sample.stepCount / sample.timing.iterationsPerSecond).toFixed(3)} s` },
    WT: { value: `${sample.timing.wallTotalSeconds.toFixed(3)} s`, raw: "timing.wall_total_s" },
    LSPARC: { value: sample.trajectory.left.ee_sparc.toFixed(4), raw: "left.ee_sparc" },
    RSPARC: { value: sample.trajectory.right.ee_sparc.toFixed(4), raw: "right.ee_sparc" },
    LPATH: { value: `${sample.trajectory.left.ee_path_length_m.toFixed(4)} m`, raw: "left.ee_path_length_m" },
    RPATH: { value: `${sample.trajectory.right.ee_path_length_m.toFixed(4)} m`, raw: "right.ee_path_length_m" },
    LSPEED: { value: `${sample.trajectory.left.ee_speed_mean_m_s.toFixed(5)} m/s`, raw: "left.ee_speed_mean_m_s" },
    RSPEED: { value: `${sample.trajectory.right.ee_speed_mean_m_s.toFixed(5)} m/s`, raw: "right.ee_speed_mean_m_s" },
    LJPL: { value: `${sample.trajectory.left.joint_path_length_rad.toFixed(4)} rad`, raw: "left.joint_path_length_rad" },
    RJPL: { value: `${sample.trajectory.right.joint_path_length_rad.toFixed(4)} rad`, raw: "right.joint_path_length_rad" },
    TJPL: { value: `${sample.totals.joint_path_length_rad.toFixed(4)} rad`, raw: `${sample.trajectory.left.joint_path_length_rad.toFixed(4)} + ${sample.trajectory.right.joint_path_length_rad.toFixed(4)}` },
    LOPL: { value: `${sample.trajectory.left.orientation_path_length_rad.toFixed(4)} rad`, raw: "left.orientation_path_length_rad" },
    ROPL: { value: `${sample.trajectory.right.orientation_path_length_rad.toFixed(4)} rad`, raw: "right.orientation_path_length_rad" },
    TOPL: { value: `${sample.totals.orientation_path_length_rad.toFixed(4)} rad`, raw: `${sample.trajectory.left.orientation_path_length_rad.toFixed(4)} + ${sample.trajectory.right.orientation_path_length_rad.toFixed(4)}` },
    TAE: { value: String(sample.events.taskAdherence.count), raw: sample.events.taskAdherence.event_codes.join(", ") || "no event onset" },
    SLIP: { value: String(sample.events.objectSlip.count), raw: sample.events.objectSlip.event_codes.join(", ") || "no slip onset" },
    ENV_COLL: { value: String(sample.events.environmentCollision.count), raw: sample.events.environmentCollision.event_codes.join(", ") || "no environment collision onset" },
    SELF_COLL: { value: String(sample.events.selfCollision.count), raw: sample.events.selfCollision.event_codes.join(", ") || "no self-collision onset" },
    TMC: { value: "M(0)", raw: "stack_bowls task registry" },
    ROBUSTNESS: { value: "N/A", raw: "only one evaluation condition" },
  };
  return values[id] ?? { value: "N/A", raw: side ? "no registered calculation" : "missing input" };
}

function defaultSampleIndex(id: string, samples: VlaWamSample[]) {
  if (id === "TAE") {
    const positive = samples.findIndex((sample) => sample.events.taskAdherence.count > 0);
    if (positive >= 0) return positive;
  }
  return 0;
}

export function VlaWamSampleEvidence({ id, model, formula }: { id: string; model: string; formula: string }) {
  const current = vlaWamSampleBundle.models[model];
  const [episodeIndex, setEpisodeIndex] = useState(() => current ? defaultSampleIndex(id, current.samples) : 0);
  if (!current) return null;
  const sample = current.samples[episodeIndex] ?? current.samples[0];
  const plan = metricPlan[id];
  const sampleValue = valueFor(id, sample);
  const ineligiblePrediction = purePredictionMetrics.has(id);

  return <section className="metricSample vlaSample">
    <div className="sampleHeading">
      <div><span>REAL EPISODE WALKTHROUGH</span><h3>{model} · seed {sample.seed}</h3><p>{sample.outcome} · score {sample.score} · {current.resultVersion}</p></div>
      <div className="sampleTools">
        <label className="episodeSelect"><span>Choose formal sample</span><select value={episodeIndex} onChange={(event) => setEpisodeIndex(Number(event.target.value))}>{current.samples.map((item, index) => <option key={item.id} value={index}>seed {item.seed} · {item.outcome}{item.events.taskAdherence.count ? ` · ${item.events.taskAdherence.count} event` : ""}</option>)}</select></label>
        <span className="fixedTaskTag">stack_bowls</span><strong>{ineligiblePrediction ? "N/A" : sampleValue.value}</strong>
      </div>
    </div>
    <div className="sampleBody vlaSampleBody">
      <div className="sampleVideo"><video key={sample.media.sha256} controls muted playsInline preload="metadata" src={sample.media.url}/><div><b>Head-camera rollout</b><span>{sample.media.durationSeconds.toFixed(2)} s · {sample.media.frameCount} frames · SHA {sample.media.sha256.slice(0, 12)}…</span></div></div>
      {ineligiblePrediction ? <div className="sampleCalculation"><div className="sampleUnavailable"><strong>Counterexample input, not an eligible sample for this metric</strong><p>This video records a post-execution simulator observation;{id} the metric requires an independently generated prediction-only future. It is shown to document available evidence, not to substitute for prediction scoring.</p></div><div className="calculationSteps"><article><span>① Current evidence</span><strong>execution observation</strong><p>Real rollout, eligible for action and closed-loop metrics.</p></article><article><span>② Protocol requirement</span><strong>prediction-only video</strong><p>An independent action-conditioned future prediction must be stored.</p></article><article><span>③ Eligibility check</span><strong>Failed</strong><p>The two video types have different semantics and cannot substitute for each other.</p></article><article><span>④ Item result</span><strong>N/A</strong><p>Pending a prediction-only artifact.</p></article></div></div> : plan ? <div className="sampleCalculation"><p>Walk through this episode from raw evidence to its item result.</p><div className="calculationSteps"><article><span>① Lock sample</span><strong>seed {sample.seed} · {sample.outcome}</strong><p>{sample.id}</p></article><article><span>② Read input</span><strong>{plan.input}</strong><p>{sampleValue.raw}</p></article><article><span>③ Apply formula</span><strong>{plan.compute}</strong><p>{formula}</p></article><article><span>④ Item contribution</span><strong>{sampleValue.value}</strong><p>{plan.note}</p></article></div></div> : <div className="sampleUnavailable"><strong>No item-level calculation explanation is registered for this metric yet</strong><p>The video and formal episode remain visible; the page does not invent calculation steps.</p></div>}
    </div>
  </section>;
}
