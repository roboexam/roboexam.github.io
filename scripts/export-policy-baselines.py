"""Export the frozen three-model policy benchmark for the Track 3 dashboard."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path("/mnt/gyc_ckp/benchmark2027/experiments/benchmark-policy")
FULL_OUT = ROOT / "app/data/generated/policy-baselines.json"
AGG_OUT = ROOT / "app/data/generated/policy-baselines-aggregates.json"
MEDIA_OUT = ROOT / "scripts/policy-baseline-media.json"
MODELS = ("G05", "HyVLA", "XVLA")
SETTINGS = ("id", "visual", "semantic", "behavior")
RESULT_VERSION = "benchmark-policy-20261104"
PROTOCOL = "Benchmark Policy v1 · 24 tasks · five frozen episodes per ID/OOD split · DLAA"
METRICS = (
    "TSR", "TASK_SCORE", "FIRST_TARGET_SELECTION", "ALL_TARGET_SELECTION",
    "GRASP_STABILITY", "DROP_RATE", "LOCAL_SUCCESS_ONCE", "LOCAL_SUCCESS_AT_END",
    "DROP_AFTER_SUCCESS", "SPARC", "EE_DISPLACEMENT", "PATH_LENGTH", "SET",
    "PATH_EFFICIENCY", "TIME_EFFICIENCY", "STAGE_TRANSITION", "GOAL_RETENTION",
    "COLLISION_RATE", "ROBUSTNESS",
)
UNITS = {
    "TASK_SCORE": "percentage", "SPARC": "SPARC", "EE_DISPLACEMENT": "m",
    "PATH_LENGTH": "m", "SET": "s",
}
CAMERAS = {"head": "cam_head", "left_wrist": "cam_left_wrist", "right_wrist": "cam_right_wrist"}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def read_json(path: Path):
    return json.loads(path.read_text())


def number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) else None


def ratio(numerator: int, denominator: int):
    return numerator / denominator if denominator else None


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def display(value, unit: str) -> str:
    if value is None:
        return "N/A"
    if unit == "rate":
        return f"{value * 100:.2f}%"
    if unit == "percentage":
        return f"{value * 100:.2f}"
    return f"{value:.3f} {unit}" if unit else f"{value:.3f}"


def episode_values(document: dict) -> dict:
    metrics = document["metrics"]
    selection = metrics["selection"]
    grasp = metrics["grasp_stability"]
    transition = metrics["stage_transition"]
    motion = metrics["kinematics"]["both_arms"]
    efficiency = metrics["efficiency"]
    release = int(grasp["release_count"])
    drop = int(grasp["drop_count"])
    return {
        "TSR": int(bool(document["success"])),
        "TASK_SCORE": number(document["score_0to100"]) / 100,
        "FIRST_TARGET_SELECTION": int(selection["first_selection_correct"]) if selection["first_selection_correct"] is not None else None,
        "ALL_TARGET_SELECTION": number(selection["sequential_accuracy"]),
        "GRASP_STABILITY": number(grasp["stability"]),
        "DROP_RATE": ratio(drop, release + drop),
        "LOCAL_SUCCESS_ONCE": None,
        "LOCAL_SUCCESS_AT_END": None,
        "DROP_AFTER_SUCCESS": None,
        "SPARC": number(motion["sparc_mean"]),
        "EE_DISPLACEMENT": number(motion["end_displacement_mean_m"]),
        "PATH_LENGTH": number(motion["path_length_sum_m"]),
        "SET": number(efficiency["time_to_success_s"]),
        "PATH_EFFICIENCY": number(efficiency["path_efficiency"]),
        "TIME_EFFICIENCY": number(efficiency["time_efficiency"]),
        "STAGE_TRANSITION": number(transition["accuracy"]),
        "GOAL_RETENTION": None,
        "COLLISION_RATE": None,
        "ROBUSTNESS": None,
    }


def metric_denominators(samples: list[dict]) -> dict:
    documents = [sample["_document"] for sample in samples]
    return {
        "FIRST_TARGET_SELECTION": sum(doc["metrics"]["selection"]["first_selection_correct"] is not None for doc in documents),
        "ALL_TARGET_SELECTION": sum(doc["metrics"]["selection"]["evaluable_selection_count"] for doc in documents),
        "GRASP_STABILITY": sum(doc["metrics"]["grasp_stability"]["established_grasps"] + doc["metrics"]["grasp_stability"]["grasp_invalid_count"] for doc in documents),
        "DROP_RATE": sum(doc["metrics"]["grasp_stability"]["release_count"] + doc["metrics"]["grasp_stability"]["drop_count"] for doc in documents),
        "STAGE_TRANSITION": sum(doc["metrics"]["stage_transition"]["denominator"] for doc in documents),
    }


def aggregate_metrics(task_result: dict, samples: list[dict]) -> dict:
    n = int(task_result["episode_count"])
    den = metric_denominators(samples)
    specs = {
        "TSR": (number(task_result["task_success_rate"]), n, "rate", "official successes / frozen episodes"),
        "TASK_SCORE": (number(task_result["task_score_mean_0to100"]) / 100, n, "percentage", "mean registered-subtask completion rate"),
        "FIRST_TARGET_SELECTION": (number(task_result["first_selection_accuracy"]), den["FIRST_TARGET_SELECTION"], "rate", "evaluable episodes"),
        "ALL_TARGET_SELECTION": (number(task_result["all_selection_accuracy"]), den["ALL_TARGET_SELECTION"], "rate", "evaluable target selections"),
        "GRASP_STABILITY": (number(task_result["grasp_stability"]), den["GRASP_STABILITY"], "rate", "established / (established + invalid)"),
        "DROP_RATE": (number(task_result["drop_rate"]), den["DROP_RATE"], "rate", "drops / (releases + drops)"),
        "LOCAL_SUCCESS_ONCE": (None, 0, "rate", "local subtask events are not published in this cohort"),
        "LOCAL_SUCCESS_AT_END": (None, 0, "rate", "local subtask events are not published in this cohort"),
        "DROP_AFTER_SUCCESS": (None, 0, "rate", "local subtask events are not published in this cohort"),
        "SPARC": (number(task_result["sparc_mean"]), n, "SPARC", "episode mean"),
        "EE_DISPLACEMENT": (number(task_result["end_displacement_mean_m"]), n, "m", "episode mean"),
        "PATH_LENGTH": (number(task_result["path_length_mean_m"]), n, "m", "mean episode path length"),
        "SET": (number(task_result["time_to_success_s_mean"]), int(task_result["time_to_success_s_available_count"]), "s", "successful episodes with available endpoint timing"),
        "PATH_EFFICIENCY": (number(task_result["path_efficiency_mean"]), int(task_result["path_efficiency_available_count"]), "rate", "successful episodes with frozen reference path"),
        "TIME_EFFICIENCY": (number(task_result["time_efficiency_mean"]), int(task_result["time_efficiency_available_count"]), "rate", "successful episodes with frozen reference time"),
        "STAGE_TRANSITION": (number(task_result["stage_transition_accuracy"]), den["STAGE_TRANSITION"], "rate", "evaluable stage transitions"),
        "GOAL_RETENTION": (None, 0, "rate", "goal-retention events are not published in this cohort"),
        "COLLISION_RATE": (None, 0, "rate", "collision evidence is not published in this cohort"),
        "ROBUSTNESS": (None, 0, "rate", "paired nominal/perturbed robustness is not published in this cohort"),
    }
    return {metric: {
        "value": value,
        "n": metric_n,
        "unit": unit,
        "primary": display(value, unit),
        "available": value is not None,
        "coverage": metric_n / n if n else None,
        "detail": detail,
    } for metric, (value, metric_n, unit, detail) in specs.items()}


def task_directory(model: str, setting: str, task: str) -> Path:
    return SOURCE / model / "id" / task if setting == "id" else SOURCE / model / "ood" / task / setting


def build() -> tuple[dict, dict, dict]:
    source_manifest = read_json(SOURCE / "manifest.json")
    require(tuple(source_manifest["models"]) == MODELS, "unexpected model roster")
    tasks = sorted(path.name for path in (SOURCE / MODELS[0] / "id").iterdir() if path.is_dir())
    require(len(tasks) == 24, "expected 24 tasks")
    full = {"schemaVersion": "unibench.policy-baselines.v1", "resultVersion": RESULT_VERSION, "sourceDataset": Path(source_manifest["source_dataset"]).name, "models": {}}
    media_candidates: list[tuple[str, Path]] = []

    for model in MODELS:
        full["models"][model] = {}
        for setting in SETTINGS:
            full["models"][model][setting] = {}
            for task in tasks:
                directory = task_directory(model, setting, task)
                task_result = read_json(directory / "task-result.json")
                samples = []
                for index in range(5):
                    episode_dir = directory / f"episode_{index}"
                    episode_file = episode_dir / "episode-result.json"
                    document = read_json(episode_file)
                    values = episode_values(document)
                    videos = []
                    for stem, camera in CAMERAS.items():
                        path = episode_dir / "videos" / f"{stem}.mp4"
                        require(path.is_file(), f"missing video: {path}")
                        media_candidates.append((camera, path))
                        videos.append({"camera": camera, "_path": path})
                    samples.append({
                        "id": f"{model}:{setting}:{task}:episode_{index}",
                        "sourceEpisode": f"episode_{index}",
                        "layoutId": document["source_case"].get("eval_layout_id", document["source_case"].get("layout_id", document["metrics"]["seed"])),
                        "status": "success" if document["success"] else "failure",
                        "success": bool(document["success"]),
                        "score": values["TASK_SCORE"],
                        "metricsAvailable": True,
                        "values": values,
                        "units": {metric: UNITS.get(metric, "rate") for metric in METRICS},
                        "videos": videos,
                        "reportSha256": sha256(episode_file),
                        "prompt": document["source_case"].get("prompt"),
                        "sourceKind": document["source_kind"],
                        "_document": document,
                    })
                require(len(samples) == task_result["episode_count"] == 5, f"incomplete task cohort: {model}/{setting}/{task}")
                full["models"][model][setting][task] = {
                    "task": task, "model": model, "split": setting,
                    "resultVersion": RESULT_VERSION, "protocol": PROTOCOL,
                    "promptVersion": "v3", "sourceBatch": SOURCE.name,
                    "expectedEpisodes": 5, "episodes": 5, "incompleteEpisodes": 0,
                    "successes": int(task_result["task_success_count"]),
                    "values": aggregate_metrics(task_result, samples), "samples": samples,
                }

    def hashed(item):
        camera, path = item
        return camera, path, sha256(path)

    registry = {}
    hashes = {}
    with ThreadPoolExecutor(max_workers=16) as executor:
        for camera, path, digest in executor.map(hashed, media_candidates):
            hashes[str(path)] = digest
            registry.setdefault(f"{digest}.mp4", {"path": str(path.resolve()), "size": path.stat().st_size, "sha256": digest})

    for model in MODELS:
        for setting in SETTINGS:
            for entry in full["models"][model][setting].values():
                for sample in entry["samples"]:
                    sample.pop("_document")
                    for video in sample["videos"]:
                        path = video.pop("_path")
                        digest = hashes[str(path)]
                        video.update({"url": f"/api/policy-baseline-media/{digest}.mp4", "sha256": digest, "size": path.stat().st_size})

    aggregates = {**{key: value for key, value in full.items() if key != "models"}, "models": {
        model: {setting: {task: {key: value for key, value in entry.items() if key != "samples"} for task, entry in tasks_data.items()} for setting, tasks_data in settings.items()}
        for model, settings in full["models"].items()
    }}
    return full, aggregates, registry


def write_outputs(full: dict, aggregates: dict, registry: dict) -> None:
    FULL_OUT.parent.mkdir(parents=True, exist_ok=True)
    for path, document in ((FULL_OUT, full), (AGG_OUT, aggregates), (MEDIA_OUT, registry)):
        text = json.dumps(document, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
        require("/mnt/" not in text or path == MEDIA_OUT, f"server path leaked into browser data: {path.name}")
        path.write_text(text)


def check_existing() -> None:
    full, aggregates, registry = read_json(FULL_OUT), read_json(AGG_OUT), read_json(MEDIA_OUT)
    require(set(full["models"]) == set(MODELS) == set(aggregates["models"]), "model mismatch")
    require(all(len(full["models"][model][setting]) == 24 for model in MODELS for setting in SETTINGS), "task count mismatch")
    samples = [sample for model in MODELS for setting in SETTINGS for task in full["models"][model][setting].values() for sample in task["samples"]]
    require(len(samples) == 1440, "episode count mismatch")
    require(sum(len(sample["videos"]) for sample in samples) == 4320, "video reference count mismatch")
    require("/mnt/" not in FULL_OUT.read_text() and "/mnt/" not in AGG_OUT.read_text(), "private path leaked")
    for key, item in registry.items():
        path = Path(item["path"])
        require(key == item["sha256"] + ".mp4" and path.is_file() and path.stat().st_size == item["size"] and path.resolve().is_relative_to(SOURCE), f"invalid media item: {key}")
    print(f"Verified policy baselines: 3 models, 24 tasks, 1440 episodes, 4320 video references, {len(registry)} unique videos")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        check_existing()
        return
    full, aggregates, registry = build()
    write_outputs(full, aggregates, registry)
    check_existing()


if __name__ == "__main__":
    main()
