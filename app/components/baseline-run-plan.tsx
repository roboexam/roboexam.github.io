"use client";

import { useMemo, useState } from "react";
import { baselineRunPlan, sharedEvaluationJobs, type BaselineRunStatus, type BaselineTrack } from "../data/baseline-run-plan";

const trackLabels: Record<"ALL" | BaselineTrack, string> = { ALL: "全部", T2: "T2 · ACWM", T3: "T3 · 仿真 policy", T4: "T4 · 真机 policy" };
const statusLabels: Record<BaselineRunStatus, string> = { running: "Running", failed: "Failed", pilot: "Pilot", planned: "待提交" };

export function BaselineRunPlan({ initialTrack = "ALL" }: { initialTrack?: "ALL" | BaselineTrack }) {
  const [track, setTrack] = useState<"ALL" | BaselineTrack>(initialTrack);
  const runs = useMemo(() => track === "ALL" ? baselineRunPlan : baselineRunPlan.filter((run) => run.track === track), [track]);
  const running = baselineRunPlan.filter((run) => run.status === "running" || run.status === "pilot").length;
  const planned = baselineRunPlan.filter((run) => run.status === "planned").length;

  return <section className="baselinePlan" aria-labelledby="baseline-plan-title">
    <div className="baselinePlanHeading">
      <div>
        <p className="eyebrow">RUN REGISTRY · 2026-10-27</p>
        <h2 id="baseline-plan-title">当前 baseline 训练与测评计划</h2>
        <p>执行计划和 AIHC 资源快照。job 出现于这里表示任务已登记或正在运行，不代表正式 benchmark 分数已发布。</p>
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
          <td><code>{run.trainingJob}</code><small>{run.trainingCards} cards</small></td>
          <td><code>{run.evaluationJob}</code><small>{run.evaluationCards}</small></td>
          <td>{run.owner}</td>
          <td><span className={`baselineStatus ${run.status}`}>{statusLabels[run.status]}</span></td>
          <td className="baselineNote">{run.note}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="baselinePlanFootnotes">
      {sharedEvaluationJobs.map((item) => <p key={item.job}><strong>共享评测：</strong><code>{item.job}</code> · {item.cards} cards · {item.note}</p>)}
      <p><strong>统一仿真口径：</strong>A800 / RTX 4090，DLSS Off、TAA On、64 spp；A800 为正式口径，4090 用于同 renderer、同 seed 复核。</p>
      <p><strong>64 卡排期：</strong>训练 + T2/T3 A800 评测的理论聚合下界约 19.0–24.6 天；考虑 8 卡槽、排队、数据转换和重跑，建议预留 28–32 天。严格按 T2→T3→T4 串行建议预留 40–42 天。</p>
      <p><strong>真机约束：</strong>T4 每个 baseline 必须从各自 base / pretrained 独立训练；robot station-hours、reset 和人工接管不折算为 GPUh。</p>
    </div>
  </section>;
}
