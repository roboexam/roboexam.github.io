# RoboExam Baseline Fine-tuning and Evaluation Schedule

更新时间：2026-10-27

## 统一口径

- 24-task joint mix24；每个 baseline 使用自己的公开 base / pretrained checkpoint 独立训练，收敛后再评测。
- T4 真机训练完全独立于 T3，不能从 T3 checkpoint 启动。下面 T4 的训练 GPUh 先沿用对应 T3 recipe 作为 planning proxy；首个真机 baseline 完成后，再按真实数据量、batch、steps、reset 和人工接管重新估计。
- 当前项目要求对齐 OpenWAM 的 80D action 信号并使用 camera-EE 监督。XPolicyLab 各 adapter 的默认动作接口并不一致：Pi0.5、FastWAM、G05、OpenDM、LingBot-VA 默认 joint；OpenWAM、HyVLA、X-VLA、X-WAM 默认 EE。因此凡是 joint adapter，必须先完成 joint→camera-EE 的 80D 转换、坐标系和归一化校准，不能直接把默认 recipe 当作已对齐结果。
- Isaac Sim 统一评测：A800 80GB 或 RTX 4090；DLSS Off、TAA On、64 spp；固定 simulator、renderer、camera、task 和 episode seed。下表的 A800/4090 时间是规划值，正式吞吐由 pilot 更新。
- GPUh = 卡数 × 训练墙钟小时。AIHC 的 source/runtime 目录只是启动目录，训练结束后必须回读最终 checkpoint 文件。

## Track 2：ACWM baseline

| 实验编号 | Baseline | 训练 job | 训练 ckp 路径 | 训练 GPUh | 测评 job | 测评 GPUh | 负责人 | 状态 / 测试结果 |
|---|---|---|---|---:|---|---:|---|---|
| E1 | Cosmos Predict 2.5 / 2B | 待提交 | 待生成 | 32×80–95 | 待提交 | 32×12（offline/pilot） | 待定 | clean24 需重新跑；旧 32GPU proxy |
| E2 | CtrlWorld | `job-nj6uhd8sy6zk`（train22，Running；yichenguo） | `/mnt/gyc_ckp/benchmark2027/experiments/training/ctrl_world/clean24_sdk/ctrlworld_clean24_sdk_tshape_joint50k_bs64_16gpu_20261027_retry5/` | 16×100–140（另计 cache 24×6–12） | 待提交 | 32×12（offline/pilot） | yichenguo | 当前正式 clean24 训练；checkpoint 待训练结束回读 |
| E3 | Cosmos3-Nano ACWM | `job-n4rv5tka9dyq`（train22，Running） | `/mnt/gyc_ckp/benchmark2027/experiments/training/cosmos3_nano/robodojo_ee20_tshape/cosmos3_nano_ee20_tshape_mix24_fd20k_16gpu_20261027_weixiaobao_v1/` | 16×80–160（估算） | 待提交 | 32×12（offline/pilot） | weixiaobao | 当前训练；AIHC_JOB_KIND=training |
| E4 | Pelican-Unify 1.0（ACWM） | 待提交 | 待生成 | 16×100–180（估算） | 待提交 | 32×12（offline/pilot） | 待定 | 仅作为 ACWM qualification；不能当作 XPolicyLab policy baseline |
| E5 | IRASim / Bridge action-conditioned | 待提交 | 待生成 | 16×80–140（adapter 估算） | 待提交 | 32×12（offline/pilot） | 待定 | 7D action → 80D camera-EE adapter 待验证 |
| E6 | Wan 2.6 action-conditioned adapter | 待提交 | 待生成 | 8×20–40（2k-step pilot） | 待提交 | 32×12（offline/pilot） | 待定 | 先确认低层 action 条件接口；无 action 时只作 Level-1 对照 |

T2 测评要求：paired future/action intervention、MSE、M-MSE、PSNR、SSIM、JEPA、IQ、MS、TA、INTERACT、AF；补充 WorldSimProbe 的 robot motion、object response、counterfactual outcome，以及 Phys-WorldBench Level 1/2/3 切片。passive video 不能与 action-following 主排名混合。

## Track 3：仿真 policy baseline

保留项都在私有 XPolicyLab 的 `policy/<name>/` 下有训练入口和对应 base / pretrained 初始化。G05、DM0.5/OpenDM 只计入仿真；AHA-WAM 和 X-WAM 是新增的可复现 adapter。当前没有 clean24 job 的新增项先保持“待提交”，不能把 adapter 存在写成已有训练结果。

| 实验编号 | Baseline | 训练 job | 训练 ckp 路径 | 训练 GPUh | 测评 job | GPUh | A800 Isaac Sim 时间 | RTX 4090 Isaac Sim 时间 | 负责人 | 动作接口 / 状态 |
|---|---|---|---|---:|---|---:|---:|---:|---|---|
| E7 | Pi0.5 / XPolicyLab | `job-gw5edw7r0hng`（train22，Running，8卡） | `/mnt/gyc_ckp/benchmark2027/runtime/jobs/pi05_joint14_mix24_perf_retry_20261027_v1/` | 8×363 | `job-vodyg0t82m89`（4×A800，Succeeded） | 8×24（pilot） | 24–36h | 36–54h | weixiaobao | Isaac pilot 已完成但为 spp8；需按 TAA+64 spp 正式重跑 |
| E8 | FastWAM | 待提交 | 待生成 | 8×80–120 | 待提交 | 8×24（pilot） | 24–36h | 36–54h | 待定 | 默认 joint；Wan2.2 + ActionDiT，OpenWAM 仅作吞吐 proxy |
| E9 | OpenWAM | `job-o7g280dz73xi`（train22，Running，8卡） | `/mnt/gyc_ckp/benchmark2027/runtime/jobs/openwam_mix24_sdk_single8_aihc_b128_weixiaobao_20261027_v1/` | 8×63.7–76.4 | 待提交 | 8×24（pilot） | 24–36h | 36–54h | weixiaobao | EE；支持 `OPENWAM_FINETUNE_CKPT_PATH`；当前 clean24 训练 |
| E10 | HyVLA | `job-7xprj38hacsl`（train22，Running，8卡） | `/mnt/gyc_ckp/benchmark2027/runtime/jobs/hyvla_mix24_videoopt8_wxb_20261027_v1/` | 8×231 | 待提交 | 8×24（pilot） | 24–36h | 36–54h | weixiaobao | EE；PRETRAIN 和真机数据协议待验 |
| E11 | G05 | `job-r2osj4szcsbc`（train22，Running，8卡） | `/mnt/gyc_ckp/benchmark2027/experiments/training/g05/mix24/g05_joint14_absolute_mix24_full_100k_single8_gb128_weixiaobao_20261027_retry1/` | 8×91 | 待提交 | 8×24（pilot） | 24–36h | 36–54h | weixiaobao | 默认 joint；仅 RoboDojo 仿真训练，real 为 evaluation-only |
| E12 | DM0.5 / OpenDM | `job-z8vn3y7oemyq`（train22，Running，8卡） | `/mnt/gyc_ckp/benchmark2027/runtime/jobs/dm05_mix24_joint14_abs_60k_8gpu_b128_mb16_acc1_20261027_v1/` | 8×133 | 待提交 | 8×24（pilot） | 24–36h | 36–54h | weixiaobao | 默认 14D joint；DM05-MEM SFT，仿真 arx_x5 only |
| E13 | LingBot-VA2.0 | `job-k8zt9ocf3dlm`（train22，Failed，8卡） | 待回读 | 8×20 | 待提交 | 8×24（pilot） | 24–36h | 36–54h | weixiaobao | 默认 joint；需 latent pipeline，修复后重跑 |
| E14 | XVLA | `job-onz1i7m4ufy1`（train22，Running，8卡） | `/mnt/gyc_ckp/benchmark2027/runtime/jobs/xvla/xvla_mix24_sdk2400_8gpu_global128_20261027_weixiaobao_retry2/` | 8×27–32 | 待提交 | 8×24（pilot） | 24–36h | 36–54h | weixiaobao | EE；需要 `X-VLA-Pt` pretrained base |
| E15 | AHA-WAM（新增） | 待提交 | 待生成 | 8×100–180（planning proxy） | 待提交 | 8×24（pilot） | 24–36h | 36–54h | 待定 | joint/EE 由 recipe 选择；有 `train.sh`，单 history policy 不做 batch eval |
| E16 | X-WAM（新增） | 待提交 | 待生成 | 8×80–160（planning proxy） | 待提交 | 8×24（pilot） | 24–36h | 36–54h | 待定 | EE；Wan2.2 base，可选 `XWAM_PRETRAINED_CHECKPOINT` |

T3 测评要求：24 tasks、固定 episode 数和 seed；报告 task success、progress、chain/horizon success、recovery、collision/safety、intervention、效率，并保存 episode trace 和视频。A800 正式结果使用 TAA + 64 spp；4090 只作为同 renderer、同 seed 的复核。

## Track 4：真机 policy baseline（每个 baseline 独立训练）

以下条目都必须从各自 base / pretrained 初始化重新训练；表中没有任何 T3 checkpoint 复用。G05、DM0.5/OpenDM、Pelican、独立 Cosmos3-Nano policy 和 MOTUS 已移除：前两者没有当前 release 的真机训练协议，后三者在 XPolicyLab 没有对应完整 policy adapter/train entry。

| 实验编号 | Baseline | 独立训练 job | 独立训练 ckp 路径 | 训练 GPUh（proxy） | 真机测评 job | 真机测评资源 / 时间 | 负责人 | 动作接口 / 状态 |
|---|---|---|---|---:|---|---|---|---|
| E17 | Pi0.5 / XPolicyLab | 待提交（T4 独立） | 待生成 | 8×363 | 待提交 | robot-station-hours；按 task/reset/接管排程 | 待定 | 默认 joint；camera-EE/80D 和 real 数据协议待验 |
| E18 | FastWAM | 待提交（T4 独立） | 待生成 | 8×80–120 | 待提交 | robot-station-hours | 待定 | 默认 joint；real 数据和 action adapter 待验 |
| E19 | OpenWAM | 待提交（T4 独立） | 待生成 | 8×63.7–76.4 | 待提交 | robot-station-hours | 待定 | EE；可从 OpenWAM base/released checkpoint warm-start |
| E20 | HyVLA | 待提交（T4 独立） | 待生成 | 8×231 | 待提交 | robot-station-hours | 待定 | EE；PRETRAIN、标定和真机数据待验 |
| E21 | LingBot-VA2.0 | 待提交（T4 独立） | 待生成 | 8×20 | 待提交 | robot-station-hours | 待定 | 默认 joint；真实 latent pipeline 和部署待验 |
| E22 | XVLA | 待提交（T4 独立） | 待生成 | 8×27–32 | 待提交 | robot-station-hours | 待定 | EE；需确认 real camera/控制频率 |
| E23 | X-WAM | 待提交（T4 独立） | 待生成 | 8×80–160 | 待提交 | robot-station-hours | 待定 | EE；adapter 支持 `EVAL_ENV_TYPE=real`，但仍需真实数据和安全接管验收 |

真机测评必须记录有效 rollout 时长、reset 次数、人工接管、安全事件、失败原因和每 task 的成功率；这些量不能用 Isaac Sim GPUh 代替。

## XPolicyLab 资格核查和候选池

核查目录：`/mnt/dataset/private/XPolicyLab/policy/`。存在对应 `README.md`/训练入口并可从各自 base 或 pretrained 初始化的例子包括 Pi_05、Pi_0_Fast、FastWAM、OpenWAM、AHA_WAM、X_WAM、GigaWorldPolicy、LingBot_VA/VLA、X_VLA、GR00T_N17、OpenVLA_OFT、ACT、RISE、SmolVLA 等；这里的“各自 base”不是所有 baseline 共享一个模型。

- 已纳入本排程：Pi0.5、FastWAM、OpenWAM、HyVLA、G05、DM0.5/OpenDM、LingBot-VA、XVLA、AHA-WAM、X-WAM。
- 可训练但暂不计入 96 卡主计划：Pi0-FAST、LingBot-VLA、GigaWorldPolicy、GR00T N1.7、OpenVLA-OFT、ACT、RISE、SmolVLA。原因是当前没有 clean24 训练 job，且需要先确认 action schema、数据转换和评测部署。
- 已删除：Pelican-VLA、Pelican-Unify policy、Cosmos3-Nano policy、MOTUS。XPolicyLab 虽有 `policy/OLA_SEM`（包含 Motus 代码和训练入口），但它固定 RoboTwin 2.0、`aloha_agilex`、14D absolute-qpos joint，不能直接满足本项目 RoboDojo/Isaac Sim 24-task、80D camera-EE contract；需要单独适配后再恢复。AIHC 中的外部 rollout 或训练 job 不能证明当前 benchmark 可复现。
- G05 的 README 明确 RoboDojo-real 为 evaluation-only；OpenDM/DM0 的 recipe 固定在 RoboDojo sim、arx_x5、14D joint，因此二者不进入 T4。
- `yichenguo` 在 `train/train2/train21/train22` 的近期扫描只确认到 `job-nj6uhd8sy6zk`（CtrlWorld，train22，Running，2 个副本各 8×A800，合计 16 卡）；没有发现 X-WAM、AHA-WAM、GigaWorldPolicy、Pi0-Fast 或其它可直接回填的 yichenguo policy job。其余已回填 policy job 以 job owner 和状态为准，不能改写成 yichenguo 任务。

## 96 张卡滚动并行安排

96 卡按 12 个 8 卡 policy 槽规划；16 卡任务占两个槽。T4 和 T3 使用独立输出目录，只有在资源槽可用时才启动，不能通过复用 T3 ckp 缩短 T4。

| 阶段 | GPU 分配 | 说明 |
|---|---:|---|
| T2 启动 | CtrlWorld 16；Cosmos3 ACWM 16；其余 T2 qualification 8–16 | CtrlWorld 为 2 个 8 卡副本；按 AIHC pod 资源核算，不能只看 job 名称 |
| T3 第一批 | Pi0.5 8；OpenWAM 8；HyVLA 8；G05 8；DM0.5 8；XVLA 8 | 现有 clean24 job 优先；合计 48 个 8 卡槽中的 6 个 |
| T3 第二批 | FastWAM 8；AHA-WAM 8；X-WAM 8；LingBot-VA 修复重跑 8 | 训练完成一项就释放一项；LingBot-VA 需先修复失败原因 |
| T3 评测 | 每个 policy 使用 8 卡评测槽 | A800 正式评测按 TAA + 64 spp；4090 复核作为尾部任务 |
| T4 滚动 | Pi0.5、FastWAM、OpenWAM、HyVLA、LingBot-VA、XVLA、X-WAM 各自 8 卡 | T4 只能从各自 base / pretrained 初始化，真机 station-hours 另行排程 |

## 总体结论（96 卡）

按主计划中 T2、T3、T4 的训练表重新求和：

- 训练预算约 **25,051–32,838 GPUh**；包含 Track 2/T3 的 Isaac Sim 评测槽后约 **29,275–37,062 GPUh**。
- 96 卡的聚合资源下界为：仅训练 **10.9–14.2 天**，包含仿真评测 **12.7–16.1 天**。由于 8 卡作业不能任意切分，实际关键路径受 Pi0.5 的单次 363 小时 proxy 约束。
- 统一调度、不同任务交错并行：理论聚合下界约 **12.7–16.0 天**，考虑数据转换、checkpoint 验证、A800/4090 双口径 pilot、排队和失败重跑，建议按 **20–24 天** 规划。
- 严格按三个阶段串行（T2 → T3 → T4）：约 **34–39 天**；真机阶段还受 robot station availability 和人工接管影响。
- 考虑队列波动、real data 重新标定和重跑，项目排期建议预留 **40–42 天**。

最后一次核查时间：2026-10-27；AIHC 资源池为 `cce-pmm1yohj`，近期可用训练队列为 `train21`、`train22`。
