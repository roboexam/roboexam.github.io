"""Export the frozen XVLA 24-task ID cohort and web video renditions."""
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
V1_SOURCE = Path("/mnt/gyc/benchmark2027/wzy/exp/benchmark-wzy-xvla-24id-dlaa-20261029t101834")
V3_SOURCE = Path("/mnt/gyc/benchmark2027/wzy/exp/benchmark-wzy-xvla-8tasks-id-promptv3-dlaa-20261029")
V3_TASKS = frozenset({
    "arrange_largest_number", "clear_keyboard_then_close_laptop",
    "find_category_outlier", "hold_button_until_cue", "hold_water_mug",
    "mirror_pair_layout", "place_between_references", "set_button_colors",
})
SOURCE_ROOTS = (V1_SOURCE, V3_SOURCE)
MEDIA_ROOT = Path(os.environ.get(
    "XVLA_24ID_MEDIA_ROOT",
    "/mnt/gyc_ckp/benchmark2027/runtime/staging/dashboard-xvla-preview-20261029",
))
FULL_OUT = ROOT / "app/data/generated/xvla-24id.json"
AGG_OUT = ROOT / "app/data/generated/xvla-24id-aggregates.json"
MEDIA_OUT = ROOT / "scripts/xvla-24id-media.json"
RESULT_VERSION = "benchmark-wzy-xvla-final-24id-v3v1-20261030"
CAMERAS = ("cam_head", "cam_left_wrist", "cam_right_wrist")
PROFILE = {"id": "web-360p-v1", "maxHeight": 360, "maxFps": 25, "crf": 29, "preset": "veryfast"}
METRICS = (
    "TSR", "TASK_SCORE", "FIRST_TARGET_SELECTION", "ALL_TARGET_SELECTION",
    "GRASP_STABILITY", "DROP_RATE", "LOCAL_SUCCESS_ONCE", "LOCAL_SUCCESS_AT_END",
    "DROP_AFTER_SUCCESS", "SPARC", "EE_DISPLACEMENT", "PATH_LENGTH", "SET",
    "PATH_EFFICIENCY", "TIME_EFFICIENCY", "STAGE_TRANSITION", "GOAL_RETENTION",
)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def finite_or_none(value) -> bool:
    return value is None or (
        isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
    )


def probe(path: Path) -> dict:
    raw = subprocess.check_output([
        "/usr/bin/ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=codec_name,width,height,nb_frames,avg_frame_rate:format=duration",
        "-of", "json", str(path),
    ], text=True)
    document = json.loads(raw)
    require(len(document.get("streams", [])) == 1, f"missing video stream: {path}")
    stream = document["streams"][0]
    numerator, denominator = stream.get("avg_frame_rate", "0/1").split("/")
    fps = float(numerator) / float(denominator)
    return {
        "codec": stream.get("codec_name"),
        "width": int(stream["width"]),
        "height": int(stream["height"]),
        "frameCount": int(stream.get("nb_frames") or round(float(document["format"]["duration"]) * fps)),
        "fps": fps,
        "durationSeconds": float(document["format"]["duration"]),
    }


def transcode(source: Path) -> dict:
    source = source.resolve()
    require(any(source.is_relative_to(root.resolve()) for root in SOURCE_ROOTS),
            f"video escaped source roots: {source}")
    source_digest = sha256(source)
    source_probe = probe(source)
    target_height = min(PROFILE["maxHeight"], source_probe["height"])
    target_width = max(2, round(source_probe["width"] * target_height / source_probe["height"] / 2) * 2)
    target_fps = min(PROFILE["maxFps"], source_probe["fps"])
    staging = MEDIA_ROOT / PROFILE["id"] / f".{source_digest}.{os.getpid()}.tmp.mp4"
    staging.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        "/usr/bin/ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
        "-i", str(source), "-map", "0:v:0", "-an",
        "-vf", f"scale={target_width}:{target_height}:flags=lanczos,fps={target_fps}",
        "-c:v", "libx264", "-preset", PROFILE["preset"], "-crf", str(PROFILE["crf"]),
        "-maxrate", "700k", "-bufsize", "1400k", "-g", str(max(1, round(target_fps * 2))),
        "-keyint_min", str(max(1, round(target_fps))), "-sc_threshold", "0",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-map_metadata", "-1", "-threads", "2",
        str(staging),
    ], check=True)
    rendered = probe(staging)
    require(rendered["codec"] == "h264", f"wrong codec: {staging}")
    require(rendered["height"] <= PROFILE["maxHeight"] and rendered["fps"] <= PROFILE["maxFps"] + 0.01,
            f"rendition profile mismatch: {staging}")
    require(abs(rendered["durationSeconds"] - source_probe["durationSeconds"]) <= max(0.25, 2 / source_probe["fps"]),
            f"duration drift: {source}")
    output_digest = sha256(staging)
    destination = MEDIA_ROOT / PROFILE["id"] / f"{output_digest}.mp4"
    if destination.exists():
        require(sha256(destination) == output_digest, f"existing rendition hash mismatch: {destination}")
        staging.unlink()
    else:
        staging.replace(destination)
    return {
        "url": f"/api/xvla-24id-media/{output_digest}.mp4",
        "sha256": output_digest,
        "sourceSha256": source_digest,
        "path": str(destination.resolve()),
        "size": destination.stat().st_size,
        **{key: rendered[key] for key in ("durationSeconds", "frameCount", "width", "height")},
    }


def ratio(numerator, denominator):
    return numerator / denominator if denominator else None


def episode_values(row: dict) -> dict:
    if not row.get("metrics_available"):
        return {metric: None for metric in METRICS}
    local = row["local_subtasks"]
    return {
        "TSR": row["official_success_rate"],
        "TASK_SCORE": row["task_score"],
        "FIRST_TARGET_SELECTION": int(row["first_selection_correct"]) if row.get("first_selection_correct") is not None else None,
        "ALL_TARGET_SELECTION": ratio(row["all_selection_correct_count"], row["all_selection_evaluable_count"]),
        "GRASP_STABILITY": ratio(row["established_grasp_count"], row["established_grasp_count"] + row["grasp_invalid_count"]),
        "DROP_RATE": ratio(row["drop_count"], row["release_count"] + row["drop_count"]),
        "LOCAL_SUCCESS_ONCE": local["completed_once_rate"],
        "LOCAL_SUCCESS_AT_END": local["active_at_end_rate"],
        "DROP_AFTER_SUCCESS": local["drop_after_success_rate"],
        "SPARC": row["sparc_mean"],
        "EE_DISPLACEMENT": row["end_displacement_mean_m"],
        "PATH_LENGTH": row["path_length_sum_m"],
        "SET": row["time_to_success_s"],
        "PATH_EFFICIENCY": row["path_efficiency"],
        "TIME_EFFICIENCY": row["time_efficiency"],
        "STAGE_TRANSITION": ratio(row["stage_transition_correct_count"], row["stage_transition_denominator"]),
        "GOAL_RETENTION": local["completed_goal_retention"],
    }


UNITS = {
    "TASK_SCORE": "score", "SPARC": "SPARC", "EE_DISPLACEMENT": "m",
    "PATH_LENGTH": "m", "SET": "s",
}


def display(value, unit: str) -> str:
    if value is None:
        return "N/A"
    if unit == "rate":
        return f"{value * 100:.2f}%"
    return f"{value:.3f} {unit}" if unit else f"{value:.3f}"


def aggregate_values(task: dict) -> dict:
    aggregate = task["aggregate"]
    den = task["metric_denominators"]
    episodes = task["episodes"]
    valid = task["valid_episode_count"]
    success = aggregate["task_success_count"]
    specs = {
        "TSR": (aggregate["task_success_rate"], valid, "rate", "official successes / valid episodes"),
        "TASK_SCORE": (aggregate["task_score"], valid, "score", "task-native subtask score"),
        "FIRST_TARGET_SELECTION": (aggregate["first_selection_accuracy"], task["first_selection_evaluable_episode_count"], "rate", "evaluable episodes"),
        "ALL_TARGET_SELECTION": (aggregate["all_selection_accuracy"], den["all_selection_evaluable_count"], "rate", "evaluable target selections"),
        "GRASP_STABILITY": (aggregate["grasp_stability"], den["established_grasp_count"] + den["grasp_invalid_count"], "rate", "established / (established + invalid)"),
        "DROP_RATE": (aggregate["drop_rate"], den["release_count"] + den["drop_count"], "rate", "drops / (releases + drops)"),
        "LOCAL_SUCCESS_ONCE": (aggregate["local_success_once"], den["local_registered_count"], "rate", "registered local subtasks"),
        "LOCAL_SUCCESS_AT_END": (aggregate["local_success_at_end"], den["local_registered_count"], "rate", "registered local subtasks"),
        "DROP_AFTER_SUCCESS": (aggregate["drop_after_success"], den["local_registered_count"], "rate", "registered local subtasks"),
        "SPARC": (aggregate["sparc_mean"], sum(e.get("sparc_mean") is not None for e in episodes), "SPARC", "episode mean"),
        "EE_DISPLACEMENT": (aggregate["end_displacement_mean_m"], sum(e.get("end_displacement_mean_m") is not None for e in episodes), "m", "episode mean"),
        "PATH_LENGTH": (aggregate["path_length_mean_m"], sum(e.get("path_length_sum_m") is not None for e in episodes), "m", "mean episode path length"),
        "SET": (aggregate["time_to_success_s"], sum(e.get("time_to_success_s") is not None for e in episodes), "s", "successful episodes only"),
        "PATH_EFFICIENCY": (aggregate["path_efficiency_mean"], task["efficiency_evaluable_episode_count"], "rate", "successful episodes with frozen reference path"),
        "TIME_EFFICIENCY": (aggregate["time_efficiency_mean"], task["efficiency_evaluable_episode_count"], "rate", "successful episodes with frozen reference time"),
        "STAGE_TRANSITION": (aggregate["stage_transition_accuracy"], den["stage_transition_denominator"], "rate", "evaluable stage transitions"),
        "GOAL_RETENTION": (aggregate["completed_goal_retention"], den["local_completed_once_count"], "rate", "completed goals with retention evidence"),
    }
    values = {}
    for metric, (value, n, unit, detail) in specs.items():
        require(finite_or_none(value), f"non-finite aggregate {task['task']} {metric}")
        values[metric] = {
            "value": value, "n": n, "unit": unit, "primary": display(value, unit),
            "available": value is not None, "coverage": n / valid if valid and n <= valid else None,
            "detail": detail,
        }
    for metric, detail in (
        ("COLLISION_RATE", "Current logs do not contain the complete collision telemetry contract."),
        ("ROBUSTNESS", "A matched nominal / perturbed cohort is not present."),
    ):
        values[metric] = {"value": None, "n": 0, "unit": "rate", "primary": "N/A", "available": False, "coverage": None, "detail": detail}
    require(success == sum(e.get("official_success_rate") == 1 for e in episodes), f"success mismatch {task['task']}")
    return values


def locate_videos(row: dict) -> dict[str, Path]:
    if not row.get("metrics_available"):
        return {}
    source_root = Path(row.get("source_root", V1_SOURCE)).resolve()
    metrics_ref = Path(row["metrics_file"])
    metrics = (metrics_ref if metrics_ref.is_absolute() else source_root / metrics_ref).resolve()
    require(metrics.is_relative_to(source_root) and metrics.is_file(), f"missing metric file: {metrics}")
    episode_root = metrics.parent.parent
    outcome = "success" if row["official_success_rate"] == 1 else "fail"
    found = {}
    for camera in CAMERAS:
        matches = list(episode_root.glob(f"episode_*_{camera}_{outcome}.mp4"))
        require(len(matches) == 1, f"expected one {camera} video for {row['task']} {row['episode']}")
        found[camera] = matches[0]
    return found


def local_subtasks(actions_path: Path) -> dict:
    catalogs = set()
    completed = set()
    active = set()
    lost_after_completed = set()
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
                        lost_after_completed.add(subtask)
                    active.discard(subtask)
    registered = len(catalogs)
    return {
        "registered_count": registered,
        "completed_once_count": len(completed),
        "active_at_end_count": len(active),
        "lost_after_completed_count": len(lost_after_completed),
        "dropped_by_end_count": len(completed - active),
        "completed_once_rate": ratio(len(completed), registered),
        "active_at_end_rate": ratio(len(active), registered),
        "drop_after_success_rate": ratio(len(lost_after_completed), registered),
        "completed_goal_retention": ratio(len(active), len(completed)),
    }


def mean(values):
    values = [value for value in values if value is not None]
    return sum(values) / len(values) if values else None


def build_v3_task(task_name: str) -> tuple[dict, Path]:
    source_files = sorted(V3_SOURCE.glob(f"lane-*/rank-*/{task_name}/episode_*/source.json"))
    require(len(source_files) == 5, f"expected five v3 source episodes for {task_name}")
    rows = []
    for source_path in source_files:
        episode_dir = source_path.parent
        episode = episode_dir.name
        result = json.loads((episode_dir / "episode-result.json").read_text())
        source = json.loads(source_path.read_text())
        metrics_files = list(episode_dir.glob("attempt-01/eval_result/**/Metrics/metrics_summary.json"))
        require(len(metrics_files) == 1, f"expected one v3 metric report for {task_name} {episode}")
        metrics_path = metrics_files[0]
        metrics = json.loads(metrics_path.read_text())
        action_files = list(metrics_path.parent.glob("*.actions.jsonl"))
        require(len(action_files) == 1, f"expected one v3 action log for {task_name} {episode}")
        aggregate = metrics["aggregate"]
        episode_metric = metrics["episodes"][0]
        official = metrics["official_task_result"]
        detail = next(iter(official["details"].values()))
        local = local_subtasks(action_files[0])
        rows.append({
            "task": task_name, "episode": episode, "layout_id": detail["layout_id"],
            "status": result["status"], "official_success_rate": official["success_rate"],
            "task_score": official["score"], "metrics_available": True,
            "metrics_file": str(metrics_path), "source_root": str(V3_SOURCE),
            "prompt": source["prompt"], "prompt_version": "v3",
            "first_selection_correct": episode_metric["selection"]["first_selection_correct"],
            "first_selection_evaluable_count": aggregate["first_selection_evaluable_episodes"],
            "all_selection_correct_count": aggregate["sequential_correct_count"],
            "all_selection_evaluable_count": aggregate["sequential_evaluable_count"],
            "established_grasp_count": aggregate["established_grasp_count"],
            "grasp_invalid_count": aggregate["grasp_invalid_count"],
            "release_count": aggregate["release_count"], "drop_count": aggregate["drop_count"],
            "sparc_mean": aggregate["sparc_mean"],
            "end_displacement_mean_m": aggregate["end_displacement_mean_m"],
            "path_length_sum_m": aggregate["path_length_sum_m"],
            "time_to_success_s": episode_metric["efficiency"]["time_to_success_s"],
            "path_efficiency": episode_metric["efficiency"]["path_efficiency"],
            "time_efficiency": episode_metric["efficiency"]["time_efficiency"],
            "stage_transition_correct_count": aggregate["reasonable_transition_count"],
            "stage_transition_denominator": aggregate["stage_transition_denominator"],
            "local_subtasks": local,
        })
    rows.sort(key=lambda row: row["episode"])
    den = {
        "all_selection_correct_count": sum(row["all_selection_correct_count"] for row in rows),
        "all_selection_evaluable_count": sum(row["all_selection_evaluable_count"] for row in rows),
        "established_grasp_count": sum(row["established_grasp_count"] for row in rows),
        "grasp_invalid_count": sum(row["grasp_invalid_count"] for row in rows),
        "release_count": sum(row["release_count"] for row in rows),
        "drop_count": sum(row["drop_count"] for row in rows),
        "stage_transition_correct_count": sum(row["stage_transition_correct_count"] for row in rows),
        "stage_transition_denominator": sum(row["stage_transition_denominator"] for row in rows),
        "local_registered_count": sum(row["local_subtasks"]["registered_count"] for row in rows),
        "local_completed_once_count": sum(row["local_subtasks"]["completed_once_count"] for row in rows),
        "local_active_at_end_count": sum(row["local_subtasks"]["active_at_end_count"] for row in rows),
        "local_lost_after_completed_count": sum(row["local_subtasks"]["lost_after_completed_count"] for row in rows),
        "local_dropped_by_end_count": sum(row["local_subtasks"]["dropped_by_end_count"] for row in rows),
    }
    successes = sum(row["official_success_rate"] == 1 for row in rows)
    aggregate = {
        "task_success_rate": successes / len(rows), "task_success_count": successes,
        "task_score": mean([row["task_score"] for row in rows]),
        "first_selection_accuracy": ratio(sum(row["first_selection_correct"] is True for row in rows),
                                            sum(row["first_selection_evaluable_count"] for row in rows)),
        "all_selection_accuracy": ratio(den["all_selection_correct_count"], den["all_selection_evaluable_count"]),
        "grasp_stability": ratio(den["established_grasp_count"], den["established_grasp_count"] + den["grasp_invalid_count"]),
        "drop_rate": ratio(den["drop_count"], den["release_count"] + den["drop_count"]),
        "local_success_once": ratio(den["local_completed_once_count"], den["local_registered_count"]),
        "local_success_at_end": ratio(den["local_active_at_end_count"], den["local_registered_count"]),
        "drop_after_success": ratio(den["local_lost_after_completed_count"], den["local_registered_count"]),
        "completed_goal_retention": ratio(den["local_active_at_end_count"], den["local_completed_once_count"]),
        "sparc_mean": mean([row["sparc_mean"] for row in rows]),
        "end_displacement_mean_m": mean([row["end_displacement_mean_m"] for row in rows]),
        "path_length_sum_m": sum(row["path_length_sum_m"] for row in rows),
        "path_length_mean_m": mean([row["path_length_sum_m"] for row in rows]),
        "time_to_success_s": mean([row["time_to_success_s"] for row in rows]),
        "path_efficiency_mean": mean([row["path_efficiency"] for row in rows]),
        "time_efficiency_mean": mean([row["time_efficiency"] for row in rows]),
        "stage_transition_accuracy": ratio(den["stage_transition_correct_count"], den["stage_transition_denominator"]),
    }
    task = {
        "schema_version": 1, "task": task_name, "expected_episode_count": 5,
        "valid_episode_count": 5, "incomplete_episode_count": 0,
        "metric_denominators": den,
        "first_selection_evaluable_episode_count": sum(row["first_selection_evaluable_count"] for row in rows),
        "efficiency_evaluable_episode_count": sum(row["path_efficiency"] is not None for row in rows),
        "aggregate": aggregate, "episodes": rows,
    }
    return task, V3_SOURCE / "summary.json"


def check_existing() -> None:
    full = json.loads(FULL_OUT.read_text())
    aggregates = json.loads(AGG_OUT.read_text())
    media = json.loads(MEDIA_OUT.read_text())
    require(len(full) == len(aggregates) == 24, "task count mismatch")
    require(sum(len(task["samples"]) for task in full.values()) == 120, "sample count mismatch")
    require(sum(len(sample["videos"]) for task in full.values() for sample in task["samples"]) == 354, "video count mismatch")
    require(len(media) == 354, "media registry count mismatch")
    for key, item in media.items():
        path = Path(item["path"])
        require(key == item["sha256"] + ".mp4" and path.is_file(), f"invalid media item {key}")
        require(path.resolve().is_relative_to(MEDIA_ROOT.resolve()), f"media path escaped root {key}")
        require(path.stat().st_size == item["size"] and sha256(path) == item["sha256"], f"media identity mismatch {key}")
    require({task["promptVersion"] for task in full.values()} == {"v1", "v3"}, "prompt version mix missing")
    require(sum(task["promptVersion"] == "v3" for task in full.values()) == 8, "v3 task count mismatch")
    print("Verified existing XVLA final export: 24 tasks, 120 IDs, 354 videos")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--jobs", type=int, default=4)
    args = parser.parse_args()
    if args.check:
        check_existing()
        return
    require(1 <= args.jobs <= 12, "--jobs must be between 1 and 12")
    summary_path = V1_SOURCE / "summary/summary.json"
    summary = json.loads(summary_path.read_text())
    task_names = list(summary["tasks"])
    require(len(task_names) == 24 and summary["overall"]["expected_episode_count"] == 120, "unexpected cohort shape")
    require(summary["overall"]["valid_episode_count"] == 118, "unexpected valid episode count")

    previous = json.loads(FULL_OUT.read_text()) if FULL_OUT.exists() else {}
    data = {}
    futures = {}
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        for task_name in task_names:
            if task_name in V3_TASKS:
                task, task_path = build_v3_task(task_name)
                prompt_version = "v3"
                source_batch = V3_SOURCE.name
            else:
                task_path = V1_SOURCE / "summary" / f"{task_name}.json"
                task = json.loads(task_path.read_text())
                prompt_version = "v1"
                source_batch = V1_SOURCE.name
            require(task["task"] == task_name and task["expected_episode_count"] == 5, f"task identity mismatch {task_name}")
            samples = []
            for row in task["episodes"]:
                values = episode_values(row)
                require(all(finite_or_none(value) for value in values.values()), f"non-finite episode metric {task_name} {row['episode']}")
                sample = {
                    "id": f"{RESULT_VERSION}:{task_name}:{row['episode']}",
                    "sourceEpisode": row["episode"], "layoutId": row["layout_id"],
                    "status": row["status"], "success": row.get("official_success_rate") == 1,
                    "score": row.get("task_score"), "metricsAvailable": row.get("metrics_available", False),
                    "values": {**values, "COLLISION_RATE": None, "ROBUSTNESS": None},
                    "units": {metric: UNITS.get(metric, "rate") for metric in (*METRICS, "COLLISION_RATE", "ROBUSTNESS")},
                    "videos": [],
                    "reportSha256": sha256((Path(row["metrics_file"]) if Path(row["metrics_file"]).is_absolute()
                                             else Path(row.get("source_root", V1_SOURCE)) / row["metrics_file"]))
                    if row.get("metrics_file") else None,
                    "promptVersion": prompt_version,
                    "prompt": row.get("prompt"),
                    "sourceBatch": source_batch,
                }
                previous_sample = next((item for item in previous.get(task_name, {}).get("samples", [])
                                        if item.get("sourceEpisode") == row["episode"]), None)
                if prompt_version == "v1" and previous_sample and len(previous_sample.get("videos", [])) == 3:
                    sample["videos"] = previous_sample["videos"]
                else:
                    for camera, source in locate_videos(row).items():
                        future = pool.submit(transcode, source)
                        futures[future] = (sample, camera)
                samples.append(sample)
            data[task_name] = {
                "task": task_name, "model": "XVLA", "split": "indomain", "resultVersion": RESULT_VERSION,
                "protocol": "XVLA final 24-task DLAa ID cohort; v3 prompt reruns for 8 changed tasks and v1 runs for 16 unchanged tasks; five registered layouts per task",
                "promptVersion": prompt_version, "sourceBatch": source_batch,
                "expectedEpisodes": task["expected_episode_count"], "episodes": task["valid_episode_count"],
                "incompleteEpisodes": task["incomplete_episode_count"], "successes": task["aggregate"]["task_success_count"],
                "values": aggregate_values(task), "samples": samples,
                "sourceSummarySha256": sha256(task_path),
            }
        completed = 0
        for future in as_completed(futures):
            sample, camera = futures[future]
            video = future.result()
            sample["videos"].append({"camera": camera, **{k: v for k, v in video.items() if k not in ("path", "size", "sourceSha256")}})
            completed += 1
            if completed % 30 == 0:
                print(f"Rendered {completed}/{len(futures)} videos", flush=True)

    media = {}
    for task in data.values():
        for sample in task["samples"]:
            sample["videos"].sort(key=lambda item: CAMERAS.index(item["camera"]))
            for video in sample["videos"]:
                key = video["sha256"] + ".mp4"
                path = MEDIA_ROOT / PROFILE["id"] / key
                media[key] = {"path": str(path.resolve()), "size": path.stat().st_size, "sha256": video["sha256"], "profile": PROFILE["id"]}

    require(sum(len(t["samples"]) for t in data.values()) == 120, "sample total mismatch")
    require(sum(s["metricsAvailable"] for t in data.values() for s in t["samples"]) == 118, "valid total mismatch")
    require(sum(len(s["videos"]) for t in data.values() for s in t["samples"]) == 354, "video total mismatch")
    require(len(media) == 354, "duplicate rendition identity")
    aggregates = {task: {key: value for key, value in entry.items() if key != "samples"} for task, entry in data.items()}
    FULL_OUT.parent.mkdir(parents=True, exist_ok=True)
    for path, document in ((FULL_OUT, data), (AGG_OUT, aggregates), (MEDIA_OUT, media)):
        text = json.dumps(document, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
        require("/mnt/" not in text or path == MEDIA_OUT, f"server path leaked into browser data: {path.name}")
        path.write_text(text)
    print("Exported XVLA final: 24 tasks, 120 IDs, 118 valid IDs, 354 web videos")


if __name__ == "__main__":
    main()
