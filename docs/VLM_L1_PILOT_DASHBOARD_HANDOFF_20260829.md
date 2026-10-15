# VLM L1 Pilot Dashboard Handoff（2026-08-29）

## 1. 发布范围

本次将 Qwen3-VL-8B-Instruct 的 Native L1 Pilot 首版结果接入看板总览的
`L1 State Grounding`。只发布 12 个确定性 metric group，不生成统一 VLM 总分，
也不把 Judge pending 当作 0 分。

正式 Pilot 状态：

- 1,277 evaluation memberships。
- 1,200 canonical predictions。
- 1,089 deterministic scored。
- 177 judge pending（Object 100 + non-numeric Spatial 77）。
- 11 parse/model failures，按冻结协议留在对应确定性指标分母并计 0。
- 0 infrastructure failure。
- deterministic scoring rerun 字节一致。
- `summary.json` 与 `runtime_status.json` 均为 `PASS_DETERMINISTIC`。

## 2. 数据来源与发布合同

正式 run：

`qwen3-vl-8b-instruct-native-l1-pilot1277-v0.2.1-20260829-aihc32`

发布链路：

```text
immutable Pilot artifacts
  -> scripts/vlm-result-registry.mjs（文件白名单 + SHA-256）
  -> scripts/export-vlm-results.mjs（schema / count / metric-set / status 门禁）
  -> app/data/generated/vlm-results.json
  -> app/data/vlm-results.ts（typed adapter）
  -> L1 overview + VLM aggregate evidence
```

冻结哈希：

| Artifact | SHA-256 |
|---|---|
| run_manifest.json | `826d81e979c363d3d383215bd98bb09f6dcd27f52cc479e1ee3143573d33e470` |
| config.json | `46cfa068d893d047052f5a501d36ce67d05e3c7c6e2b2f2fa2ca519353bcd54a` |
| runtime_status.json | `5b31de9c1357d34235146693f032458749a170f46213df9e573fdbe74ca008a7` |
| gate_d_audit.json | `0270b90880bda8a85ddc9d6a54dd6981b56c1a956b03d234c8ed72fc1e1c07f5` |
| summary.json | `5b4a58669a018653f20bf1ddbe5579acbda073e6ca423e30f6b9fcc04179e8a1` |
| predictions.jsonl | `1fa774ae84f4eaf397a6976f4161fdbadea8850786dc78ab1c89f0a935c5b190` |
| item_scores.jsonl | `62904e173e9e6efe8451398a4955db780ca56c8b3001985efd45c1cde89dca2b` |

生成 bundle 不包含 `/mnt/` 路径、GT、RefSpatial mask 或私有 manifest 内容。

## 3. 看板首版结果

| Metric | Planned N | Parse rate | Score |
|---|---:|---:|---:|
| Direct Acc@0.5 | 50 | 98.00% | 26.00% |
| Situational Acc@0.5 | 50 | 100.00% | 10.00% |
| Object Referring All | 100 | 99.00% | 18.00% |
| MRA | 19 | 100.00% | 33.16% |
| RoA | 4 | 100.00% | 0.00% |
| Area point-in-polygon ratio | 100 | 100.00% | 17.75% |
| Affordance exp(-mean nearest distance) | 100 | 100.00% | 81.98% |
| PIO S1 repo-code bbox IoU | 229 | 98.69% | 56.63% |
| PIO S2 repo-code bbox IoU | 271 | 99.26% | 33.22% |
| RefSpatial Location point-in-mask | 100 | 95.00% | 48.00% |
| RefSpatial Placement point-in-mask | 100 | 100.00% | 41.00% |
| RefSpatial Unseen point-in-mask | 77 | 100.00% | 27.27% |

RoA 的 `0.00%` 是正式计算值，UI 必须保持可用结果样式；它不是 N/A。

## 4. 维护方式

新增正式 VLM run 时，不在 TSX 中改分数。先将 run 与文件哈希加入
`scripts/vlm-result-registry.mjs`，再按新发布合同升级 exporter / bundle version，运行：

```bash
npm run export:vlm
npm run check
```

若原始文件哈希、Gate D 计数、12 项确定性 metric identity、parse rate、Judge 状态或
基础设施状态发生偏移，exporter 会拒绝生成。强教师 Judge 接入后应升级 schema 与 bundle
版本；不得覆盖本次 immutable Pilot 的确定性发布记录。
