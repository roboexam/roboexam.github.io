"""Consolidate the final XVLA OOD cohort and export dashboard evidence."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path("/mnt/gyc_ckp/benchmark2027/experiments/evaluation/benchmark-wzy-xvla-24tasks-ood-dlaa-v3-20261030")
FINAL = Path("/mnt/gyc_ckp/benchmark2027/experiments/evaluation/benchmark-wzy-xvla-final-24tasks-ood-349-20261101")
MEDIA_ROOT = Path(os.environ.get("XVLA_OOD_MEDIA_ROOT", "/mnt/gyc_ckp/benchmark2027/runtime/staging/dashboard-xvla-ood-20261101"))
FULL_OUT = ROOT / "app/data/generated/xvla-ood.json"
AGG_OUT = ROOT / "app/data/generated/xvla-ood-aggregates.json"
MEDIA_OUT = ROOT / "scripts/xvla-ood-media.json"
RESULT_VERSION = FINAL.name
CAMERAS = ("cam_head", "cam_left_wrist", "cam_right_wrist")
SPLITS = ("visual", "semantic", "behavior")
PROFILE = {"id": "web-360p-v1", "maxHeight": 360, "maxFps": 25, "crf": 29, "preset": "veryfast"}
METRICS = (
    "TSR", "TASK_SCORE", "FIRST_TARGET_SELECTION", "ALL_TARGET_SELECTION", "GRASP_STABILITY",
    "DROP_RATE", "LOCAL_SUCCESS_ONCE", "LOCAL_SUCCESS_AT_END", "DROP_AFTER_SUCCESS", "SPARC",
    "EE_DISPLACEMENT", "PATH_LENGTH", "SET", "PATH_EFFICIENCY", "TIME_EFFICIENCY",
    "STAGE_TRANSITION", "GOAL_RETENTION",
)
UNITS = {"TASK_SCORE": "percentage", "SPARC": "SPARC", "EE_DISPLACEMENT": "m", "PATH_LENGTH": "m", "SET": "s"}

OVERRIDES = {
    ("clear_keyboard_then_close_laptop", "semantic", 0): "keyboard-preauth-readonly-semantic0-20261031T120927",
    **{("clear_keyboard_then_close_laptop", "semantic", i): "keyboard-final-semantic-20261031T124032" for i in range(1, 5)},
    ("build_tower", "visual", 4): "source-commit-build-tower-v2-visual4-20261030T233805",
    ("find_category_outlier", "behavior", 1): "auto-find_category_outlier-behavior-1-lane1-20261030T185120",
    ("find_category_outlier", "behavior", 2): "auto-find_category_outlier-behavior-2-lane1-20261030T190150",
    ("find_category_outlier", "behavior", 3): "auto-find_category_outlier-behavior-3-lane0-20261030T191317",
    ("find_category_outlier", "behavior", 4): "auto-find_category_outlier-behavior-4-lane0-20261030T192319",
    ("place_between_references", "behavior", 3): "retry-place_between_references-behavior-3-20261030T170805",
    ("place_between_references", "behavior", 4): "auto-place_between_references-behavior-4-lane2-20261030T190700",
    ("hold_water_mug", "behavior", 0): "hold_water_mug-exact-positions-behavior-0-20261031T040818",
    ("hold_water_mug", "behavior", 1): "hold_water_mug-exact-positions-behavior-1-20261031T040818",
    ("hold_water_mug", "behavior", 2): "hold_water_mug-exact-positions-behavior-2-20261031T040818",
    ("hold_water_mug", "behavior", 3): "hold_water_mug-explicit-fill-behavior-34-20261031T033858",
    ("hold_water_mug", "behavior", 4): "hold_water_mug-exact-positions-behavior-4-20261031T040818",
    ("mirror_pair_layout", "behavior", 3): "retry-mirror_pair_layout-behavior-3-20261030T170805",
    ("mirror_pair_layout", "behavior", 4): "auto-mirror_pair_layout-behavior-4-lane2-20261030T184725",
    ("hold_button_until_cue", "behavior", 1): "hold_button-contact-capacity-behavior-1-20261031T043823",
    ("hold_button_until_cue", "behavior", 2): "hold_button-contact-capacity-behavior-2-20261031T043823",
    ("hold_button_until_cue", "behavior", 3): "auto-hold_button_until_cue-behavior-3-lane0-20261030T184641",
    ("hold_button_until_cue", "behavior", 4): "auto-hold_button_until_cue-behavior-4-lane0-20261030T185952",
    ("press_by_number", "visual", 4): "clutter-binding-press-visual4-20261031T003857",
}
EXPECTED_MISSING = {
    ("classify_objects_by_language", "behavior", 1),
    *{("classify_objects_by_language", "visual", i) for i in range(5)},
    *{("classify_objects_by_language", "semantic", i) for i in range(5)},
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def read_json(path: Path):
    return json.loads(path.read_text())


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ratio(numerator, denominator):
    return numerator / denominator if denominator else None


def mean(values):
    values = [value for value in values if value is not None]
    return sum(values) / len(values) if values else None


def finite_or_none(value) -> bool:
    return value is None or (isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value))


def local_subtasks(actions_path: Path) -> dict:
    catalogs, completed, active, lost = set(), set(), set(), set()
    with actions_path.open() as stream:
        for line in stream:
            row = json.loads(line)
            if row.get("kind") == "subtask_catalog":
                catalogs.add(row["id"])
            elif row.get("kind") == "subtask":
                subtask = row.get("subtask")
                if row.get("event") == "completed":
                    completed.add(subtask)
                    active.add(subtask)
                elif row.get("event") == "lost":
                    if subtask in completed:
                        lost.add(subtask)
                    active.discard(subtask)
    return {"registered": len(catalogs), "completed": len(completed), "active": len(active), "lost": len(lost)}


def prompt_by_layout(group_path: Path) -> dict[int, str]:
    cases = group_path.parent / "cases.json"
    if not cases.is_file():
        return {}
    return {int(str(row["episode"]).rsplit("_", 1)[-1]): row.get("prompt") for row in read_json(cases)}


def records_from_group(group_path: Path, *, allow_partial: bool = False) -> dict[tuple[str, str, int], dict]:
    group = read_json(group_path)
    task, split = group.get("task"), group.get("split")
    if split not in SPLITS or not task or (group.get("status") != "completed" and not allow_partial):
        return {}
    metric_entries = [Path(item["path"]) for item in group.get("metrics", []) if item.get("exit_code") == 0]
    if len(metric_entries) != 1:
        return {}
    metrics_dir = metric_entries[0]
    summary_path = metrics_dir / "metrics_summary.json"
    if not summary_path.is_file():
        return {}
    summary = read_json(summary_path)
    details = summary.get("official_task_result", {}).get("details", {})
    episodes = summary.get("episodes", [])
    prompts = prompt_by_layout(group_path)
    result = {}
    for position, (detail_key, detail) in enumerate(details.items()):
        layout_id = int(detail["layout_id"])
        local_index = int(detail_key) if str(detail_key).isdigit() else position
        episode = next((item for item in episodes if item.get("seed") == local_index), None)
        if episode is None and len(episodes) == len(details):
            episode = episodes[position]
        if episode is None:
            continue
        actions = metrics_dir / f"{episode['log_stem']}.actions.jsonl"
        if not actions.is_file():
            continue
        outcome = "success" if detail["success"] else "fail"
        videos = {}
        for camera in CAMERAS:
            matches = list(metrics_dir.parent.glob(f"episode_{local_index:07d}_{camera}_{outcome}.mp4"))
            if len(matches) != 1:
                break
            videos[camera] = matches[0]
        if len(videos) != len(CAMERAS):
            continue
        local = local_subtasks(actions)
        selection, grasp = episode["selection"], episode["grasp_stability"]
        kinematics, efficiency = episode["kinematics"]["both_arms"], episode["efficiency"]
        transition = episode["stage_transition"]
        values = {
            "TSR": int(bool(detail["success"])), "TASK_SCORE": detail.get("score"),
            "FIRST_TARGET_SELECTION": int(selection["first_selection_correct"]) if selection.get("first_selection_correct") is not None else None,
            "ALL_TARGET_SELECTION": ratio(selection["sequential_correct_count"], selection["evaluable_selection_count"]),
            "GRASP_STABILITY": grasp.get("stability"),
            "DROP_RATE": ratio(grasp["drop_count"], grasp["release_count"] + grasp["drop_count"]),
            "LOCAL_SUCCESS_ONCE": ratio(local["completed"], local["registered"]),
            "LOCAL_SUCCESS_AT_END": ratio(local["active"], local["registered"]),
            "DROP_AFTER_SUCCESS": ratio(local["lost"], local["registered"]),
            "SPARC": kinematics.get("sparc_mean"), "EE_DISPLACEMENT": kinematics.get("end_displacement_mean_m"),
            "PATH_LENGTH": kinematics.get("path_length_sum_m"), "SET": efficiency.get("time_to_success_s"),
            "PATH_EFFICIENCY": efficiency.get("path_efficiency"), "TIME_EFFICIENCY": efficiency.get("time_efficiency"),
            "STAGE_TRANSITION": transition.get("accuracy"), "GOAL_RETENTION": ratio(local["active"], local["completed"]),
        }
        require(all(finite_or_none(value) for value in values.values()), f"non-finite values: {task}/{split}/{layout_id}")
        result[(task, split, layout_id)] = {
            "task": task, "split": split, "layoutId": layout_id, "success": bool(detail["success"]),
            "score": detail.get("score"), "prompt": prompts.get(layout_id), "values": values,
            "counts": {
                "allCorrect": selection["sequential_correct_count"], "allEvaluable": selection["evaluable_selection_count"],
                "established": grasp["established_grasps"], "invalid": grasp["grasp_invalid_count"],
                "release": grasp["release_count"], "drop": grasp["drop_count"],
                "localRegistered": local["registered"], "localCompleted": local["completed"],
                "localActive": local["active"], "localLost": local["lost"],
                "transitionCorrect": transition["reasonable_transition_count"], "transitionDenominator": transition["denominator"],
            },
            "source": {
                "groupResult": str(group_path.resolve()), "metricsSummary": str(summary_path.resolve()),
                "actions": str(actions.resolve()), "videos": {camera: str(path.resolve()) for camera, path in videos.items()},
            },
            "sourceSha256": sha256(summary_path),
        }
    return result


def collect_records() -> tuple[list[str], dict[tuple[str, str, int], dict]]:
    records = {}
    groups = sorted(SOURCE.glob("lane-*/rank-*/*/*/group-result.json"))
    groups += sorted(SOURCE.glob("lane-*/rank-*/*/visual/episode_*/group-result.json"))
    for group in groups:
        records.update(records_from_group(group, allow_partial=True))
    retry_groups = sorted(
        (group for group in (SOURCE / "retries").glob("*/lane-*/rank-*/*/*/group-result.json") if not group.parts[-6].startswith("canary")),
        key=lambda path: path.stat().st_mtime,
    )
    retry_groups += sorted(
        (group for group in (SOURCE / "retries").glob("*/lane-*/rank-*/*/visual/episode_*/group-result.json") if not group.parts[-7].startswith("canary")),
        key=lambda path: path.stat().st_mtime,
    )
    for group in retry_groups:
        records.update(records_from_group(group, allow_partial=True))
    for key in EXPECTED_MISSING:
        records.pop(key, None)
    for key, retry_name in OVERRIDES.items():
        retry_root = SOURCE / "retries" / retry_name
        groups = sorted(retry_root.glob("lane-*/rank-*/*/*/group-result.json"))
        groups += sorted(retry_root.glob("lane-*/rank-*/*/visual/episode_*/group-result.json"))
        candidates = {}
        for group in groups:
            candidates.update(records_from_group(group, allow_partial=True))
        require(key in candidates, f"audited retry missing requested cell: {key} in {retry_name}")
        records[key] = candidates[key]
        records[key]["source"]["retry"] = retry_name
    tasks = sorted({key[0] for key in records} | {"classify_objects_by_language"})
    require(len(tasks) == 24, f"expected 24 tasks, got {len(tasks)}")
    all_cells = {(task, split, layout) for task in tasks for split in SPLITS for layout in range(5)}
    missing = all_cells - set(records)
    require(missing == EXPECTED_MISSING, f"unexpected missing cells: {sorted(missing)}")
    require(len(records) == 349, f"expected 349 final records, got {len(records)}")
    return tasks, records


def display(value, unit: str) -> str:
    if value is None:
        return "N/A"
    if unit == "rate":
        return f"{value * 100:.2f}%"
    if unit == "percentage":
        return f"{value * 100:.2f}"
    return f"{value:.3f} {unit}" if unit else f"{value:.3f}"


def aggregate(rows: list[dict]) -> dict:
    counts = {name: sum(row["counts"][name] for row in rows) for name in rows[0]["counts"]} if rows else {}
    specs = {
        "TSR": (mean([row["values"]["TSR"] for row in rows]), len(rows), "rate", "official successes / available episodes"),
        "TASK_SCORE": (mean([row["values"]["TASK_SCORE"] for row in rows]), len(rows), "percentage", "mean registered-subtask completion rate"),
        "FIRST_TARGET_SELECTION": (mean([row["values"]["FIRST_TARGET_SELECTION"] for row in rows]), sum(row["values"]["FIRST_TARGET_SELECTION"] is not None for row in rows), "rate", "evaluable episodes"),
        "ALL_TARGET_SELECTION": (ratio(counts.get("allCorrect", 0), counts.get("allEvaluable", 0)), counts.get("allEvaluable", 0), "rate", "evaluable target selections"),
        "GRASP_STABILITY": (ratio(counts.get("established", 0), counts.get("established", 0) + counts.get("invalid", 0)), counts.get("established", 0) + counts.get("invalid", 0), "rate", "established / (established + invalid)"),
        "DROP_RATE": (ratio(counts.get("drop", 0), counts.get("release", 0) + counts.get("drop", 0)), counts.get("release", 0) + counts.get("drop", 0), "rate", "drops / (releases + drops)"),
        "LOCAL_SUCCESS_ONCE": (ratio(counts.get("localCompleted", 0), counts.get("localRegistered", 0)), counts.get("localRegistered", 0), "rate", "registered local subtasks"),
        "LOCAL_SUCCESS_AT_END": (ratio(counts.get("localActive", 0), counts.get("localRegistered", 0)), counts.get("localRegistered", 0), "rate", "registered local subtasks"),
        "DROP_AFTER_SUCCESS": (ratio(counts.get("localLost", 0), counts.get("localRegistered", 0)), counts.get("localRegistered", 0), "rate", "completed then lost / registered subtasks"),
        "SPARC": (mean([row["values"]["SPARC"] for row in rows]), sum(row["values"]["SPARC"] is not None for row in rows), "SPARC", "episode mean"),
        "EE_DISPLACEMENT": (mean([row["values"]["EE_DISPLACEMENT"] for row in rows]), sum(row["values"]["EE_DISPLACEMENT"] is not None for row in rows), "m", "episode mean"),
        "PATH_LENGTH": (mean([row["values"]["PATH_LENGTH"] for row in rows]), sum(row["values"]["PATH_LENGTH"] is not None for row in rows), "m", "mean episode path length"),
        "SET": (mean([row["values"]["SET"] for row in rows]), sum(row["values"]["SET"] is not None for row in rows), "s", "successful episodes only"),
        "PATH_EFFICIENCY": (mean([row["values"]["PATH_EFFICIENCY"] for row in rows]), sum(row["values"]["PATH_EFFICIENCY"] is not None for row in rows), "rate", "successful episodes with frozen reference path"),
        "TIME_EFFICIENCY": (mean([row["values"]["TIME_EFFICIENCY"] for row in rows]), sum(row["values"]["TIME_EFFICIENCY"] is not None for row in rows), "rate", "successful episodes with frozen reference time"),
        "STAGE_TRANSITION": (ratio(counts.get("transitionCorrect", 0), counts.get("transitionDenominator", 0)), counts.get("transitionDenominator", 0), "rate", "evaluable stage transitions"),
        "GOAL_RETENTION": (ratio(counts.get("localActive", 0), counts.get("localCompleted", 0)), counts.get("localCompleted", 0), "rate", "completed goals with retention evidence"),
    }
    result = {}
    for metric, (value, n, unit, detail) in specs.items():
        result[metric] = {"value": value, "n": n, "unit": unit, "primary": display(value, unit), "available": value is not None, "coverage": ratio(n, len(rows)) if n <= len(rows) else None, "detail": detail}
    for metric, detail in (("COLLISION_RATE", "Current logs do not contain the complete collision telemetry contract."), ("ROBUSTNESS", "A matched nominal / perturbed cohort is not present.")):
        result[metric] = {"value": None, "n": 0, "unit": "rate", "primary": "N/A", "available": False, "coverage": None, "detail": detail}
    return result


def probe(path: Path) -> dict:
    raw = subprocess.check_output(["/usr/bin/ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,nb_frames,avg_frame_rate:format=duration", "-of", "json", str(path)], text=True)
    document = json.loads(raw)
    stream = document["streams"][0]
    numerator, denominator = stream.get("avg_frame_rate", "0/1").split("/")
    fps = float(numerator) / float(denominator)
    return {"codec": stream.get("codec_name"), "width": int(stream["width"]), "height": int(stream["height"]), "frameCount": int(stream.get("nb_frames") or round(float(document["format"]["duration"]) * fps)), "fps": fps, "durationSeconds": float(document["format"]["duration"])}


def transcode(source: Path) -> dict:
    source = source.resolve()
    require(source.is_relative_to(SOURCE.resolve()), f"video escaped source root: {source}")
    source_digest, source_probe = sha256(source), probe(source)
    target_height = min(PROFILE["maxHeight"], source_probe["height"])
    target_width = max(2, round(source_probe["width"] * target_height / source_probe["height"] / 2) * 2)
    target_fps = min(PROFILE["maxFps"], source_probe["fps"])
    staging = MEDIA_ROOT / PROFILE["id"] / f".{source_digest}.{os.getpid()}.tmp.mp4"
    staging.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["/usr/bin/ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", str(source), "-map", "0:v:0", "-an", "-vf", f"scale={target_width}:{target_height}:flags=lanczos,fps={target_fps}", "-c:v", "libx264", "-preset", PROFILE["preset"], "-crf", str(PROFILE["crf"]), "-maxrate", "700k", "-bufsize", "1400k", "-g", str(max(1, round(target_fps * 2))), "-keyint_min", str(max(1, round(target_fps))), "-sc_threshold", "0", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-map_metadata", "-1", "-threads", "2", str(staging)], check=True)
    rendered = probe(staging)
    require(rendered["codec"] == "h264" and rendered["height"] <= PROFILE["maxHeight"] and rendered["fps"] <= PROFILE["maxFps"] + 0.01, f"rendition profile mismatch: {source}")
    output_digest = sha256(staging)
    destination = MEDIA_ROOT / PROFILE["id"] / f"{output_digest}.mp4"
    if destination.exists():
        require(sha256(destination) == output_digest, f"existing rendition mismatch: {destination}")
        staging.unlink()
    else:
        staging.replace(destination)
    return {"url": f"/api/xvla-24id-media/{output_digest}.mp4", "sha256": output_digest, "path": str(destination.resolve()), "size": destination.stat().st_size, **{key: rendered[key] for key in ("durationSeconds", "frameCount", "width", "height")}}


def write_final(records: dict) -> None:
    FINAL.mkdir(parents=True, exist_ok=False)
    manifest_records = []
    for key in sorted(records):
        row = records[key]
        relative = Path("records") / row["task"] / row["split"] / f"episode_{row['layoutId']}.json"
        target = FINAL / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(row, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
        manifest_records.append({"task": row["task"], "split": row["split"], "layoutId": row["layoutId"], "record": str(relative), "sourceSha256": row["sourceSha256"]})
    missing = [{"task": task, "split": split, "layoutId": layout} for task, split, layout in sorted(EXPECTED_MISSING)]
    manifest = {"schemaVersion": "unibench.xvla-ood-final.v1", "resultVersion": RESULT_VERSION, "sourceBatch": str(SOURCE), "expected": 360, "available": 349, "missingCount": 11, "taskCount": 24, "splits": list(SPLITS), "records": manifest_records, "missing": missing}
    (FINAL / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    (FINAL / "README.md").write_text("# XVLA final OOD cohort\n\n349 validated task/split/layout records consolidated from the initial lanes and audited reruns. Original runs are unchanged; every record retains source provenance and SHA-256 identity. Eleven unavailable cells are listed in `manifest.json`.\n")


def build_dashboard(tasks: list[str], records: dict, jobs: int) -> None:
    data = {split: {} for split in SPLITS}
    futures = {}
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        for split in SPLITS:
            for task in tasks:
                rows = [records[(task, split, layout)] for layout in range(5) if (task, split, layout) in records]
                samples = []
                for row in rows:
                    sample = {"id": f"{RESULT_VERSION}:{task}:{split}:{row['layoutId']}", "sourceEpisode": f"episode_{row['layoutId']}", "layoutId": row["layoutId"], "status": "completed", "success": row["success"], "score": row["score"], "metricsAvailable": True, "values": {**row["values"], "COLLISION_RATE": None, "ROBUSTNESS": None}, "units": {metric: UNITS.get(metric, "rate") for metric in (*METRICS, "COLLISION_RATE", "ROBUSTNESS")}, "videos": [], "reportSha256": row["sourceSha256"], "promptVersion": "v3", "prompt": row["prompt"], "sourceBatch": RESULT_VERSION}
                    for camera, path in row["source"]["videos"].items():
                        futures[pool.submit(transcode, Path(path))] = (sample, camera)
                    samples.append(sample)
                data[split][task] = {"task": task, "model": "XVLA", "split": split, "resultVersion": RESULT_VERSION, "protocol": "XVLA final 24-task DLAa OOD cohort; initial runs plus audited reruns; five registered layouts per task and split where available", "promptVersion": "v3", "sourceBatch": RESULT_VERSION, "expectedEpisodes": 5, "episodes": len(rows), "incompleteEpisodes": 5 - len(rows), "successes": sum(row["success"] for row in rows), "values": aggregate(rows), "samples": samples, "sourceSummarySha256": sha256(FINAL / "manifest.json")}
        completed = 0
        for future in as_completed(futures):
            sample, camera = futures[future]
            video = future.result()
            sample["videos"].append({"camera": camera, **{key: value for key, value in video.items() if key not in ("path", "size")}})
            completed += 1
            if completed % 30 == 0:
                print(f"Rendered {completed}/{len(futures)} videos", flush=True)
    media = {}
    for split in SPLITS:
        for task in data[split].values():
            for sample in task["samples"]:
                sample["videos"].sort(key=lambda item: CAMERAS.index(item["camera"]))
                for video in sample["videos"]:
                    key, path = video["sha256"] + ".mp4", MEDIA_ROOT / PROFILE["id"] / (video["sha256"] + ".mp4")
                    media[key] = {"path": str(path.resolve()), "size": path.stat().st_size, "sha256": video["sha256"], "profile": PROFILE["id"]}
    require(sum(len(task["samples"]) for split in data.values() for task in split.values()) == 349, "dashboard sample total mismatch")
    require(sum(len(sample["videos"]) for split in data.values() for task in split.values() for sample in task["samples"]) == 1047, "dashboard video total mismatch")
    aggregates = {split: {task: {key: value for key, value in entry.items() if key != "samples"} for task, entry in tasks_data.items()} for split, tasks_data in data.items()}
    FULL_OUT.parent.mkdir(parents=True, exist_ok=True)
    for path, document in ((FULL_OUT, data), (AGG_OUT, aggregates), (MEDIA_OUT, media)):
        text = json.dumps(document, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
        require("/mnt/" not in text or path == MEDIA_OUT, f"server path leaked into browser data: {path.name}")
        path.write_text(text)


def check_existing() -> None:
    full, aggregates, media = read_json(FULL_OUT), read_json(AGG_OUT), read_json(MEDIA_OUT)
    require(set(full) == set(SPLITS) == set(aggregates), "split mismatch")
    require(all(len(full[split]) == 24 for split in SPLITS), "task count mismatch")
    require(sum(len(task["samples"]) for split in full.values() for task in split.values()) == 349, "sample count mismatch")
    require(sum(len(sample["videos"]) for split in full.values() for task in split.values() for sample in task["samples"]) == 1047, "video count mismatch")
    require(read_json(FINAL / "manifest.json")["available"] == 349, "final manifest mismatch")
    for key, item in media.items():
        path = Path(item["path"])
        require(key == item["sha256"] + ".mp4" and path.is_file() and path.stat().st_size == item["size"] and sha256(path) == item["sha256"], f"invalid media item: {key}")
    print(f"Verified XVLA OOD final export: 24 tasks, 349 records, 1047 video references, {len(media)} unique renditions")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--collect-check", action="store_true")
    parser.add_argument("--dashboard-only", action="store_true")
    parser.add_argument("--jobs", type=int, default=12)
    args = parser.parse_args()
    if args.check:
        check_existing()
        return
    require(1 <= args.jobs <= 16, "--jobs must be between 1 and 16")
    tasks, records = collect_records()
    if args.collect_check:
        print(f"Verified source selection: {len(tasks)} tasks, {len(records)} records, {len(EXPECTED_MISSING)} missing")
        return
    if args.dashboard_only:
        require(FINAL.exists(), f"final cohort is missing: {FINAL}")
        build_dashboard(tasks, records, args.jobs)
        print(f"Refreshed dashboard export for {RESULT_VERSION}: 349 records, 1047 web video references")
        return
    require(not FINAL.exists(), f"final cohort already exists: {FINAL}")
    write_final(records)
    build_dashboard(tasks, records, args.jobs)
    print(f"Exported {RESULT_VERSION}: 349 records, 1047 web video references")


if __name__ == "__main__":
    main()
