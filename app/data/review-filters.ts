import type { ReviewCandidate } from "./review-candidates.ts";
export const reviewLabels: Record<string, string> = {
  arrange_largest_number: "Arrange · 最大数字排列", cover_blocks: "Cover · 盖揭方块", play_stacking_toy: "Play · 套柱积木",
  pour_by_language: "Pour · 按语言倒水", store_tools_in_toolbox: "Store · 工具入箱", press_by_number: "Press · 按次数按键",
  pack_objects_into_box: "Pack · 物品装箱", fold_clothes: "Fold · 折衣服", hang_mugs: "Hang · 挂杯",
  match_and_pick_from_conveyor: "Match Conveyor · 记忆匹配抓取", imitate_sorting_sequence: "Imitate · 模仿分类顺序",
  classify_objects_by_language: "Classify · 按语言分类", solve_equation: "Solve · 补全算式", stack_bowls: "Stack Bowls · 叠碗",
  push_T: "Push T · 推T形物", insert_key: "Insert Key · 插钥匙", build_tower: "Build Tower · 搭塔",
  find_category_outlier: "B01 · 类别异类查找", place_between_references: "B03 · 放在参照物之间",
  mirror_pair_layout: "B04 · 镜像成对布局", hold_water_mug: "B08 · 盛水杯稳定保持",
  set_button_colors: "B09 · 设置按钮颜色", hold_button_until_cue: "B11 · 按住按钮等待提示",
  clear_keyboard_then_close_laptop: "B06 · 清理键盘并合盖",
};
export const reviewRoleLabels: Record<string, string> = { primary: "本轮批次", backup: "旧批备选", development: "开发复用", validation: "工程小样" };
export type ReviewFilters = { batch: string; role: string; family: string; machine: string };
export function filterReviewEpisodes(rows: ReviewCandidate[], filters: ReviewFilters) {
  return rows.filter(row => {
    const memberMatches = (row.memberships ?? []).some(m =>
      (!filters.batch || m.batch === filters.batch) && (!filters.role || m.role === filters.role) && (!filters.family || m.family === filters.family));
    return ((!filters.batch && !filters.role && !filters.family) || memberMatches) &&
      (!filters.machine || (row.machineStatus ?? "clean_selected") === filters.machine);
  });
}
