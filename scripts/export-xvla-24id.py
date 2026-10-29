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
SOURCE = Path("/mnt/gyc/benchmark2027/wzy/exp/benchmark-wzy-xvla-24id-dlaa-20261029t101834")
MEDIA_ROOT = Path(os.environ.get(
    "XVLA_24ID_MEDIA_ROOT",
    "/mnt/gyc_ckp/benchmark2027/runtime/staging/dashboard-xvla-preview-20261029",
))
FULL_OUT = ROOT / "app/data/generated/xvla-24id.json"
AGG_OUT = ROOT / "app/data/generated/xvla-24id-aggregates.json"
MEDIA_OUT = ROOT / "scripts/xvla-24id-media.json"
RESULT_VERSION = "benchmark-wzy-xvla-24id-dlaa-20261029t101834"
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
    require(source.is_relative_to(SOURCE.resolve()), f"video escaped source root: {source}")
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
    metrics = (SOURCE / row["metrics_file"]).resolve()
    require(metrics.is_relative_to(SOURCE.resolve()) and metrics.is_file(), f"missing metric file: {metrics}")
    episode_root = metrics.parent.parent
    outcome = "success" if row["official_success_rate"] == 1 else "fail"
    found = {}
    for camera in CAMERAS:
        matches = list(episode_root.glob(f"episode_*_{camera}_{outcome}.mp4"))
        require(len(matches) == 1, f"expected one {camera} video for {row['task']} {row['episode']}")
        found[camera] = matches[0]
    return found


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
    print("Verified existing XVLA export: 24 tasks, 120 IDs, 354 videos")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--jobs", type=int, default=4)
    args = parser.parse_args()
    if args.check:
        check_existing()
        return
    require(1 <= args.jobs <= 12, "--jobs must be between 1 and 12")
    summary_path = SOURCE / "summary/summary.json"
    summary = json.loads(summary_path.read_text())
    task_names = list(summary["tasks"])
    require(len(task_names) == 24 and summary["overall"]["expected_episode_count"] == 120, "unexpected cohort shape")
    require(summary["overall"]["valid_episode_count"] == 118, "unexpected valid episode count")

    data = {}
    futures = {}
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        for task_name in task_names:
            task_path = SOURCE / "summary" / f"{task_name}.json"
            task = json.loads(task_path.read_text())
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
                    "reportSha256": sha256(SOURCE / row["metrics_file"]) if row.get("metrics_file") else None,
                }
                for camera, source in locate_videos(row).items():
                    future = pool.submit(transcode, source)
                    futures[future] = (sample, camera)
                samples.append(sample)
            data[task_name] = {
                "task": task_name, "model": "XVLA", "split": "indomain", "resultVersion": RESULT_VERSION,
                "protocol": "XVLA 24-task DLAa ID cohort; five registered layouts per task",
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
    print("Exported XVLA: 24 tasks, 120 IDs, 118 valid IDs, 354 web videos")


if __name__ == "__main__":
    main()
