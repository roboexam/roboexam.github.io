# UniEmbodied-Bench Level 1 最小 Benchmark 端到端 Handoff

日期：2026-09-01  
状态：三任务最小链路已完成、Cosmos3-Nano 正式 retry1 已通过、解释型看板已上线  
固定看板：<https://unibench-dashboard.tail4ada12.ts.net/?section=l1-minimal>  
功能上线提交：`5c851cd19ed5265afef958bf276d75bfd5f447cb`  
Benchmark 实现分支提交：`3a99416ab199717443b2503df5b97549f91d4a9a`

> 本文面向后续接手的同事及 AI agent。它是 2026-09-01 这轮 Level 1
> 工作的完整入口。开始修改前，请先完整阅读本文、Benchmark 仓库根目录
> `AGENTS.md`、metric contract 和 retry1 PASS 报告。不要从旧 Codex rollout
> 恢复上下文；旧历史文件约 3.2 GB，本文列出的代码、immutable artifacts 和
> machine-readable records 才是可信来源。

## 0. 一页摘要

今天完成了一个真正端到端、可审计的 Level 1 最小 benchmark：

1. 固定三个差异明显的任务：Stack Bowls、Arrange Largest Number、Sort Nesting Dolls By Size。
2. 每个任务准备 success / partial-success / complete-failure 三种结果，共 9 条 Golden Episode。
3. 按四个 Level 1 能力维度物化 48 条模型样本、111 张公开输入图片。
4. 冻结每维 Top 3，共 12 项 deterministic metric。
5. 使用冻结的 Cosmos3-Nano 权重完成 48/48 条真实推理，0 parse failure、0 infrastructure failure。
6. 生成逐样本分数、四维度分数、任务分数和总 Level 1 Score。
7. 发布到固定看板，包含视频、筛选、结果图、metric 来源、选择理由和逐 episode 公式代入过程。
8. 完成生产构建、数据 freshness、媒体 hash、登录、视频 Range、样本图片与固定 URL 验证。

最终有效结果：

- Level 1 Score：`53.899444 / 100`
- Spatial Understanding：`53.580247`
- Subtask Decomposition：`88.888889`
- Progress Estimation：`41.202234`
- Failure Detection：`31.926407`

最重要的结论是：在这 9 条最小样本上，Cosmos3-Nano 的结构化任务分解明显强于失败检测；但这不是总体能力排名，也不能支持 metric 与 SR 的相关性结论。

## 1. 已冻结的产品与研究定义

### 1.1 Level 1 测的不是独立 VLM backbone

本项目正式定义的 Level 1 是：

> 一体化模型基于其联合内部表示，对场景空间、任务分解、执行进程和失败状态进行结构化理解与诊断的能力。

“VLM 能力”只是一种方便说法。不要把 Level 1 偷换成单独评测 Qwen、Cosmos 或 Motus 内部某个冻结视觉语言 backbone。

本轮 Cosmos3-Nano 有原生文本/结构化输出接口，因此直接评测冻结模型的原生回答。Motus Stage 2 仍是计划对象，但尚未进入本次正式 run；对于 Motus 这类没有原生文本出口的一体化模型，已讨论的公平方案是冻结整个模型，只训练非侵入式标准读出头，并明确标注为 readout-based Level 1，而不是“原生文本能力”。具体工程实现后续再冻结。

### 1.2 四个能力维度

1. Spatial Understanding：任务相关语义空间理解。
2. Subtask Decomposition：根据初始帧和任务指令进行子任务分割与依赖规划。
3. Progress Estimation：识别已完成步骤、离散阶段和连续进度。
4. Failure Detection：判断失败发生、失败类型和首次失败时刻。

### 1.3 统一分数层级

所有分数使用 `0–100 score`，越高越好，不使用百分号冒充 success rate。

聚合顺序固定为：

1. 每项 metric 在全部 eligible samples 上得到一个分数。
2. 同一维度内三项 metric 等权平均。
3. 四个维度等权平均得到 Level 1 Score。
4. 未来四个 Level 如何合成统一模型总分尚未在本轮实现。

Parse/model-output failure 计 0；基础设施故障必须使 run 无效，禁止静默转成 0。

## 2. 代码仓库与不可覆盖状态

### 2.1 Benchmark / experiment 仓库

- 工作树：`/mnt/gyc/benchmark2027/wm/worktrees/metrics/vlm_native_v0_2`
- 分支：`codex/motus-l1-readout-v0.1`
- 当前实现提交：`3a99416ab199717443b2503df5b97549f91d4a9a`
- metric contract：`docs/notes/L1_METRIC_CONTRACT_V0_1_20260901.md`
- scorer：`src/metrics/vlm/src/vlm_eval/l1_metrics.py`
- runner：`scripts/evaluation/l1/run_minimal_benchmark.py`
- 有效配置：`configs/evaluation/l1/l1_minimal_benchmark_20260901_retry1.json`

正式 retry1 registration 已发布到该仓库本地 `main`，发布提交为：

`1acbb9ba40f2a0366b973000c8acbedba399576f`

不要 reset、rebase 或覆盖用户已有分支。任何新正式实验必须新建 run ID 和 immutable output root，并按 `AGENTS.md` 走 preclaim、post report、registration publication 和 global strict audit。

### 2.2 Dashboard 仓库

- 共享部署 checkout：`/mnt/gyc/benchmark2027/dashboard`
- 共享分支：`main`
- 功能工作树：`/mnt/gyc/benchmark2027/dashboard-codex-l1-minimal`
- 功能分支：`codex/l1-minimal-benchmark-20260901`
- 当前功能提交：`1e18f87`，后续 handoff 文档提交可通过 `git log` 查看。
- 功能上线 merge：`5c851cd19ed5265afef958bf276d75bfd5f447cb`

共享 `main` 相对 `sites/main` 已有大量用户提交处于 ahead 状态。这是正常且必须保留的项目状态，严禁 reset、force push 或为了“同步远端”丢弃现有提交。

## 3. 三任务九条 Golden Episodes

### 3.1 任务与固定指令

| Task ID | 展示名 | 指令 |
| --- | --- | --- |
| `stack_bowls` | Stack Bowls | Stack all three bowls into one nested stack. |
| `arrange_largest_number` | Arrange Largest Number | Arrange the digit blocks to form the largest possible number. |
| `sort_nesting_dolls_by_size` | Sort Nesting Dolls By Size | Sort the nesting dolls into ascending size order from left to right. |

### 3.2 Stack Bowls Golden Triplet

- Run ID：`stack-bowls-l1-golden-seed127-branches-20260901-v1`
- Scene seed：`127`
- Summary：`/mnt/gyc_ckp/benchmark2027/experiments/data/robodojo_l1/stack_bowls/stack-bowls-l1-golden-seed127-branches-20260901-v1/golden_capture_summary.json`
- 报告：`/mnt/gyc/benchmark2027/wm/worktrees/metrics/vlm_native_v0_2/docs/experiments/STACK_BOWLS_L1_GOLDEN_SEED127_BRANCHES_V1_PASS_20260901.md`

结果：

| Branch | 完成里程碑 | 原生过程 Score | 语义 |
| --- | ---: | ---: | --- |
| success | 2/2 | 100 | 三只碗形成稳定 nested stack |
| partial-success | 1/2 | 15 | 完成一次 nesting，随后发生掉落 |
| complete-failure | 0/2 | 0 | 未完成有效 nesting |

三分支来自同一 seed、同一 scene blueprint 和同一源轨迹，公开 `cam_head` 在首次干预前使用逐帧 hash 完全一致的 canonical prefix。左右腕部相机、instance ID 和状态元数据只作 private/debug evidence，不进入模型公开输入。

这三条视频已经由用户肉眼确认清晰、稳定且标签正确，状态是 `user_accepted`。

### 3.3 Arrange 与 Dolls Golden Triplets

- Run ID：`l1-temporal-halt-golden-triplets-20260901-retry1`
- Summary：`/mnt/gyc_ckp/benchmark2027/experiments/evaluation/l1/golden_episodes/l1-temporal-halt-golden-triplets-20260901-retry1/golden_capture_summary.json`
- 配置：`/mnt/gyc/benchmark2027/wm/worktrees/metrics/vlm_native_v0_2/configs/data/l1_temporal_halt_golden_triplets_20260901_retry1.json`
- 报告：`/mnt/gyc/benchmark2027/wm/worktrees/metrics/vlm_native_v0_2/docs/experiments/L1_TEMPORAL_HALT_GOLDEN_TRIPLETS_RETRY1_PASS_20260901.md`

Arrange Largest Number：

- 来源：Pi0.5 正式 success episode，seed `120`。
- success：完整来源视频，4/4 official transitions。
- partial-success：在 `10.4 s` terminal halt，位于 transition 2 (`10.20 s`) 后，标为 2/4。
- complete-failure：在 `2.0 s` halt，早于 transition 1 (`3.16 s`)，标为 0/4。

Sort Nesting Dolls By Size：

- 来源：Pi0.5 正式 success episode，seed `26`。
- success：完整来源视频，4/4 task graph。
- partial-success：在 `18.1 s` halt；画面显示 3/4 对象已排序，最大 doll 尚未处理。
- complete-failure：在 `2.0 s` halt，早于第一次对象放置。

必须准确描述这六条分支：

- partial/failure 是真实 success episode 的受控 `terminal-halt + held-last-frame` 派生分支。
- halt 前是同源真实观测；halt 后保持最后一帧到统一时长。
- 它们不是三次独立 policy rollout，也不是持续物理仿真的 no-op rollout。
- retry1 使用 H.264 lossless QP0，三分支前 50 个 decoded frames 逐帧 hash 完全一致。
- 自动门与 agent 视觉复核已通过，但 Arrange 与 Dolls 仍标注 `awaiting_user_review`，等待用户最终肉眼确认；尤其 Dolls 的 3/4 是 task-graph 视觉标注，不是 RoboDojo 原生 graded score。

## 4. 48 条样本与 111 张媒体如何得到

有效 run 的数据目录：

`/mnt/gyc_ckp/benchmark2027/experiments/evaluation/l1/minimal/l1-minimal-benchmark-cosmos3-nano-20260901-retry1/dataset`

关键文件：

- `public_samples.jsonl`：模型可见 prompt 与媒体相对路径，不含 GT。
- `private_ground_truth.jsonl`：只在评分阶段读取的 GT 与 evidence。
- `media_index.json`：111 张图片的时间戳、来源和 SHA-256。
- `materialization_summary.json`：物化统计。

样本组成：

| Capability | 样本数 | 输入规则 | 媒体数 |
| --- | ---: | --- | ---: |
| Spatial Understanding | 9 | 每任务选 3 个代表里程碑帧，每帧独立提问 | 9 |
| Subtask Decomposition | 3 | 每任务只使用初始帧 + 任务指令 | 3 |
| Progress Estimation | 27 | 3 tasks × 3 outcomes × 3 milestone frames，分别输入 | 27 |
| Failure Detection | 9 | 3 tasks × 3 outcomes，每条输入 8 个有序稀疏帧 | 72 |
| 合计 | 48 | capability-specific structured prompts | 111 |

重要协议：

- Spatial 和 Progress 的帧分别输入，不把多个里程碑拼成一个大问题。
- Decomposition prompt 可公开 JSON grammar 和 atomic `action/object/destination` 词表，但不得公开正确 atom 组合、canonical step set、依赖边或顺序。
- Failure 使用有序稀疏帧覆盖完整 episode。
- 公开模型输入只有 `cam_head` 派生图；腕部相机不要求加入公开输入。
- GT 与公开样本必须物理分离；`validation.json` 已验证 public manifest 不含 `ground_truth` key。

## 5. 冻结的 4 × Top 3 metrics

完整合同：

`/mnt/gyc/benchmark2027/wm/worktrees/metrics/vlm_native_v0_2/docs/notes/L1_METRIC_CONTRACT_V0_1_20260901.md`

| Dimension | Metric | 公式类型与归属 | 为什么保留 |
| --- | --- | --- | --- |
| Spatial | Entity F1 | 标准集合 F1；task-relevant entity ontology 为本项目定义；受 Visual Genome scene graph 启发 | 同时惩罚漏看与幻觉实体 |
| Spatial | Relation F1 | 标准集合 F1 改造到 `(subject,predicate,object)`；参考 SpatialSense | 单独检查任务相关空间关系 |
| Spatial | Graph Exact Match | Benchmark2027 设计的完整图双集合全等门；Exact Match 为标准判定 | 防止局部高 F1 掩盖关键图错误 |
| Decomposition | Subtask F1 | 标准集合 F1 改造到 `action|object|destination`；参考 ALFRED | 不受任意 step ID 影响，检查漏步和多步 |
| Decomposition | Dependency F1 | 标准集合 F1 改造到 task-graph directed edges；参考 PlanBench | 步骤正确但顺序不可执行时仍能抓出错误 |
| Decomposition | Plan Edit Similarity | 标准 Levenshtein distance，本项目归一化为 0–100 | 连续反映修复整条计划需要多少编辑 |
| Progress | Completed-step F1 | 标准集合 F1；参考 ALFRED goal condition 与 RoboVQA | 检查具体完成了什么，不让连续比例碰巧命中 |
| Progress | Stage Accuracy | 标准 Exact Match；五阶段词表由本项目冻结；参考 RoboVQA | 提供直观离散阶段诊断 |
| Progress | Progress Agreement | Benchmark2027 将标准绝对误差映射为 `100×(1-|pred-GT|)` | 与其他 metric 同方向，保留连续校准误差 |
| Failure | Occurrence Macro-F1 | 标准分类 Macro-F1 直接采用 | 成功/失败类等权，防止多数类掩盖失败漏检 |
| Failure | Type Macro-F1 | 标准 Macro-F1；失败 taxonomy 由本次 Golden set 定义 | 检查具体故障机制而非只报“失败” |
| Failure | Onset Similarity | 本项目将 temporal grounding 边界误差改造成单边界 0–100 score | 恢复需要知道何时开始失败 |

文献依据：Visual Genome、SpatialSense、ALFRED、PlanBench、RoboVQA、Temporal Grounding。DOI 与来源链接已写入 metric contract 和 dashboard 生成数据。

Failure Occurrence/Type Macro-F1 是 cohort metric：单个 episode 只贡献 `(pred, GT)` 标签对，不能给单 episode 编造 Macro-F1。看板会展示当前 episode 的标签贡献，再展示 9 条联合形成的 TP/FP/FN 与最终类间平均。

## 6. Cosmos3-Nano 模型运行

### 6.1 冻结模型与环境

- 模型权重：`/mnt/gyc_ckp/models/Cosmos3-Nano`
- Python 环境：`/mnt/gyc_ckp/wm/uv_env/cosmos3_reasoner_native_l1_20260830`
- Python：3.11
- 配置：`/mnt/gyc/benchmark2027/wm/worktrees/metrics/vlm_native_v0_2/configs/evaluation/l1/l1_minimal_benchmark_20260901_retry1.json`
- 解码：greedy，`do_sample=false`、`temperature=0`、`max_new_tokens=768`
- 模型参数全冻结，没有训练，没有写 checkpoint。

Cosmos3-Nano 是 primary。配置允许在 documented primary failure 后 fallback 到 `Qwen3-VL-8B-Instruct`，但本次 Cosmos3 运行成功，因此没有启用 Qwen fallback。

### 6.2 A800 使用约定

本次 Cosmos 推理在 A800 上完成。用户明确授权：benchmark 任务优先级最高，需要 GPU 时可以停止标准占卡脚本，但任务结束必须恢复。

标准恢复命令：

```bash
tmux new-session -d -s occupy python3 /root/workspace/tools/occupy.py
```

交接时 `occupy` session 已恢复，A800 GPU0 占用约 `68476 MiB`。后续 agent 释放前应确认目标确实是标准 `occupy` session；完成推理后必须重新创建并通过 `tmux list-sessions` 与 `nvidia-smi` 验证。

用户另有 4090 主机：

```text
ssh -p 6015 root@10.40.0.110
```

Golden Episode 渲染与 dashboard 服务相关说明见各自报告和 `ops/4090/README.md`。不要无关地启动大规模训练或分布式任务。

## 7. v1 为什么作废，retry1 为什么有效

### 7.1 作废 run

- Run ID：`l1-minimal-benchmark-cosmos3-nano-20260901-v1`
- Root：`/mnt/gyc_ckp/benchmark2027/experiments/evaluation/l1/minimal/l1-minimal-benchmark-cosmos3-nano-20260901-v1`
- 报告：`/mnt/gyc/benchmark2027/wm/worktrees/metrics/vlm_native_v0_2/docs/experiments/L1_MINIMAL_BENCHMARK_COSMOS3_V1_PROTOCOL_FAILED_20260901.md`
- Registration publication commit：`20e65767976c600255738aa41d3dd7926c313307`

v1 虽然 Cosmos 完成 48/48 推理且工程链通过，但 decomposition prompt 暴露了完整 canonical subtask labels。模型可以复制答案集合，因此该 run 的任何总分都不得发布为有效 Level 1 结果。

v1 immutable artifacts 必须保留作为协议失败证据，禁止删除、覆盖或“修正原地结果”。

### 7.2 有效 retry1

- Run ID：`l1-minimal-benchmark-cosmos3-nano-20260901-retry1`
- Root：`/mnt/gyc_ckp/benchmark2027/experiments/evaluation/l1/minimal/l1-minimal-benchmark-cosmos3-nano-20260901-retry1`
- 配置 SHA-256：`c7c19590e7d0bc9bc55ce3507ba6f0a59345d1632856f05ce3f043c6e6d5a64a`
- Summary SHA-256：`b6a2d9345c95b9a5a33f28dbe4f387a712cf6bf149b5105767d2b907d0c15f86`
- Validation SHA-256：`627ec24b663e36c566b131cb7bf9d6fbbfb9f69fbecbd0b0583b8f2f7f13ae17`
- PASS 报告：`/mnt/gyc/benchmark2027/wm/worktrees/metrics/vlm_native_v0_2/docs/experiments/L1_MINIMAL_BENCHMARK_COSMOS3_RETRY1_PASS_20260901.md`

retry1 唯一允许变化是 decomposition prompt/representation：只给 atomic vocabulary 和结构化输出 grammar，不给正确组合或顺序。

`validation.json` 已确认：

- 48 条 sample、111 张媒体全部 hash 通过。
- 三个任务各 16 条 sample。
- 48 条预测均为唯一 terminal record 且 status=`ok`。
- parse failure=`0`，infrastructure failure=`0`。
- public manifest 不含 GT。
- retry 只改变 3 条 decomposition public rows。
- 111 张媒体与 v1 完全一致。
- 45 条未改变样本的 deterministic rerun raw response 与 v1 `45/45` 完全一致。
- 新 decomposition prompt 不再暴露 canonical answer labels。
- aggregate 可从 sample scores 完整重算。

## 8. 有效结果

### 8.1 12 项 aggregate metrics

| Metric | Score |
| --- | ---: |
| Entity F1 | 71.851852 |
| Relation F1 | 55.555556 |
| Graph Exact Match | 33.333333 |
| Subtask F1 | 100.000000 |
| Dependency F1 | 66.666667 |
| Plan Edit Similarity | 100.000000 |
| Completed-step F1 | 44.162258 |
| Stage Accuracy | 22.222222 |
| Progress Agreement | 57.222222 |
| Occurrence Macro-F1 | 41.558442 |
| Type Macro-F1 | 40.404040 |
| Onset Similarity | 13.816739 |

### 8.2 四维度与总分

| Score | Value |
| --- | ---: |
| Spatial Understanding | 53.580247 |
| Subtask Decomposition | 88.888889 |
| Progress Estimation | 41.202234 |
| Failure Detection | 31.926407 |
| **Level 1** | **53.899444** |

### 8.3 每任务 Level 1

| Task | Level 1 Score |
| --- | ---: |
| Stack Bowls | 67.312210 |
| Arrange Largest Number | 53.611111 |
| Sort Nesting Dolls By Size | 39.728836 |

详细 per-task / per-dimension / per-metric 数据不要手抄，直接读取：

`/mnt/gyc_ckp/benchmark2027/experiments/evaluation/l1/minimal/l1-minimal-benchmark-cosmos3-nano-20260901-retry1/scores/aggregate.json`

逐样本 prediction、GT、分数和基础解释位于：

`/mnt/gyc_ckp/benchmark2027/experiments/evaluation/l1/minimal/l1-minimal-benchmark-cosmos3-nano-20260901-retry1/scores/sample_scores.jsonl`

## 9. 结果应该如何解释

可以说：

- 在这次最小 run 上，模型的 Subtask Decomposition 最强，Failure Detection 最弱。
- Dolls 的 Dependency F1 为 0，是因为模型给出了正确步骤与序列，但没有给出可解析的三条依赖边。
- Failure 分数低主要来自大量漏报 derived halt 和失败 onset。
- Stack Bowls 在本次九条样本中的任务分数最高，Dolls 最低。

不可以说：

- “Cosmos3 的总体 Level 1 能力就是 53.9”。这里只是最小 benchmark，不是总体置信估计。
- “某个 metric 与 SR 正相关/负相关”。当前只有一个模型、9 条 episode，没有识别相关性的样本量。
- “Dolls 一定比 Stack Bowls 难”。当前差异也可能来自 seed、标签与任务图。
- “三种 outcome 都是独立模型 rollout”。Arrange/Dolls 的失败分支是 terminal-halt derivation。
- “N/A 等于 0”。例如成功 episode 没有真实 failure onset，因此单条 onset 是 N/A，不进入 onset 分母。

## 10. Dashboard 实现

### 10.1 固定入口

Canonical URL：

<https://unibench-dashboard.tail4ada12.ts.net/?section=l1-minimal>

匿名访问会 `307` 跳转登录页。凭据由项目成员线下共享，不得写入代码、文档或日志。

历史 `trycloudflare.com` 地址是会变化的临时 tunnel，不是 canonical URL，也可能指向不同时间的 build。不要把它写入论文、handoff 或自动化。

### 10.2 页面现在包含

- Cosmos3-Nano Level 1 总分与 run 状态。
- 四维度分数和每维 Top 3 metric mini bars。
- 三任务对比矩阵。
- 12 项 metric explainer。
- 9 条 Golden Episode 视频，支持播放、暂停和拖动进度条。
- task / outcome / dimension 样本筛选。
- 48 条逐样本 evidence frame、模型 prediction、private GT 与 GT 来源。
- 每项 metric 的归属：标准公式、公开方法改造或本项目设计。
- 每项 metric 的选择理由、精确方法、公式、样本口径、论文链接和本次 run 汇总方式。
- 当前 episode 的 Pred / GT、TP/FP/FN、绝对误差、公式代入与结果解释。
- Failure cohort metric 的“单条标签贡献 → 全 9 条 Macro-F1”说明。
- episode → sampling → model → metric → Level 1 的完整流程图与 evidence boundary。

### 10.3 关键文件

数据注册与生成：

- `scripts/l1-minimal-registry.mjs`
- `scripts/export-l1-minimal-results.mjs`
- `scripts/check-l1-minimal-media.mjs`
- `app/data/generated/l1-minimal-results.json`
- `app/data/l1-minimal-results.ts`

页面与样式：

- `app/components/l1-minimal-benchmark.tsx`
- `app/l1-minimal.css`
- `app/l1-metric-explainers.css`
- `app/dashboard-client.tsx`
- `app/layout.tsx`

媒体 API 与测试：

- `app/api/l1-minimal-media/[...segments]/route.ts`
- `tests/l1-minimal-data.test.mjs`
- `tests/rendered-html.test.mjs`

### 10.4 Dashboard 媒体包

- Bundle root：`/mnt/gyc_ckp/benchmark2027/data/generated/dashboard-l1-minimal-media/v0.1-20260901`
- 文件数：62 个去重文件。
- 总大小：`104729010` bytes。
- 内容：9 个 MP4 + 53 个按 SHA-256 去重的 PNG。
- `public/l1-minimal-media` 是部署脚本创建的 ignored symlink，不要提交真实媒体。

媒体路由要求登录。MP4 支持 HTTP Range，PNG 返回 `image/png`。上线验收实测视频 Range=`206`、样本图=`200`。

## 11. Dashboard 提交时间线

功能分支的重要提交：

| Commit | 内容 |
| --- | --- |
| `f2ef5ec` | Checkpoint A：Stack Bowls 与 L1 页面骨架 |
| `984368f` | Checkpoint B：发布三任务九条 Golden Episode |
| `291dee4` | 忽略部署时创建的 L1 媒体 symlink |
| `280ca6d` | 发布有效 Cosmos3 retry1、48 样本、12 metrics 和完整交互页 |
| `db27c28` | 修复 PNG evidence media route；此前 MP4 正常但 PNG 404 |
| `1e18f87` | 增加每项 metric 来源、选择理由、本次汇总和逐 episode 公式代入 |

共享 `main` 的功能上线 merge：

`5c851cd19ed5265afef958bf276d75bfd5f447cb`

后续 handoff-only merge 不改变页面功能。以
`/mnt/gyc_ckp/benchmark2027/runtime/dashboard/deployed-commit.txt` 和
`bash ops/4090/status.sh` 获取实际线上提交。

## 12. 验证证据

### 12.1 Benchmark

已通过：

- L1 scorer / runner 相关 9 项 pytest。
- `scripts/sync_research_knowledge.py --check`。
- `scripts/audit_research_state.py global --strict-artifacts --require-clean`。
- Global strict audit：`0 error(s), 0 warning(s)`。
- retry1 post gate、artifact inventory、registration publication。

测试环境注意：

- 系统默认 Python 3.10 不满足项目 `>=3.11` 的 `StrEnum` 要求。
- Cosmos 环境中的某些第三方 pytest plugin 会自动加载 RoboDojo parser 并产生与 L1 无关的 ANTLR 错误。
- 运行 focused tests 时使用：

```bash
cd /mnt/gyc/benchmark2027/wm/worktrees/metrics/vlm_native_v0_2
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 \
  /mnt/gyc_ckp/wm/uv_env/cosmos3_reasoner_native_l1_20260830/bin/python \
  -m pytest -q \
  src/metrics/vlm/tests/test_l1_metrics.py \
  src/metrics/vlm/tests/test_l1_minimal_runner.py
```

### 12.2 Dashboard

已通过：

- repository hygiene。
- 78 个既有静态媒体校验。
- 4,500 个既有 dataset episode media 校验。
- 62 个 L1 minimal media 校验。
- 所有 generated data bundle freshness / allowlist 检查。
- TypeScript typecheck。
- ESLint：0 errors；保留 5 条已知 `<img>` optimization warnings。
- 42/42 unit tests。
- production vinext build。
- 3/3 rendered HTML tests。
- hashed client asset verification。
- 固定 URL 登录后页面 HTTP `200`。
- 匿名首页 HTTP `307`。
- Golden video Range HTTP `206`。
- Sample PNG HTTP `200`。
- deployed commit 与源码记录一致。

## 13. 安全地重生成 Dashboard

普通开发必须在功能 worktree 运行：

```bash
cd /mnt/gyc/benchmark2027/dashboard-codex-l1-minimal
npm run export:l1-minimal
npm run check
```

导出器会从 immutable retry1 artifacts 读取数据、重新发布/核验媒体，并生成 browser-safe JSON。它会验证 run ID、样本数、parse failure、媒体 hash 和 decomposition leakage boundary。

提交功能分支后，才能合并到共享 `main`。生产部署只能从共享 checkout 执行：

```bash
cd /mnt/gyc/benchmark2027/dashboard
bash ops/4090/update.sh
```

严禁在运行中的共享 checkout 直接执行 `npm run build`、`npm run check` 或 `vinext build`。这些命令会替换 content-hashed client files，可能让旧服务继续输出已经不存在的 JS 文件。`update.sh` 会检查 main、clean worktree、部署锁、停止服务、构建、render test、重启与 asset verification。

部署后检查：

```bash
bash ops/4090/status.sh
cat /mnt/gyc_ckp/benchmark2027/runtime/dashboard/deployed-commit.txt
```

## 14. 如果必须新跑模型

优先复用现有 immutable prediction，不要为了改 dashboard 或解释文案重跑模型。

若协议、数据或模型确实变化：

1. 新建 config、run ID 和 output root。
2. 按 Benchmark `AGENTS.md` 做 governance preclaim。
3. 先 `materialize` 并审计 public/private separation。
4. 做少量 `--limit` probe。
5. 再跑完整 `infer`。
6. 最后 `score`，生成 summary/validation/report。
7. post gate 后封存，不原地修改。
8. 发布 registration 到本地 main。

Runner 入口：

```bash
cd /mnt/gyc/benchmark2027/wm/worktrees/metrics/vlm_native_v0_2
/mnt/gyc_ckp/wm/uv_env/cosmos3_reasoner_native_l1_20260830/bin/python \
  scripts/evaluation/l1/run_minimal_benchmark.py \
  --config configs/evaluation/l1/<new-config>.json \
  --stage materialize
```

之后分别使用 `--stage infer` 和 `--stage score`。不要直接复制 retry1 的 output root 作为新 run。

## 15. 已知边界与未完成事项

1. Arrange 与 Dolls 六条 derived branches 尚待用户最终视频语义复核；页面已明确标注。
2. 当前只有 3 tasks、9 episodes、1 个模型，不能提供置信区间、总体泛化或 metric-SR correlation。
3. Motus Stage 2 尚未接入 Level 1；non-invasive readout 的训练数据、预算和跨模型公平性仍需工程冻结。
4. 本周正式目标还包括扩展为正式规模数据集：更多场景、seed、episode，以及正式 train/validation/test split。今天没有批量生成这些数据。
5. 当前 12 metrics 朝正式冻结版本设计，但用户保留在审查最小 benchmark 后修改的权利；若修改 metric contract，必须升版本，不能静默改写 v0.1。
6. 当前 Level 1 只完成 Cosmos3-Nano；没有形成 Motus 与 Cosmos3 的正式横向排名。
7. 四个 Level 合成统一模型总分的最终权重尚未在本轮实现。

## 16. 建议的下一步顺序

### 立即进行

1. 用户最终审查 Arrange 与 Dolls 的 success / partial / failure 六条视频及标签。
2. 根据用户对当前看板的阅读反馈，修正解释性和交互问题，但不改变 formal artifacts。
3. 将今天的 12 metrics 作为候选冻结版进行一次人工设计 review，重点检查 taxonomy 与 GT 可规模化程度。

### 本周正式规模

1. 为三个任务设计场景/seed/episode 扩展矩阵。
2. 冻结 train/validation/test 划分原则，避免同场景和同源轨迹泄漏。
3. 建立批量 Golden Episode QA、用户抽检与版本化标注流程。
4. 在正式 test split 上运行 Cosmos3-Nano。
5. 接入 Motus Stage 2 的冻结 non-invasive Level 1 readout，并保持同输入、同输出 schema、同 metric、同预算。
6. 至少有多个模型和足够 episode 后，再做 metric 与 SR 的相关性、置信区间和稳定性分析。

## 17. 接手 AI 的禁止事项

- 不读取或复制旧 3.2 GB Codex rollout；使用本文与现有代码/artifacts。
- 不 reset、force push 或清理用户现有 ahead commits。
- 不把 v1 protocol-failed 分数晋升为结果。
- 不原地修改任何 immutable experiment output。
- 不把 terminal-halt branch 写成 independent policy rollout。
- 不把 N/A 记成 0。
- 不把 execution observation 冒充 prediction-only artifact。
- 不把单条 episode 标签贡献冒充 Macro-F1 单条分数。
- 不把 9 条 episode 的结果外推为总体结论或 metric-SR correlation。
- 不在共享 dashboard checkout 直接运行普通 build。
- 不在 GPU 任务结束后忘记恢复 A800 `occupy` session。
- 不把登录凭据、session secret 或内部 env 写进文档、提交或终端输出。
- 不启动与当前目标无关的大规模实验。

## 18. 最可信的阅读顺序

接手 AI 建议按以下顺序读取：

1. 本文。
2. `/mnt/gyc/benchmark2027/wm/worktrees/metrics/vlm_native_v0_2/AGENTS.md`。
3. `/mnt/gyc/benchmark2027/wm/worktrees/metrics/vlm_native_v0_2/docs/notes/L1_METRIC_CONTRACT_V0_1_20260901.md`。
4. `/mnt/gyc/benchmark2027/wm/worktrees/metrics/vlm_native_v0_2/docs/experiments/L1_MINIMAL_BENCHMARK_COSMOS3_RETRY1_PASS_20260901.md`。
5. retry1 `summary.json`、`validation.json`、`scores/aggregate.json`、`scores/sample_scores.jsonl`。
6. Dashboard `scripts/export-l1-minimal-results.mjs`。
7. Dashboard `app/components/l1-minimal-benchmark.tsx`。
8. Dashboard `ops/4090/README.md`。

遵循这条路径，可以在不依赖旧对话历史的情况下完整恢复今天的设计、实验、证据边界和线上实现。
