import { vlmDashboardBundle } from "../data/vlm-results";

const solutionPaths: Record<string, [string, string, string]> = {
  DIRECT: ["Find the explicitly named target across the frame sequence.", "Return the target frame and a 0–1000 normalized bounding box.", "Score bbox IoU on the same frame; only IoU > 0.5 passes."],
  SITUATIONAL: ["Infer the intended object from the use or scene description.", "Locate the object in the video and return frame + bbox.", "Same-frame IoU > 0.5 counts as correct."],
  "OBJ-REF": ["Determine whether the question is direct or situational referring.", "Return frame + bbox under the corresponding protocol.", "The item score contributes to the native Direct + Situational aggregate."],
  MRA: ["Read the multi-frame scene and the requested distance or size.", "Return a numeric answer with units.", "A frozen parser extracts the value and applies the repository relative-accuracy formula."],
  RoA: ["Identify the two objects and their relative orientation.", "Return the angle or clock direction with the requested unit.", "Accumulate ten tolerance thresholds on the circular direction error; this pilot item did not pass."],
  AREA: ["Find the ground-truth usable region described by the instruction.", "Return one or more candidate points in the target frame.", "Measure the fraction of predicted points inside or on the ground-truth polygon."],
  AFF: ["Understand where the action can interact with the object.", "Return affordance points in the target frame.", "Compute exp(−mean nearest-point distance) against the ground-truth points."],
  "PIO-S1": ["Find the directly described target in a single image.", "Return an xyxy bbox in 0–1000 coordinates.", "Use the Point-It-Out repository scorer to compute bbox IoU."],
  "PIO-S2": ["Use the situational question to identify the correct target.", "Return that target as an xyxy bbox in 0–1000 coordinates.", "Use the Point-It-Out repository scorer to compute bbox IoU."],
  "RS-LOC": ["Find the text-referred object in the image.", "Return a point_2d in 0–1000 coordinates.", "Map the point back to the image and test it against the ground-truth mask."],
  "RS-PLACE": ["Understand the free space available for placement between objects.", "Return a point_2d in 0–1000 coordinates.", "Check whether the predicted point falls inside the placement mask."],
  "RS-UNSEEN": ["Solve the same text referring task on the unseen split.", "Return a point_2d in 0–1000 coordinates.", "Reuse the frozen prediction and score it against the unseen membership mask."],
};

function statistic(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function parsed(value: unknown) {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export function VlmMetricEvidence({ id, model }: { id: string; model: string }) {
  const modelResult = vlmDashboardBundle.models[model];
  const metric = modelResult?.values[id];
  const sample = modelResult?.samples[id];
  if (!modelResult || !metric || !sample) return null;
  const steps = solutionPaths[id];
  const verdict = sample.correct === true ? "Pass" : sample.correct === false ? "Fail" : sample.scoreDisplay;

  return <>
    <section className="vlmExample" aria-label={`${model} ${id} real question example`}>
      <div className="vlmExampleHeader">
        <div><span>REAL PILOT QUESTION</span><h3>{sample.sourceBenchmark} · {sample.nativeTask}</h3><p>{sample.evaluationId}</p></div>
        <div><strong>{verdict}</strong><span>Item contribution · {sample.metricName}</span></div>
      </div>
      <div className="vlmExampleBody">
        <div className="vlmInputPanel">
          <div className="vlmPanelTitle"><span>1 · Model input</span><b>{sample.inputCount} images</b></div>
          <div className={`vlmMediaGrid ${sample.media.length === 1 ? "single" : ""}`}>
            {sample.media.map((media) => <figure key={media.sha256}><img src={media.url} alt={`${id} real example ${media.label}`} loading="lazy"/><figcaption>{media.label}</figcaption></figure>)}
          </div>
          {sample.displayedInputCount < sample.inputCount && <p className="vlmMediaNote">Model actually read {sample.inputCount} frames; the page shows first, middle, last, and cited frames out of {sample.displayedInputCount}  frames.</p>}
        </div>
        <div className="vlmQuestionPanel">
          <article><span>2 · Question</span><p>{sample.question}</p></article>
          <article><span>3 · Model output</span><pre>{sample.rawResponse}</pre></article>
          <article><span>Parsed result</span><pre>{parsed(sample.parsedResponse)}</pre></article>
        </div>
      </div>
      <div className="vlmSolution">
        <div className="vlmPanelTitle"><span>How to solve the task</span><b>Task-level path, not hidden chain of thought</b></div>
        <div>{steps.map((step, index) => <article key={step}><span>0{index + 1}</span><p>{step}</p></article>)}</div>
      </div>
      <div className="vlmSampleScore">
        <div><span>Frozen output</span><strong>{sample.terminalState}</strong></div>
        <div><span>Native item score</span><strong>{sample.nativeScoreDisplay}</strong></div>
        <div><span>Aggregate contribution</span><strong>{sample.scoreDisplay}</strong></div>
        <p>{sample.note}</p>
      </div>
    </section>
    <section className="formalEvidence" aria-label={`${model} ${id} formal aggregate evidence`}>
      <div className="formalEvidenceHeader">
        <div><span>VLM L1 PILOT AGGREGATE</span><h3>{model} · {metric.sourceBenchmark}</h3><p>{modelResult.resultVersion} · {metric.split} / {metric.scope}</p></div>
        <div className="formalEvidenceValue"><strong>{metric.primary}</strong><span>{metric.aux}</span></div>
      </div>
      <div className="formalEvidenceFacts">
        <article><span>Memberships</span><strong>{metric.effectiveN} / {metric.plannedN}</strong><p>effective / planned</p></article>
        <article><span>Distribution</span><strong>{statistic(metric.median)}</strong><p>median · IQR {statistic(metric.q25)}–{statistic(metric.q75)}</p></article>
        <article><span>Failures</span><strong>{metric.parseFailureN} / {metric.infrastructureFailureN}</strong><p>parse / infrastructure</p></article>
        <article><span>Provenance</span><strong>{String(modelResult.provenance.summarySha256).slice(0, 12)}</strong><p>formal summary SHA-256</p></article>
      </div>
      <p className="formalEvidenceNote">This metric uses a deterministic evaluator without a semantic judge. The aggregate comes from the immutable pilot; parse failures remain in the denominator and score zero.</p>
    </section>
  </>;
}
