# Level 1 候选 Metric 全量审计与看板重构 Handoff（2026-09-02）

> **已被语义审计替代。** 本文记录的是 `l1-candidate-metric-audit-...-v3` 当时的实现事实，其中部分 metric 名称、公式解释和 E3 提升后来被确认与飞书四级矩阵 revision 264 不一致。请以 [`L1_METRIC_DEFINITION_AUDIT_20260902.md`](./L1_METRIC_DEFINITION_AUDIT_20260902.md) 和 `scripts/l1-metric-contracts.mjs` 为当前定义基准；不要再把本文的 14 个 E3、58.008391 部分分数或 v3 `registry.json` 语义当成发布口径。

## 1. 本轮完成了什么

本轮按用户与同事确认的新 Level 1 定义，完成了 29 项候选 metric 的可行性审计、机器可读 registry、不可变 Cosmos3 结果重放、E0–E3 证据门禁、逐任务得分、交互式 Score Composer，以及现有 L1 Benchmark 页面的整体替换与部署。

Level 1 当前只评测一体化模型的理解能力：

- L1-A：场景与任务状态建模。
- L1-B：任务条件下的一步交互理解。
- L1-C：进程与计划组织理解。
- L1-D：偏差诊断与恢复思路理解；不要求真实执行恢复动作。

没有新增 episode、没有训练模型、没有运行 Motus，也没有重复下载权重。候选 E3 分数只读重放自既有、不可变的 Cosmos3-Nano retry1 真实输出。

## 2. 正式结果与最重要边界

正式候选审计 run：

`/mnt/gyc_ckp/benchmark2027/experiments/evaluation/l1/candidates/l1-candidate-metric-audit-cosmos3-nano-20260902-v3`

结果：

- 候选总数：29。
- E3：14，可进入 Score Composer。
- E2：2，有真实输出/数据但 judge 未冻结，不能计分。
- E1：9，只有公式与实现样例，不能当作 Cosmos3 结果。
- E0：4，仍是设计候选。
- L1-A：63.703704。
- L1-B：N/A，目前没有 E3。
- L1-C：78.395062。
- L1-D：31.926407。
- 3/4 层部分覆盖分：58.008391。

`58.008391` 不是完整 Level 1 总分。L1-B 的空缺不能记作 0，也不能静默忽略；网页所有出现该数字的位置都同时显示部分覆盖警告。

另一个重要发现是 Plan BLEU-1/2/3/4 在当前三条任务计划上全部为 100。原因是结构化计划文本与 GT 使用相同词项，而不是模型已经“解决规划”。四个 BLEU 在当前小样本上高度冗余，最终 Top 3 不建议全部保留。

单模型、9 条 episode 不能支持总体泛化、模型排名、置信区间或 metric 与 SR 的相关性结论。

## 3. 29 项候选的当前状态

| 层 | 候选 | 等级 | 当前处理 |
|---|---|---:|---|
| L1-A | Object / State F1 | E3 | 来自真实结构化实体输出，可计分 |
| L1-A | LLM Alignment | E2 | 缺冻结 judge、校准集和缓存回执 |
| L1-A | Text Spatial Relation F1 | E3 | 来自真实关系三元组输出，可计分 |
| L1-A | MRA | E1 | 缺跨任务人工复核框/点 GT |
| L1-A | RoA | E1 | 缺跨任务人工复核框/点 GT |
| L1-A | RefSpatial | E1 | 缺目标 mask GT 和 Cosmos3 坐标合同 |
| L1-A | Direct | E1 | 缺框 GT 和 Cosmos3 框输出合同 |
| L1-A | PIO-S1 | E1 | 缺框 GT 和 Cosmos3 框输出合同 |
| L1-B | Situational | E1 | 缺逐里程碑交互目标框 GT |
| L1-B | Area Hit Ratio | E1 | 缺可交互多边形 GT |
| L1-B | Affordance Similarity | E1 | 缺可供性点集 GT |
| L1-B | PIO-S2 | E1 | 缺 PIO-S2 GT 字段和统一输出合同 |
| L1-B | Affordance AP | E0 | 缺多实例置信度合同、标注和冻结实现 |
| L1-C | Stage Accuracy | E3 | 真实进程输出，可计分 |
| L1-C | Next-Subgoal Accuracy | E0 | 现有 run 未询问，允许节点 GT 未复核 |
| L1-C | Stage Macro-F1 | E3 | 从真实三分类输出确定性重放 |
| L1-C | Plan Step F1 | E3 | 真实结构化计划输出，可计分 |
| L1-C | Plan Edit Similarity | E3 | 真实有序计划输出，可计分 |
| L1-C | Dependency F1 | E3 | 真实依赖边输出，可计分 |
| L1-C | BLEU-1/2/3/4 | E3 | 固定 RoboBrain evaluator profile；当前均 100 |
| L1-C | Planning LLM Alignment | E2 | 缺冻结 judge、校准集和缓存回执 |
| L1-D | Failure Occurrence Macro-F1 | E3 | 真实失败判断输出，可计分 |
| L1-D | Failure Type Macro-F1 | E3 | 真实失败类型输出，可计分 |
| L1-D | Failure Onset Similarity | E3 | 真实时刻输出，可计分 |
| L1-D | Recovery Subgoal Accuracy | E0 | 未询问，恢复 DAG GT 未人工复核 |
| L1-D | Recovery Plan Score | E0 | GT、等价方案和评分合同未冻结 |

完整字段（输入、输出、公式、来源、选择理由、blocker）以 v3 的 `registry.json` 为准。

## 4. 不可变产物

v3 run 中的核心文件：

- `registry.json`：29 项候选的完整合同。
- `candidate_scores.json`：总分、逐层、逐任务与 BLEU 样本证据。
- `score_composer.json`：E3 allowlist、默认选择与聚合说明。
- `summary.json`：run 摘要。
- `validation.json`：E3 完整性、非 E3 空分和覆盖边界检查。
- `provenance/source_artifacts.json`：源 retry1 的关键文件 SHA256。
- `provenance/governance/run_claim.json`、`post_gate.json`、`output_inventory.json`：治理回执。

源 Cosmos3 run 未被改写：

`/mnt/gyc_ckp/benchmark2027/experiments/evaluation/l1/minimal/l1-minimal-benchmark-cosmos3-nano-20260901-retry1`

v1 与 v2 被保留为失败证据：v1 是 post 前增强代码造成 claim/code 漂移；v2 是生成器 summary run_id 写死。v3 修复身份绑定后 pre、重放、validation 和 post 全部 PASS。不要引用 v1/v2 作为正式结果。

## 5. 网页现在怎样组织

固定网址：<https://unibench-dashboard.tail4ada12.ts.net/>

进入现有 `L1 Benchmark`，没有新增重复入口。页面从上到下为：

1. 结论先行：说明这是候选审计与部分覆盖，不是最终 Level 1。
2. 四层能力卡：L1-A 到 L1-D，空层显示 N/A 而非 0。
3. Score Composer：只有 E3 可选；切换后实时重算层分、部分覆盖分和三个任务；可保存 3 组组合比较。
4. Task Comparison：同一选择在 Stack Bowls、Arrange Largest Number、Sort Nesting Dolls By Size 上同步变化。
5. Metric Explorer：29 项全部可展开；显示“它回答什么、模型看到什么、输出什么、怎样计算、来源、等级与 blocker”，并可跳到 episode。
6. Golden Episodes：9 条视频可播放、暂停、拖动进度条；显示任务、结果、进度与 GT 来源。
7. Evidence Replay：保留 48 条真实 Cosmos3 prediction / private GT / 旧合同逐样本分，解释 E3 从哪里重放而来。
8. Audit Pipeline：展示 episode → 真实输出 → registry → evidence gate → composer。

页面颜色沿用看板的深蓝、纸白、浅蓝网格与薄荷绿证据色；E3/E2/E1/E0 使用固定视觉等级，避免把 unavailable 和低分混淆。

## 6. 代码位置

Benchmark / scorer worktree：

`/mnt/gyc/benchmark2027/wm/worktrees/metrics/l1_candidate_metrics_20260902`

关键文件：

- `src/metrics/vlm/src/vlm_eval/l1_candidates.py`
- `scripts/evaluation/l1/replay_candidate_metrics.py`
- `configs/evaluation/l1/l1_candidate_metric_audit_20260902_v3.json`
- `src/metrics/vlm/tests/test_l1_candidates.py`
- `docs/experiments/L1_CANDIDATE_METRIC_AUDIT_V3_PASS_20260902.md`

Dashboard 主仓库：

`/mnt/gyc/benchmark2027/dashboard`

关键文件：

- `app/components/l1-minimal-benchmark.tsx`
- `app/l1-candidate-audit.css`
- `app/data/l1-minimal-results.ts`
- `app/data/generated/l1-minimal-results.json`
- `scripts/export-l1-minimal-results.mjs`
- `scripts/l1-minimal-registry.mjs`
- `tests/l1-minimal-data.test.mjs`

## 7. 已执行验证

Scorer：

- candidate registry 唯一性与 E3 allowlist 测试 PASS。
- RoboBrain BLEU evaluator profile 测试 PASS。
- 旧 L1 metric 回归测试 PASS。
- v3 validation：29 项、14 个 E3 全有有限值；15 个非 E3 全为空且有 blocker；PASS。
- Governance pre / post：PASS。

Dashboard：

- generated data stale check：PASS。
- TypeScript typecheck：PASS。
- ESLint：0 error（仅保留已有/允许的 `<img>` 性能 warning）。
- 43 项 unit tests：PASS。
- production build：PASS。
- rendered login / anonymous redirect / authenticated matrix：PASS。
- 62 个 L1 媒体文件、104,729,010 bytes：hash 验证 PASS。
- 固定网址匿名访问：307 → `/login`。
- 本地与固定网址真实登录：200；登录后首页：200。
- 视频 Range：206。
- 服务状态与 10 个客户端资源：healthy / PASS。

## 8. 下一步建议

第一优先级不是立刻扩充数据，而是先用网页讨论每层最终 Top 3。尤其需要决定：

1. L1-C 的四个 BLEU 留 0 个还是 1 个，避免重复计权。
2. L1-A 是否保留结构化 F1 为主，还是投入框/mask GT 让 geometry family 升到 E3。
3. 先为 L1-B 冻结“当前状态下应交互的对象/区域”GT 和 Cosmos3 输出合同，至少做出一个 E3，才能形成完整四层 Level 1。
4. 是否为 Recovery Subgoal / Recovery Plan 建人工复核的恢复 DAG；它们测理解，不执行动作。

Top 3 与输出合同冻结后，再把同一 pipeline 扩展到正式 scenes、seeds、episodes 和 train/validation/test split。
