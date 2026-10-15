# ACWM 看板前端数据缺失与错误归属问题：极限完整 Handoff

更新时间：2026-08-11  
适用模型：Cosmos Predict 2.5、CtrlWorld  
适用任务：RoboDojo `stack_bowls`，100 条 open-loop prediction，heldout-73 为主报告 split  
本轮操作边界：只读检查线上看板、看板源码、正式结果 JSON 和固定版本 evaluator；未修改远程代码、结果、任务或服务。

## 0. 交接结论

看板中 ACWM metric 详情显示没有单 episode 结果，主要不是 evaluator 不能计算，而是看板没有读取正式结果文件中的 `per_episode` 数据。

当前问题由三部分组成：

1. ACWM 模型汇总值在前端组件中静态硬编码，未从正式结果 JSON 加载。
2. ACWM metric 详情错误复用 Pi0.5 VLA 的固定 episode 示例组件，因此 MSE、IQ、TA 等键查不到后统一显示 N/A。
3. CtrlWorld 看板使用旧的 `5/10` 快照；正式最新结果已经是 `9/10`。

需要特别区分：

- 7 项指标已经在两个模型的结果文件中保存了 100 条逐 episode 数值，不需要重跑。
- CtrlWorld Interaction Quality 也已有 100 条逐 episode 结果。
- JEPA/JEDi 本身是集合级指标，不应伪造单 episode 值。
- Action Following 需要同一初始状态下的三 action 视频组，当前数据确实不满足协议。
- Cosmos Interaction Quality 尚未运行，这一项不是前端漏展示。

## 1. 用户可见现象

线上看板：

```text
https://benchmark2027-dashboard.yichen013.chatgpt.site/
```

复现步骤：

1. 登录看板。
2. 在 ACWM 模型中选择 `Cosmos Predict 2.5`。
3. 点击 `MSE` 卡片。
4. 汇总区域显示 Cosmos MSE `0.00638585`，但下方 `EPISODE SAMPLE` 显示：

```text
Pi0.5 · organize_table · seed 12 · half-success · 1000 control steps
N/A
该任务尚无此指标的可计算证据
```

该 episode 属于 Pi0.5 VLA，不属于 Cosmos，也不是 ACWM prediction。这里的 N/A 只说明前端固定示例字典没有 `MSE` 键，不能作为 evaluator 缺失证据。

CtrlWorld 页面还存在另一个现象：

```text
看板：5 / 10
正式最新结果：9 / 10
```

看板把 IQ、MS、JEPA、Interaction 错误显示为未运行。

## 2. 正确的数据链路

正常架构应是：

```text
Evaluator
  计算逐 episode 和 split aggregate
        ↓
Versioned result JSON
  保存 schema、provenance、per_episode、groups
        ↓
Dashboard server/data adapter
  校验 schema 并按 model/group/metric/sample_id 读取
        ↓
Dashboard UI
  展示 aggregate、分布和真实 episode 明细
```

当前实现实际是：

```text
Evaluator → 正式 JSON（正常，已有 per_episode）

前端 acwmModelResults 静态对象 → aggregate 卡片
前端 Pi0.5 静态 MetricSample → episode 详情
```

正式 JSON 与看板之间没有数据读取链路。

## 3. 源码根因

看板核心文件：

```text
/mnt/gyc/benchmark2027/dashboard/app/dashboard-client.tsx
```

本地只读副本：

```text
D:\Wu_Project\acwm_metrics_audit\dashboard\dashboard-client.tsx
```

### 3.1 汇总值硬编码

第 125-131 行定义：

```tsx
const acwmModelResults = {
  "Cosmos Predict 2.5": {
    status: "PASS",
    completed: "8 / 10",
    values: { ... }
  },
  CtrlWorld: {
    status: "PARTIAL PASS",
    completed: "5 / 10",
    values: { ... }
  }
};
```

源码没有：

```text
fetch(...)
aggregate_metrics.json
first_stage_metrics.json
per_episode
```

因此看板展示的是源文件发布时的快照，不会随正式结果更新。

### 3.2 详情组件只收到 aggregate

第 250 行调用 `MetricDetail` 时，仅传入：

```tsx
resultOverride={acwmModelResults[model].values[detail]}
```

没有传入：

```text
result root
group
episode list
sample_id
per-episode metric record
```

所以详情页最多知道当前模型的一个汇总数字。

### 3.3 ACWM 错误复用 VLA 样例

第 285 行无条件调用：

```tsx
<MetricSample id={id} />
```

没有传入当前 `model`。第 291-299 行的 `MetricSample` 又固定使用：

```tsx
Pi0.5 · organize_table · seed 12
Pi0.5 · stack_bowls · success_001
```

这使 ACWM、VLA 和不同任务的数据混在同一个详情组件中。

### 3.4 静态样例字典没有 ACWM metric

`sampleMetricData` 与 `stackBowlsSampleData` 主要定义 TSR、MCR、RACPR 等 VLA 指标，没有：

```text
MSE
M-MSE
PSNR
SSIM
JEPA
IQ
MS
TA
INTERACT
AF
```

组件使用：

```tsx
sample?.result ?? "N/A"
```

因此点击任意 ACWM metric 时，静态字典查询返回 `undefined`，页面必然显示 N/A。

### 3.5 CtrlWorld 使用旧快照

第 129-130 行仅硬编码：

```text
MSE、M-MSE、PSNR、SSIM、TA
```

于是页面显示 `5/10`。但正式结果已经增加：

```text
JEPA、Image Quality、Motion Smoothness、Interaction Quality
```

正式状态应为 `9/10`。

## 4. 正式结果证据

### 4.1 Cosmos Predict 2.5

```text
/mnt/gyc_ckp/benchmark2027/experiments/wm/evaluation/cosmos_predict2_5_2b/stack_bowls_corrected_v2/metrics_official8_stageb2000_20260810T050325Z/summary/official8_metrics.json
```

该文件包含：

```text
status = PASS
per_episode count = 100
primary_group = heldout73
secondary_group = all100
deferred = interaction_quality, action_following
```

每条 `per_episode` 已有：

```text
mse
masked_mse
psnr
ssim
image_quality
motion_smoothness
trajectory_accuracy
```

JEPA 位于 `groups.heldout73.metrics` 和 `groups.all100.metrics`，不在 `per_episode` 中，这是正确设计。

### 4.2 CtrlWorld

主结果：

```text
/mnt/gyc_ckp/benchmark2027/ctrlworld/stack_bowls_corrected_v2/ACWM-wjx-ctrlworld-stackbowls-official8-success100-20260810/aggregate_metrics.json
```

同样包含 100 条逐 episode 的 7 项指标。

Interaction：

```text
/mnt/gyc_ckp/benchmark2027/ctrlworld/stack_bowls_corrected_v2/ACWM-wjx-ctrlworld-stackbowls-official8-success100-20260810/metrics/worldarena_interaction_quality/full100/results.json
```

包含 100 条逐 episode 记录，每条保存：

```text
sample_id
episode
video
instruction
sampled_frame_count
Interaction_Quality score / score_normalized / reason
Perspectivity score / score_normalized / reason
Instruction_Following score / score_normalized / reason
error
```

AF 输入审计：

```text
/mnt/gyc_ckp/benchmark2027/ctrlworld/stack_bowls_corrected_v2/ACWM-wjx-ctrlworld-stackbowls-official8-success100-20260810/metrics/worldarena_action_following/status.json
```

内容明确指出：

```text
episode_count = 100
distinct_initial_frame_count = 100
eligible_initial_frame_group_count = 0
status = NOT_RUN_INPUT_MISSING
```

## 5. 当前真实完成度

| 模型 | 看板显示 | 正式结果 | 可逐 episode 展示 | 不能或尚未展示 |
|---|---:|---:|---|---|
| Cosmos Predict 2.5 | 8/10 | 8/10 | MSE、M-MSE、PSNR、SSIM、IQ、MS、TA（Trajectory Accuracy） | JEPA 集合级；Interaction 未运行；AF 输入不足 |
| CtrlWorld | 5/10 | 9/10 | MSE、M-MSE、PSNR、SSIM、IQ、MS、TA（Trajectory Accuracy）、Interaction | JEPA 集合级；AF 输入不足 |

## 6. 影响范围

### 6.1 直接影响

- 用户会把“前端没有样例数据”误判为“metric 无法逐 episode 计算”。
- CtrlWorld 完成度被低报为 5/10。
- IQ、MS、TA 等无法查看分布、异常值和对应视频。
- 详情页把 Pi0.5、Cosmos、CtrlWorld 和两个任务混在一起，证据归属错误。

### 6.2 不受影响的部分

- evaluator 已生成的正式结果不受影响。
- 两个模型的 aggregate 数值文件仍然有效。
- Cosmos 看板当前显示的 8 项 aggregate 与正式结果一致。
- CtrlWorld 已完成的 9 项结果不需要因为看板问题重算。

## 7. 推荐修复设计

本轮未执行以下修改，仅作为后续实现建议。

### 7.1 建立只读结果 registry

不要在前端写死绝对数值。为每个模型登记：

```json
{
  "model_id": "ctrlworld",
  "display_name": "CtrlWorld",
  "result_root": "/mnt/.../ACWM-wjx-ctrlworld-stackbowls-official8-success100-20260810",
  "summary": "first_stage_metrics.json",
  "aggregate": "aggregate_metrics.json",
  "interaction": "metrics/worldarena_interaction_quality/full100/results.json",
  "action_following": "metrics/worldarena_action_following/status.json"
}
```

路径应由服务端白名单配置，不接受客户端任意路径。

### 7.2 建立统一 metric data contract

建议 API 返回：

```json
{
  "model": "CtrlWorld",
  "metric": "mse",
  "granularity": "episode",
  "primary_group": "heldout73",
  "aggregate": 0.010758618026818724,
  "sample_count": 73,
  "per_episode": [
    {
      "sample_id": "stack_bowls_001",
      "episode": "success/...",
      "value": 0.0071999491192400455,
      "video": "/api/media/..."
    }
  ],
  "source": {
    "schema_version": "...",
    "result_file": "...",
    "created_utc": "..."
  }
}
```

JEPA 应返回：

```json
{
  "granularity": "distribution",
  "per_episode": null,
  "groups": {
    "heldout73": {"sample_count": 73, "value": 0.40164},
    "all100": {"sample_count": 100, "value": 0.39583}
  }
}
```

AF 应返回：

```json
{
  "granularity": "counterfactual_group",
  "status": "INPUT_MISSING",
  "required_group_size": 3,
  "eligible_group_count": 0
}
```

### 7.3 拆分详情组件

不要继续让所有 metric 共用一个固定 `MetricSample`。

建议按粒度拆成：

```text
EpisodeMetricDetail
DistributionMetricDetail
CounterfactualGroupMetricDetail
MissingMetricDetail
```

其中：

- Episode：显示排序、筛选、分布、真实视频和 sample_id。
- Distribution：显示 group、样本数、distance 和 similarity，不显示虚假 episode。
- Counterfactual group：显示初始帧、三 action、三视频与三对距离。
- Missing：显示缺失输入和补数据要求，不把 N/A 当 0。

### 7.4 正确关联 Interaction

Interaction 位于独立文件，需要按 `sample_id` 与主 aggregate 的 episode join。必须保留：

```text
raw 1-5 score
normalized score
reason
judge model
prompt hash
sampled frame count
error
```

不能只取均值后丢弃 judge 证据。

## 8. 修复实施顺序

1. 建立 model result registry，并校验文件存在与 schema。
2. 服务端读取 aggregate 和 per_episode，禁止前端直接访问任意服务器路径。
3. 更新 CtrlWorld headline 为正式 `9/10`。
4. 先接入 7 项通用 episode metric。
5. 单独接入 CtrlWorld Interaction。
6. 为 JEPA 实现 distribution detail。
7. 为 AF 实现 `INPUT_MISSING` / group detail 状态。
8. 删除 ACWM 页面里的 Pi0.5 `MetricSample` 复用。
9. 增加 schema、样本数、数值和证据归属测试。

## 9. 验收标准

### 9.1 数据正确性

- Cosmos、CtrlWorld 的 episode metric 各读取 100 个 distinct `sample_id`。
- heldout-73 筛选后严格为 73 条。
- 页面 aggregate 与正式 JSON 在设定精度内一致。
- CtrlWorld 显示 9/10，Interaction heldout-73 显示 `0.6410958904`。
- JEPA 不出现 episode table。
- AF 不显示 0 分，明确显示 `INPUT_MISSING` 和 `eligible_group_count=0`。

### 9.2 证据归属

- 选择 Cosmos 后，详情不得出现 Pi0.5 或 CtrlWorld 视频。
- 选择 CtrlWorld 后，episode 视频、sample_id 和 metric record 必须来自同一 result root。
- 切换 metric 不得保留上一模型或上一任务的样例。

### 9.3 回归测试

- MSE 点击后可以选择 `stack_bowls_001` 并显示其真实单条值。
- IQ、MS、TA 同样可按 sample_id 查看。
- Interaction 可显示原始 judge reason。
- 浏览器刷新后数据仍来自 registry，而不是客户端静态状态。
- 结果文件更新时无需修改 TSX 中的数字。

## 10. 不应采取的处理

- 不要为了让页面不显示 N/A 而重新跑已经完成的 7 项 metric。
- 不要给 JEPA 人工构造 per-episode cosine distance并继续叫 JEPA/JEDi。
- 不要把单条 AF 或无 pair 的 AF 记为 0。
- 不要用 CtrlWorld 的 zero/swapped action 诊断冒充官方三 action AF。
- 不要把 Interaction、TA、IQ 等不同量纲直接求和成无定义综合分。
- 不要只更新硬编码数字而不建立结果读取链路，否则下一轮仍会过期。

## 11. 相关代码和结果索引

看板：

```text
/mnt/gyc/benchmark2027/dashboard/app/dashboard-client.tsx
/mnt/gyc/benchmark2027/dashboard/app/page.tsx
```

指标适配代码：

```text
/mnt/gyc/benchmark2027/wm/scripts/evaluation/cosmos_predict2_5_2b/metrics/run_acwm_phys_metrics.py
/mnt/gyc/benchmark2027/wm/scripts/evaluation/cosmos_predict2_5_2b/metrics/merge_worldarena_perceptual.py
/mnt/gyc/benchmark2027/wm/scripts/evaluation/cosmos_predict2_5_2b/metrics/run_worldarena_jedi.py
/mnt/gyc/benchmark2027/wm/scripts/evaluation/cosmos_predict2_5_2b/metrics/compute_worldarena_trajectory_metrics.py
/mnt/gyc/benchmark2027/wm/scripts/evaluation/cosmos_predict2_5_2b/metrics/summarize_acwm_metrics.py
/mnt/gyc/benchmark2027/SongZhimo/ctrlworld_stack_bowls_acwm/run_worldarena_interaction_quality_shard.py
/mnt/gyc/benchmark2027/SongZhimo/ctrlworld_stack_bowls_acwm/merge_worldarena_interaction_quality.py
```

固定上游版本：

```text
ACWM-Phys: 9a5ce2babb18ba42c83b56dc5b70fef7e4ca4b0c
WorldArena: 2da2ae253b8637ba9de3afc7bea4e087f778ee4d
```

## 12. 接手人最短操作清单

```text
[ ] 先读 CtrlWorld first_stage_metrics.json，确认当前 9/10
[ ] 检查两套 aggregate_metrics/official8_metrics 的 per_episode=100
[ ] 建立只读 registry 和服务端 schema parser
[ ] 删除 ACWM 对 Pi0.5 MetricSample 的依赖
[ ] 接入 7 项 episode metric
[ ] 接入 CtrlWorld Interaction 的 per_episode
[ ] JEPA 按 distribution 展示
[ ] AF 按 counterfactual group 展示或明确 INPUT_MISSING
[ ] 用 heldout73=73、all100=100 做自动验收
[ ] 保留 provenance，不修改 evaluator 公式
```

---

## 13. 审计快照、源码哈希与新增高风险发现

本文结论对应 2026-08-11 的线上源码快照。审计时本地副本与远端源码哈希一致：

```text
dashboard-client.tsx
SHA256 b1c4b557c24eb8d913bc9d98a5505b81b9506e7f5934bebc8883e14d7c4798cc

page.tsx
SHA256 11a5c1f125a32567022f15ee1589866566a37bf2abea13bcc78426feafcd2879
```

后续若源码哈希改变，应重新核对本文行号和结论，不要机械照抄补丁。

### 13.1 问题严重度

| 问题 | 严重度 | 原因 |
|---|---:|---|
| ACWM 详情显示 Pi0.5 视频 | P0 | 科学证据归属错误，可能导致错误结论 |
| CtrlWorld 5/10 而正式为 9/10 | P0 | 直接低报模型评测完成度 |
| Action intervention 被写成 Action 诊断 Passed | P0 | 容易与官方 WorldArena AF 混淆 |
| MSE 等已有数据却显示无证据 | P0 | 把前端缺键误报为 evaluator 缺失 |
| aggregate、split、日期全部硬编码 | P1 | 结果更新后必然再次过期 |
| JEPA/AF 没有独立粒度组件 | P1 | 容易伪造 episode 值或把缺输入记 0 |
| 现有测试只测 starter skeleton | P1 | 当前错误不会阻止构建或部署 |

### 13.2 页面中另两个隐蔽问题

第 164 行固定显示：

```text
数据已同步 · 2026-08-10
```

但源码没有同步逻辑。该文案应由发布 manifest 的 `created_utc`、`result_version` 和 `source_sha256` 驱动，或者在永久数据链路建立前删除。

第 262 行对 ACWM 无条件显示：

```text
Action 诊断
Passed
```

CtrlWorld 的 `true > zero` / `true > swapped` 是辅助 intervention diagnostic，不是官方三 action Action Following。正确页面应同时区分：

```text
Auxiliary action intervention: PASS
Official WorldArena Action Following: INPUT_MISSING
```

### 13.3 现有测试缺口

```text
/mnt/gyc/benchmark2027/dashboard/tests/rendered-html.test.mjs
```

当前测试主要断言：

```text
Your site is taking shape
Building your site
react-loading-skeleton
```

没有覆盖模型切换、aggregate、per_episode、sample_id、视频归属、heldout73、N/A 语义或 CtrlWorld 9/10。现有测试可以保留为部署框架测试，但不能作为 benchmark 数据正确性的验收。

---

## 14. 部署架构约束：不能只在 React 里加 fetch

看板依赖：

```text
Vinext
Vite
Wrangler
Cloudflare runtime
```

线上部署环境无法直接挂载评测服务器的：

```text
/mnt/gyc_ckp
```

因此下面的“修复”不可行：

```tsx
fetch("/mnt/gyc_ckp/.../aggregate_metrics.json")
```

永久修复必须建立一个数据发布层。

### 14.1 推荐：构建前只读 exporter

```text
/mnt/gyc_ckp 正式结果
  ↓ 白名单 registry
server-side exporter
  ↓ schema validation / join / path sanitization
public/generated/acwm/index.json
public/generated/acwm/cosmos_predict_2_5/summary.json
public/generated/acwm/cosmos_predict_2_5/episodes-000.json
public/generated/acwm/ctrlworld/summary.json
public/generated/acwm/ctrlworld/episodes-000.json
public/generated/acwm/ctrlworld/interaction-000.json
  ↓ vinext build/deploy
browser fetches /generated/acwm/index.json
```

优点：

- 线上不需要访问 `/mnt`。
- 数据版本和源码版本可复现。
- 可以在 CI 中拒绝 schema 错误、缺样本和错误 join。
- 前端保持只读。

视频较大时应发布到对象存储/CDN，通过受控 URL 映射引用，不应把服务器绝对路径直接暴露给浏览器。

### 14.2 可选：受认证 Result API

如果需要实时更新，可建立 API：

```text
browser → authenticated benchmark API → server-side registry → /mnt results
```

安全约束：

```text
客户端只能传 model_id / metric_id / sample_id
客户端不能传任意 filesystem path
result root 只能来自服务端白名单
所有输入先做 schema/version 校验
媒体必须通过固定映射或授权 URL
```

### 14.3 不推荐：继续手工同步数字

只更新 `acwmModelResults` 可以临时修正截图，但不能解决：

- 下一轮结果再次过期。
- 逐 episode 数据缺失。
- Interaction join。
- JEPA/AF 粒度语义。
- 视频和模型证据串线。
- 数据 freshness 和 provenance。

---

## 15. 十项 Metric 的真实数据粒度与展示组件

| UI ID | 正式字段 | 正式粒度 | Cosmos | CtrlWorld | 正确详情组件 |
|---|---|---|---|---|---|
| MSE | `mse` | episode / split | 100 条 | 100 条 | EpisodeMetricDetail |
| M-MSE | `masked_mse` | episode / split | 100 条 | 100 条 | EpisodeMetricDetail |
| PSNR | `psnr` | episode / split | 100 条 | 100 条 | EpisodeMetricDetail |
| SSIM | `ssim` | episode / split | 100 条 | 100 条 | EpisodeMetricDetail |
| JEPA | `jepa_similarity` | distribution / group | heldout73 + all100 | heldout73 + all100 | DistributionMetricDetail |
| IQ | `image_quality` | episode / split | 100 条 | 100 条 | EpisodeMetricDetail |
| MS | `motion_smoothness` | episode / split | 100 条 | 100 条 | EpisodeMetricDetail |
| TA | `trajectory_accuracy` | episode / split | 100 条 | 100 条 | EpisodeMetricDetail |
| INTERACT | `interaction_quality` | judge episode / split | NOT_RUN | 100 条 | JudgeEpisodeMetricDetail |
| AF | `action_following` | counterfactual group | 0 合格组 | 0 合格组 | CounterfactualGroupDetail / MissingMetricDetail |

### 15.1 主结果 schema

Cosmos 与 CtrlWorld 主结果均包含：

```text
composite_score
deferred
groups
metric_definitions
per_episode
primary_group
schema_version
secondary_group
source_artifacts
status
video_protocol
```

两者的 `per_episode` 都严格为 100 条，每条包含：

```text
episode
heldout73
image_quality
masked_mse
motion_smoothness
mse
psnr
sample_id
ssim
training_membership
trajectory_accuracy
```

### 15.2 Interaction schema

CtrlWorld Interaction 结果为 100 条，每条包含：

```text
sample_id
episode
heldout73
training_membership
video
video_sha256
instruction
sampled_frame_count
metrics
error
```

`metrics.Interaction_Quality` 必须保留：

```text
score
score_normalized
reason
```

前端不能只复制 aggregate 而丢掉 judge reason 和视频 hash。

### 15.3 合法 N/A 与前端 bug

| 场景 | 正确显示 | 判定 |
|---|---|---|
| Cosmos MSE episode 为 N/A | 100 条 episode | 前端 bug |
| CtrlWorld IQ/MS/TA 为 N/A | 100 条 episode | 前端 bug |
| CtrlWorld Interaction 为 N/A | 100 条 judge 记录 | 前端 bug |
| CtrlWorld 为 5/10 | 9/10 | 静态数据 bug |
| JEPA 没有 episode table | group/distribution 详情 | 合法 |
| Cosmos Interaction 无值 | NOT_RUN | 合法 |
| AF 无单 episode 值 | INPUT_MISSING、0 eligible groups | 合法 |
| AF 显示 0 | value=null | 语义 bug |
| ACWM 显示 Pi0.5 视频 | 对应 ACWM prediction | P0 证据归属 bug |

---

## 16. Result Registry 设计

registry 必须存在于 exporter/API 的服务端侧，而不是允许浏览器指定绝对路径。

```ts
type AcwmModelRegistryEntry = {
  modelId: "cosmos_predict_2_5" | "ctrlworld";
  displayName: string;
  task: "stack_bowls";
  resultVersion: string;
  resultRoot: string;
  aggregateFile: string;
  firstStageFile?: string;
  interactionFile?: string;
  actionFollowingStatusFile?: string;
  mediaRoot: string;
};
```

CtrlWorld 示例：

```json
{
  "modelId": "ctrlworld",
  "displayName": "CtrlWorld",
  "task": "stack_bowls",
  "resultVersion": "official8-success100-20260810",
  "resultRoot": "/mnt/gyc_ckp/.../ACWM-wjx-ctrlworld-stackbowls-official8-success100-20260810",
  "aggregateFile": "aggregate_metrics.json",
  "firstStageFile": "first_stage_metrics.json",
  "interactionFile": "metrics/worldarena_interaction_quality/full100/results.json",
  "actionFollowingStatusFile": "metrics/worldarena_action_following/status.json",
  "mediaRoot": "inputs/aligned_videos/pred"
}
```

发布给浏览器的 manifest 应去除服务器绝对路径，保留稳定 ID、版本、hash 和受控媒体 URL。

---

## 17. 统一 Typed Data Contract

### 17.1 availability 与 granularity

```ts
type MetricAvailability =
  | "available"
  | "not_run"
  | "input_missing"
  | "evaluator_failed"
  | "partial"
  | "unsupported";

type MetricGranularity =
  | "episode"
  | "distribution"
  | "judge_episode"
  | "counterfactual_group";
```

### 17.2 通用结果

```ts
type MetricResult = {
  modelId: string;
  modelDisplayName: string;
  task: string;
  metricId: string;
  metricField: string;
  direction: "higher" | "lower";
  unit: string;
  granularity: MetricGranularity;
  availability: MetricAvailability;
  nAReason: string | null;
  primaryGroup: "heldout73";
  secondaryGroup: "all100";
  groups: Record<string, {
    sampleCount: number;
    value: number | null;
  }>;
  provenance: {
    schemaVersion: string;
    resultVersion: string;
    sourceFileId: string;
    sourceSha256?: string;
    createdUtc?: string;
    evaluatorCommit?: string;
  };
};
```

### 17.3 Episode metric

```ts
type EpisodeMetricResult = MetricResult & {
  granularity: "episode";
  episodes: Array<{
    sampleId: string;
    episodeId: string;
    heldout73: boolean;
    trainingMembership: string;
    value: number;
    videoUrl: string | null;
    videoSha256?: string;
  }>;
};
```

### 17.4 JEPA distribution metric

```ts
type DistributionMetricResult = MetricResult & {
  granularity: "distribution";
  episodes: null;
  distributions: {
    heldout73: { sampleCount: 73; value: number };
    all100: { sampleCount: 100; value: number };
  };
};
```

不要为了复用 episode table 给 JEPA 人工构造单条值。如果另定义 per-sample embedding distance，必须改名，不能继续标成官方 JEPA/JEDi。

### 17.5 Interaction judge metric

```ts
type JudgeEpisodeMetricResult = MetricResult & {
  granularity: "judge_episode";
  episodes: Array<{
    sampleId: string;
    episodeId: string;
    heldout73: boolean;
    rawScore: number;
    normalizedScore: number;
    reason: string;
    instruction: string;
    sampledFrameCount: number;
    videoUrl: string;
    videoSha256: string;
    error: string | null;
  }>;
};
```

### 17.6 AF 缺输入状态

```ts
type CounterfactualGroupMetricResult = MetricResult & {
  granularity: "counterfactual_group";
  availability: "available" | "input_missing";
  officialRequirement: string;
  episodeCount: number;
  distinctInitialFrameCount: number;
  eligibleGroupCount: number;
  groups: unknown[];
  excludedSubstitutes: string[];
};
```

当前必须是：

```json
{
  "availability": "input_missing",
  "eligibleGroupCount": 0,
  "value": null
}
```

不能是：

```json
{
  "availability": "available",
  "value": 0
}
```

---

## 18. 前端组件拆分

不要继续让所有模型和所有粒度共用一个固定 `MetricSample`。

建议组件树：

```text
MetricDetailDrawer
├── MetricSummary
├── MetricProvenance
├── EpisodeMetricDetail
├── DistributionMetricDetail
├── JudgeEpisodeMetricDetail
├── CounterfactualGroupMetricDetail
└── MissingMetricDetail
```

### 18.1 EpisodeMetricDetail

用于 MSE、M-MSE、PSNR、SSIM、IQ、MS、TA：

- heldout73/all100 切换。
- sample_id 搜索。
- training membership 筛选。
- 数值排序与分布。
- aggregate、样本数、方向和单位。
- prediction/GT 或 prediction 视频。
- episode ID、result version、video hash。

### 18.2 DistributionMetricDetail

用于 JEPA：

- 显示 heldout73 与 all100 group value。
- 显示 sample count 和 evaluator version。
- 明确标记 `distribution-level`。
- 不渲染 episode table。

### 18.3 JudgeEpisodeMetricDetail

用于 Interaction：

- raw 1-5 score。
- normalized score。
- judge reason。
- instruction、采样帧数、judge model/source hash。
- 单条 error 状态。

### 18.4 CounterfactualGroupMetricDetail

用于 AF：

- 同一 initial frame。
- 三条 action 序列摘要。
- 三条 prediction 视频。
- group/pairwise 计算证据。
- 输入不足时进入 MissingMetricDetail，不渲染空表。

### 18.5 状态隔离

组件 key 至少包含：

```text
modelId + task + resultVersion + metricId + sampleId
```

切换模型、任务或 result version 时必须重置 sample。不能保留上一模型的视频或 metric record。

---

## 19. Interaction Join 规则

主结果和 Interaction 是两个文件，必须按：

```text
sample_id
```

join。

辅助一致性字段：

```text
episode
heldout73
training_membership
video_sha256
```

禁止：

- 按数组下标 join。
- 按文件名模糊匹配。
- 只复制 aggregate，丢弃 per_episode reason。
- 缺样本时静默忽略。

join 验收：

```text
main per_episode = 100
interaction per_episode = 100
intersection(sample_id) = 100
duplicate sample_id = 0
heldout73 joined = 73
error_count = 0
```

---

## 20. 修复实施阶段

### 20.1 阶段 A：P0 止血 Hotfix

不改变部署架构时，最少应：

1. 更新 CtrlWorld 为正式 9/10。
2. 补 IQ、MS、JEPA、Interaction aggregate。
3. ACWM 页面隐藏 Pi0.5 `MetricSample`。
4. JEPA 显示“集合级，无单 episode”。
5. AF 显示 `INPUT_MISSING`，不显示 0。
6. Cosmos Interaction 显示 `NOT_RUN`。
7. 将 Action intervention 与 official AF 分开。
8. 删除或修正静态“数据已同步”。

该阶段只能止血，不能算永久修复。

### 20.2 阶段 B：Result Exporter 与 Registry

1. 建立服务端白名单 registry。
2. 读取正式结果。
3. 校验 schema/version/sample count。
4. 按 sample_id join Interaction。
5. 转换服务器路径为安全 URL/ID。
6. 生成 normalized JSON、source manifest 和 SHA256。
7. exporter 任一步失败时中止发布。

### 20.3 阶段 C：Typed Adapter 与组件

1. 定义 TypeScript contract。
2. 接入 7 项 episode metric。
3. 接入 Interaction judge detail。
4. 为 JEPA/AF 使用独立组件。
5. 完成 model/task/version/sample 状态隔离。

### 20.4 阶段 D：测试与 Staging

1. parser/exporter unit test。
2. golden fixture test。
3. component test。
4. browser E2E。
5. staging 与正式 JSON 逐项对账。

### 20.5 阶段 E：生产发布与回滚

1. 记录数据 bundle version/hash。
2. 保留上一版本 bundle。
3. 生产发布。
4. 重新执行本文复现流程。
5. 若 schema、数值或证据归属失败，回滚整套 bundle，不回退到硬编码旧值。

---

## 21. 自动测试矩阵

### 21.1 Exporter/Parser 单元测试

```text
[ ] Cosmos per_episode count = 100
[ ] CtrlWorld per_episode count = 100
[ ] distinct sample_id = 100
[ ] heldout73 count = 73
[ ] all100 count = 100
[ ] 7 项 episode 字段全部 finite
[ ] JEPA 只在 group metrics
[ ] Interaction count = 100
[ ] Interaction error_count = 0
[ ] Interaction join intersection = 100
[ ] AF eligible group count = 0
[ ] AF status = input_missing
[ ] 不支持的 schema version 导致构建失败
[ ] 重复 sample_id 导致构建失败
[ ] aggregate 与 per_episode 重算不一致时失败或告警
```

### 21.2 组件测试

```text
[ ] Cosmos + MSE 显示 Cosmos sample_id 和值
[ ] CtrlWorld + MSE 不保留 Cosmos sample
[ ] CtrlWorld + Interaction 显示 raw score 和 reason
[ ] JEPA 不渲染 episode table
[ ] AF 显示 INPUT_MISSING 与 eligible_group_count=0
[ ] Cosmos Interaction 显示 NOT_RUN
[ ] 任一 ACWM metric 不出现 Pi0.5
[ ] N/A 不自动转为 0
[ ] MS/TA 不格式化为百分比
[ ] heldout73/all100 切换后样本数和值正确
```

### 21.3 E2E 测试

```text
[ ] CtrlWorld headline = 9 / 10
[ ] Cosmos headline = 8 / 10
[ ] CtrlWorld Interaction heldout73 = 0.6410958904
[ ] Cosmos MSE heldout73 = 0.0063858469
[ ] CtrlWorld MSE heldout73 = 0.0107586180
[ ] sample_id stack_bowls_001 可搜索并打开
[ ] 页面刷新后仍从发布 JSON 读取
[ ] 模型切换不会发生视频或数值串线
[ ] 发布 bundle 缺文件时明确报错，不回退硬编码值
```

### 21.4 负向测试

```text
[ ] per_episode 少一条时拒绝 PASS
[ ] heldout73 不是 73 时拒绝发布
[ ] Interaction 出现未知 sample_id 时拒绝 join
[ ] AF status=input_missing 但 value=0 时校验失败
[ ] JEPA 带伪造 episodes 时校验失败
[ ] video URL 指向未注册路径时拒绝发布
[ ] source hash 变化但 result version 不变时告警或失败
```

---

## 22. Definition of Done

### 22.1 数据正确性

- Cosmos 8/10，CtrlWorld 9/10。
- 两个模型的 7 项 episode metric 各有 100 个 distinct sample_id。
- heldout73=73，all100=100。
- 页面 aggregate 与正式 JSON 在显示精度内一致。
- CtrlWorld Interaction 有 100 条，heldout73=`0.6410958904109596`。
- JEPA 仅显示 group/distribution 详情。
- AF 显示 `INPUT_MISSING`、eligible groups 0、value null。

### 22.2 证据归属

- Cosmos 详情只使用 Cosmos result version 和 prediction。
- CtrlWorld 详情只使用 CtrlWorld result version 和 prediction。
- ACWM 详情不出现 Pi0.5、Oracle 或 organize_table 内容。
- metric、sample_id、episode、视频和 source version 来自同一 registry entry。

### 22.3 状态语义

- `not_run`、`input_missing`、`evaluator_failed`、`partial` 分开显示。
- N/A 不参与均值，不计为 0。
- Action intervention 与 official AF 分开。
- freshness 来自发布 manifest，不是手写日期。

### 22.4 可维护性

- 更新结果不需要修改 TSX 数字。
- 新模型通过 registry 和兼容 schema 接入。
- 新 metric 必须声明 granularity、direction、unit、availability 和组件类型。
- 构建失败时不会发布半套数据。

---

## 23. 风险登记表

| ID | 风险 | 触发条件 | 直接后果 | 检测方式 | 处置 |
|---|---|---|---|---|---|
| R1 | 汇总数字继续硬编码 | 新结果产生后只改 `acwmModelResults` | 首页与正式 JSON 再次漂移 | CI 搜索 ACWM 数值字面量；比对 registry | 删除生产路径硬编码，只保留测试 fixture |
| R2 | 浏览器直接读取共享盘 | 前端尝试 `fetch('/mnt/gyc_ckp/...')` | 本机可调试，部署后必然 404/权限失败 | staging 网络面板与部署构建测试 | 构建前 exporter，或受认证 API |
| R3 | 模型证据串线 | 详情组件没有 `modelId/resultVersion` | CtrlWorld 页面展示 Cosmos/VLA 样本 | E2E 切换模型并断言 provenance | 所有详情查询使用复合键 |
| R4 | N/A 被当成 0 | adapter 用 `value ?? 0` | 均值、完成度和排名被污染 | schema 负向测试 | 使用显式 availability union |
| R5 | JEPA 伪造单 episode | 为统一 UI 强拆 distribution metric | 给出方法学上不成立的证据 | metric registry granularity 校验 | 仅显示 split/group 结果 |
| R6 | AF 与 action probe 混淆 | 将 intervention passed 当作 AF 完成 | 10 项完成数被虚增 | 状态映射测试 | 两套字段、两套标签、两套证据 |
| R7 | Interaction join 错位 | 用数组下标而非 sample_id 关联 | score/reason 对到错误视频 | shuffle 输入后测试结果不变 | 强制按 sample_id join |
| R8 | split 混用 | 首页 heldout73，详情误用 all100 | 汇总无法由详情复算 | count 与 aggregate 重算 | UI 明示 split；查询键包含 split |
| R9 | 部分发布 | aggregate 已更新但 episodes/videos 未同步 | 页面显示新数字配旧证据 | manifest 完整性检查 | 原子发布版本目录，再切 current 指针 |
| R10 | 旧 bundle 缓存 | Cloudflare/Vite 缓存未刷新 | 用户看到旧 5/10 | 页面显示 manifest hash/version | 文件名内容哈希并核对线上 manifest |
| R11 | 正式结果被临时文件覆盖 | exporter 使用 glob 选中测试结果 | 看板悄然引用错误 run | allowlist + source hash | registry 显式列路径，禁用“最新文件”推断 |
| R12 | 视频与 metric 时间轴不一致 | 39 valid frames 与 42 display frames 混用 | 逐帧证据偏移或包含 padding | frame metadata 校验 | registry 保存 valid/display/padding 定义 |

风险优先级：`R3/R4/R6/R7/R9` 属于 P0 数据可信度问题；`R1/R2/R8/R10/R11/R12` 至少是 P1。任何 P0 未关闭时，不应把页面标为正式 benchmark 结果。

---

## 24. 禁止合入的“伪修复”

以下方案会暂时改变页面，但没有解决根因，禁止作为正式修复：

1. 只把 CtrlWorld 的 `5/10` 手工改成 `9/10`。
2. 给 `sampleMetricData` 补几个 ACWM 固定样例，却仍不读取正式结果。
3. 为所有 N/A 显示 `0`、`-` 或“待运行”，但不区分原因。
4. 用 Pi0.5 或 Oracle rollout 充当 ACWM prediction 的视频证据。
5. 把 action intervention 的 Passed 映射成 official AF 已完成。
6. 把 JEPA aggregate 均值复制到每一个 episode。
7. 在客户端代码里写服务器绝对路径，期待浏览器读取共享盘。
8. 用文件修改时间或文件名中的 `latest` 自动选择正式结果。
9. 允许 aggregate 与 episode 重算不一致但静默发布。
10. 把正式 JSON 复制进 TSX 常量，然后声称“已接入数据”。
11. 只补截图测试，不测试数字、模型归属、split 和 sample_id。
12. 在没有保留旧版本 manifest 的情况下覆盖线上结果。

一个修复只有同时做到“数据源可追溯、状态语义正确、详情证据同源、自动测试可阻断回归”，才算关闭本问题。

---

## 25. Metric 语义速查与前端展示约束

| Metric | 核心含义 | 方向 | 当前粒度 | 前端必须避免的误导 |
|---|---|---|---|---|
| MSE | 预测帧与配对 GT 的像素均方误差 | 越低越好 | episode | 不能脱离颜色范围/预处理版本比较 |
| M-MSE | 运动区域上的像素误差 | 越低越好 | episode | 不能写成普通 MSE；必须保留 mask 方法版本 |
| PSNR | 基于像素误差的峰值信噪比 | 越高越好 | episode | 不能当作语义或物理正确性指标 |
| SSIM | 局部结构、亮度和对比度相似性 | 越高越好 | episode | 不能等价为任务成功率 |
| JEPA | 表征空间中的分布/语义相似性 | 越高越好 | distribution/group | 当前不能声称有单 episode 值 |
| IQ | 官方图像质量评估器的感知质量 | 越高越好 | episode | 必须显示 evaluator/version，不等同于 GT fidelity |
| MS | 视频运动平滑度 | 依官方定义解释 | episode | 不能简单写“越大越好”或“越小越好”而无版本说明 |
| TA | 预测与 GT 的轨迹偏差/准确性 | 当前数值越低越好 | episode | 当前是误差型数值，标签“Accuracy 越高越好”会误导 |
| INTERACT | 官方交互质量 judge 对动作-物体交互的评分 | 越高越好 | episode + aggregate | 必须展示 reason/evaluator provenance；不是像素指标 |
| AF | 成组反事实 action 条件下的 action following | 越高越好 | counterfactual group | 当前缺 eligible groups，不能用普通 rollout 或 intervention probe 替代 |

详细公式、官方实现与能力边界以独立文档 `ACWM_METRICS_DEFINITION_AND_INTERPRETATION.md` 为准。本 handoff 只列出前端实现必须保留的语义约束。

---

## 26. 推荐 PR 拆分

### PR 1：阻断错误展示

- 标记 CtrlWorld 当前静态值为过期，或从可信静态 JSON 更新 headline。
- ACWM 详情不再渲染 Pi0.5 `MetricSample`。
- Action intervention 与 AF 分栏。
- 页面显示真实 result version，而不是手写同步日期。
- 加入最小 E2E：模型切换不串线、N/A 不变 0。

该 PR 是止血，不代表数据接入完成。

### PR 2：只读 exporter 与 manifest

- 从 allowlist 中读取正式 JSON。
- 校验 schema、样本数、distinct sample_id、split、有限值和 source hash。
- 生成带版本的前端数据 bundle 和 manifest。
- 原子发布；异常时构建失败并保留上一版本。
- 为 exporter 增加 fixture 与负向测试。

### PR 3：typed adapter 与 metric registry

- 引入 `availability`、`granularity`、`direction`、`unit`。
- 统一 aggregate/episode/distribution/judge/counterfactual schema。
- 删除生产路径 `acwmModelResults` 数字常量。
- 明确 heldout73 与 all100 查询边界。

### PR 4：详情组件与 provenance

- 实现四类详情组件。
- 所有 sample 由 `modelId + resultVersion + split + metricId + sampleId` 定位。
- Interaction 按 sample_id join，显示 score/reason。
- 展示 evaluator、source path/hash、frame protocol 与 prediction/GT 证据。

### PR 5：完整回归与上线

- 完成第 21 节矩阵。
- staging 对照正式 JSON 抽查。
- 验证 Cloudflare 发布 bundle 与 manifest hash。
- 保存回滚版本并更新维护说明。

不要把上述五类改动压进一个无法审阅的大 PR。每个 PR 都应附“输入文件、输出 schema、截图、自动测试结果、剩余已知限制”。

---

## 27. 接手人执行清单

### 27.1 开始前

```text
[ ] 从独立工作分支/worktree 开始
[ ] 记录 dashboard-client.tsx 和 page.tsx 当前 hash
[ ] 记录两模型正式 result 文件路径与 hash
[ ] 确认页面部署方式与构建命令
[ ] 明确只读，不修改任何 evaluator 输出
[ ] 备份当前线上 manifest 和 bundle
```

### 27.2 开发中

```text
[ ] 先写 schema/registry，再写 UI
[ ] 所有数据读取经过 exporter 或 API
[ ] 所有状态使用显式枚举
[ ] 所有详情查询带 model/result/split/metric/sample 复合键
[ ] 所有 join 按 sample_id
[ ] 所有 N/A 保留 reason
[ ] 所有 metric 显示 direction/unit/granularity
[ ] JEPA 和 AF 不伪造 episode 结果
```

### 27.3 提交前

```text
[ ] 运行 parser、component、E2E、negative tests
[ ] 从 per_episode 重算并核对 aggregate
[ ] 核对 Cosmos 8/10、CtrlWorld 9/10
[ ] 核对 CtrlWorld Interaction 0.6410958904 (heldout73)
[ ] 核对 AF 为 INPUT_MISSING，eligible groups=0
[ ] 全局搜索生产代码中 Pi0.5/VLA sample 被 ACWM 引用的位置
[ ] 全局搜索 ACWM headline 数字硬编码
[ ] staging 手工切换两个模型和全部十项 metric
[ ] 核对 manifest hash、source hash 与页面展示版本
```

### 27.4 发布后

```text
[ ] 清缓存后重新打开页面
[ ] 抽查至少 3 个 heldout episode 和 2 个 all100 episode
[ ] 检查浏览器控制台和网络错误
[ ] 保存发布 manifest、测试报告和截图
[ ] 更新 handoff 中的最终 commit、部署 URL 和回滚版本
```

---

## 28. 最终交接声明

本问题已经通过只读审计定位到前端数据接入与组件归属层，不是“单个 episode 无法计算 MSE”，也不是 evaluator 普遍失败。当前正式结果已经足够支持两个 ACWM 模型的 7 项逐 episode 指标；CtrlWorld 还具备逐 episode Interaction。JEPA 与 AF 的限制分别来自指标粒度和协议输入，不应与前端 bug 混为一谈。

接手人修复时应把下面这条作为唯一主线：

```text
正式结果 JSON
  -> 只读校验/export
  -> 带版本 manifest
  -> typed adapter
  -> 按 metric granularity 分流的详情组件
  -> 同源 aggregate / episode / evidence
  -> 自动测试阻断串线、过期快照和伪 N/A
```

完成第 22 节全部 Definition of Done，并通过第 21 节测试矩阵后，才能宣告 ACWM 看板问题关闭。此前任何仅改变可见数字或样例内容的提交，都只能算临时止血。

本文档是问题与修复工程的主 handoff；指标公式与解释见 `ACWM_METRICS_DEFINITION_AND_INTERPRETATION.md`，正式评测边界见 `ACWM_FIRST_STAGE_METRICS_SPECIFICATION.md`，原始审计记录见 `ACWM_METRICS_PER_EPISODE_AUDIT.md`。
