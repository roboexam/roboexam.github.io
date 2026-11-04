import {
  policyTaskFor,
  type PolicyBaselineModel,
  type PolicySetting,
} from "../data/policy-baselines";

export function PolicyBaselineEvidence({ model, taskId, metricId, formula, setting = "id" }: {
  model: PolicyBaselineModel;
  taskId: string;
  metricId: string;
  formula: string;
  setting?: PolicySetting;
}) {
  const task = policyTaskFor(model, taskId, setting);
  if (!task) return <section className="metricSample sampleUnavailable">
    <strong>No validated aggregate is available for this task.</strong>
  </section>;

  const metric = task.values[metricId];
  const settingLabel = setting === "id" ? "ID" : `${setting.toUpperCase()} OOD`;

  return <section className="formalEvidence" aria-label={`${model} ${taskId} ${settingLabel} aggregate evidence`}>
    <div className="formalEvidenceHeader">
      <div>
        <span>VALIDATED AGGREGATE</span>
        <h3>{model} · {taskId} · {settingLabel}</h3>
        <p>{task.resultVersion}</p>
      </div>
      <div className={metric?.available ? "formalEvidenceValue" : "formalEvidenceValue unavailable"}>
        <strong>{metric?.primary ?? "N/A"}</strong>
        <span>N = {metric?.n ?? 0}{metric?.coverage == null ? "" : ` · coverage ${(metric.coverage * 100).toFixed(1)}%`}</span>
      </div>
    </div>
    <div className="formalEvidenceFacts">
      <article><span>Cohort</span><strong>{task.episodes} / {task.expectedEpisodes} episodes</strong><p>{task.incompleteEpisodes} incomplete</p></article>
      <article><span>Task success</span><strong>{task.successes} / {task.episodes}</strong></article>
      <article><span>Protocol</span><p>{task.protocol}</p></article>
      <article><span>Scoring rule</span><p>{formula}</p></article>
    </div>
    <p className="formalEvidenceNote">The public board reports the validated aggregate only. Episode-level media and internal run provenance are not published here.</p>
  </section>;
}
