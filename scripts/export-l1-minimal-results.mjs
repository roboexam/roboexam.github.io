import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { link, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { l1MetricContracts, l1MetricContractSource } from "./l1-metric-contracts.mjs";
import { l1MinimalRegistry } from "./l1-minimal-registry.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "app/data/generated/l1-minimal-results.json");
const checkOnly = process.argv.includes("--check");

const metricCatalog = [
  { id: "spatial.entity_f1", dimension: "spatial", name: "Entity F1", zh: "任务实体覆盖", formula: "100 × 2PR / (P + R)", question: "该看的物体有没有看全，也有没有凭空多看？", eligible: 9, scope: "单样本计算，再跨样本平均", methodClass: "标准公式 · 本项目任务化改造", ownership: "F1 是通用指标；task-relevant entity ontology 与集合化口径由 Benchmark2027 定义。", why: "同时惩罚漏看（低 Recall）和幻觉实体（低 Precision），比只看命中数更公平。", method: "把模型与 GT 的实体 ID 归一化为集合，计算 TP、FP、FN 后得到集合 F1。", citation: { label: "Visual Genome · IJCV 2017", url: "https://doi.org/10.1007/s11263-016-0981-7" } },
  { id: "spatial.relation_f1", dimension: "spatial", name: "Relation F1", zh: "空间关系覆盖", formula: "100 × set-F1(subject, predicate, object)", question: "物体之间的任务相关空间关系判断对了吗？", eligible: 9, scope: "单样本计算，再跨样本平均", methodClass: "标准公式 · 场景图关系改造", ownership: "集合 F1 非原创；三元组表示和任务相关关系口径由 Benchmark2027 冻结。", why: "实体看对不等于关系看对；该指标能定位 inside、left-of、on 等任务语义错误。", method: "每条关系编码为 subject|predicate|object，按完整三元组精确匹配后计算集合 F1。", citation: { label: "SpatialSense · ICCV 2019", url: "https://doi.org/10.1109/ICCV.2019.00214" } },
  { id: "spatial.graph_exact_match", dimension: "spatial", name: "Graph Exact Match", zh: "空间图全对率", formula: "entities 全等 且 relations 全等 → 100，否则 0", question: "局部事实能否组合成一张完全正确的空间图？", eligible: 9, scope: "单样本二值判定，再跨样本平均", methodClass: "本项目设计 · 标准 Exact Match", ownership: "完整空间图的双集合全等门由 Benchmark2027 设计；Exact Match 本身是标准严格判定。", why: "两个 F1 可能掩盖少量关键错误；严格全对率专门检查模型能否形成无遗漏、无幻觉的完整状态。", method: "实体集合和关系三元组集合必须同时与 GT 完全相等，只要多一项或少一项即为 0。", citation: { label: "Visual Genome scene graph 表示", url: "https://doi.org/10.1007/s11263-016-0981-7" } },
  { id: "decomposition.subtask_f1", dimension: "decomposition", name: "Subtask F1", zh: "子任务覆盖", formula: "100 × set-F1(action|object|destination)", question: "必要步骤是否完整，且没有发明多余步骤？", eligible: 3, scope: "每任务初始帧计算，再跨任务平均", methodClass: "标准公式 · 具身计划改造", ownership: "集合 F1 非原创；语义三元组和可接受计划集合由 Benchmark2027 定义。", why: "不受模型自定义 step ID 影响，同时分别惩罚漏步骤与凭空增加步骤。", method: "将每步转换为 action|object|destination；若 GT 有多条等价计划，整套选择总分最高的一条，禁止逐 metric 挑答案。", citation: { label: "ALFRED · CVPR 2020", url: "https://doi.org/10.1109/CVPR42600.2020.01075" } },
  { id: "decomposition.dependency_f1", dimension: "decomposition", name: "Dependency F1", zh: "依赖关系覆盖", formula: "100 × set-F1(before → after)", question: "哪些步骤必须先做、哪些后做，依赖关系对了吗？", eligible: 3, scope: "每任务初始帧计算，再跨任务平均", methodClass: "标准公式 · Task Graph 改造", ownership: "集合 F1 非原创；依赖边的语义解析与 GT task graph 由 Benchmark2027 定义。", why: "步骤集合正确仍可能顺序不可执行；依赖边单独揭示前置条件和因果顺序。", method: "先把任意 step ID 解析回语义子任务，再将每条有向边编码为 before=>after，计算集合 F1。", citation: { label: "PlanBench · 2022", url: "https://doi.org/10.48550/arXiv.2206.10498" } },
  { id: "decomposition.plan_edit_similarity", dimension: "decomposition", name: "Plan Edit Similarity", zh: "计划序列相似度", formula: "100 × (1 − Levenshtein / max sequence length)", question: "要经过多少插入、删除、替换才能修成正确计划？", eligible: 3, scope: "每任务初始帧计算，再跨任务平均", methodClass: "标准距离 · 本项目归一化", ownership: "Levenshtein 是标准序列距离；语义步骤序列与 0–100 归一化口径由 Benchmark2027 采用。", why: "Dependency F1 只看显式边；编辑相似度还能连续反映整条执行序列需要修复多少。", method: "对语义化后的预测与 GT 序列求最少插入、删除、替换次数，再除以较长序列长度。", citation: { label: "Levenshtein 1966 · edit distance", url: "https://www.mathnet.ru/eng/dan31411" } },
  { id: "progress.completed_subtask_f1", dimension: "progress", name: "Completed-step F1", zh: "已完成步骤识别", formula: "100 × set-F1(completed subtask IDs)", question: "模型是否看清哪些步骤真的已经完成？", eligible: 27, scope: "每个里程碑帧计算，再跨帧平均", methodClass: "标准公式 · 进程状态改造", ownership: "集合 F1 非原创；completed-subtask 标签由 Golden task graph 生成。", why: "连续进度值可能碰巧接近，但已完成步骤错了；集合 F1 保留具体完成了什么。", method: "比较预测与 GT 的 completed_subtasks 集合，通过 TP、FP、FN 计算 F1。", citation: { label: "ALFRED + RoboVQA", url: "https://doi.org/10.1109/ICRA57147.2024.10610216" } },
  { id: "progress.stage_accuracy", dimension: "progress", name: "Stage Accuracy", zh: "执行阶段准确率", formula: "stage_pred === stage_GT → 100，否则 0", question: "当前处于哪个离散执行阶段？", eligible: 27, scope: "每个里程碑帧计算，再跨帧平均", methodClass: "标准 Exact Match · 状态词表改造", ownership: "Exact Match 非原创；五阶段词表与里程碑映射由 Benchmark2027 冻结。", why: "提供容易解释的离散阶段诊断，避免连续分数掩盖跨阶段误判。", method: "将输出归一化后，与 not started / early / middle / late / complete 中的 GT 标签精确比较。", citation: { label: "RoboVQA · ICRA 2024", url: "https://doi.org/10.1109/ICRA57147.2024.10610216" } },
  { id: "progress.value_agreement", dimension: "progress", name: "Progress Agreement", zh: "连续进度一致度", formula: "100 × clamp(1 − |progress_pred − progress_GT|, 0, 1)", question: "0 到 1 的完成比例估计离 GT 有多远？", eligible: 27, scope: "每个里程碑帧计算，再跨帧平均", methodClass: "本项目评分映射 · 基于标准绝对误差", ownership: "绝对误差是标准量；转成越高越好的 0–100 agreement score 是 Benchmark2027 的透明设计。", why: "在离散阶段之外保留细粒度校准误差，并与其余 metric 统一为高分更好。", method: "计算预测与 GT 进度比例的绝对差，1 减去该差并截断到 [0,1]，最后乘 100。", citation: { label: "RoboVQA progress-state principle", url: "https://doi.org/10.1109/ICRA57147.2024.10610216" } },
  { id: "failure.occurrence_macro_f1", dimension: "failure", name: "Occurrence Macro-F1", zh: "失败发生检测", formula: "100 × mean(F1_no-failure, F1_failure)", question: "能否同时避免漏报失败和误报成功？", eligible: 9, scope: "9 条 episode 联合计算，不产生单 episode 分数", methodClass: "标准分类指标 · 直接采用", ownership: "Macro-F1 是通用分类指标；正负标签来自 Benchmark2027 Golden Episodes。", why: "成功样本与失败样本数量不同，Macro-F1 给两类同等权重，不让多数类掩盖失败漏检。", method: "每条 episode 贡献 (pred_has_failure, GT_has_failure)；分别计算 failure 与 no-failure 的类 F1，再不加权平均。", citation: { label: "Macro-F1 standard classification metric", url: "https://scikit-learn.org/stable/modules/generated/sklearn.metrics.f1_score.html" } },
  { id: "failure.type_macro_f1", dimension: "failure", name: "Type Macro-F1", zh: "失败类型诊断", formula: "100 × mean(F1_none, F1_in-air-drop, F1_premature-halt)", question: "不只知道失败，还能否说清失败属于哪一类？", eligible: 9, scope: "9 条 episode 联合计算，不产生单 episode 分数", methodClass: "标准分类指标 · 自定义失败 taxonomy", ownership: "Macro-F1 非原创；none / in-air drop / premature halt taxonomy 由本次 Golden set 明确定义。", why: "只报‘失败’不足以支持恢复；分类分数检查模型是否识别具体故障机制。", method: "每条 episode 贡献一对 failure_type 标签；每类单独计算 F1，再对出现于预测或 GT 的类别等权平均。", citation: { label: "Macro-F1 standard classification metric", url: "https://scikit-learn.org/stable/modules/generated/sklearn.metrics.f1_score.html" } },
  { id: "failure.onset_similarity", dimension: "failure", name: "Onset Similarity", zh: "失败时刻定位", formula: "100 × clamp(1 − |onset_pred − onset_GT|, 0, 1)", question: "第一次失败发生在整个执行的什么位置？", eligible: 6, scope: "仅真实失败 episode 单样本计算，再平均", methodClass: "本项目评分映射 · 时序定位改造", ownership: "归一化边界误差思路来自 temporal grounding；单边界 0–100 映射由 Benchmark2027 定义。", why: "恢复策略需要知道何时开始出错；只判断失败存在无法区分及时与滞后诊断。", method: "把首次失败时刻除以 episode 时长得到 [0,1] 边界；计算预测与 GT 的绝对差并转为 agreement score。", citation: { label: "Temporal Grounding · EMNLP 2018", url: "https://doi.org/10.18653/v1/D18-1015" } },
];

const dimensionCatalog = [
  { id: "spatial", resultKey: "spatial_understanding", name: "Spatial Understanding", zh: "任务相关空间理解", description: "在每个里程碑帧上判断实体、目标区域与任务相关语义空间关系。" },
  { id: "decomposition", resultKey: "subtask_decomposition", name: "Subtask Decomposition", zh: "子任务分割", description: "只看初始帧与任务指令，自主组合 action / object / destination 并形成有序任务图。" },
  { id: "progress", resultKey: "progress_estimation", name: "Progress Estimation", zh: "进程评估", description: "分别读取里程碑帧，判断已完成子目标、当前阶段与连续完成比例。" },
  { id: "failure", resultKey: "failure_detection", name: "Failure Detection", zh: "失败检测", description: "从有序执行帧识别失败是否发生、失败类型及首次发生时刻。" },
];

async function sha256(file) {
  const bytes = await readFile(file);
  return createHash("sha256").update(bytes).digest("hex");
}

function probe(file) {
  return JSON.parse(execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,avg_frame_rate,nb_frames:format=duration",
    "-of", "json", file,
  ], { encoding: "utf8" }));
}

async function publishMedia(source, taskId, outcome, expectedSha) {
  assert.equal(await sha256(source), expectedSha, `source video hash drift: ${source}`);
  const relativePath = path.join(taskId, outcome, `${expectedSha}.mp4`);
  const destination = path.join(l1MinimalRegistry.mediaBundleRoot, "media", relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  try { await link(source, destination); } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  assert.equal(await sha256(destination), expectedSha, `published video hash drift: ${destination}`);
  const info = await stat(destination);
  const metadata = probe(destination);
  const stream = metadata.streams[0];
  return {
    relativePath: relativePath.split(path.sep).join("/"),
    url: `/api/l1-minimal-media/${relativePath.split(path.sep).join("/")}`,
    sha256: expectedSha,
    bytes: info.size,
    frameCount: Number(stream.nb_frames),
    frameRate: stream.avg_frame_rate,
    width: stream.width,
    height: stream.height,
    durationSeconds: Number(metadata.format.duration),
  };
}

async function publishSampleMedia(source, expectedSha) {
  assert.equal(await sha256(source), expectedSha, `source sample image hash drift: ${source}`);
  const relativePath = path.join("samples", `${expectedSha}.png`);
  const destination = path.join(l1MinimalRegistry.mediaBundleRoot, "media", relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  try { await link(source, destination); } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  assert.equal(await sha256(destination), expectedSha, `published sample image hash drift: ${destination}`);
  const info = await stat(destination);
  return {
    relativePath: relativePath.split(path.sep).join("/"),
    url: `/api/l1-minimal-media/${relativePath.split(path.sep).join("/")}`,
    sha256: expectedSha,
    bytes: info.size,
  };
}

function readJsonl(bytes) {
  return bytes.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function outcomeLabel(outcome) {
  if (outcome === "success") return "成功";
  if (outcome === "partial_success") return "部分成功";
  if (outcome === "complete_failure") return "完整失败";
  return "任务级";
}

function outcomeFor(branch) {
  if (branch === "success") return "success";
  if (branch === "partial_success") return "partial";
  return "failure";
}

function label(value) {
  return String(value ?? "").trim().toLowerCase().replaceAll("_", " ").replace(/\s+/g, " ");
}

function relationKey(value) {
  if (Array.isArray(value) && value.length === 3) return value.map(label).join("|");
  if (value && typeof value === "object") return [value.subject, value.predicate, value.object].map(label).join("|");
  return "";
}

function subtaskKey(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return [value.action, value.object, value.destination].map(label).join("|");
  return label(value);
}

function decompositionView(value) {
  const subtasks = new Set();
  const idToKey = new Map();
  for (const [index, subtask] of (value?.subtasks ?? []).entries()) {
    const key = subtaskKey(subtask);
    if (!key) continue;
    subtasks.add(key);
    idToKey.set(label(subtask?.id ?? `step ${index + 1}`), key);
  }
  const resolve = (identity) => idToKey.get(label(identity)) ?? label(identity);
  const dependencies = new Set();
  for (const edge of value?.dependencies ?? []) {
    const fields = Array.isArray(edge) ? edge : [edge?.before, edge?.after];
    if (fields.length !== 2 || !label(fields[0]) || !label(fields[1])) continue;
    dependencies.add(`${resolve(fields[0])}=>${resolve(fields[1])}`);
  }
  return { subtasks, dependencies, sequence: (value?.sequence ?? []).map(resolve) };
}

function formatSet(values) {
  const sorted = [...values].sort();
  return sorted.length ? `{ ${sorted.join(", ")} }` : "∅";
}

function setStats(predictionValues, truthValues) {
  const prediction = new Set([...predictionValues].map(label).filter(Boolean));
  const truth = new Set([...truthValues].map(label).filter(Boolean));
  const matched = new Set([...prediction].filter((value) => truth.has(value)));
  const extra = new Set([...prediction].filter((value) => !truth.has(value)));
  const missed = new Set([...truth].filter((value) => !prediction.has(value)));
  const precision = prediction.size ? matched.size / prediction.size : truth.size ? 0 : 1;
  const recall = truth.size ? matched.size / truth.size : prediction.size ? 0 : 1;
  const f1 = matched.size || (!prediction.size && !truth.size) ? (precision + recall ? 2 * precision * recall / (precision + recall) : 1) : 0;
  return { prediction, truth, matched, extra, missed, precision, recall, score: 100 * f1 };
}

function editDistance(prediction, truth) {
  let previous = Array.from({ length: truth.length + 1 }, (_, index) => index);
  for (let row = 1; row <= prediction.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= truth.length; column += 1) {
      current.push(Math.min(current[column - 1] + 1, previous[column] + 1, previous[column - 1] + Number(prediction[row - 1] !== truth[column - 1])));
    }
    previous = current;
  }
  return previous.at(-1);
}

function number(value, digits = 3) {
  return Number(value).toFixed(digits).replace(/\.?0+$/, "");
}

function calculationFor(metricId, scored, aggregateScore) {
  const prediction = scored.prediction ?? {};
  let truth = scored.ground_truth ?? {};
  if (metricId.startsWith("decomposition.")) truth = truth.alternatives?.[scored.selected_decomposition_alternative ?? 0] ?? truth;
  const direct = (inputs, substitution, result) => ({ scope: "本样本直接计分", inputs, substitution, result, aggregateScore });
  const cohort = (inputs, result) => ({ scope: "本样本只贡献标签；分数在 9 条 episode 上联合计算", inputs, substitution: "把全部 9 对标签组成混淆计数 → 分别计算各类别 F1 → 等权平均", result, aggregateScore });

  if (metricId === "spatial.entity_f1") {
    const stats = setStats(prediction.entities ?? [], truth.entities ?? []);
    return direct([`Pred entities = ${formatSet(stats.prediction)}`, `GT entities = ${formatSet(stats.truth)}`, `TP=${stats.matched.size}, FP=${stats.extra.size}, FN=${stats.missed.size}`], `P=${number(stats.precision)}, R=${number(stats.recall)} → 100 × 2PR/(P+R)`, `本样本 ${number(scored.metrics[metricId], 1)} 分；多报 ${formatSet(stats.extra)}，漏报 ${formatSet(stats.missed)}。`);
  }
  if (metricId === "spatial.relation_f1") {
    const stats = setStats((prediction.relations ?? []).map(relationKey), (truth.relations ?? []).map(relationKey));
    return direct([`Pred relations = ${formatSet(stats.prediction)}`, `GT relations = ${formatSet(stats.truth)}`, `TP=${stats.matched.size}, FP=${stats.extra.size}, FN=${stats.missed.size}`], `P=${number(stats.precision)}, R=${number(stats.recall)} → 100 × 2PR/(P+R)`, `本样本 ${number(scored.metrics[metricId], 1)} 分；多报 ${formatSet(stats.extra)}，漏报 ${formatSet(stats.missed)}。`);
  }
  if (metricId === "spatial.graph_exact_match") {
    const entities = setStats(prediction.entities ?? [], truth.entities ?? []);
    const relations = setStats((prediction.relations ?? []).map(relationKey), (truth.relations ?? []).map(relationKey));
    const exact = !entities.extra.size && !entities.missed.size && !relations.extra.size && !relations.missed.size;
    return direct([`实体集合全等：${!entities.extra.size && !entities.missed.size ? "是" : "否"}`, `关系集合全等：${!relations.extra.size && !relations.missed.size ? "是" : "否"}`], `${exact ? "true" : "false"} → ${exact ? 100 : 0}`, `本样本 ${number(scored.metrics[metricId], 1)} 分；两个集合必须同时完全一致。`);
  }
  if (metricId === "decomposition.subtask_f1" || metricId === "decomposition.dependency_f1") {
    const predView = decompositionView(prediction);
    const truthView = decompositionView(truth);
    const key = metricId.endsWith("subtask_f1") ? "subtasks" : "dependencies";
    const stats = setStats(predView[key], truthView[key]);
    return direct([`Pred ${key} = ${formatSet(stats.prediction)}`, `GT ${key} = ${formatSet(stats.truth)}`, `TP=${stats.matched.size}, FP=${stats.extra.size}, FN=${stats.missed.size}`], `P=${number(stats.precision)}, R=${number(stats.recall)} → 100 × 2PR/(P+R)`, `本样本 ${number(scored.metrics[metricId], 1)} 分；多报 ${formatSet(stats.extra)}，漏报 ${formatSet(stats.missed)}。`);
  }
  if (metricId === "decomposition.plan_edit_similarity") {
    const predSequence = decompositionView(prediction).sequence;
    const truthSequence = decompositionView(truth).sequence;
    const distance = editDistance(predSequence, truthSequence);
    const denominator = Math.max(predSequence.length, truthSequence.length);
    return direct([`Pred sequence = [${predSequence.join(" → ")}]`, `GT sequence = [${truthSequence.join(" → ")}]`, `Levenshtein distance = ${distance}, max length = ${denominator}`], `100 × (1 − ${distance}/${denominator})`, `本样本 ${number(scored.metrics[metricId], 1)} 分；最少需要 ${distance} 次编辑。`);
  }
  if (metricId === "progress.completed_subtask_f1") {
    const stats = setStats(prediction.completed_subtasks ?? [], truth.completed_subtasks ?? []);
    return direct([`Pred completed = ${formatSet(stats.prediction)}`, `GT completed = ${formatSet(stats.truth)}`, `TP=${stats.matched.size}, FP=${stats.extra.size}, FN=${stats.missed.size}`], `P=${number(stats.precision)}, R=${number(stats.recall)} → 100 × 2PR/(P+R)`, `本帧 ${number(scored.metrics[metricId], 1)} 分；多报 ${formatSet(stats.extra)}，漏报 ${formatSet(stats.missed)}。`);
  }
  if (metricId === "progress.stage_accuracy") {
    const predStage = label(prediction.stage);
    const truthStage = label(truth.stage);
    return direct([`Pred stage = ${predStage || "∅"}`, `GT stage = ${truthStage || "∅"}`], `${predStage === truthStage ? "相等" : "不相等"} → ${predStage === truthStage ? 100 : 0}`, `本帧 ${number(scored.metrics[metricId], 1)} 分。`);
  }
  if (metricId === "progress.value_agreement") {
    const predValue = Number(prediction.progress ?? 0);
    const truthValue = Number(truth.progress ?? 0);
    const error = Math.abs(predValue - truthValue);
    return direct([`Pred progress = ${number(predValue)}`, `GT progress = ${number(truthValue)}`, `absolute error = ${number(error)}`], `100 × (1 − |${number(predValue)} − ${number(truthValue)}|)`, `本帧 ${number(scored.metrics[metricId], 1)} 分。`);
  }
  if (metricId === "failure.occurrence_macro_f1") {
    return cohort([`Pred has_failure = ${Boolean(prediction.has_failure)}`, `GT has_failure = ${Boolean(truth.has_failure)}`, `当前标签对 = (${Boolean(prediction.has_failure)}, ${Boolean(truth.has_failure)})`], `本 episode 不单独产生 Macro-F1；它贡献一个${Boolean(prediction.has_failure) === Boolean(truth.has_failure) ? "正确" : "错误"}标签对。最终汇总为 ${number(aggregateScore, 1)} 分。`);
  }
  if (metricId === "failure.type_macro_f1") {
    return cohort([`Pred type = ${label(prediction.failure_type) || "none"}`, `GT type = ${label(truth.failure_type) || "none"}`], `本 episode 不单独产生 Macro-F1；失败类型${label(prediction.failure_type) === label(truth.failure_type) ? "匹配" : "不匹配"}。最终汇总为 ${number(aggregateScore, 1)} 分。`);
  }
  const truthFailure = Boolean(truth.has_failure);
  if (!truthFailure) return { scope: "真实成功 episode 不适用", inputs: ["GT has_failure = false", "GT onset = N/A"], substitution: "成功执行没有真实失败边界，因此不进入 onset 分母", result: `本样本 N/A；最终 6 条真实失败 episode 汇总为 ${number(aggregateScore, 1)} 分。`, aggregateScore };
  const predOnset = prediction.onset_fraction === null || prediction.onset_fraction === undefined ? Number.NaN : Number(prediction.onset_fraction);
  const truthOnset = Number(truth.onset_fraction);
  if (!Number.isFinite(predOnset)) return direct(["Pred onset = N/A", `GT onset = ${number(truthOnset)}`], "缺失预测边界 → 0", "本样本 0 分；模型漏报失败时刻。");
  return direct([`Pred onset = ${number(predOnset)}`, `GT onset = ${number(truthOnset)}`, `absolute error = ${number(Math.abs(predOnset - truthOnset))}`], `100 × (1 − |${number(predOnset)} − ${number(truthOnset)}|)`, `本样本 ${number(scored.metrics[metricId], 1)} 分。`);
}

function classF1Rows(prediction, truth, classes) {
  return classes.map((className) => {
    const tp = prediction.filter((value, index) => value === className && truth[index] === className).length;
    const fp = prediction.filter((value, index) => value === className && truth[index] !== className).length;
    const fn = prediction.filter((value, index) => value !== className && truth[index] === className).length;
    const score = 2 * tp + fp + fn ? 200 * tp / (2 * tp + fp + fn) : 0;
    return `${className}: F1=${number(score, 2)} (TP=${tp}, FP=${fp}, FN=${fn})`;
  });
}

function runCalculation(metricId, sampleScores, aggregateScore) {
  if (metricId === "failure.occurrence_macro_f1" || metricId === "failure.type_macro_f1") {
    const rows = sampleScores.filter((row) => row.capability === "failure_detection");
    const occurrence = metricId === "failure.occurrence_macro_f1";
    const prediction = rows.map((row) => occurrence ? String(Boolean(row.prediction.has_failure)) : label(row.prediction.failure_type) || "none");
    const truth = rows.map((row) => occurrence ? String(Boolean(row.ground_truth.has_failure)) : label(row.ground_truth.failure_type) || "none");
    const classes = occurrence ? ["false", "true"] : [...new Set([...prediction, ...truth])].sort();
    return `${classF1Rows(prediction, truth, classes).join("；")}；类间等权平均 = ${number(aggregateScore, 2)}。`;
  }
  const values = sampleScores.map((row) => row.metrics[metricId]).filter((value) => Number.isFinite(value));
  return `${values.length} 个合格样本逐项计算后取算术平均：Σ score / ${values.length} = ${number(aggregateScore, 2)}。`;
}

function mean(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function auditedCandidateMetrics(candidateRegistry, candidateScores) {
  const registryById = new Map(candidateRegistry.metrics.map((metric) => [metric.metric_id, metric]));
  const resultById = new Map(candidateScores.metric_results.map((metric) => [metric.metric_id, metric]));
  assert.deepEqual(
    [...registryById.keys()].sort(),
    l1MetricContracts.map((metric) => metric.metric_id).sort(),
    "document-aligned L1 contract IDs must exactly match the candidate artifact",
  );
  return l1MetricContracts.map((metric) => {
    const registryMetric = registryById.get(metric.metric_id);
    const sourceResult = resultById.get(metric.metric_id);
    assert.equal(registryMetric.layer, metric.layer, `${metric.metric_id} layer drift`);
    if (metric.evidence_grade === "E3") {
      assert.equal(sourceResult?.evidence_grade, "E3", `${metric.metric_id} lacks an E3 source result`);
      assert.ok(Number.isFinite(sourceResult.score), `${metric.metric_id} lacks a finite E3 score`);
    }
    return {
      ...registryMetric,
      ...metric,
      score: metric.evidence_grade === "E3" ? sourceResult.score : null,
      score_eligible: metric.evidence_grade === "E3",
      source_candidate_evidence_grade: sourceResult?.evidence_grade ?? null,
      source_candidate_score: Number.isFinite(sourceResult?.score) ? sourceResult.score : null,
    };
  });
}

function auditedPerTask(candidateScores, metrics) {
  const byId = new Map(metrics.map((metric) => [metric.metric_id, metric]));
  return Object.fromEntries(Object.entries(candidateScores.per_task).map(([taskId, task]) => {
    const sourceById = new Map(task.metric_results.map((metric) => [metric.metric_id, metric]));
    const metricResults = metrics.map((metric) => {
      const source = sourceById.get(metric.metric_id);
      const score = metric.evidence_grade === "E3" && Number.isFinite(source?.score) ? source.score : null;
      return {
        metric_id: metric.metric_id,
        layer: metric.layer,
        evidence_grade: metric.evidence_grade,
        score_eligible: metric.evidence_grade === "E3",
        score,
        blocker: metric.blocker,
      };
    });
    const layerScores = Object.fromEntries(Object.keys(candidateScores.layer_scores).map((layer) => [
      layer,
      mean(metricResults.filter((metric) => metric.layer === layer && byId.get(metric.metric_id)?.score_eligible).map((metric) => metric.score)),
    ]));
    return [taskId, { metric_results: metricResults, layer_scores: layerScores, partial_level_1_score: null }];
  }));
}

async function build() {
  const sourceBytes = await readFile(l1MinimalRegistry.sourceSummary, "utf8");
  const source = JSON.parse(sourceBytes);
  const multiTaskSourceBytes = await readFile(l1MinimalRegistry.multiTaskSourceSummary, "utf8");
  const multiTaskSource = JSON.parse(multiTaskSourceBytes);
  const resultSummaryBytes = await readFile(path.join(l1MinimalRegistry.resultRoot, "summary.json"), "utf8");
  const resultSummary = JSON.parse(resultSummaryBytes);
  const aggregate = JSON.parse(await readFile(path.join(l1MinimalRegistry.resultRoot, "scores/aggregate.json"), "utf8"));
  const validation = JSON.parse(await readFile(path.join(l1MinimalRegistry.resultRoot, "validation.json"), "utf8"));
  const candidateRegistry = JSON.parse(await readFile(path.join(l1MinimalRegistry.candidateAuditRoot, "registry.json"), "utf8"));
  const candidateScores = JSON.parse(await readFile(path.join(l1MinimalRegistry.candidateAuditRoot, "candidate_scores.json"), "utf8"));
  const candidateMetrics = auditedCandidateMetrics(candidateRegistry, candidateScores);
  const candidateLayerScores = Object.fromEntries(Object.keys(candidateScores.layer_scores).map((layer) => [
    layer,
    mean(candidateMetrics.filter((metric) => metric.layer === layer && metric.score_eligible).map((metric) => metric.score)),
  ]));
  const candidatePerTask = auditedPerTask(candidateScores, candidateMetrics);
  const publicSamples = readJsonl(await readFile(path.join(l1MinimalRegistry.resultRoot, "dataset/public_samples.jsonl"), "utf8"));
  const sampleScores = readJsonl(await readFile(path.join(l1MinimalRegistry.resultRoot, "scores/sample_scores.jsonl"), "utf8"));
  const mediaIndex = JSON.parse(await readFile(path.join(l1MinimalRegistry.resultRoot, "dataset/media_index.json"), "utf8"));
  assert.equal(source.status, "PASS");
  assert.equal(source.acceptance.outcomes_and_process_scores_pass, true);
  assert.equal(source.acceptance.canonical_public_prefix_exact_pass, true);
  assert.equal(source.episodes.length, 3);
  assert.equal(multiTaskSource.status, "PASS");
  assert.equal(multiTaskSource.acceptance.episode_count, 6);
  assert.equal(multiTaskSource.acceptance.decoded_common_prefix_exact, true);
  assert.equal(resultSummary.status, "PASS");
  assert.equal(resultSummary.run_id, "l1-minimal-benchmark-cosmos3-nano-20260901-retry1");
  assert.equal(resultSummary.sample_count, 48);
  assert.equal(resultSummary.parse_failure_count, 0);
  assert.equal(validation.status, "PASS");
  assert.equal(publicSamples.length, 48);
  assert.equal(sampleScores.length, 48);

  const stackEpisodes = [];
  for (const episode of source.episodes) {
    const outcome = outcomeFor(episode.branch);
    stackEpisodes.push({
      id: `stack_bowls-${outcome}-seed-${source.scene_seed}`,
      outcome,
      label: outcome === "success" ? "成功" : outcome === "partial" ? "部分成功" : "完整失败",
      branch: episode.branch,
      sceneSeed: source.scene_seed,
      actionCount: episode.action_count,
      frameCount: episode.frame_count,
      completedCount: episode.completed_count,
      totalSubgoals: 2,
      progressPercent: episode.completed_count / 2 * 100,
      nativeProcessScore: episode.process_score,
      normalizedScore: episode.normalized_score,
      media: await publishMedia(episode.review_video, "stack_bowls", outcome, episode.review_video_sha256),
      evidence: {
        episodeManifestSha256: episode.episode_manifest_sha256,
        publicSequenceManifestSha256: episode.public_cam_head_manifest_sha256,
      },
    });
  }

  const derivedEpisodes = new Map();
  for (const sourceTask of multiTaskSource.tasks) {
    const episodes = [];
    for (const branch of sourceTask.branches) {
      const outcome = outcomeFor(branch.branch);
      episodes.push({
        id: `${sourceTask.task_id}-${outcome}-seed-${sourceTask.scene_seed}`,
        outcome,
        label: outcome === "success" ? "成功" : outcome === "partial" ? "部分成功" : "完整失败",
        branch: branch.branch,
        sceneSeed: sourceTask.scene_seed,
        actionCount: null,
        frameCount: branch.frame_count,
        completedCount: branch.completed_subgoals,
        totalSubgoals: branch.task_graph_total,
        progressPercent: branch.completed_subgoals / branch.task_graph_total * 100,
        nativeProcessScore: branch.native_process_score,
        normalizedScore: branch.native_process_score === null ? null : branch.native_process_score / 100,
        intervention: branch.intervention,
        haltSeconds: branch.halt_seconds,
        gtSource: branch.gt_source,
        reviewStatus: branch.review_status,
        media: await publishMedia(branch.video, sourceTask.task_id, outcome, branch.video_sha256),
        evidence: {
          sourceVideoSha256: sourceTask.source_video_sha256,
          sourceManifestSha256: sourceTask.source_manifest_sha256,
          commonPrefixFrames: sourceTask.common_prefix_frames,
          commonPrefixDecodedHashesExact: sourceTask.common_prefix_decoded_hashes_exact,
        },
      });
    }
    derivedEpisodes.set(sourceTask.task_id, episodes);
  }

  const dimensions = dimensionCatalog.map((dimension) => ({
    ...dimension,
    score: aggregate.dimension_scores[dimension.resultKey],
    metrics: metricCatalog.filter((metric) => metric.dimension === dimension.id).map((metric) => ({
      ...metric,
      score: aggregate.metric_scores[metric.id],
      runCalculation: runCalculation(metric.id, sampleScores, aggregate.metric_scores[metric.id]),
    })),
  }));
  const pipeline = [
    { id: "episodes", label: "Golden Episodes", detail: "3 tasks × success / partial / failure" },
    { id: "sampling", label: "Milestone Sampling", detail: "初始帧与任务里程碑分别取样" },
    { id: "inference", label: "Native L1 Inference", detail: "Cosmos3-Nano primary · Qwen3-VL fallback" },
    { id: "metrics", label: "12 Frozen Metrics", detail: "4 dimensions × Top 3" },
    { id: "scores", label: "Hierarchical Scores", detail: "metric → dimension → Level 1" },
  ];
  const tasks = l1MinimalRegistry.tasks.map((task) => ({
    ...task,
    episodes: task.id === "stack_bowls" ? stackEpisodes : derivedEpisodes.get(task.id) ?? [],
  }));
  const scoreRows = new Map(sampleScores.map((row) => [row.sample_id, row]));
  const publishedSampleMedia = new Map();
  for (const [relativePath, media] of Object.entries(mediaIndex)) {
    const published = await publishSampleMedia(path.join(l1MinimalRegistry.resultRoot, relativePath), media.sha256);
    publishedSampleMedia.set(relativePath, {
      ...published,
      timestampSeconds: media.timestamp_seconds,
    });
  }
  const samples = publicSamples.map((sample) => {
    const scored = scoreRows.get(sample.sample_id);
    assert.ok(scored, `missing sample score: ${sample.sample_id}`);
    const dimension = dimensionCatalog.find((item) => item.resultKey === sample.capability);
    assert.ok(dimension, `unknown capability: ${sample.capability}`);
    return {
      id: sample.sample_id,
      dimensionId: dimension.id,
      capability: sample.capability,
      taskId: sample.task_id,
      taskName: sample.task_name,
      outcome: sample.outcome,
      outcomeLabel: outcomeLabel(sample.outcome),
      prompt: sample.prompt,
      status: scored.status,
      media: sample.media_paths.map((relative) => publishedSampleMedia.get(relative)),
      prediction: scored.prediction,
      groundTruth: scored.ground_truth,
      groundTruthEvidence: scored.ground_truth_evidence,
      modelEvidence: scored.prediction?.evidence ?? "模型未提供 evidence。",
      metrics: Object.entries(scored.metrics).toSorted(([left], [right]) => metricCatalog.findIndex((metric) => metric.id === left) - metricCatalog.findIndex((metric) => metric.id === right)).map(([id, score]) => {
        const definition = metricCatalog.find((metric) => metric.id === id);
        assert.ok(definition, `missing metric definition: ${id}`);
        const aggregateScore = aggregate.metric_scores[id];
        return {
          id,
          score,
          aggregateScore,
          name: definition.name,
          zh: definition.zh,
          formula: definition.formula,
          methodClass: definition.methodClass,
          explanation: scored.metric_explanations[id],
          calculation: calculationFor(id, scored, aggregateScore),
        };
      }),
    };
  });
  const taskResults = tasks.map((task) => ({
    taskId: task.id,
    taskName: task.name,
    level1Score: aggregate.per_task[task.id].level_1_score,
    dimensions: dimensionCatalog.map((dimension) => ({
      id: dimension.id,
      score: aggregate.per_task[task.id].dimension_scores[dimension.resultKey],
    })),
  }));
  const bundle = {
    schemaVersion: l1MinimalRegistry.schemaVersion,
    bundleVersion: l1MinimalRegistry.bundleVersion,
    generatedAt: l1MinimalRegistry.generatedAt,
    evidenceStatus: "complete_minimal_benchmark",
    headline: "Level 1 · Unified Model Understanding",
    definition: "评测一体化模型基于其联合内部表示，对场景空间、任务分解、执行进程与失败状态进行结构化理解与诊断的能力。",
    protocol: {
      publicCamera: source.public_input_camera,
      privateDebugCameras: source.private_debug_cameras,
      matchedPrefixFrames: source.common_prefix.frame_range_inclusive,
      matchedPrefixExact: source.common_prefix.action_contract,
      sourceSummarySha256: createHash("sha256").update(sourceBytes).digest("hex"),
      multiTaskSourceSummarySha256: createHash("sha256").update(multiTaskSourceBytes).digest("hex"),
      scoreScale: "0–100",
      aggregation: "每项 metric 得分 → 维度内等权平均 → 四个维度等权平均为 Level 1 Score",
      resultSummarySha256: createHash("sha256").update(resultSummaryBytes).digest("hex"),
      metricContractVersion: resultSummary.metric_contract_version,
      model: "Cosmos3-Nano",
      runId: resultSummary.run_id,
    },
    dimensions,
    candidateAudit: {
      schemaVersion: l1MetricContractSource.schemaVersion,
      definitionSource: l1MetricContractSource,
      definition: candidateRegistry.level_definition,
      evidenceGrades: candidateRegistry.evidence_grades,
      layers: candidateRegistry.layers,
      metrics: candidateMetrics,
      layerScores: candidateLayerScores,
      partialLevel1Score: null,
      coverageWarning: "只展示与飞书四级矩阵 revision 264 语义一致的 E3 结果；L1-B 当前无 E3，因此不发布 Level 1 总分。",
      perTask: candidatePerTask,
      sourceRunId: candidateScores.source_run_id,
      model: candidateScores.model,
      defaultSelectedMetricIds: candidateMetrics.filter((metric) => metric.score_eligible).map((metric) => metric.metric_id),
      upstreamPins: candidateScores.upstream_pins,
      bleuSampleEvidence: [],
    },
    results: {
      level1Score: aggregate.level_1_score,
      taskResults,
      strongestDimensionId: dimensions.toSorted((a, b) => b.score - a.score)[0].id,
      weakestDimensionId: dimensions.toSorted((a, b) => a.score - b.score)[0].id,
      sampleCount: samples.length,
      parseFailures: resultSummary.parse_failure_count,
      status: resultSummary.status,
    },
    pipeline,
    tasks,
    samples,
    evidenceBoundary: resultSummary.evidence_boundary,
    counts: {
      plannedTasks: 3,
      readyTasks: tasks.filter((task) => task.status === "golden_ready").length,
      plannedEpisodes: 9,
      readyEpisodes: tasks.reduce((sum, task) => sum + task.episodes.length, 0),
      plannedMetrics: 12,
      frozenMetrics: 12,
      modelPredictions: 48,
    },
  };
  const videoFiles = tasks.flatMap((task) => task.episodes).map((episode) => ({
    path: episode.media.relativePath,
    bytes: episode.media.bytes,
    sha256: episode.media.sha256,
  }));
  const sampleFiles = [...new Map([...publishedSampleMedia.values()].map((media) => [media.sha256, {
    path: media.relativePath,
    bytes: media.bytes,
    sha256: media.sha256,
  }])).values()];
  const files = [...videoFiles, ...sampleFiles].sort((a, b) => a.path.localeCompare(b.path));
  const manifest = {
    schema_version: 2,
    bundle_id: "v0.1-20260901",
    source_run_id: `${source.run_id}+${multiTaskSource.run_id}+${resultSummary.run_id}`,
    file_count: files.length,
    total_bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
  };
  await mkdir(l1MinimalRegistry.mediaBundleRoot, { recursive: true });
  await writeFile(path.join(l1MinimalRegistry.mediaBundleRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

const rendered = await build();
if (checkOnly) {
  assert.equal(await readFile(outputPath, "utf8"), rendered, "generated L1 minimal bundle is stale");
  console.log("L1 minimal result bundle is current.");
} else {
  await writeFile(outputPath, rendered);
  console.log(`Wrote ${path.relative(root, outputPath)}`);
}
