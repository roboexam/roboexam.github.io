const metrics = '/mnt/gyc_ckp/benchmark2027/experiments/evaluation/acwm_threebaseline_clean2400_20261103/benchmark2027_threebaseline_AB_eval600_20261103_v1/metrics';
export const v5Root = '/mnt/gyc_ckp/benchmark2027/experiments/metrics/acwm_visual_closed_loop_mvp/stack_bowls_20260928/benchmark2027_latest3_AB600_anyposv5_one4gpu_20261105_v1';
export const quickRoot = '/mnt/gyc_ckp/benchmark2027/experiments/metrics/acwm_visual_closed_loop_mvp/stack_bowls_20260928/benchmark2027_anypos_clean2400_v5_quick_pairs_20261104_v1';
export const version = 'latest3-ab600-20261105-v1';
export const readerSha = {
  v5: '1632a7bc566ffedc1c8c5615aa51c814c2a89d8933068bcb8daa5cb7dd5af9f9',
  v4: 'c1c1e01a420c7dde7254ec9612d96f0deeb70c6e6bc1f35c99e8cf2f58c9e5e7',
};
export const models = [
  { id: 'ctrl_world', label: 'Ctrl-World', checkpoint: 'instructionv2 · 50k', sha256: 'e974a642e15aebf98020d6f648224c03c881166f83913e699dffd33464e383b0', aRoot: `${metrics}/benchmark2027_ctrlworld_A_metrics600_20261104_v1`, v4Root: `${metrics}/benchmark2027_ctrlworld_AB_stream600_20261104_v1` },
  { id: 'lingbot_va', label: 'LingBot-VA', checkpoint: 'instructionv2 · 50k', sha256: 'c3d5cd35dd253c473742619fdf7562b560bbb9279af61673bef124ba2eecc9c7', aRoot: `${metrics}/benchmark2027_lingbot_va_AB_metrics600_modelready_20261104_v1`, v4Root: `${metrics}/benchmark2027_lingbot_va_AB_metrics600_modelready_20261104_v1` },
  { id: 'motus', label: 'Motus', checkpoint: 'instructionv3 · 40k', sha256: '04b25e9306b623d24c6b4e810f2ca643697c66bc4a337f50531eeb8fd67f09f3', aRoot: `${metrics}/benchmark2027_motus_AB_metrics600_modelready_20261104_v1`, v4Root: `${metrics}/benchmark2027_motus_AB_metrics600_modelready_20261104_v1` },
];
