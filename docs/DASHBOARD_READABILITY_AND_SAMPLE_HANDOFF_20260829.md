# UniEmbodied-Bench 看板可读性与 Metric Sample 改版 Handoff

日期：2026-08-29  
状态：已上线，正式数据、生产构建与公网链路验证通过  
固定网址：<https://unibench-dashboard.tail4ada12.ts.net/>
线上版本：以 `bash ops/4090/status.sh` 显示的 `Deployed commit` 为准  

> **L1 后续更新（2026-08-29）**：本 handoff 中关于“L1 scorer 尚未冻结”的
> 描述是改版当时的历史状态。Native L1 Pilot 的 12 个确定性指标现已上线；177 条
> Judge-dependent 题保持 pending。当前合同与结果见
> [VLM_L1_PILOT_DASHBOARD_HANDOFF_20260829.md](VLM_L1_PILOT_DASHBOARD_HANDOFF_20260829.md)。

## 1. 这次解决了什么

本轮不增加新的模型结论，重点解决两个问题：

1. 总览信息过密，用户进入页面后不清楚“当前已经证明了什么”和“哪些仍缺证据”。
2. Metric 详情以定义文字为主，VLA/WAM 指标没有真实 episode、视频和逐步计算过程；从 Metrics Registry 打开时还可能因模型上下文缺失而没有 sample。

改版后的阅读顺序是：

1. 总览先展示当前正式范围和四条最重要结论。
2. 点击任意 metric 后，默认进入“样例计算”。
3. 先看同一 seed 的真实视频和单条结果，再看四步计算。
4. 需要时切到“定义与公式”或“来源与边界”。
5. 在详情页直接切换适用 baseline，不需要关闭后重新寻找。

## 2. 用户可见变化

### 2.1 总览

新增 “READ THIS FIRST / 先知道我们已经证明了什么” 区域：

- L4：直接显示 Pi0.5 与 FastWAM 在 Stack Bowls 冻结 cohort 上的任务成功率差异。
- L2：说明已发布 20 条 VLA/WAM 真实视频样例，每个 baseline 10 条。
- L3：说明两条 ACWM baseline 当前各有 8/10 个正式指标。
- L1：当前展示 Native L1 Pilot 的 12 个确定性指标；Judge-dependent 题明确 pending。
- Evidence gap：FastWAM 当前 cohort 仍没有 prediction-only 视频。

这些卡片均可直接打开对应 metric 的真实样例，而不是只有静态说明。

### 2.2 Metric 详情

详情页改为三个页签：

- **样例计算**：默认页；真实视频、seed、outcome、单条数值、四步计算。
- **定义与公式**：指标定义、官方公式、输入、统计方向、聚合口径。
- **来源与边界**：论文/benchmark 来源、来源性质、最少 GT、解释边界和缺失状态。

上方增加模型切换：

- VLA/WAM action、outcome、diagnostic：Pi0.5 / FastWAM。
- WAM prediction-only：FastWAM。
- ACWM：Cosmos Predict 2.5 / CtrlWorld。

Metrics Registry 不再使用虚拟的 `Metrics Registry` 模型，而会自动选择适用 baseline。

## 3. Sample 覆盖

### 3.1 VLA / WAM

Pi0.5 与 FastWAM 各发布 10 条正式 episode sample，均覆盖 success、half-success、failure。

Pi0.5 seeds：

`1, 11, 12, 14, 15, 0, 10, 210, 110, 159`

FastWAM seeds：

`12, 13, 23, 0, 11, 14, 1, 10, 15, 18`

Pi0.5 的 seed 159 和 210 包含正式 Task-Adherence event 正例；打开 TAE 时默认优先显示事件正例。

每条 sample 包含：

- Head-camera rollout 视频及 SHA-256。
- outcome、RoboDojo score、step count。
- successful duration、iterations per second、wall time。
- 左右臂 EE / joint / orientation 轨迹指标。
- task adherence、slip、environment collision、self-collision 事件。

已覆盖的 VLA/WAM 指标：

- Evidence/runtime：AC、N、IPS、WT、TMC、ROBUSTNESS。
- L2 trajectory：L/R SPARC、EE path、EE speed、JPL、OPL、TJPL、TOPL。
- L2 events：TAE、SLIP、ENV_COLL、SELF_COLL。
- L4 outcome：TSR、SR95、SCORE_DIST、SET。

其中 SR95、SCORE_DIST、N 等属于 cohort/distribution 指标。页面展示单条 episode 如何贡献到集合结果，不把集合指标伪装成独立单条分数。

### 3.2 WAM prediction-only 指标

MUSIQ、Motion、Scene、HSD、NDTW、DYN 需要模型执行前保存的纯预测未来视频。当前 FastWAM 100-seed cohort 只有执行后的 simulator observation。

页面会展示一条真实 execution rollout，明确标注为 **不合格输入反例**，并用四步资格检查解释为什么该 metric 保持 N/A。执行观测不会被拿来冒充预测视频。

### 3.3 ACWM

- episode-level metrics 继续展示真实 predicted future / ground-truth future 视频对和四步计算。
- JEPA/JEDi distribution metric 现在也展示一条代表性预测–GT 对，同时明确最终值来自正式 split 的分布距离，不构造单 episode JEPA 分数。
- INTERACT / AF 等 unavailable 情况也展示已有代表性视频，并明确缺少哪类协议输入；缺失项保持 N/A。

## 4. 数据来源与防漂移

本轮没有重新运行模型或生成新的实验结果。所有新 sample 均来自已经冻结的正式 evaluator 输出，并通过 seed 与媒体目录严格配对。

Pi0.5 evaluator source：

`/mnt/gyc_ckp/benchmark2027/experiments/evaluation/pi05/stack_bowls/pi05-stack-bowls-vla13-events100-20260817-v1/final_vla13_eval/episodes.jsonl`

SHA-256：

`77eda50fbc9b1462314faa5eaf61056e4456066cbfcbe105b23b59f7e68cf1de`

FastWAM evaluator source：

`/mnt/gyc_ckp/benchmark2027/experiments/evaluation/fastwam/stack_bowls/fastwam-stack-bowls-vla13-events100-formal-20260818-v1/final_vla13_eval/episodes.jsonl`

SHA-256：

`140beaa32b29e22441a2c7871aa90115e3d1f78cd8e91553b7eca7aab7012e8e`

媒体目录 SHA-256：

- Pi0.5：`a9a07d1ce25f9b6d754c47f671e807fa24027b3a4302185eb9d67080a327c074`
- FastWAM：`36955730f88746325ba5acccd4882e614dd6ffc0b918b08c6bb83462e682844c`

导出器会检查：

- evaluator 与媒体源哈希是否匹配。
- 每个正式 cohort 是否恰好 100 条。
- 每个模型的 10 个 sample seed 是否唯一。
- success / half-success / failure 是否均被覆盖。
- evaluator outcome、score 与媒体目录是否一致。
- 视频 URL、SHA-256 与轨迹数值是否合法。
- Pi0.5 sample 集是否包含 event positive。

## 5. 关键实现文件

数据与导出：

- `scripts/vla-wam-sample-result-registry.mjs`
- `scripts/export-vla-wam-samples.mjs`
- `app/data/generated/vla-wam-samples.json`
- `app/data/vla-wam-samples.ts`

界面：

- `app/components/vla-wam-sample-evidence.tsx`
- `app/components/vla-wam-metric-evidence.tsx`
- `app/components/acwm-metric-evidence.tsx`
- `app/dashboard-client.tsx`
- `app/metric-detail.css`
- `app/overview.css`

测试与工程约束：

- `tests/vla-wam-samples.test.mjs`
- `tests/repository-contract.test.mjs`
- `scripts/check-repository.mjs`
- `package.json`

## 6. 验证结果

已通过：

- TypeScript typecheck。
- ESLint（仅保留仓库原有两条 `<img>` 性能 warning，无 error）。
- Repository hygiene 与文件大小预算。
- 78 个静态媒体、4,500 个 episode 媒体文件校验。
- 所有正式数据 bundle 的 freshness / hash 检查。
- 31 个 unit tests。
- production build。
- rendered HTML：登录页、匿名重定向、鉴权后的 L1–L4 matrix。
- 公网登录接口与鉴权后首页均返回 HTTP 200。
- 公网页面包含新版 “READ THIS FIRST” 与真实样例入口。
- Episode 视频支持 HTTP Range；实测任意字节区间返回 HTTP 206 与正确 `Content-Range`，可拖动播放进度。
- 4090 常驻服务健康，部署记录与源码版本一致。

## 7. 明确没有做的事

- 没有修改任何正式模型分数。
- 没有重新运行 Pi0.5、FastWAM、Cosmos 或 CtrlWorld。
- 没有把 unavailable 记成 0。
- 没有用 execution observation 替代 prediction-only video。
- 没有给 distribution metric 编造单 episode 分数。
- 本次可读性改版本身没有扩大 Stack Bowls；同日后续的 Native L1 Pilot 作为独立
  VLM 协议发布，不与 Stack Bowls 合成跨层总分。

## 8. 后续建议

1. L1 确定性 scorer 已冻结并发布；下一步是接入强教师 Judge，并继续复用 immutable
   predictions，不重跑被测 VLM。
2. 后续 FastWAM rollout 必须额外保存 prediction-only artifact，才能计算 WAM L3 六项指标。
3. 增加至少两个匹配 seed/layout 的受控扰动条件，才能正式发布 ROBUSTNESS。
4. 若要进行跨任务排名，应先完成其他任务的同协议正式 cohort；不要把当前 Stack Bowls 结果外推为全局结论。
