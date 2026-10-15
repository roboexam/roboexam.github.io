"use client";

import {
  AlertTriangle,
  BookOpen,
  Database,
  FlaskConical,
  Layers3,
  Link2,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MetricDetail } from "./metric-detail";
import { MetricMatrix } from "./metric-matrix";
import {
  audit,
  formatScore,
  gradeMeta,
  layerIds,
  layerMeta,
  metricExample,
  phase1,
  phase1Metric,
  selectedLayerFromUrl,
  selectedMetricFromUrl,
  selectedSampleFromUrl,
  type L1CandidateMetric,
  type L1LayerId,
} from "./l1-view-model";

const sectionLinks = [
  ["overview", "概览"],
  ["metric-matrix", "指标矩阵"],
  ["metric-guide", "指标详情"],
  ["tasks-errors", "任务与错误"],
  ["advanced", "高级分析"],
  ["provenance", "来源与治理"],
] as const;

function syncUrl(layer: L1LayerId | "ALL", metric: L1CandidateMetric, sampleId: string) {
  const url = new URL(window.location.href);
  if (layer === "ALL") url.searchParams.delete("layer");
  else url.searchParams.set("layer", layer);
  url.searchParams.set("metric", metric.metric_id);
  url.searchParams.set("sample", sampleId);
  url.searchParams.set("run", phase1.run.id);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function L1ResultsPage() {
  const [layer, setLayer] = useState<L1LayerId | "ALL">(selectedLayerFromUrl);
  const [selectedMetricId, setSelectedMetricId] = useState(selectedMetricFromUrl);
  const selectedMetric = audit.metrics.find((metric) => metric.metric_id === selectedMetricId) ?? audit.metrics[0];
  const [selectedSampleId, setSelectedSampleId] = useState(() => selectedSampleFromUrl(selectedMetric));
  const defaultExample = metricExample(selectedMetric);

  useEffect(() => syncUrl(layer, selectedMetric, selectedSampleId), [layer, selectedMetric, selectedSampleId]);

  const selectMetric = (metric: L1CandidateMetric) => {
    setSelectedMetricId(metric.metric_id);
    setLayer(metric.layer);
    setSelectedSampleId(phase1.exampleByMetricId[metric.metric_id]);
    requestAnimationFrame(() => document.getElementById("metric-guide")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return <div className="l1rRoot">
    <section className="l1rHero" id="overview">
      <div className="l1rHeroCopy">
        <span className="l1rEyebrow">BENCHMARK LEVEL 1 · VLM UNDERSTANDING</span>
        <h1>Level 1 · VLM 理解能力</h1>
        <p>同一个 Stack Bowls episode 依次派生状态、一步交互、进程计划和失败恢复问题。指标集合严格以飞书文档编号条目为白名单；项目内部设计会明确标注，不再伪装成外部 benchmark 来源。</p>
        <div className="l1rHeroTags"><span>PROVISIONAL</span><span>Stack Bowls derived questions</span><span>Cosmos3-Nano only</span><span>Native processor + generation head</span><span>No readout head</span><span>Qwen Judge only</span></div>
      </div>
      <div className="l1rContext" aria-label="评测上下文">
        <div><small>RUN STATUS</small><strong>PROVISIONAL</strong><span>{phase1.coverage.numericMetricCount} / {phase1.coverage.metricCount} metrics have numeric results</span></div>
        <dl>
          <div><dt>Run ID</dt><dd>{phase1.run.id}</dd></div>
          <div><dt>Contract</dt><dd>{phase1.run.contractVersion}</dd></div>
          <div><dt>Questions</dt><dd>{phase1.run.predictionCount} frozen Cosmos3-Nano predictions</dd></div>
          <div><dt>Dataset</dt><dd>12 Stack Bowls episode blueprints · development pilot</dd></div>
        </dl>
      </div>
    </section>

    <aside className="l1rPhase1Banner" aria-label="Phase 1 provisional 发布边界">
      <ShieldCheck size={21}/>
      <div>
        <strong>Phase 1 provisional · 仅供内部开发，不是正式 benchmark 发布</strong>
        <p>{phase1.coverage.scoreBearingMembershipCount} / {phase1.coverage.nonNotApplicableMembershipCount} eligible memberships 有合法 score-bearing 终态（{(phase1.coverage.scoreBearingFraction * 100).toFixed(2)}%）；14 个 membership 保持 contract_pending，8 个 not_applicable。缺失不会补零。</p>
        <div className="l1rPhase1Flags"><span>human_gt_review = not_started</span><span>judge_human_calibration = waived_for_provisional_run</span><span>cross_layer_total = forbidden</span></div>
      </div>
    </aside>

    <nav className="l1rSectionNav" aria-label="Level 1 页面导航">
      {sectionLinks.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
    </nav>

    <section className="l1rSection l1rLayers">
      <header className="l1rSectionHeader">
        <div><span>CAPABILITY LAYERS</span><h2>四层能力结构</h2></div>
        <p>四层共用 Stack Bowls 任务证据，只改变向 Cosmos3-Nano 提出的问题；本页不生成跨层统一总分。</p>
      </header>
      <div className="l1rLayerGrid">{layerIds.map((id) => {
        const definitions = audit.metrics.filter((metric) => metric.layer === id);
        const layerResult = phase1.layers[id];
        return <button type="button" key={id} className={selectedMetric.layer === id ? "active" : ""} onClick={() => {
          setLayer(id);
          const first = definitions[0];
          if (first) {
            setSelectedMetricId(first.metric_id);
            setSelectedSampleId(phase1.exampleByMetricId[first.metric_id]);
          }
          document.getElementById("metric-matrix")?.scrollIntoView({ behavior: "smooth" });
        }}>
          <span>{id}</span>
          <h3>{layerMeta[id].title}</h3>
          <p>{layerMeta[id].description}</p>
          <dl><div><dt>Definitions</dt><dd>{definitions.length}</dd></div><div><dt>Numeric results</dt><dd>{layerResult.numericMetricCount}</dd></div></dl>
          <footer>{layerResult.numericMetricCount} / {layerResult.metricCount} numeric · {layerResult.pendingMetricCount} pending</footer>
        </button>;
      })}</div>
    </section>

    <MetricMatrix layer={layer} selectedMetricId={selectedMetric.metric_id} onLayer={setLayer} onMetric={selectMetric}/>
    <MetricDetail key={selectedMetric.metric_id} metric={selectedMetric} defaultExample={defaultExample} selectedSampleId={selectedSampleId} onExample={setSelectedSampleId}/>
    <TaskAndErrorAnalysis metric={selectedMetric}/>
    <AdvancedAnalysis/>
    <Provenance/>
  </div>;
}

function TaskAndErrorAnalysis({ metric }: { metric: L1CandidateMetric }) {
  const result = phase1Metric(metric);
  const terminalCounts = phase1.coverage.terminalCounts;
  return <section className="l1rSection" id="tasks-errors">
    <header className="l1rSectionHeader">
      <div><span>TASKS / ERRORS</span><h2>开发任务与终态</h2></div>
      <p>当前只覆盖 Stack Bowls 的 12-episode development pilot；不据此声称跨任务泛化。</p>
    </header>
    <div className="l1rAnalysisGrid">
      <div className="l1rTaskTable">
        <header><span>Task</span><span>{metric.name}</span></header>
        <div><span><strong>Stack Bowls</strong><small>12 episode blueprints · {result.scoreBearingN}/{result.membershipN} score-bearing memberships</small></span><b className={result.score === null ? "pending" : ""}>{result.score === null ? "— contract_pending" : formatScore(result.score)}</b></div>
      </div>
      <div className="l1rErrors">
        <article><span><ShieldCheck size={17}/> Cosmos parser</span><strong>0</strong><small>failures / {phase1.run.predictionCount} predictions</small></article>
        <article><span><AlertTriangle size={17}/> Judge pending</span><strong>{terminalCounts.judge_pending ?? 0}</strong><small>failed Judge calls stay pending, never zero</small></article>
        <article><span><Database size={17}/> Contract pending</span><strong>{terminalCounts.contract_pending ?? 0}</strong><small>memberships without a legal score</small></article>
        <article><span><ShieldCheck size={17}/> Infrastructure</span><strong>{phase1.coverage.infrastructureFailureCount}</strong><small>failures in the closed run</small></article>
      </div>
    </div>
  </section>;
}

function AdvancedAnalysis() {
  const gradeCounts = useMemo(() => Object.fromEntries((Object.keys(gradeMeta) as Array<keyof typeof gradeMeta>).map((grade) => [grade, audit.metrics.filter((metric) => metric.evidence_grade === grade).length])), []);
  return <section className="l1rSection" id="advanced">
    <header className="l1rSectionHeader">
      <div><span>ADVANCED ANALYSIS</span><h2>方法审计</h2></div>
      <p>候选定义成熟度保留在二级分析区；它不再代替当前 run 的真实终态。</p>
    </header>
    <div className="l1rAuditStrip">
      {(Object.keys(gradeMeta) as Array<keyof typeof gradeMeta>).map((grade) => <article key={grade}><i className={`l1rGrade ${grade}`}>{grade}</i><strong>{gradeCounts[grade]}</strong><span>{gradeMeta[grade].label}</span></article>)}
    </div>
    <details className="l1rAdvancedDetails">
      <summary><FlaskConical size={16}/> Experimental Metric Composer 边界</summary>
      <div><p>{audit.coverageWarning}</p><p>当前发布 29 项逐 metric 终态，其中 26 项有数值、3 项保持 contract_pending。BLEU-1 至 BLEU-4 分别报告，不据此构造统一 Level 1 Score；跨层总分被合同明确禁止。</p></div>
    </details>
  </section>;
}

function Provenance() {
  return <section className="l1rSection l1rProvenance" id="provenance">
    <header className="l1rSectionHeader">
      <div><span>PROVENANCE</span><h2>来源与治理</h2></div>
      <p>页面发布 hash 固定的 aggregate 与 provenance；登录后可按 canonical sample 查看经过字段白名单过滤的逐题 GT 和 Cosmos 回答，但它们不进入静态前端 bundle。</p>
    </header>
    <div className="l1rProvenanceGrid">
      <article><Layers3 size={18}/><span>Matrix whitelist</span><strong>{audit.schemaVersion}</strong><small>{audit.metrics.length} document-approved definitions only</small></article>
      <article><Database size={18}/><span>Run</span><strong>{phase1.run.id}</strong><small>{phase1.run.testedModel} · immutable provisional replay</small></article>
      <article><BookOpen size={18}/><span>Metric contract</span><strong>{phase1.run.contractVersion}</strong><small>{phase1.bundleVersion}</small></article>
      <article><Link2 size={18}/><span>Result receipt</span><strong>{phase1.sourceHashes["summary.provisional.json"].slice(0, 20)}…</strong><small>source summary SHA-256</small></article>
    </div>
    <p className="l1rBoundary"><ShieldCheck size={17}/>result_tier={phase1.run.resultTier} · publish_scope={phase1.run.publishScope} · human_gt_review={phase1.run.humanGtReview} · judge_human_calibration={phase1.run.judgeHumanCalibration} · cross_layer_total={phase1.run.crossLayerTotal}. {phase1.run.generalizationScope}</p>
  </section>;
}
