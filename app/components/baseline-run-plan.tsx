"use client";

import { useMemo, useState } from "react";
import { baselineRunPlan, sharedEvaluationJobs, type BaselineRunStatus, type BaselineTrack } from "../data/baseline-run-plan";

const trackLabels: Record<"ALL" | BaselineTrack, string> = { ALL: "全部", T2: "T2 · ACWM", T3: "T3 · 仿真 policy", T4: "T4 · 真机 policy" };
const statusLabels: Record<BaselineRunStatus, string> = {
  running: "Running",
  succeeded: "Succeeded",
  stopped: "Manual stop",
  failed: "Failed",
  pilot: "Pilot",
  planned: "待提交",
};
const trainingCardsLabel = (value: string) => /^\d/.test(value) ? `${value} cards` : value;

export function BaselineRunPlan({ initialTrack = "ALL" }: { initialTrack?: "ALL" | BaselineTrack }) {
  const [track, setTrack] = useState<"ALL" | BaselineTrack>(initialTrack);
  const runs = useMemo(() => track === "ALL" ? baselineRunPlan : baselineRunPlan.filter((run) => run.track === track), [track]);
  const running = baselineRunPlan.filter((run) => run.status === "running" || run.status === "pilot").length;
  const planned = baselineRunPlan.filter((run) => run.status === "planned").length;

  return <section className="baselinePlan" aria-labelledby="baseline-plan-title">
    <div className="baselinePlanHeading">
      <div>
        <p className="eyebrow">RUN REGISTRY · 2026-10-29</p>
        <h2 id="baseline-plan-title">当前 baseline 训练与测评计划</h2>
        <p>AIHC 资源与状态快照。job 出现于这里表示任务已登记，不代表正式 benchmark 分数已发布。</p>
      </div>
      <div className="baselinePlanStats" aria-label="Baseline plan summary">
        <span><strong>{baselineRunPlan.length}</strong> runs</span>
        <span><strong>{running}</strong> active</span>
        <span><strong>{planned}</strong> queued</span>
      </div>
    </div>
    <div className="baselinePlanFilters" role="group" aria-label="Filter baseline runs">
      {(Object.keys(trackLabels) as Array<"ALL" | BaselineTrack>).map((item) => <button type="button" key={item} className={track === item ? "selected" : ""} aria-pressed={track === item} onClick={() => setTrack(item)}>{trackLabels[item]}</button>)}
    </div>
    <div className="baselinePlanTableWrap">
      <table className="baselinePlanTable">
        <thead><tr><th>编号</th><th>Baseline</th><th>训练 job / 卡数</th><th>测评 job / 资源</th><th>负责人</th><th>状态</th><th>说明</th></tr></thead>
        <tbody>{runs.map((run) => <tr key={run.id}>
          <td><b>{run.id}</b><small>{run.track}</small></td>
          <td><strong>{run.baseline}</strong></td>
          <td><code>{run.trainingJob}</code><small>{trainingCardsLabel(run.trainingCards)}</small></td>
          <td><code>{run.evaluationJob}</code><small>{run.evaluationCards}</small></td>
          <td>{run.owner}</td>
          <td><span className={`baselineStatus ${run.status}`}>{statusLabels[run.status]}</span></td>
          <td className="baselineNote">{run.note}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="baselinePlanFootnotes">
      {sharedEvaluationJobs.map((item) => <p key={item.job}><strong>最近评测：</strong><code>{item.job}</code> · {item.cards} card{item.cards === "1" ? "" : "s"} · {item.note}</p>)}
      <p><strong>统一仿真口径：</strong>A800 / RTX 4090，DLSS Off、TAA On、64 spp；A800 为正式口径，4090 用于同 renderer、同 seed 复核。</p>
      <p><strong>64 卡排期：</strong>当前共 24 个 baseline；已有资源参数覆盖 23 个，EnerVerse-AC 待确认。A800 理论资源下界约 19.0–24.6 天；按 8 卡槽滚动并计入计划缓冲，建议预留 24–33 天。</p>
      <p><strong>真机约束：</strong>T4 每个 baseline 必须从各自 base / pretrained 独立训练；robot station-hours、reset 和人工接管不折算为 GPUh。</p>
    </div>
  </section>;
}
