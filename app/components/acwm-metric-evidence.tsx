"use client";

import { useState } from "react";
import { acwmDashboardBundle, type AcwmSampleResult } from "../data/acwm-results";

const metricSteps: Record<string, { input: string; compute: string; aggregate: string }> = {
  MSE: {
    input: "Align 39 predicted and ground-truth frames pixel by pixel",
    compute: "Sum squared error over all pixels",
    aggregate: "Squared-error sum ÷ valid pixel count",
  },
  "M-MSE": {
    input: "Build the mask from ground-truth motion with a 0.01 floor",
    compute: "Weight the error by motion",
    aggregate: "weighted numerator ÷ weighted denominator",
  },
  PSNR: {
    input: "Read the sample aggregate MSE",
    compute: "10 × log10(1 / (MSE + 1e-8))",
    aggregate: "Item result; split PSNR must be derived from split MSE",
  },
  SSIM: {
    input: "Align 39 predicted and ground-truth frames frame by frame",
    compute: "Run skimage SSIM per frame",
    aggregate: "Mean over valid frames",
  },
  IQ: {
    input: "Read only the 38-frame predicted future",
    compute: "Run MUSIQ per frame",
    aggregate: "Frame mean ÷ 100",
  },
  MS: {
    input: "Consecutive triplets from the predicted video",
    compute: "Use VFIMamba to reconstruct the middle frame and compute SSIM × motion weight",
    aggregate: "Mean over valid triplets; the value is not bounded to [0,1]",
  },
  TA: {
    input: "Robot arm / gripper in predicted and ground-truth videos",
    compute: "Track with SAM3, interpolate, and compute DTW",
    aggregate: "1 ÷ mean DTW; missing coverage above 90% scores zero",
  },
  INTERACT: {
    input: "16 uniformly sampled predicted frames + instruction",
    compute: "Fixed Qwen3-VL rubric returns a 1–5 score and rationale",
    aggregate: "Raw score ÷ 5",
  },
};

function SampleVideoPair({ sample }: { sample: AcwmSampleResult | undefined }) {
  if (!sample?.media || !sample.media.prediction.url.startsWith("/samples/") || !sample.media.groundTruth.url.startsWith("/samples/")) {
    return <div className="sampleUnavailable"><strong>No publishable video sample is available</strong><p>The value still comes from the formal result bundle; no private or substitute video is shown.</p></div>;
  }
  return <div className="acwmVideoPair">
    <div className="sampleVideo"><video key={sample.media.prediction.sha256} controls muted playsInline preload="metadata" src={sample.media.prediction.url}/><div><b>Predicted future</b><span>SHA-256: {sample.media.prediction.sha256.slice(0, 12)}…</span></div></div>
    <div className="sampleVideo"><video key={sample.media.groundTruth.sha256} controls muted playsInline preload="metadata" src={sample.media.groundTruth.url}/><div><b>Ground-truth future</b><span>SHA-256: {sample.media.groundTruth.sha256.slice(0, 12)}…</span></div></div>
  </div>;
}

export function AcwmMetricEvidence({
  id,
  model,
  formula,
}: {
  id: string;
  model: string;
  formula: string;
}) {
  const [episodeIndex, setEpisodeIndex] = useState(0);
  const current = acwmDashboardBundle.models[model];
  const metric = current.values[id];
  const representativeSample = current.samples.find((sample) => sample.media);

  if (metric.granularity === "distribution") {
    return (
      <section className="metricSample">
        <div className="sampleHeading">
          <div>
            <span>ACWM DISTRIBUTION RESULT</span>
            <h3>{model} · {id}</h3>
            <p>{current.resultVersion} · Set-level metric; no per-episode score is constructed</p>
          </div>
        </div>
        <div className="sampleBody acwmSampleBody">
          <SampleVideoPair sample={representativeSample}/>
          <div className="sampleCalculation">
            <p>The pair above shows the input format. The final JEPA/JEDi value is the distance between two formal split distributions, not this item score.</p>
            <div className="calculationSteps">
              <article><span>① Sample input</span><strong>{representativeSample?.id ?? "N/A"}</strong><p>The paired item enters the feature set for its split.</p></article>
              <article><span>② Extract features</span><strong>prediction + GT</strong><p>Extract representations from the formal video set.</p></article>
              {Object.entries(metric.groups).map(([groupId, group]) => (
                <article key={groupId}>
                  <span>{groupId}</span>
                  <strong>{group.value?.toFixed(8) ?? "N/A"}</strong>
                  <p>{group.sampleCount} samples · distribution-level</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (metric.availability !== "available") {
    const missing = metric.missingEvidence;
    const availabilityTitle = {
      not_run: "Official evaluator not run",
      input_missing: "Protocol input missing",
      evaluator_failed: "Evaluator failed",
      partial: "Partial result",
      unsupported: "Unsupported by the current protocol",
    }[metric.availability];
    return (
      <section className="metricSample">
        <div className="sampleHeading">
          <div>
            <span>ACWM AVAILABILITY</span>
            <h3>{model} · {id}</h3>
            <p>{current.resultVersion}</p>
          </div>
          <div className="sampleTools"><strong>{metric.primary}</strong></div>
        </div>
        <div className="sampleBody acwmSampleBody">
          <SampleVideoPair sample={representativeSample}/>
          <div className="sampleUnavailable">
            <strong>{availabilityTitle}</strong>
            <p>{metric.aux}</p>
            {missing && (
              <p>
                episodes {missing.episodeCount} · distinct initial frames {missing.distinctInitialFrameCount} ·
                eligible groups {missing.eligibleGroupCount}。Requirement:{missing.requirement}。
              </p>
            )}
            <p>These real videos show the available input shape. Without the complete metric evidence contract, item and set results remain null / N/A and are never converted to zero.</p>
          </div>
        </div>
      </section>
    );
  }

  const selectedSample = current.samples[episodeIndex] ?? current.samples[0];
  const sampleValue = selectedSample.values[id];
  const step = metricSteps[id];
  const interaction = id === "INTERACT" ? selectedSample.interaction : null;

  if (!sampleValue || !step) {
    return (
      <section className="metricSample">
        <div className="sampleUnavailable">
          <strong>The published bundle has no result for this episode</strong>
          <p>{model} · {id} · {selectedSample.id}。The page does not substitute another metric or sample.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="metricSample">
      <div className="sampleHeading">
        <div>
          <span>{metric.granularity === "judge_episode" ? "ACWM JUDGE EPISODE" : "ACWM PAIRED EPISODE"}</span>
          <h3>{model} · {selectedSample.id}</h3>
          <p>
            {selectedSample.heldout73 ? "heldout73" : "all100 only"} · {selectedSample.trainingMembership} ·
            {current.resultVersion}
          </p>
        </div>
        <div className="sampleTools">
          <label className="episodeSelect">
            <span>Choose formal sample</span>
            <select value={episodeIndex} onChange={(event) => setEpisodeIndex(Number(event.target.value))}>
              {current.samples.map((sample, index) => (
                <option key={sample.id} value={index}>{sample.id} · {sample.heldout73 ? "heldout73" : "all100"}</option>
              ))}
            </select>
          </label>
          <span className="fixedTaskTag">stack_bowls</span>
          <strong>{sampleValue}</strong>
        </div>
      </div>
      <div className="sampleBody acwmSampleBody">
        <SampleVideoPair sample={selectedSample}/>
        <div className="sampleCalculation">
          <p>{id} Calculation and attribution for this formal sample.</p>
          <div className="calculationSteps">
            <article><span>① Sample and split</span><strong>{selectedSample.id}</strong><p>{selectedSample.episodeId}</p></article>
            <article><span>② Read input</span><strong>{step.input}</strong><p>The final 3 padding frames are excluded.</p></article>
            <article><span>③ Apply formula</span><strong>{step.compute}</strong><p>{formula}</p></article>
            <article><span>④ Item result</span><strong>{sampleValue}</strong><p>{step.aggregate}</p></article>
          </div>
          {interaction && (
            <div className="sampleUnavailable">
              <strong>Judge reason · raw {interaction.rawScore}/5 · {interaction.sampledFrameCount} frames</strong>
              <p>{interaction.reason}</p>
              <p>Instruction: {interaction.instruction} · source video {interaction.sourceVideoSha256.slice(0, 12)}…</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
