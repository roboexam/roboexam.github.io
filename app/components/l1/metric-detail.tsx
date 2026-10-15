"use client";

import {
  AlertCircle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { metricNarrative } from "./metric-narratives";
import {
  audit,
  formatScore,
  layerMeta,
  metricDisplayName,
  metricHasNumericResult,
  metricStateLabel,
  metricStateToken,
  phase1,
  phase1Metric,
  type L1CandidateMetric,
} from "./l1-view-model";
import type { L1Phase1Example } from "../../data/l1-phase1-provisional";

type ItemEvidence = {
  canonicalSampleId: string;
  bundleVersion: string;
  episodeBlueprintId: string;
  seed: number;
  split: string;
  taskId: "stack_bowls";
  queryType: string;
  promptFamily: string;
  responseSchema: string;
  camera: string;
  frameIndices: number[];
  instruction: string;
  question: string;
  metricMemberships: string[];
  media: L1Phase1Example["media"];
  cosmos: {
    modelId: "nvidia/Cosmos3-Nano";
    collectionStatus: "ok";
    rawResponse: string;
    parsedResponse: unknown;
    parserVersion: string;
    promptVersion: string;
  };
  membership: {
    metricId: string;
    groundTruth: unknown;
    gtField: string;
    gtReviewStatus: string;
    gtTier: "frozen_machine_gt" | "provisional_machine_gt" | "contract_pending";
    lane: "deterministic" | "judge";
    nativeScore: number | null;
    binaryCorrect: boolean | null;
    eligible: boolean;
    modelFailure: boolean;
    scoreState: string;
    terminalState: string;
    scorer: string | null;
    judge: null | {
      verdict: string | null;
      reason: string | null;
      accuracy: number | null;
      completeness: number | null;
      humanCalibration: string | null;
      rubricVersion: string | null;
    };
  };
};

type EvidenceState = {
  key: string;
  evidence: ItemEvidence | null;
  error: string | null;
};

type MetricSampleSummary = {
  canonicalSampleId: string;
  seed: number;
  split: string;
  camera: string;
  frameIndices: number[];
  terminalState: string;
  nativeScore: number | null;
};

type SampleIndexState = {
  key: string;
  samples: MetricSampleSummary[];
  error: string | null;
};

const noMetricSamples: MetricSampleSummary[] = [];

function pretty(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function gtTierLabel(tier: ItemEvidence["membership"]["gtTier"]) {
  if (tier === "contract_pending") return "CONTRACT PENDING TARGET";
  if (tier === "provisional_machine_gt") return "PROVISIONAL MACHINE GT · 未人工签核";
  return "FROZEN MACHINE GT";
}

export function MetricDetail({
  metric,
  defaultExample,
  selectedSampleId,
  onExample,
}: {
  metric: L1CandidateMetric;
  defaultExample: L1Phase1Example;
  selectedSampleId: string;
  onExample: (sampleId: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [sampleIndexState, setSampleIndexState] = useState<SampleIndexState>({ key: "", samples: [], error: null });
  const evidenceKey = `${metric.metric_id}::${selectedSampleId}`;
  const [evidenceState, setEvidenceState] = useState<EvidenceState>({ key: "", evidence: null, error: null });
  const samples = sampleIndexState.key === metric.metric_id ? sampleIndexState.samples : noMetricSamples;
  const filteredExamples = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return samples;
    return samples.filter((candidate) => [
      candidate.canonicalSampleId,
      candidate.seed,
      candidate.camera,
      candidate.frameIndices.join(","),
    ].join(" ").toLowerCase().includes(needle));
  }, [samples, filter]);
  const selectedIndex = samples.findIndex((candidate) => candidate.canonicalSampleId === selectedSampleId);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/l1-phase1-evidence/index?metric=${encodeURIComponent(metric.metric_id)}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    }).then(async (response) => {
      if (!response.ok) throw new Error(`question index request failed (${response.status})`);
      return response.json() as Promise<{ metricId: string; samples: MetricSampleSummary[] }>;
    }).then((index) => {
      if (index.metricId !== metric.metric_id || !Array.isArray(index.samples) || index.samples.length === 0) {
        throw new Error("question index identity mismatch");
      }
      setSampleIndexState({ key: metric.metric_id, samples: index.samples, error: null });
    }).catch((error: Error) => {
      if (error.name !== "AbortError") setSampleIndexState({ key: metric.metric_id, samples: [], error: error.message });
    });
    return () => controller.abort();
  }, [metric.metric_id]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/l1-phase1-evidence/items/${selectedSampleId}?metric=${encodeURIComponent(metric.metric_id)}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    }).then(async (response) => {
      if (!response.ok) throw new Error(`item evidence request failed (${response.status})`);
      return response.json() as Promise<ItemEvidence>;
    }).then((item) => {
      if (item.canonicalSampleId !== selectedSampleId || item.membership.metricId !== metric.metric_id) {
        throw new Error("item evidence identity mismatch");
      }
      setEvidenceState({ key: evidenceKey, evidence: item, error: null });
    }).catch((error: Error) => {
      if (error.name !== "AbortError") setEvidenceState({ key: evidenceKey, evidence: null, error: error.message });
    });
    return () => controller.abort();
  }, [evidenceKey, metric.metric_id, selectedSampleId]);

  const evidence = evidenceState.key === evidenceKey ? evidenceState.evidence : null;
  const evidenceError = evidenceState.key === evidenceKey ? evidenceState.error : null;
  const evidenceLoading = evidenceState.key !== evidenceKey;
  const input = evidence ?? (selectedSampleId === defaultExample.canonicalSampleId ? defaultExample : null);

  const result = phase1Metric(metric);
  const resultReady = metricHasNumericResult(metric);
  const narrative = metricNarrative(metric);
  const runMethod = result.state === "contract_pending"
    ? "contract_pending：本轮没有合法 scorer/GT 组合，因此不产生数值"
    : result.lane === "judge"
      ? "冻结 Qwen3-VL provisional semantic Judge（未做人工校准）"
      : result.state === "scored_provisional_gt"
        ? "冻结 deterministic scorer + 尚未人工签核的机器 GT"
        : "冻结 deterministic scorer";
  const executionSteps = [
    "Cosmos3-Nano 的原生 generation 输出先按冻结 output contract 解析；parse error 仍留在模型分母。",
    `按本轮合同执行：${runMethod}。`,
    resultReady
      ? `按 ${result.aggregationProfile ?? "冻结 aggregation profile"} 聚合 ${result.scoreBearingN} 个 score-bearing membership。`
      : `${result.membershipN} 个 membership 保持真实 pending / not-applicable 终态，不补零。`,
  ];
  const bleuFamily = metric.metric_id === "l1c.bleu1"
    ? audit.metrics.filter((item) => item.metric_id.startsWith("l1c.bleu"))
    : [];

  return <section className="l1rSection l1rDetail" id="metric-guide">
    <header className="l1rDetailTitle">
      <div>
        <span>{metric.layer} · {layerMeta[metric.layer].title}</span>
        <h2>{metricDisplayName(metric)}</h2>
        <p className="l1rMetricAnswer">它回答：{narrative.explains}</p>
      </div>
      <div className="l1rMetricState">
        <i className={`l1rState ${result.state}`}>{metricStateToken(metric)}</i>
        <strong>{resultReady ? formatScore(result.score) : "— pending"}</strong>
        <small>{metricStateLabel(metric)}</small>
      </div>
    </header>

    <ol className="l1rReadingPath" aria-label="指标详情阅读顺序">
      <li><b>01</b><span>出处</span></li>
      <li><b>02</b><span>是什么 / 为什么</span></li>
      <li><b>03</b><span>Stack Bowls 问题</span></li>
      <li><b>04</b><span>怎样计算</span></li>
      <li><b>05</b><span>真实结果</span></li>
    </ol>

    <section className="l1rStoryStep l1rSourceStep">
      <div className="l1rStoryIndex"><b>01</b><span>METRIC ORIGIN</span></div>
      <div className="l1rStoryBody">
        <span className="l1rSourceMode">定义谱系 · 飞书白名单</span>
        <h3>为什么它会出现在看板？</h3>
        <p><strong>入选依据：飞书《{audit.definitionSource.documentTitle}》§{metric.document_section} · {metric.document_heading}</strong></p>
        <h3>它的计算方法从哪里来？</h3>
        <p><strong>{metric.source}</strong></p>
        <p>这里的论文或 benchmark 来源只解释 metric 的定义与 evaluator 谱系，不代替本轮执行合同。本轮评分方法为：<strong>{runMethod}</strong>；真实终态是 <code>{result.state}</code>。</p>
        <p><small>白名单基准：revision {audit.definitionSource.documentRevision} · {audit.schemaVersion}。项目内部派生项会明确写出“非外部 benchmark 原生指标”。</small></p>
      </div>
    </section>

    <section className="l1rStoryStep">
      <div className="l1rStoryIndex"><b>02</b><span>WHAT / WHY</span></div>
      <div className="l1rStoryBody l1rWhatWhy">
        <article><h3>它是什么</h3><p>{metric.why_considered}</p></article>
        <article><h3>为什么需要它</h3><p>{narrative.need}</p></article>
        <article><h3>为什么属于 {metric.layer}</h3><p>{layerMeta[metric.layer].description}</p></article>
      </div>
    </section>

    <section className="l1rStoryStep l1rExampleStep">
      <div className="l1rStoryIndex"><b>03</b><span>QUESTION EXAMPLE</span></div>
      <div className="l1rStoryBody">
        <div className="l1rQuestionStatus exact">
          <CheckCircle2 size={17}/><div>
            <strong>Phase 1 逐题证据 · 输入、GT、Cosmos 回答精确绑定</strong>
            <span>以下证据按 run ID + canonical sample ID + metric ID 严格连接；Qwen 结果只在 Judge 专区单独标记。</span>
          </div>
        </div>
        <div className="l1rSamplePicker">
          <div>
            <span>SELECT ONE REAL QUESTION</span>
            <strong>{samples.length > 0 ? `${samples.length} 道属于 ${metric.metric_id} 的题目` : `正在载入 ${metric.metric_id} 的题目索引…`}</strong>
            <small>{selectedIndex >= 0 ? `当前第 ${selectedIndex + 1} 题 · seed ${samples[selectedIndex]?.seed} · frames [${samples[selectedIndex]?.frameIndices.join(", ")}]` : `sample ${selectedSampleId.slice(0, 12)}…`}</small>
          </div>
          <label>
            <Search size={15}/>
            <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="搜索 sample ID、seed、camera 或 frame"/>
          </label>
          <select
            aria-label="选择本指标的一道真实题目"
            disabled={samples.length === 0}
            value={filteredExamples.some((candidate) => candidate.canonicalSampleId === selectedSampleId) ? selectedSampleId : ""}
            onChange={(event) => event.target.value && onExample(event.target.value)}
          >
            {!filteredExamples.some((candidate) => candidate.canonicalSampleId === selectedSampleId) && <option value="">从 {filteredExamples.length} 条搜索结果中选择</option>}
            {filteredExamples.map((candidate) => <option key={candidate.canonicalSampleId} value={candidate.canonicalSampleId}>
              seed {candidate.seed} · frames [{candidate.frameIndices.join(",")}] · {candidate.canonicalSampleId.slice(0, 12)}…
            </option>)}
          </select>
          <div className="l1rSamplePager">
            <button type="button" disabled={selectedIndex <= 0} onClick={() => {
              const previous = samples[selectedIndex - 1];
              if (previous) onExample(previous.canonicalSampleId);
            }}><ChevronLeft size={15}/>上一题</button>
            <button type="button" disabled={selectedIndex < 0 || selectedIndex >= samples.length - 1} onClick={() => {
              const next = samples[selectedIndex + 1];
              if (next) onExample(next.canonicalSampleId);
            }}>下一题<ChevronRight size={15}/></button>
          </div>
        </div>
        {sampleIndexState.key === metric.metric_id && sampleIndexState.error && <div className="l1rEvidenceLoading error"><AlertCircle size={18}/><span>题目索引不可用：{sampleIndexState.error}</span></div>}
        {input ? <div className="l1rExampleBand">
          <div className="l1rExampleMedia">
            <div className={`l1rExampleFrames ${input.media.length === 1 ? "single" : "sequence"}`}>
              {input.media.map((frame) => <figure key={`${input.canonicalSampleId}-${frame.frameIndex}`}>
                <img src={frame.url} alt={`Stack Bowls input frame ${frame.frameIndex}`}/>
                <figcaption>FRAME {frame.frameIndex}</figcaption>
              </figure>)}
            </div>
            <span>STACK BOWLS · {input.media.length} INPUT {input.media.length === 1 ? "FRAME" : "FRAMES"}</span>
          </div>
          <div className="l1rQuestion">
            <span>ACTUAL PHASE 1 INPUT</span>
            <h3>模型会看到什么问题？</h3>
            <code>{input.canonicalSampleId} · {input.camera} · frames [{input.frameIndices.join(", ")}]</code>
            <pre>{input.question}</pre>
            <small>任务指令</small>
            <p>{input.instruction}</p>
            <small>该指标的输入边界</small>
            <p>{metric.input_contract}</p>
            <small>共享同一 canonical input 的 metrics</small>
            <p>{input.metricMemberships.join(" · ")}</p>
            <small>正式输出合同</small>
            <p>{metric.output_contract}</p>
          </div>
        </div> : <div className="l1rEvidenceLoading">正在读取本题精确绑定的输入图像与问题…</div>}
        {evidenceLoading && <div className="l1rEvidenceLoading">正在读取受保护的逐题 GT 与 Cosmos3-Nano 回答…</div>}
        {evidenceError && <div className="l1rEvidenceLoading error"><AlertCircle size={18}/><span>逐题证据不可用：{evidenceError}。这是基础设施错误，不会回退到手写示例。</span></div>}
        {evidence && <div className="l1rItemEvidence">
          <div className="l1rItemScoreStrip">
            <span>ITEM SCORE</span>
            <strong>{evidence.membership.nativeScore === null ? "—" : `${(evidence.membership.nativeScore * 100).toFixed(1)} / 100`}</strong>
            <code>{evidence.membership.nativeScore === null ? "native_score = null" : `native_score = ${evidence.membership.nativeScore.toFixed(6)}`}</code>
            <i className={evidence.membership.terminalState}>{evidence.membership.terminalState}</i>
            <small>{evidence.membership.scorer ?? "scorer unavailable"}</small>
          </div>
          <div className="l1rEvidenceCompare">
            <article className="groundTruth">
              <header><div><span>GROUND TRUTH</span><h3>本 metric 使用的真实目标</h3></div><b>{gtTierLabel(evidence.membership.gtTier)}</b></header>
              <code>{evidence.membership.gtField}</code>
              <pre>{pretty(evidence.membership.groundTruth)}</pre>
              <small>review_status = {evidence.membership.gtReviewStatus}</small>
            </article>
            <article className="modelResponse">
              <header><div><span>COSMOS3-NANO ACTUAL RESPONSE</span><h3>本题模型实际回答</h3></div><b>{evidence.cosmos.collectionStatus}</b></header>
              <pre>{evidence.cosmos.rawResponse}</pre>
              <details><summary>查看 parser 后的结构化结果</summary><pre>{pretty(evidence.cosmos.parsedResponse)}</pre></details>
              <small>{evidence.cosmos.modelId} · {evidence.cosmos.parserVersion}</small>
            </article>
          </div>
          {evidence.membership.judge && <div className="l1rJudgeEvidence">
            <strong>QWEN3-VL PROVISIONAL JUDGE · 与 Cosmos 回答分栏保存</strong>
            <span>verdict = {evidence.membership.judge.verdict ?? "pending"}</span>
            <p>{evidence.membership.judge.reason ?? "Judge 没有返回可展示的理由。"}</p>
            <small>human_calibration = {evidence.membership.judge.humanCalibration ?? "not_recorded"} · {evidence.membership.judge.rubricVersion ?? "rubric unavailable"}</small>
          </div>}
        </div>}
      </div>
    </section>

    <section className="l1rStoryStep l1rScoringStep">
      <div className="l1rStoryIndex"><b>04</b><span>SCORING</span></div>
      <div className="l1rStoryBody">
        <h3>文档定义与本轮执行怎样对应？</h3>
        <p>下式保留飞书白名单中的定义口径；本轮实际 scorer lane、GT 审核状态和聚合 profile 由下方三步及 run evidence 约束。</p>
        <code className="l1rFormula">{metric.calculation}</code>
        <div className="l1rPlainSteps">{executionSteps.map((step, index) => <article key={step}><b>{index + 1}</b><p>{step}</p>{index < 2 && <ArrowRight size={16}/>}</article>)}</div>
        {bleuFamily.length > 0 && <div className="l1rBleuFamily">{bleuFamily.map((item) => <span key={item.metric_id}><b>BLEU-{item.metric_id.at(-1)}</b>{formatScore(phase1Metric(item).score)}</span>)}</div>}
        <div className="l1rInterpretationGrid">
          <article><span>这个 metric 能解释</span><p>{narrative.explains}</p></article>
          <article><span>不能据此声称</span><p>{layerMeta[metric.layer].boundary}</p></article>
        </div>
      </div>
    </section>

    <section className="l1rStoryStep l1rEvidenceStep">
      <div className="l1rStoryIndex"><b>05</b><span>RUN EVIDENCE</span></div>
      <div className="l1rStoryBody">
        <div className={resultReady ? "l1rRunEvidence ready" : "l1rRunEvidence pending"}>
          <header>
            <div>{resultReady ? <CheckCircle2 size={18}/> : <AlertCircle size={18}/>}<span>{resultReady ? "Phase 1 provisional 模型结果" : "真实合同缺口"}</span></div>
            <strong>{phase1.run.id}</strong>
          </header>
          {resultReady ? <>
            <div className="l1rAggregateResult"><span>Cosmos3-Nano · 12-episode descriptive blueprint macro · 0–100 display</span><strong>{formatScore(result.score)}</strong></div>
            <div className="l1rRunFacts">
              <article><span>SCORING LANE</span><strong>{result.lane}</strong><small>{result.scoreTier}</small></article>
              <article><span>SCORE-BEARING N</span><strong>{result.scoreBearingN}</strong><small>{result.membershipN} total memberships in this metric</small></article>
              <article><span>TERMINAL STATE</span><strong>{result.state}</strong><small>pending is never coerced to zero</small></article>
            </div>
            <div className="l1rNotice"><ShieldCheck size={16}/><p><b>聚合结果保持冻结；逐题 GT 与 Cosmos 回答只通过登录后的受保护 API 按需读取，不进入静态前端 bundle。</b>当前 human_gt_review=not_started；Judge-dependent 分数尚未人工校准，只能用于内部开发。</p></div>
            <p className="l1rProvenanceLine"><ShieldCheck size={15}/> {phase1.run.testedModel} · {phase1.run.contractVersion} · immutable replay</p>
          </> : <div className="l1rPendingEvidence">
            <AlertCircle size={22}/><div><h3>— contract_pending</h3><p>该指标缺少合法 GT、合同或 scorer，Phase 1 没有让 Qwen 猜 GT，也没有用 0 补分。</p><small>{result.membershipN} 个 membership 保留真实终态；第 03 节仅用于解释合同。</small></div>
          </div>}
        </div>
      </div>
    </section>
  </section>;
}
