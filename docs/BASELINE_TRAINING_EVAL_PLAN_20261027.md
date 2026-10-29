# Benchmark baseline training and evaluation plan (64-card plan)

- 当前精简主计划包含 **24 个 baseline**：T2 7 个、T3 10 个、T4 7 个。
- 每个 baseline 使用自己的公开 pretrained checkpoint 独立训练；T4 不复用 T3 checkpoint。
- GPUh = 卡数 × 训练墙钟小时。训练和评测都对齐 80D action；policy 在本项目中使用 camera-EE，进入 RoboDojo 仿真或真机前再还原为 base-EE。
- Isaac Sim 评测同时保留 A800 和 RTX 4090 两个时间口径；A800 正式口径为 TAA + 64 spp，4090 用于独立复核。

## Track 2：ACWM baseline

| 实验编号 | Baseline | 训练 job | 训练 ckp 路径 | 训练 GPUh | 测评 job | 测评资源 / 时间 |
|---|---|---|---|---:|---|---|
| E1 | Cosmos Predict 2.5 / 2B | 待提交 | 待生成 | 32×80–95 | 待提交 | 32×12 |
| E2 | CtrlWorld | `job-nj6uhd8sy6zk`（train22，Running） | `/mnt/gyc_ckp/benchmark2027/experiments/training/ctrl_world/clean24_sdk/ctrlworld_clean24_sdk_tshape_joint50k_bs64_16gpu_20261027_retry5/` | 16×100–140 | 待提交 | 32×12 |
| E3 | Cosmos3-Nano ACWM | `job-n4rv5tka9dyq`（train22，Running） | `/mnt/gyc_ckp/benchmark2027/experiments/training/cosmos3_nano/robodojo_ee20_tshape/cosmos3_nano_ee20_tshape_mix24_fd20k_16gpu_20261027_weixiaobao_v1/` | 16×80–160 | 待提交 | 32×12 |
| E4 | Pelican-Unify 1.0（ACWM） | 待提交 | 待生成 | 16×100–180 | 待提交 | 32×12 |
| E5 | IRASim / Bridge action-conditioned | 待提交 | 待生成 | 16×80–140 | 待提交 | 32×12 |
| E6 | Wan-Move | 待提交 | 待生成 | 8×20–40 | 待提交 | 32×12 |
| E25 | EnerVerse-AC | 待提交 | 待生成 | 待确认 | 待提交 | 32×12 |

## Track 3：仿真 policy baseline

| 实验编号 | Baseline | 训练 job | 训练 ckp 路径 | 训练 GPUh | 测评 job | 测评 GPUh | A800 Isaac Sim | RTX 4090 Isaac Sim |
|---|---|---|---|---:|---|---:|---:|---:|
| E7 | Pi0.5 / XPolicyLab | `job-gw5edw7r0hng`（train22，Running，8卡） | `/mnt/gyc_ckp/benchmark2027/runtime/jobs/pi05_joint14_mix24_perf_retry_20261027_v1/` | 8×363 | `job-vodyg0t82m89`（pilot，4×A800，Succeeded） | 8×24–36 | 24–36h | 36–54h |
| E8 | FastWAM | 待提交 | 待生成 | 8×80–120 | 待提交 | 8×24–36 | 24–36h | 36–54h |
| E9 | OpenWAM | `job-o7g280dz73xi`（train22，Running，8卡） | `/mnt/gyc_ckp/benchmark2027/runtime/jobs/openwam_mix24_sdk_single8_aihc_b128_weixiaobao_20261027_v1/` | 8×63.7–76.4 | 待提交 | 8×24–36 | 24–36h | 36–54h |
| E10 | HyVLA | `job-7xprj38hacsl`（train22，Running，8卡） | `/mnt/gyc_ckp/benchmark2027/runtime/jobs/hyvla_mix24_videoopt8_wxb_20261027_v1/` | 8×231 | 待提交 | 8×24–36 | 24–36h | 36–54h |
| E11 | G05 | `job-r2osj4szcsbc`（train22，Running，8卡） | `/mnt/gyc_ckp/benchmark2027/experiments/training/g05/mix24/g05_joint14_absolute_mix24_full_100k_single8_gb128_weixiaobao_20261027_retry1/` | 8×91 | 待提交 | 8×24–36 | 24–36h | 36–54h |
| E12 | DM0.5 / OpenDM | `job-z8vn3y7oemyq`（train22，Running，8卡） | `/mnt/gyc_ckp/benchmark2027/runtime/jobs/dm05_mix24_joint14_abs_60k_8gpu_b128_mb16_acc1_20261027_v1/` | 8×133 | 待提交 | 8×24–36 | 24–36h | 36–54h |
| E13 | LingBot-VA2.0 | `job-lp44kdpv85kg`（train22，Running，8卡；retry1） | `/mnt/gyc_ckp/benchmark2027/experiments/training/lingbot_va/lingbot_va_acwm_clean2400_50k_8gpu_b4_20261027_retry1_debug/` | 8×20 | 待提交 | 8×24–36 | 24–36h | 36–54h |
| E14 | XVLA | `job-onz1i7m4ufy1`（train22，Running，8卡） | `/mnt/gyc_ckp/benchmark2027/runtime/jobs/xvla/xvla_mix24_sdk2400_8gpu_global128_20261027_weixiaobao_retry2/` | 8×27–32 | 待提交 | 8×24–36 | 24–36h | 36–54h |
| E15 | AHA-WAM | 待提交 | 待生成 | 8×100–180（planning proxy） | 待提交 | 8×24–36 | 24–36h | 36–54h |
| E16 | Pelican-Unify（policy） | 待提交 | 待生成 | 8×80–160（planning proxy） | 待提交 | 8×24–36 | 24–36h | 36–54h |

E13 的旧任务 `job-k8zt9ocf3dlm` 在 formal step 24,567 后因 stale manifest gate 失败；缓存和输入索引未漂移，retry1 复用已完成 cache，并从官方 base fresh-start，不恢复旧 optimizer state。

## Track 4：真机 policy baseline（每个 baseline 独立训练）

| 实验编号 | Baseline | 独立训练 job | 独立训练 ckp 路径 | 训练 GPUh | 真机测评 |
|---|---|---|---|---:|---|
| E17 | Pi0.5 / XPolicyLab | 待提交（T4 独立） | 待生成 | 8×363 | robot-station-hours；按 task/reset/人工接管排程 |
| E18 | FastWAM | 待提交（T4 独立） | 待生成 | 8×80–120 | robot-station-hours |
| E19 | OpenWAM | 待提交（T4 独立） | 待生成 | 8×63.7–76.4 | robot-station-hours |
| E20 | HyVLA | 待提交（T4 独立） | 待生成 | 8×231 | robot-station-hours |
| E21 | LingBot-VA2.0 | 待提交（T4 独立） | 待生成 | 8×20 | robot-station-hours |
| E22 | XVLA | 待提交（T4 独立） | 待生成 | 8×27–32 | robot-station-hours |
| E24 | Pelican-Unify（policy） | 待提交（T4 独立） | 待生成 | 8×80–160 | robot-station-hours |

T2 评测要求 paired future/action intervention、MSE、M-MSE、PSNR、SSIM、JEPA、IQ、MS、TA、INTERACT 和 AF；补充 WorldSimProbe 的 robot motion、object response、counterfactual outcome，以及 Phys-WorldBench Level 1/2/3 切片。Passive video 结果不能与 action-following 主排名混合。

T3 评测固定 24 tasks、episode 数和 seed，记录 task success、progress、chain/horizon success、recovery、collision/safety、intervention、效率，并保存 episode trace 和视频。A800 正式结果使用 TAA + 64 spp；4090 只作为同 renderer、同 seed 的复核。

真机评测必须记录有效 rollout 时长、reset 次数、人工接管、安全事件、失败原因和每 task 成功率；这些量不能用 Isaac Sim GPUh 代替。

## XPolicyLab 资格核查和候选池

- 已纳入本排程：Pi0.5、FastWAM、OpenWAM、HyVLA、G05、DM0.5/OpenDM、LingBot-VA、XVLA、AHA-WAM、Pelican-Unify policy。
- 可训练但暂不计入 64 卡主计划：Pi0-FAST、LingBot-VLA、GigaWorldPolicy、GR00T N1.7、OpenVLA-OFT、ACT、RISE、SmolVLA。当前没有 clean24 训练 job，且需要先确认 action schema、数据转换和评测部署。
- 已从 policy baseline 主计划删除 Pelican-VLA、Cosmos3-Nano policy 和 MOTUS：当前 XPolicyLab adapter/训练入口或 RoboDojo/80D camera-EE 评测协议仍不完整。Pelican-Unify policy 按当前精简稿保留，但正式提交前仍需完成 XPolicyLab adapter、action schema 和 RoboDojo 评测验收。
- G05 的 RoboDojo-real 为 evaluation-only；OpenDM/DM0 的 recipe 固定在 RoboDojo sim、arx_x5、14D joint，因此二者不进入 T4。
- T4 不纳入 X-WAM：其默认训练契约启用 depth 分支并要求 `depth_path`，而当前真机数据没有深度图；XVLA 使用 RGB 输入，继续保留。

## 64 张卡滚动并行安排

64 卡按 8 个 8 卡 policy 槽规划；16 卡任务占两个槽。T4 和 T3 使用独立输出目录，不能通过复用 T3 checkpoint 缩短 T4。

| 阶段 | GPU 分配 | 说明 |
|---|---:|---|
| T2 启动 | CtrlWorld 16；Cosmos3-Nano ACWM 16；其余 T2 qualification 8–16 | 按 AIHC pod 资源核算，不能只看 job 名称 |
| T3 第一批 | Pi0.5 8；OpenWAM 8；HyVLA 8；G05 8；DM0.5 8；XVLA 8 | 现有 clean24 job 优先 |
| T3 第二批 | FastWAM 8；LingBot-VA 8；AHA-WAM 8；Pelican-Unify 8 | 无 clean24 job 的条目保持待提交 |
| T3 评测 | 每个 policy 使用 8 卡评测槽 | A800 正式评测按 TAA + 64 spp；4090 复核作为尾部任务 |
| T4 滚动 | Pi0.5、FastWAM、OpenWAM、HyVLA、LingBot-VA、XVLA、Pelican-Unify 各自 8 卡 | T4 只能从各自 base/pretrained 初始化，真机 station-hours 另行排程 |

## 64 卡总体结论

以下按已有资源参数的 23 个 baseline 求和；EnerVerse-AC 的训练资源待确认，暂不计入 GPUh 与工期：

- T2 训练约 **8,480–13,280 GPUh**；T3 训练约 **9,509.6–11,251.2 GPUh**；T4 真机训练约 **6,917.6–8,019.2 GPUh**。
- 三个 track 的训练合计约 **24,907.2–32,550.4 GPUh**。
- T2 评测固定按 **2,304 GPUh** 计；T3 A800 Isaac Sim 按 **1,920–2,880 GPUh** 计，所以训练加 A800 评测约 **29,131.2–37,734.4 GPUh**。
- 64 张 A800 的理论资源聚合下界约 **455.2–589.6h（19.0–24.6 天）**；只算训练约 **16.2–21.2 天**。按 8 卡槽进行不可抢占滚动排程，得到一个可执行工期上界 **479–626h（20.0–26.1 天）**，它不是最优性证明；加 20%–25% 计划缓冲后约 **574.8–782.5h（24.0–32.6 天）**，对外建议按 **24–33 天** 预留。
- 若 T3 仿真评测使用一个独立 **8×RTX 4090** 槽，A800 训练与 T2 评测继续使用 A800，T3 的 10 个 baseline 评测串行占用该槽，每个约 **36–54 小时**；整体滚动排程约 **482–771.4h（20.1–32.1 天）**，加 20%–25% 缓冲约 **578.4–964.3h（24.1–40.2 天）**。严格三阶段时约 **966.7–1,238.4h（40.3–51.6 天）**，加缓冲约 **48.3–64.5 天**。4090 时间与 A800 GPUh 分开统计。若额外提供 64×4090（8 个 8 卡槽），4090 口径可缩短到 **450–587h（18.8–24.5 天）**，这属于额外资源情景。
- 严格按 T2→T3→T4 三个 Track 串行，A800 训练和评测关键路径约 **930–1,021h（38.8–42.5 天）**；加 20%–25% 计划缓冲约 **1,116–1,276.3h（46.5–53.2 天）**，建议按 **47–53 天** 预留。T4 真机测评不纳入 GPU makespan，需另排 robot-station-hours。
