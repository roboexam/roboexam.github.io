# Dataset browser

The **Datasets** entry has three views:

- **Task trajectories** reads the curated simulation index and presents Clean,
  Failure Recovery, and OOD records in the three-column task browser. Each
  record keeps its task instruction, seed, admission state, camera views, and
  hash-checked identity details.
- **Model rollouts** restores the frozen historical archive of 3 tasks, 15
  cohorts, and 1,500 model episodes. Oracle, policy, and ACWM protocols remain
  separate; open-loop prediction records never receive a policy success score.
- **Scenario plan** is the 31-scenario proposal table with capability tags and
  admission status. It is a planning view, not a result table.

The curated task view reads `/mnt/gyc_ckp/benchmark2027/data/episode/curated_simulation_data/`
through the published browser-safe index. The model archive reads the versioned
episode chunks under `public/episode-data/`. Both views preserve stable IDs and
provenance; they do not infer scores from missing media.

## 浏览方式

- Search and choose a task, or move through the filtered task list.
- Desktop uses three category columns; narrow screens stack the same cards.
- Each category has its own episode and failure/condition filter.
- Original video supports playback, seeking, fullscreen, and head/left-wrist/
  right-wrist camera switching. Mark buttons seek to recorded frame times.
- Identity details expose the instruction, seed, stable ID, hashes, and source
  revision. An episode number is not a seed.
- Empty OOD cards mean that no record has been admitted for that task; they are
  not model failures and are not converted to zero.

## 把新入库的数据放上看板

正式入库（catalog.json、episode_numbers.json、完整 episode）完成后，一条命令即可：

```bash
bash ops/4090/publish-curated.sh            # 重新导出 + 提交
bash ops/4090/publish-curated.sh --dry-run  # 只导出并打印前后数量，不提交
```

它会打印导出前后的任务数、episode 数和 clean / recovery / ood 分项，只提交生成产物，
并且在工作区有无关改动时拒绝执行（不会卷进别人未提交的工作）。提交后合入共享 main，
release watchdog 约一分钟内自动发布；要立刻发布就跑 `ops/4090/update.sh`。

新任务还需要在 `scripts/curated-task-metadata.json` 里加一条能力 tag 和中文指令，
否则该任务会以「无 tag、无中文翻译」发布，在能力筛选里选不到。导出时会明确告警提示。

这一步不放宽任何数据门槛：导出仍逐条校验 manifest 哈希、三路视频哈希与字节数、
official reward、任务终局、失败语义 witness、编号账本，并拒绝 catalog 中非
`strictly_selected` 的记录。放宽的只是「整个任务采集达标后才能展示」这条限制——
它属于阶段进度，不代表单条数据是否合格，过去会让只采到 2 条的任务完全无法展示。

## 数据更新与验收

1. 先通过采集侧正式入库流程更新 catalog.json、episode_numbers.json 和完整 episode。不得手改网页数字。
2. 在个人 dashboard worktree 执行 `npm run export:curated-dataset`。导出器核对 v3 manifest、稳定序号、严格选中记录、成功/故障证据，以及全部视频的字节数和 SHA-256；未通过直接失败。
3. 执行 `npm run check:curated-dataset`、typecheck、lint、test:unit、build、test:render，并用浏览器实际检查任务切换、相机切换、播放、拖动及手机布局。
4. 提交生成的两份小索引和 public/curated-data 下任务 JSON。不提交视频，不修改原始 manifest。旧内容寻址任务 JSON 不影响当前索引；清理时只删除确认不再被任何发布引用的 JSON。
5. 合并到干净 main，再从部署 checkout 的 ops/4090/update.sh 发布；保留固定网址和 watchdog。

视频接口 `/api/curated-media/<sha256>.mp4` 需要登录，服务端只允许生成索引中的固定根目录文件。支持 HEAD 和单段 HTTP Range（拖动所需），拒绝任意路径、未知哈希和无效范围。部署后原始文件应保持不可变；重新采集应产生新的哈希与索引。

展示数量是入库数量，不是模型得分、成功率、官方 Oracle 数量，也不等同于所有评测 GT 已完成。
