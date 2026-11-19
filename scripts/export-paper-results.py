#!/usr/bin/env python3
"""Export the submitted manuscript's results as the site's paper-results bundle.

The CVPR 2027 manuscript (main-e22e87b) is the single source for every
published number. Headline values are read verbatim from the manuscript's
LaTeX tables; T3 per-task cells are pooled from its frozen policy episodes and
checked against those tables. Nothing is re-scored or estimated here.

Usage:
  python3 scripts/export-paper-results.py --paper /path/to/overleaf_repo
  python3 scripts/export-paper-results.py --paper /path/to/overleaf_repo --check
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "app/data/generated/paper-results.json"
SETTINGS = ["ID", "V", "S", "B", "REC"]
TAGS = ["G", "R", "F", "P", "T", "M"]  # manuscript tag S ("Order & stages") is stored as T

# Manuscript row label -> (site id, display label)
T1_MODELS = {
    "GPT-6.1 Sol": ("gpt-6.1-sol-xhigh", "GPT-6.1 Sol"),
    "DeepSeek-V4.1 Flash": ("deepseek-v4.1-flash-high", "DeepSeek-V4.1 Flash"),
    "MiniMax-M3.1 Flash": ("minimax-m3.1-flash-high", "MiniMax-M3.1 Flash"),
    "GLM-5.3 Flash": ("glm-5.3-flash-high", "GLM-5.3 Flash"),
    "GPT-6 Luna": ("gpt-6-luna-xhigh", "GPT-6 Luna"),
}
T2_MODELS = {
    "Motus": ("motus", "Motus"),
    "Ctrl-World": ("ctrl_world", "Ctrl-World"),
    "LingBot-VA": ("lingbot_va", "LingBot-VA"),
    "Pelican-Sim": ("pelican_sim", "Pelican-Sim"),
    "IRASim": ("irasim", "IRASim"),
}
T3_MODELS = {
    "G05": ("G05", "G0.5"),
    "HyVLA": ("HyVLA", "HyVLA"),
    "X-VLA": ("XVLA", "X-VLA"),
    "pi0.5": ("Pi_05", "π0.5"),
    "OpenDM": ("OpenDM", "OpenDM"),
    "OpenWAM": ("OpenWAM", "OpenWAM"),
    "FastWAM": ("FastWAM", "Fast-WAM"),
}
T4_MODELS = {
    "X-VLA": ("XVLA", "X-VLA"),
    "HyVLA": ("HyVLA", "HyVLA"),
    "FastWAM": ("FastWAM", "Fast-WAM"),
    "OpenWAM": ("OpenWAM", "OpenWAM"),
    "pi0.5": ("Pi_05", "π0.5"),
}
TASK_LABELS = {
    "Imitate Sorting Sequence": "imitate_sorting_sequence",
    "Classify Objects by Language": "classify_objects_by_language",
    "Pour Liquid Into Cup": "pour_liquid_into_cup",
    "Arrange Largest Number": "arrange_largest_number",
    "Solve Equation": "solve_equation",
    "Pack Mixed Objects Into Box v1": "pack_mixed_objects_into_box_v1",
    "Hang Mugs": "hang_mugs",
    "Cover Blocks": "cover_blocks",
    "Press By Number": "press_by_number",
    "Play Stacking Toy": "play_stacking_toy",
    "Store Tools In Toolbox": "store_tools_in_toolbox",
    "Fold Clothes": "fold_clothes",
    "Stack Bowls": "stack_bowls",
    "Match And Pick From Conveyor": "match_and_pick_from_conveyor",
    "Push T": "push_T",
    "Insert Key": "insert_key",
    "Build Tower": "build_tower",
    "Find Category Outlier": "find_category_outlier",
    "Set Button Colors": "set_button_colors",
    "Place Between References": "place_between_references",
    "Mirror Pair Layout": "mirror_pair_layout",
    "Clear Keyboard Then Close Laptop": "clear_keyboard_then_close_laptop",
    "Hold Water Mug": "hold_water_mug",
    "Hold Button Until Cue": "hold_button_until_cue",
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def clean(cell: str) -> str:
    cell = re.sub(r"\\caprowstripe\s*", "", cell)
    cell = re.sub(r"\\cellcolor(\[[^\]]*\])?\{[^}]*\}", "", cell)
    cell = re.sub(r"\\textbf\{([^{}]*)\}", r"\1", cell)
    cell = cell.replace(r"$\pi_{0.5}$", "pi0.5").replace("$", "")
    return cell.strip()


def rows_of(text: str, start: str | None = None, end: str | None = None):
    """Yield cleaned cell lists for each tabular row between optional markers."""
    if start is not None:
        text = text[text.index(start):]
    if end is not None and end in text:
        text = text[:text.index(end)]
    for line in text.splitlines():
        line = line.strip()
        if not line.endswith(r"\\") or line.startswith("%"):
            continue
        yield [clean(cell) for cell in line[:-2].split("&")]


def num(cell: str) -> float:
    return float(cell)


def frac(cell: str):
    successes, n = cell.split("/")
    return {"successes": int(successes), "n": int(n)}


def table_rows(text: str, names: dict, width: int, start=None, end=None):
    out = {}
    for cells in rows_of(text, start, end):
        if cells and cells[0] in names and len(cells) == width:
            out[cells[0]] = cells[1:]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--paper", type=Path, required=True, help="manuscript repository (Overleaf/GitHub checkout)")
    ap.add_argument("--check", action="store_true", help="verify the committed bundle instead of writing it")
    args = ap.parse_args()
    paper = args.paper.resolve()
    tables = paper / "tables"
    sources = {}

    def read(rel: str) -> str:
        path = paper / rel
        sources[rel] = sha(path)
        return path.read_text()

    # ------------------------------------------------------------ tags (Supp. Table 3)
    mapping = read("tables/task_capability_mapping.tex")
    tasks = []
    origin = "RoboDojo"
    for line in mapping.splitlines():
        if "Newly designed" in line:
            origin = "new"
        cells = [c.strip() for c in line.rstrip().removesuffix(r"\\").split("&")]
        if len(cells) != 8 or cells[0] not in TASK_LABELS:
            continue
        base, conditional = [], []
        for tag, cell in zip(TAGS, cells[1:7]):
            if "checkmark" in cell:
                (conditional if "^" in cell else base).append(tag)
        tasks.append({"id": TASK_LABELS[cells[0]], "origin": origin, "tags": base,
                      "conditionalTags": conditional, "requirement": cells[7]})
    assert len(tasks) == 24, len(tasks)
    tag_counts = {tag: sum(tag in t["tags"] + t["conditionalTags"] for t in tasks) for tag in TAGS}
    assert tag_counts == {"G": 12, "R": 13, "F": 10, "P": 11, "T": 13, "M": 14}, tag_counts

    # ------------------------------------------------------------ Table 1
    table1 = read("tables/main_capabilities.tex")
    sim, real = table1.split("% T4:")

    def tag_block(names, start, end):
        rows = table_rows(sim, names, 15, start, end)
        assert set(rows) == set(names), (start, set(names) - set(rows))
        out = {}
        for name, cells in rows.items():
            values = [num(c) for c in cells]
            pairs = {key: (values[2 * i], values[2 * i + 1]) for i, key in enumerate(TAGS + ["Overall"])}
            out[name] = pairs
        return out

    t1_tags = tag_block(T1_MODELS, "T1: VLM agents", "T2: ACWMs")
    t2_tags = tag_block(T2_MODELS, "T2: ACWMs", "T3: Policies")
    t3_tags = tag_block(T3_MODELS | {"pi0.5": T3_MODELS["pi0.5"]}, "T3: Policies", None)
    t4_rows = table_rows(real, T4_MODELS, 15)
    assert set(t4_rows) == set(T4_MODELS)

    # ------------------------------------------------------------ supplementary tables
    track_metrics = read("tables/track_metrics.tex")
    t1_summary = table_rows(track_metrics, T1_MODELS, 4, "T1: VLM agents", "Hybrid agent")
    hybrid = table_rows(track_metrics, {"Without forecasting": 0, "With forecasting": 0}, 3, "Hybrid agent", "T3: Simulation")
    t3_summary = table_rows(track_metrics, T3_MODELS, 3, "T3: Simulation")
    team = table_rows(read("tables/team_vlm_results.tex"), T1_MODELS, 13)
    axes = read("tables/evaluation_axes.tex")
    t1_axes = table_rows(axes, T1_MODELS, 7, "T1: VLM agents", "T3: Simulation")
    t3_axes = table_rows(axes, T3_MODELS, 7, "T3: Simulation", "Hybrid agent")
    hybrid_axes = table_rows(axes, {"Without forecasting": 0, "With forecasting": 0}, 7, "Hybrid agent")
    conditions = read("tables/acwm_conditions.tex")
    t2_mmse = table_rows(conditions, T2_MODELS, 6, "Motion-weighted", "EE position")
    t2_pos = table_rows(conditions, T2_MODELS, 6, "EE position", "Arm--frames")
    t2_full = table_rows(read("tables/acwm_full_results.tex"), T2_MODELS, 10)
    t4_detail = {}
    for cells in rows_of(read("tables/real_results.tex")):
        if len(cells) == 10 and cells[0] in T4_MODELS:
            t4_detail[(cells[0], cells[1])] = cells[2:]
    for got, names in [(t1_summary, T1_MODELS), (team, T1_MODELS), (t1_axes, T1_MODELS), (t3_summary, T3_MODELS),
                       (t3_axes, T3_MODELS), (t2_mmse, T2_MODELS), (t2_pos, T2_MODELS), (t2_full, T2_MODELS)]:
        assert set(got) == set(names), set(names) - set(got)
    assert len(hybrid) == 2 and len(hybrid_axes) == 2 and len(t4_detail) == 15

    # ------------------------------------------------------------ T3 per task, from frozen episodes
    episodes = []
    for rel in ["data/track_results_20261112/episodes.json", "data/policy_results_20261115/episodes.json"]:
        episodes += json.loads(read(rel))
    t3_ids = {site_id for site_id, _ in T3_MODELS.values()}
    task_ids = {task["id"].lower(): task["id"] for task in tasks}
    policy_episodes = [dict(r, task=task_ids[r["task"].lower()]) for r in episodes if r["model"] in t3_ids]
    cells = defaultdict(lambda: {"n": 0, "successes": 0, "subtask": 0.0})
    for r in policy_episodes:
        c = cells[(r["model"], r["task"], r["setting"])]
        c["n"] += 1
        c["successes"] += int(r["success"])
        c["subtask"] += float(r["subtask"])

    def mean(values):
        values = list(values)
        return sum(values) / len(values) if values else None

    def profile(model, key, tag=None):
        """Manuscript aggregation (aggregate_track_results.profile): episodes within
        task/setting, tasks within setting, then settings. Tag membership is per
        episode, so conditional tags only count eligible cases."""
        groups = defaultdict(list)
        for r in policy_episodes:
            if r["model"] == model and (tag is None or tag in r["tags"]):
                groups[(r["setting"], r["task"])].append(float(r[key]))
        by_setting = {}
        for setting in SETTINGS:
            vals = [mean(v) for (s, _), v in groups.items() if s == setting]
            if vals:
                by_setting[setting] = 100 * mean(vals)
        return mean(by_setting.values()), by_setting

    # ------------------------------------------------------------ assemble
    def r1(x):
        return None if x is None else round(x, 4)

    t1 = []
    for name, (site_id, label) in T1_MODELS.items():
        tsr, subtask, vqa = map(num, t1_summary[name])
        team_cells = [num(c) for c in team[name]]
        settings = {s: {"tsr": team_cells[3 + 2 * i], "subtask": team_cells[2 + 2 * i]} for i, s in enumerate(SETTINGS)}
        for i, s in enumerate(SETTINGS):
            assert abs(settings[s]["tsr"] - num(t1_axes[name][i])) < 1e-9, (name, s)
        t1.append({"id": site_id, "label": label,
                   "tags": {tag: {"tsr": t1_tags[name][tag][0], "score": t1_tags[name][tag][1]} for tag in TAGS},
                   "overall": {"tsr": t1_tags[name]["Overall"][0], "score": t1_tags[name]["Overall"][1]},
                   "summary": {"tsr": tsr, "subtask": subtask, "vqa": vqa, "score": team_cells[0]},
                   "settings": settings})
        assert abs(round(tsr, 1) - t1_tags[name]["Overall"][0]) < 1e-9 and abs(round(team_cells[0], 1) - t1_tags[name]["Overall"][1]) < 1e-9

    t2 = []
    keys = ["psnr", "ssim", "jepa", "jedi", "smoothness", "mmse", "subject", "eePos", "eeRot"]
    for name, (site_id, label) in T2_MODELS.items():
        metrics = dict(zip(keys, map(num, t2_full[name])))
        t2.append({"id": site_id, "label": label,
                   "tags": {tag: {"ee": t2_tags[name][tag][0], "pred": t2_tags[name][tag][1]} for tag in TAGS},
                   "overall": {"ee": t2_tags[name]["Overall"][0], "pred": t2_tags[name]["Overall"][1]},
                   "metrics": metrics,
                   "settings": {s: {"eePos": num(t2_pos[name][i]), "mmse": num(t2_mmse[name][i])} for i, s in enumerate(SETTINGS)}})
        assert abs(metrics["eePos"] - t2_tags[name]["Overall"][0]) <= 0.05 + 1e-9, name

    t3 = []
    for name, (site_id, label) in T3_MODELS.items():
        tsr_all, _ = profile(site_id, "success")
        assert abs(round(tsr_all, 1) - t3_tags[name]["Overall"][0]) < 1e-9, (name, tsr_all)
        for tag in TAGS:
            got, _ = profile(site_id, "success", tag)
            assert abs(round(got, 1) - t3_tags[name][tag][0]) < 1e-9, (name, tag, got)
        _, subtask_by_setting = profile(site_id, "subtask")
        tsr, subtask = map(num, t3_summary[name])
        per_task = {}
        for task in tasks:
            per_task[task["id"]] = {s: {"n": c["n"], "successes": c["successes"], "subtask": r1(100 * c["subtask"] / c["n"])}
                                    for s in SETTINGS if (c := cells.get((site_id, task["id"], s))) and c["n"]}
        t3.append({"id": site_id, "label": label,
                   "tags": {tag: {"tsr": t3_tags[name][tag][0], "score": t3_tags[name][tag][1]} for tag in TAGS},
                   "overall": {"tsr": t3_tags[name]["Overall"][0], "score": t3_tags[name]["Overall"][1]},
                   "summary": {"tsr": tsr, "subtask": subtask},
                   "settings": {s: {"tsr": num(t3_axes[name][i]), "subtask": r1(subtask_by_setting.get(s))} for i, s in enumerate(SETTINGS)},
                   "cases": sum(sum(v["n"] for v in t.values()) for t in per_task.values()),
                   "tasks": per_task})

    t4 = []
    t4_tasks = [("Buttons", "Button sequence", "Missing color"), ("Towel", "Towel folding", "Continuation"),
                ("Puzzle", "Puzzle insertion", "Continuation")]
    for name, (site_id, label) in T4_MODELS.items():
        values = [num(c) for c in t4_rows[name]]
        entry = {"id": site_id, "label": label, "tasks": {}, "overall": {"sr": values[12], "subtask": values[13], "n": 69}}
        for index, (task, task_label, extra) in enumerate(t4_tasks):
            d = t4_detail[(name, task)]
            entry["tasks"][task] = {
                "label": task_label, "extraLabel": extra,
                "ordinary": {"sr": values[4 * index], "subtask": values[4 * index + 1], **frac(d[4])},
                "extra": {"sr": values[4 * index + 2], "subtask": values[4 * index + 3], **frac(d[5])},
                "conditions": {s: frac(d[i]) for i, s in enumerate(["ID", "V", "S", "B"])},
            }
            assert abs(num(d[6]) - values[4 * index + 1]) < 1e-9 and abs(num(d[7]) - values[4 * index + 3]) < 1e-9
        t4.append(entry)

    hybrid_rows = []
    for name, cells_ in hybrid.items():
        axes_cells = [num(c) for c in hybrid_axes[name]]
        hybrid_rows.append({"id": "forecast" if name == "With forecasting" else "direct", "label": name,
                            "tsr": num(cells_[0]), "subtask": num(cells_[1]),
                            "settings": {s: axes_cells[i] for i, s in enumerate(SETTINGS)}})

    # ------------------------------------------------------------ findings (Sec. 5)
    # Read from the frozen cross-track package and the decision-replay table, and
    # checked against the numbers the manuscript prose reports.
    prose = read("sec/5_experiments.tex")
    r2 = lambda x: round(x + 0.0, 2)
    cross = json.loads(read("data/cross_track_20261115/summary.json"))
    assert cross["scope"]["T1"] == [site for site, _ in T1_MODELS.values()], cross["scope"]["T1"]
    assert cross["scope"]["T3"] == [site for site, _ in T3_MODELS.values()], cross["scope"]["T3"]
    task_ids = {task["id"].lower(): task["id"] for task in tasks}
    assert sorted(task_ids) == sorted(cross["task_gaps"]), "cross-track tasks differ from the task mapping"
    task_strengths = sorted(
        ({"task": task_ids[task], "gapPp": r2(gap["gap_pp"]),
          "t1": r2(100 * cross["profiles"][task]["T1"]), "t3": r2(100 * cross["profiles"][task]["T3"])}
         for task, gap in cross["task_gaps"].items()),
        key=lambda row: -row["gapPp"])
    family_tsr = {"T1": round(sum(m["summary"]["tsr"] for m in t1) / len(t1), 1),
                  "T3": round(sum(m["summary"]["tsr"] for m in t3) / len(t3), 1)}
    assert f"{family_tsr['T1']}\\% for T1 and {family_tsr['T3']}\\% for T3" in prose, family_tsr
    shifts = {}
    for setting in ["V", "S", "B", "REC"]:
        block = cross["shifts"][setting]
        shifts[setting] = {"tasks": block["T3"]["n_tasks"], "t1Pp": r2(block["T1"]["mean"]), "t3Pp": r2(block["T3"]["mean"]),
                           "t2EeRatio": r2(block["T2_position_mm"]["ratio"]), "t2MmseRatio": r2(block["T2_mmse"]["ratio"])}
    by_id = {row["id"]: row["settings"] for row in hybrid_rows}
    hybrid_v = {key: r2(by_id[key]["ID"] - by_id[key]["V"]) for key in ("direct", "forecast")}
    v = shifts["V"]
    assert f"drops by {abs(v['t3Pp']):.2f} pp for T3 policies and by {hybrid_v['direct']:.2f}/{hybrid_v['forecast']:.2f} pp" in prose, (v, hybrid_v)
    assert f"rise to {v['t2EeRatio']:.2f} and {v['t2MmseRatio']:.2f} times ID" in prose, v
    vqa = sorted(m["summary"]["vqa"] for m in t1)
    tsr = sorted(m["summary"]["tsr"] for m in t1)
    assert f"score {vqa[0]:.1f}--{vqa[-1]:.1f}\\% on VQA but attain {tsr[0]:.1f}--{tsr[-1]:.1f}\\% TSR" in prose, (vqa, tsr)

    replay_text = read("tables/acwm_decision_replay.tex")
    replay_n = [int(n) for n in re.findall(r"\(\$n=(\d+)\$\)", replay_text)]
    assert len(replay_n) == 3, replay_n
    replay = []
    for cells in rows_of(replay_text):
        if len(cells) == 4 and re.fullmatch(r"\d+ \([\d.]+\)", cells[1]):
            all_, ok, failed = (int(c.split()[0]) for c in cells[1:])
            replay.append({"forecast": cells[0], "all": all_, "planSucceeds": ok, "planFails": failed})
    assert [row["forecast"] for row in replay] == ["Blank", "LingBot-VA", "Motus", "Ctrl-World", "Pelican-Sim", "GT"], replay
    acwm = [row for row in replay if row["forecast"] not in ("Blank", "GT")]
    blank, gt = replay[0], replay[-1]
    assert (f"Local-goal attainment is {blank['all']}/{replay_n[0]} with Blank, {min(r['all'] for r in acwm)}--{max(r['all'] for r in acwm)}/{replay_n[0]} "
            f"with ACWMs, and {gt['all']}/{replay_n[0]} with GT") in prose
    assert (f"At the {replay_n[2]} points where the original plan fails, these counts are {blank['planFails']}, "
            f"{min(r['planFails'] for r in acwm)}--{max(r['planFails'] for r in acwm)}, and {gt['planFails']}") in prose
    repair = re.search(r"At the (\d+) failed-plan points with no success under any of the six conditions, .*? finds executable repairs at (\d+) points", prose)
    repair_runs = re.search(r"yield (\d+)/(\d+) successes with Blank and (\d+)/(\d+) with GT", prose)
    assert repair and repair_runs, "repairability sentence changed"
    findings = {
        "taskStrengths": {"familyTsr": family_tsr, "tasks": task_strengths},
        "conditionShifts": {"bySetting": shifts, "hybridVisualDropPp": hybrid_v},
        "answeringVsActing": {"vqa": [vqa[0], vqa[-1]], "tsr": [tsr[0], tsr[-1]]},
        "decisionReplay": {
            "points": replay_n[0], "planSucceeds": replay_n[1], "planFails": replay_n[2], "rows": replay,
            "repairs": {"unsolvedFailedPoints": int(repair[1]), "repairablePoints": int(repair[2]),
                        "blank": {"successes": int(repair_runs[1]), "n": int(repair_runs[2])},
                        "gt": {"successes": int(repair_runs[3]), "n": int(repair_runs[4])}},
        },
    }

    head = subprocess.run(["git", "-C", str(paper), "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
    bundle = {
        "schemaVersion": "roboexam.paper-results.v1",
        "paper": {"title": "RoboExam: A Shared-Task Benchmark for Robotic Components and Systems",
                  "manuscript": "CVPR 2027 submission (main-e22e87b)", "sourceCommit": head or None},
        "tags": {tag: {"tasks": tag_counts[tag]} for tag in TAGS},
        "tasks": tasks,
        "tracks": {"T1": t1, "T2": t2, "T3": t3, "T4": t4},
        "hybrid": hybrid_rows,
        "findings": findings,
        "sources": dict(sorted(sources.items())),
    }
    text = json.dumps(bundle, indent=1, ensure_ascii=False) + "\n"
    if args.check:
        current = OUT.read_text() if OUT.exists() else ""
        stable = lambda s: re.sub(r'"sourceCommit": "[^"]*"', "", s)
        if stable(current) != stable(text):
            sys.exit(f"{OUT} is out of date; rerun without --check")
        print("paper-results bundle is current")
        return
    OUT.write_text(text)
    print(f"wrote {OUT.relative_to(OUT.parents[3])} ({len(text):,} bytes) from manuscript {head}")


if __name__ == "__main__":
    main()
