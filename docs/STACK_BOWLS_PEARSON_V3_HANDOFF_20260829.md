# Stack Bowls Pearson 热力图 v3 Handoff

状态：待审计后合并部署
日期：2026-08-29
维护人：SZM
范围：Stack Bowls 冻结正式 cohort 的 Pearson 相关性展示，不运行模型、不重新采样

## 1. 本次解决的问题

旧版把 `Success`、`Ordinal` 与各个 metric 放进同一个 N×N 相关矩阵，容易混淆两类问题：

1. metric 是否与逐 episode 的严格成功标签相关；
2. metric 之间是否冗余或互补。

新版将两者严格拆开：

- `Metric -> Episode Success`：只对 Pi0.5、FastWAM 计算，target 为逐 episode 的 `success=1`、`half-success/failure=0`。二元 target 下 Pearson r 等价于 point-biserial correlation。
- `Metric <-> Metric`：四模型均展示，但完全排除 Success、Ordinal、official score、runtime、step、累计路径和稀疏常量事件。

整体 success rate 仅作为 cohort 背景信息，不作为相关变量。相关性只解释为同 cohort 内的统计关联，不解释为因果或跨任务泛化。

## 2. 冻结数据与 artifact

旧版只读来源：

```text
/mnt/gyc_ckp/benchmark2027/experiments/metrics/correlation/stack_bowls/stack-bowls-existing-metrics-pearson-20260825-v1
```

新版不可变 artifact：

```text
/mnt/gyc_ckp/benchmark2027/experiments/metrics/correlation/stack_bowls/stack-bowls-existing-metrics-pearson-20260829-v2
```

关键 SHA256：

```text
MANIFEST.json
50f9972c79778289a2a3e44eba6f3cc9de87cff0e593f9e06d20913b31d071ec

analysis.json
79ea8238e3e8cef96396a1f99b6f8f663f7d844bdfceb53e3a0d74c8e2f1165b

vla_wam_metric_vs_episode_success.png
0ef5c5b52a69ef532c2bec864a439a01f7de32c5e088324d21acb24786e3eca4

all_models_metric_only_pearson_matrices.png
7d7a37d718d1f3f08b1de0456ae856bf0769f8acc0e826599b7881188c075f8c
```

冻结正式输入 SHA 保持不变：

```text
Pi0.5     77eda50f...
FastWAM   140beaa3...
Cosmos    26d41a31...
CtrlWorld fcafdb45...
```

## 3. 统计口径

VLA/WAM primary metric 顺序固定为：

```text
L-SPARC, R-SPARC, L-Speed, R-Speed
```

Group 定义：

```text
Smoothness = mean(r[L-SPARC], r[R-SPARC])
Speed      = mean(r[L-Speed], r[R-Speed])
```

Group 数值只是组内单项 Pearson r 的算术平均 `mean(r)`，不是联合模型分数，因此不提供虚构的 group q 值或 CI。

验证值：

| 模型 | n | cohort SR | Smoothness mean(r) | Speed mean(r) |
|---|---:|---:|---:|---:|
| Pi0.5 | 100 | 76% | 0.0243161947 | 0.2027985348 |
| FastWAM | 100 | 12% | -0.0209480974 | 0.2522835762 |

Cosmos、CtrlWorld 使用正式 `heldout73` metric-only 矩阵。它们来自 Oracle-success episode 的开环预测，没有可变的闭环 success label，因此不得计算或暗示 metric-success correlation。

Ordinal 结果仍保留在正式分析报告/CSV 中，作为 sensitivity evidence，但不进入两张主图。

## 4. 看板数据契约

Schema：

```text
unibench.dashboard.pearson-matrix.v3
```

Bundle version：

```text
stack-bowls-pearson-20260829-v3
```

exporter 从固定 v2 artifact 读取并执行以下检查：

- 固定四个正式来源和 SHA；
- 两张图片 SHA、尺寸和文件存在性；
- group membership 与 `meanR` 精确一致；
- cohort SR 必须由分类计数计算，不能独立硬编码；
- metric-only 矩阵必须对称、对角线为 1、数值有限；
- 拒绝 outcome、target、ordinal、official、runtime、step、path、event 字段进入主矩阵；
- 浏览器 bundle 不得包含 `/mnt/...` 或 Windows 绝对路径。

## 5. 代码改动

```text
app/components/pearson-matrix-section.tsx
app/data/generated/pearson-matrix-results.json
app/data/pearson-matrix-results.ts
app/pearson-matrix.css
scripts/export-pearson-matrix-results.mjs
scripts/pearson-matrix-result-registry.mjs
tests/pearson-matrix-data.test.mjs
tests/rendered-html.test.mjs
public/analysis/stack-bowls-pearson-20260829/
```

前端现在包含：

- Pi0.5、FastWAM 的 Group/Metric 双行色带；
- 每项 metric 的 r 与 BH 显著性；
- 四模型独立 metric-only 矩阵；
- 两张正式 PNG 的查看与下载入口；
- ACWM、Ordinal、aggregate SR 和因果解释边界。

## 6. 验证结果

已通过：

- exporter 固定源与图片校验；
- Pearson 数据契约测试 6/6；
- 全部 unit 33/33；
- typecheck；
- lint 0 errors（仅保留 2 个项目既有/预期的 `<img>` warning）；
- production build；
- rendered HTML 3/3；
- 浏览器桌面与 390x844 移动端验收。

浏览器验收事实：

- 两张新版图均 `complete=true`；
- outcome 图原始尺寸 3214x1597；
- metric-only 图原始尺寸 3301x2995；
- 移动端 document `scrollWidth == clientWidth`，页面本身无横向溢出；
- 四个 `metricMatrixScroller` 在窄屏内独立横向滚动；
- 浏览器控制台无 error。

正式合并前仍需在最终提交上再次执行完整 `npm run check`。

## 7. 审计清单

1. 确认 target 是逐 episode 二元成功，不是 aggregate SR。
2. 确认 Group 只展示 `mean(r)`，不展示 group q/CI。
3. 确认 VLA/WAM N×N 矩阵中没有 Success 或 Ordinal。
4. 确认 ACWM 只展示 metric-only heldout73，不声称与成功相关。
5. 确认两张图片与 manifest SHA 一致。
6. 确认 exporter 失败时不会静默发布旧 schema 或错误来源。
7. 确认移动端仅矩阵容器横向滚动，页面主体不横向溢出。

## 8. 发布与回滚边界

发布只允许从干净的共享 `main` 执行：

```bash
bash ops/4090/update.sh
bash ops/4090/status.sh
bash ops/4090/public-status.sh
```

不要重启公网 tunnel。原始实验数据和旧版 artifact 均不删除、不移动。若发布门禁失败，应保留当前线上版本并修复个人分支，不得使用 `git reset --hard` 或清理共享目录。
