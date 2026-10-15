import { CheckCircle2, FlaskConical, ShieldAlert } from "lucide-react";
import { acwmDashboardBundle } from "../data/acwm-results";
import { pearsonMatrixDashboardBundle } from "../data/pearson-matrix-results";
import { vlmDashboardBundle } from "../data/vlm-results";
import { vlaWamDashboardBundle } from "../data/vla-wam-results";

type StageTone = "published" | "smoke" | "blocked";

const stageMeta: Record<StageTone, { label: string; icon: typeof CheckCircle2 }> = {
  published: { label: "正式发布", icon: CheckCircle2 },
  smoke: { label: "Smoke / 分析", icon: FlaskConical },
  blocked: { label: "证据不足", icon: ShieldAlert },
};

const pipelineRows: Array<{
  track: string;
  title: string;
  scope: string;
  evidence: string;
  next: string;
  tone: StageTone;
}> = [
  {
    track: "L1",
    title: "Qwen3-VL-8B-Instruct Native L1",
    scope: `${vlmDashboardBundle.models["Qwen3-VL-8B-Instruct"].cohort.memberships.toLocaleString()} memberships / ${vlmDashboardBundle.models["Qwen3-VL-8B-Instruct"].cohort.canonicalPredictions.toLocaleString()} canonical predictions`,
    evidence: `${vlmDashboardBundle.models["Qwen3-VL-8B-Instruct"].completed} deterministic metrics；${vlmDashboardBundle.models["Qwen3-VL-8B-Instruct"].cohort.deterministicScored.toLocaleString()} scored，${vlmDashboardBundle.models["Qwen3-VL-8B-Instruct"].cohort.parseFailures} parse failures，${vlmDashboardBundle.models["Qwen3-VL-8B-Instruct"].cohort.infrastructureFailures} infrastructure failures。`,
    next: `接入冻结的强教师模型，复用已保存的 ${vlmDashboardBundle.models["Qwen3-VL-8B-Instruct"].judge.memberships} 条 prediction 完成 Judge；不重跑被测 VLM。`,
    tone: "published",
  },
  {
    track: "L2 / L4",
    title: "Pi0.5 与 FastWAM · Stack Bowls",
    scope: "每模型 100 个独立 seed",
    evidence: "VLA/WAM v4 正式 bundle 已发布；成功率、得分分布、轨迹、事件与运行效率可追溯。",
    next: "扩展到第二、第三个任务，并保持同一 evaluator contract。",
    tone: "published",
  },
  {
    track: "L3",
    title: "Cosmos Predict 2.5 与 CtrlWorld",
    scope: "每模型 100 条 Oracle-success 输入",
    evidence: "ACWM official8 已发布；像素、结构、表征、画质、运动与轨迹指标可用。",
    next: "补齐 Action Following；Cosmos 还缺 Interaction Quality。",
    tone: "published",
  },
  {
    track: "鲁棒性",
    title: "Pi0.5 Object-pose Variation",
    scope: "baseline / 20 cm，各 2 条",
    evidence: "配对 smoke 通过，但总 N=4，正式 100-seed cohort 不完整。",
    next: "扩展为完整 paired cohort 后才能发布鲁棒性结论。",
    tone: "smoke",
  },
  {
    track: "可解释性",
    title: "Pi0.5 P0 Diagnostic Metrics",
    scope: "100 条 episode，16 项诊断量",
    evidence: "100/100 可计算；这些量与 success 的关系是相关性，不是因果解释。",
    next: "完成 reviewer audit，再决定哪些诊断量进入稳定看板。",
    tone: "smoke",
  },
  {
    track: "统计分析",
    title: "Stack Bowls Pearson Matrix",
    scope: "4 baseline，按模型分别分析",
    evidence: "矩阵与报告已发布；VLA success 相关和 ACWM metric-to-metric 严格分开。",
    next: "增加 held-out task / checkpoint 验证，避免把单任务相关当通用 proxy。",
    tone: "published",
  },
];

function formatAcwmCoverage(model: keyof typeof acwmDashboardBundle.models) {
  const values = acwmDashboardBundle.models[model].values;
  const available = Object.values(values).filter((metric) => metric.availability === "available").length;
  return `${available}/${Object.keys(values).length} metrics`;
}

export function ProjectProgressView() {
  const qwenVl = vlmDashboardBundle.models["Qwen3-VL-8B-Instruct"];
  const pi05 = vlaWamDashboardBundle.models["Pi0.5"];
  const fastWam = vlaWamDashboardBundle.models.FastWAM;
  const formalRuns = [
    {
      family: "VLM",
      model: qwenVl.displayName,
      task: "Native L1 Pilot",
      evidence: `${qwenVl.cohort.memberships.toLocaleString()} memberships · ${qwenVl.cohort.canonicalPredictions.toLocaleString()} canonical`,
      result: `${qwenVl.completed} metrics`,
      version: qwenVl.resultVersion,
    },
    {
      family: "VLA",
      model: pi05.displayName,
      task: pi05.task,
      evidence: `${pi05.cohort.episodes} episodes · ${pi05.cohort.uniqueSeeds} seeds`,
      result: pi05.values.TSR.primary,
      version: pi05.resultVersion,
    },
    {
      family: "WAM",
      model: fastWam.displayName,
      task: fastWam.task,
      evidence: `${fastWam.cohort.episodes} episodes · ${fastWam.cohort.uniqueSeeds} seeds`,
      result: fastWam.values.TSR.primary,
      version: fastWam.resultVersion,
    },
    {
      family: "ACWM",
      model: "Cosmos Predict 2.5",
      task: acwmDashboardBundle.models["Cosmos Predict 2.5"].task,
      evidence: `${acwmDashboardBundle.models["Cosmos Predict 2.5"].samples.length} samples`,
      result: formatAcwmCoverage("Cosmos Predict 2.5"),
      version: acwmDashboardBundle.models["Cosmos Predict 2.5"].resultVersion,
    },
    {
      family: "ACWM",
      model: "CtrlWorld",
      task: acwmDashboardBundle.models.CtrlWorld.task,
      evidence: `${acwmDashboardBundle.models.CtrlWorld.samples.length} samples`,
      result: formatAcwmCoverage("CtrlWorld"),
      version: acwmDashboardBundle.models.CtrlWorld.resultVersion,
    },
  ];

  return (
    <div className="content progressView">
      <section className="progressIntro band">
        <div>
          <p className="eyebrow">EVIDENCE LEDGER</p>
          <h2>当前进展与证据边界</h2>
          <p>把正式结果、Judge pending、smoke 和缺失证据分开。这里展示的是可复核状态，不把未运行项目填成 0。</p>
        </div>
        <div className="progressRelease">
          <span>当前计分版本</span>
          <strong>Native L1 + Stack Bowls · 5 baselines</strong>
          <small>{vlmDashboardBundle.bundleVersion}<br />{vlaWamDashboardBundle.bundleVersion}<br />{acwmDashboardBundle.bundleVersion}</small>
        </div>
      </section>

      <section className="progressFacts" aria-label="当前项目事实">
        <article><span>正式评测协议</span><strong>2</strong><small>Native L1 · Stack Bowls</small></article>
        <article><span>正式 baseline</span><strong>{formalRuns.length}</strong><small>VLM 1 · VLA 1 · WAM 1 · ACWM 2</small></article>
        <article><span>数据浏览任务</span><strong>3</strong><small>每项 5 个 protocol cohort</small></article>
        <article><span>Pearson 分析</span><strong>{pearsonMatrixDashboardBundle.panels.length}</strong><small>按模型独立统计</small></article>
      </section>

      <section className="band progressSection">
        <header className="progressSectionTitle">
          <div><h2>已发布正式结果</h2><p>这些结果来自版本化文件与受校验 exporter，可进入模型比较。</p></div>
          <span>{formalRuns.length} / {formalRuns.length} 可追溯</span>
        </header>
        <div className="progressTableWrap">
          <table className="progressTable">
            <thead><tr><th>模型</th><th>类型</th><th>任务与证据</th><th>当前主结果</th><th>结果版本</th></tr></thead>
            <tbody>{formalRuns.map((run) => <tr key={run.model}>
              <td><strong>{run.model}</strong></td>
              <td><span className="familyTag">{run.family}</span></td>
              <td><code>{run.task}</code><small>{run.evidence}</small></td>
              <td><strong className="formalResult">{run.result}</strong></td>
              <td><small className="versionText">{run.version}</small></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="band progressSection">
        <header className="progressSectionTitle">
          <div><h2>实验流水线</h2><p>按证据成熟度排列；smoke 通过不等于正式指标已经发布。</p></div>
        </header>
        <div className="pipelineList">
          {pipelineRows.map((row) => {
            const meta = stageMeta[row.tone];
            const Icon = meta.icon;
            return <article key={row.title} className={`pipelineRow ${row.tone}`}>
              <div className="pipelineTrack">{row.track}</div>
              <div className="pipelineBody"><strong>{row.title}</strong><span>{row.scope}</span><p>{row.evidence}</p></div>
              <div className="pipelineNext"><span>下一步</span><p>{row.next}</p></div>
              <div className="pipelineStatus"><Icon size={15}/><span>{meta.label}</span></div>
            </article>;
          })}
        </div>
      </section>

      <section className="claimBoundary band">
        <div><strong>现在可以说</strong><p>Native L1 Pilot 已发布 {qwenVl.completed} 个确定性指标；Stack Bowls 上 Pi0.5 的闭环成功率为 {pi05.values.TSR.primary}，FastWAM 为 {fastWam.values.TSR.primary}；两套 ACWM 已有 100-sample 的视频预测指标。</p></div>
        <div><strong>现在不能说</strong><p>L1 的 Judge-dependent Object / Spatial 得分、跨任务统一排名、鲁棒性正式结论，以及 ACWM 指标能预测闭环成功。</p></div>
      </section>
    </div>
  );
}
