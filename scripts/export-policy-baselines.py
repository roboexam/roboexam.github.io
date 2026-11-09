"""Export the frozen five-model policy benchmark for the Track 3 dashboard."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path("/mnt/gyc_ckp/benchmark2027/experiments/benchmark-policy")
LEGACY_FULL_OUT = ROOT / "app/data/generated/policy-baselines.json"
AGG_OUT = ROOT / "app/data/generated/policy-baselines-aggregates.json"
MEDIA_OUT = ROOT / "scripts/policy-baseline-media.json"
MODELS = ("G05", "HyVLA", "XVLA", "Pi_05", "OpenDM")
MODEL_IDS = {"G05": "G05", "HyVLA": "HyVLA", "XVLA": "XVLA", "Pi_05": "Pi0.5", "OpenDM": "OpenDM"}
MODEL_FILES = {
    "G05": ROOT / "app/data/generated/policy-baselines-g05.json",
    "HyVLA": ROOT / "app/data/generated/policy-baselines-hyvla.json",
    "XVLA": ROOT / "app/data/generated/policy-baselines-xvla.json",
    "Pi0.5": ROOT / "app/data/generated/policy-baselines-pi05.json",
    "OpenDM": ROOT / "app/data/generated/policy-baselines-opendm.json",
}
SOURCE_BY_MODEL_ID = {public: source for source, public in MODEL_IDS.items()}
PUBLIC_MODEL_IDS = tuple(MODEL_IDS[model] for model in MODELS)
SETTINGS = ("id", "visual", "semantic", "behavior", "recovery")
RESULT_VERSION = "benchmark-policy-20261107-five-model-recovery-v7"
PROTOCOL = "Benchmark Policy v7 · 24 tasks · five planned episodes per ID/OOD/Recovery split · DLAA · current-rule evidence with explicit missing and fallback states"
SCORING_REVISION = "20261104_B01_B06_B08"
EFFICIENCY_REFERENCE_REVISION = "20261104_exact_v3_parquet_source_episode_id"
LOSS_EVENT_REVISION = "20261105_six_task_loss_events"
PI05_OPENDM_EFFICIENCY_REVISION = "20261106_exact_v3_parquet_source_episode_id"
FIVE_MODEL_CURRENT_RULE_REVISION = "20261106_current_rule_evidence_with_original_fallback"
FIVE_MODEL_CURRENT_RULE_FALLBACK = "Insufficient saved physical evidence uses previous exported success/score and is marked per episode."
RECOVERY_ADDED_AT = "2026-11-07T10:14:11.786470+00:00"
RECOVERY_SCOPE = "24 tasks x 5 episodes x 5 models; missing classify_objects_by_language/episode_4 retained"
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
    events = document.get("event_metrics", {})
    release = int(grasp["release_count"])
    drop = int(grasp["drop_count"])
    return {
        "TSR": int(bool(document["success"])),
        "TASK_SCORE": number(document["score_0to100"]) / 100,
        "FIRST_TARGET_SELECTION": int(selection["first_selection_correct"]) if selection["first_selection_correct"] is not None else None,
        "ALL_TARGET_SELECTION": number(selection["sequential_accuracy"]),
        "GRASP_STABILITY": number(grasp["stability"]),
        "DROP_RATE": ratio(drop, release + drop),
        "LOCAL_SUCCESS_ONCE": number(events.get("local_success_once")),
        "LOCAL_SUCCESS_AT_END": number(events.get("local_success_at_end")),
        "DROP_AFTER_SUCCESS": number(events.get("drop_after_success")),
        "SPARC": number(motion["sparc_mean"]),
        "EE_DISPLACEMENT": number(motion["end_displacement_mean_m"]),
        "PATH_LENGTH": number(motion["path_length_sum_m"]),
        "SET": number(efficiency.get("time_to_success_s")),
        "PATH_EFFICIENCY": number(efficiency.get("path_efficiency")),
        "TIME_EFFICIENCY": number(efficiency.get("time_efficiency")),
        "STAGE_TRANSITION": number(transition["accuracy"]),
        "GOAL_RETENTION": number(events.get("completed_goal_retention")),
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
        "LOCAL_SUCCESS_ONCE": (number(task_result["local_success_once"]), int(task_result["local_success_once_available_episode_count"]), "rate", "episode-macro mean of registered subtasks completed at least once"),
        "LOCAL_SUCCESS_AT_END": (number(task_result["local_success_at_end"]), int(task_result["local_success_at_end_available_episode_count"]), "rate", "episode-macro mean of registered subtasks still active at episode end"),
        "DROP_AFTER_SUCCESS": (number(task_result["drop_after_success"]), int(task_result["drop_after_success_available_episode_count"]), "rate", "episode-macro mean of completed subtasks later lost"),
        "SPARC": (number(task_result["sparc_mean"]), n, "SPARC", "episode mean"),
        "EE_DISPLACEMENT": (number(task_result["end_displacement_mean_m"]), n, "m", "episode mean"),
        "PATH_LENGTH": (number(task_result["path_length_mean_m"]), n, "m", "mean episode path length"),
        "SET": (number(task_result["time_to_success_s_mean"]), int(task_result["time_to_success_s_available_count"]), "s", "successful episodes with available endpoint timing"),
        "PATH_EFFICIENCY": (number(task_result["path_efficiency_mean"]), int(task_result["path_efficiency_available_count"]), "rate", "successful episodes with frozen reference path"),
        "TIME_EFFICIENCY": (number(task_result["time_efficiency_mean"]), int(task_result["time_efficiency_available_count"]), "rate", "successful episodes with frozen reference time"),
        "STAGE_TRANSITION": (number(task_result["stage_transition_accuracy"]), den["STAGE_TRANSITION"], "rate", "evaluable stage transitions"),
        "GOAL_RETENTION": (number(task_result["completed_goal_retention"]), int(task_result["completed_goal_retention_available_episode_count"]), "rate", "final completed goal remains active at episode end"),
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


def aggregate_recovery_metrics(result: dict, samples: list[dict]) -> dict:
    n = len(samples)
    require(int(result["verified_episode_count"]) == n, "recovery verified count mismatch")
    values = {metric: [sample["values"][metric] for sample in samples if sample["values"][metric] is not None] for metric in METRICS}
    documents = [sample["_document"] for sample in samples]
    den = metric_denominators(samples)

    def average(metric: str):
        return sum(values[metric]) / len(values[metric]) if values[metric] else None

    def weighted(metric: str, denominator_key: str):
        denominator = den[denominator_key]
        if not denominator:
            return None
        return sum(sample["values"][metric] * sample["_document"]["metrics"][denominator_key]["denominator"] for sample in samples if sample["values"][metric] is not None) / denominator

    selection_den = den["ALL_TARGET_SELECTION"]
    selection_value = sum(document["metrics"]["selection"]["sequential_correct_count"] for document in documents) / selection_den if selection_den else None
    grasp_den = den["GRASP_STABILITY"]
    grasp_value = sum(document["metrics"]["grasp_stability"]["established_grasps"] for document in documents) / grasp_den if grasp_den else None
    drop_den = den["DROP_RATE"]
    drop_value = sum(document["metrics"]["grasp_stability"]["drop_count"] for document in documents) / drop_den if drop_den else None
    transition_den = den["STAGE_TRANSITION"]
    transition_value = sum((sample["values"]["STAGE_TRANSITION"] or 0) * sample["_document"]["metrics"]["stage_transition"]["denominator"] for sample in samples) / transition_den if transition_den else None
    official_success_rate = number(result["task_success_rate"])
    official_score = number(result["task_score_mean_0to100"])
    require(sum(sample["success"] for sample in samples) == int(result["task_success_count"]), "recovery success count mismatch")
    require(abs(average("TSR") - official_success_rate) < 1e-12, "recovery success rate mismatch")
    require(abs(average("TASK_SCORE") * 100 - official_score) < 1e-9, "recovery score mismatch")
    specs = {
        "TSR": (official_success_rate, n, "rate", "verified recovery successes / verified recovery episodes"),
        "TASK_SCORE": (official_score / 100, n, "percentage", "mean registered-subtask completion over verified recovery episodes"),
        "FIRST_TARGET_SELECTION": (average("FIRST_TARGET_SELECTION"), len(values["FIRST_TARGET_SELECTION"]), "rate", "verified recovery episodes with an evaluable first selection"),
        "ALL_TARGET_SELECTION": (selection_value, selection_den, "rate", "evaluable recovery target selections"),
        "GRASP_STABILITY": (grasp_value, grasp_den, "rate", "established / (established + invalid) in recovery"),
        "DROP_RATE": (drop_value, drop_den, "rate", "drops / (releases + drops) in recovery"),
        "LOCAL_SUCCESS_ONCE": (None, 0, "rate", "recovery event catalog is not published"),
        "LOCAL_SUCCESS_AT_END": (None, 0, "rate", "recovery event catalog is not published"),
        "DROP_AFTER_SUCCESS": (None, 0, "rate", "recovery event catalog is not published"),
        "SPARC": (average("SPARC"), len(values["SPARC"]), "SPARC", "verified recovery episode mean"),
        "EE_DISPLACEMENT": (average("EE_DISPLACEMENT"), len(values["EE_DISPLACEMENT"]), "m", "verified recovery episode mean"),
        "PATH_LENGTH": (average("PATH_LENGTH"), len(values["PATH_LENGTH"]), "m", "verified recovery episode mean"),
        "SET": (average("SET"), len(values["SET"]), "s", "successful recovery episodes with available endpoint timing"),
        "PATH_EFFICIENCY": (average("PATH_EFFICIENCY"), len(values["PATH_EFFICIENCY"]), "rate", "successful recovery episodes with a reference path"),
        "TIME_EFFICIENCY": (average("TIME_EFFICIENCY"), len(values["TIME_EFFICIENCY"]), "rate", "successful recovery episodes with a reference time"),
        "STAGE_TRANSITION": (transition_value, transition_den, "rate", "evaluable recovery stage transitions"),
        "GOAL_RETENTION": (None, 0, "rate", "recovery event catalog is not published"),
        "COLLISION_RATE": (None, 0, "rate", "collision evidence is not published in this cohort"),
        "ROBUSTNESS": (None, 0, "rate", "paired nominal/perturbed robustness is not published in this cohort"),
    }
    return {metric: {
        "value": value, "n": metric_n, "unit": unit, "primary": display(value, unit),
        "available": value is not None, "coverage": metric_n / n if n else None, "detail": detail,
    } for metric, (value, metric_n, unit, detail) in specs.items()}


def task_directory(model: str, setting: str, task: str) -> Path:
    if setting == "id":
        return SOURCE / model / "id" / task
    if setting == "recovery":
        return SOURCE / model / "recovery" / task
    return SOURCE / model / "ood" / task / setting


def build() -> tuple[dict, dict, dict]:
    source_manifest = read_json(SOURCE / "manifest.json")
    require(tuple(source_manifest["models"]) == MODELS, "unexpected model roster")
    require(source_manifest.get("scoring_revision") == SCORING_REVISION, "unexpected scoring revision")
    require(source_manifest.get("efficiency_reference_revision") == EFFICIENCY_REFERENCE_REVISION, "unexpected efficiency reference revision")
    require(source_manifest.get("loss_event_revision") == LOSS_EVENT_REVISION, "unexpected loss-event revision")
    require(source_manifest.get("pi05_opendm_efficiency_reference_revision") == PI05_OPENDM_EFFICIENCY_REVISION, "unexpected Pi0.5/OpenDM efficiency revision")
    require(source_manifest.get("five_model_current_rule_revision") == FIVE_MODEL_CURRENT_RULE_REVISION, "unexpected five-model current-rule revision")
    require(source_manifest.get("five_model_current_rule_fallback") == FIVE_MODEL_CURRENT_RULE_FALLBACK, "unexpected five-model current-rule fallback")
    require(source_manifest.get("recovery_added_at") == RECOVERY_ADDED_AT, "unexpected recovery publication time")
    require(source_manifest.get("recovery_scope") == RECOVERY_SCOPE, "unexpected recovery scope")
    tasks = sorted(path.name for path in (SOURCE / MODELS[0] / "id").iterdir() if path.is_dir())
    require(len(tasks) == 24, "expected 24 tasks")
    full = {
        "schemaVersion": "unibench.policy-baselines.v2",
        "resultVersion": RESULT_VERSION,
        "sourceDataset": Path(source_manifest["source_dataset"]).name,
        "sourceManifestSha256": sha256(SOURCE / "manifest.json"),
        "scoringRevision": SCORING_REVISION,
        "efficiencyReferenceRevision": EFFICIENCY_REFERENCE_REVISION,
        "lossEventRevision": LOSS_EVENT_REVISION,
        "pi05OpenDmEfficiencyReferenceRevision": PI05_OPENDM_EFFICIENCY_REVISION,
        "fiveModelCurrentRuleRevision": FIVE_MODEL_CURRENT_RULE_REVISION,
        "fiveModelCurrentRuleFallback": FIVE_MODEL_CURRENT_RULE_FALLBACK,
        "recoveryAddedAt": RECOVERY_ADDED_AT,
        "recoveryScope": RECOVERY_SCOPE,
        "officialResultScope": "current-rule success/score where saved physical evidence supports replay; previous exported result retained and marked when evidence is insufficient",
        "models": {},
        "overall": {},
    }
    media_candidates: list[tuple[str, Path]] = []

    for model in MODELS:
        model_id = MODEL_IDS[model]
        full["models"][model_id] = {}
        full["overall"][model_id] = {}
        for setting in SETTINGS:
            full["models"][model_id][setting] = {}
            for task in tasks:
                directory = task_directory(model, setting, task)
                task_result = read_json(directory / "task-result.json")
                samples = []
                episode_records = task_result["episodes"] if setting == "recovery" else [{"episode": f"episode_{index}", "status": "verified"} for index in range(5)]
                for record in episode_records:
                    if record["status"] == "missing":
                        continue
                    index = int(record["episode"].removeprefix("episode_"))
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
                        "id": f"{model_id}:{setting}:{task}:episode_{index}",
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
                        "sourceKind": document.get("source_kind", "recovery"),
                        "_document": document,
                    })
                verified_count = int(task_result.get("verified_episode_count", task_result.get("episode_count", 0)))
                planned_count = int(task_result.get("planned_episode_count", task_result.get("episode_count", 0)))
                missing_count = int(task_result.get("missing_episode_count", planned_count - verified_count))
                require(len(samples) == verified_count and planned_count == 5, f"invalid task cohort: {model}/{setting}/{task}")
                full["models"][model_id][setting][task] = {
                    "task": task, "model": model_id, "split": setting,
                    "resultVersion": RESULT_VERSION, "protocol": PROTOCOL,
                    "promptVersion": "v3", "sourceBatch": SOURCE.name,
                    "expectedEpisodes": planned_count, "episodes": verified_count, "incompleteEpisodes": missing_count,
                    "successes": int(task_result["task_success_count"]),
                    "values": aggregate_recovery_metrics(task_result, samples) if setting == "recovery" else aggregate_metrics(task_result, samples), "samples": samples,
                }

            setting_samples = [
                sample
                for entry in full["models"][model_id][setting].values()
                for sample in entry["samples"]
            ]
            if setting == "id":
                overall_result = read_json(SOURCE / model / "overall.json")
            elif setting == "recovery":
                overall_result = read_json(SOURCE / model / "recovery-overall.json")
            else:
                overall_result = read_json(SOURCE / model / "ood-overall.json")["by_split"][setting]
            expected_overall = int(overall_result.get("planned_episode_count", overall_result.get("episode_count", 0)))
            verified_overall = int(overall_result.get("verified_episode_count", overall_result.get("episode_count", 0)))
            missing_overall = int(overall_result.get("missing_episode_count", expected_overall - verified_overall))
            require(verified_overall == len(setting_samples) and expected_overall == 120, f"invalid official overall cohort: {model}/{setting}")
            full["overall"][model_id][setting] = {
                "model": model_id, "split": setting,
                "resultVersion": RESULT_VERSION, "protocol": PROTOCOL,
                "taskCount": 24, "expectedEpisodes": expected_overall, "episodes": verified_overall,
                "incompleteEpisodes": missing_overall,
                "successes": int(overall_result["task_success_count"]),
                "values": aggregate_recovery_metrics(overall_result, setting_samples) if setting == "recovery" else aggregate_metrics(overall_result, setting_samples),
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
        model_id = MODEL_IDS[model]
        for setting in SETTINGS:
            for entry in full["models"][model_id][setting].values():
                for sample in entry["samples"]:
                    sample.pop("_document")
                    for video in sample["videos"]:
                        path = video.pop("_path")
                        digest = hashes[str(path)]
                        video.update({"url": f"/api/policy-baseline-media/{digest}.mp4", "sha256": digest, "size": path.stat().st_size})

    aggregates = {**{key: value for key, value in full.items() if key not in ("models", "overall")}, "models": {
        model: {setting: {task: {key: value for key, value in entry.items() if key != "samples"} for task, entry in tasks_data.items()} for setting, tasks_data in settings.items()}
        for model, settings in full["models"].items()
    }, "overall": full["overall"]}
    return full, aggregates, registry


def write_outputs(full: dict, aggregates: dict, registry: dict) -> None:
    AGG_OUT.parent.mkdir(parents=True, exist_ok=True)
    metadata = {key: value for key, value in full.items() if key not in ("models", "overall")}
    documents = [
        (MODEL_FILES[model], {**metadata, "models": {model: full["models"][model]}, "overall": {model: full["overall"][model]}})
        for model in PUBLIC_MODEL_IDS
    ]
    documents.extend(((AGG_OUT, aggregates), (MEDIA_OUT, registry)))
    for path, document in documents:
        text = json.dumps(document, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
        require("/mnt/" not in text or path == MEDIA_OUT, f"server path leaked into browser data: {path.name}")
        path.write_text(text)
    LEGACY_FULL_OUT.unlink(missing_ok=True)


def read_full_outputs() -> dict:
    documents = [read_json(MODEL_FILES[model]) for model in PUBLIC_MODEL_IDS]
    metadata = {key: value for key, value in documents[0].items() if key not in ("models", "overall")}
    require(all({key: value for key, value in document.items() if key not in ("models", "overall")} == metadata for document in documents), "split metadata mismatch")
    return {
        **metadata,
        "models": {model: documents[index]["models"][model] for index, model in enumerate(PUBLIC_MODEL_IDS)},
        "overall": {model: documents[index]["overall"][model] for index, model in enumerate(PUBLIC_MODEL_IDS)},
    }


def check_existing() -> None:
    full, aggregates, registry = read_full_outputs(), read_json(AGG_OUT), read_json(MEDIA_OUT)
    require(full.get("resultVersion") == RESULT_VERSION == aggregates.get("resultVersion"), "stale result version")
    require(full.get("sourceManifestSha256") == sha256(SOURCE / "manifest.json") == aggregates.get("sourceManifestSha256"), "stale source manifest")
    require(full.get("scoringRevision") == SCORING_REVISION == aggregates.get("scoringRevision"), "stale scoring revision")
    require(full.get("efficiencyReferenceRevision") == EFFICIENCY_REFERENCE_REVISION == aggregates.get("efficiencyReferenceRevision"), "stale efficiency reference revision")
    require(full.get("lossEventRevision") == LOSS_EVENT_REVISION == aggregates.get("lossEventRevision"), "stale loss-event revision")
    require(full.get("pi05OpenDmEfficiencyReferenceRevision") == PI05_OPENDM_EFFICIENCY_REVISION == aggregates.get("pi05OpenDmEfficiencyReferenceRevision"), "stale Pi0.5/OpenDM efficiency revision")
    require(full.get("fiveModelCurrentRuleRevision") == FIVE_MODEL_CURRENT_RULE_REVISION == aggregates.get("fiveModelCurrentRuleRevision"), "stale five-model current-rule revision")
    require(full.get("fiveModelCurrentRuleFallback") == FIVE_MODEL_CURRENT_RULE_FALLBACK == aggregates.get("fiveModelCurrentRuleFallback"), "stale five-model current-rule fallback")
    require(full.get("recoveryAddedAt") == RECOVERY_ADDED_AT == aggregates.get("recoveryAddedAt"), "stale recovery publication time")
    require(full.get("recoveryScope") == RECOVERY_SCOPE == aggregates.get("recoveryScope"), "stale recovery scope")
    require(set(full["models"]) == set(PUBLIC_MODEL_IDS) == set(aggregates["models"]), "model mismatch")
    require(set(full.get("overall", {})) == set(PUBLIC_MODEL_IDS) == set(aggregates.get("overall", {})), "official overall model mismatch")
    require(all(len(full["models"][model][setting]) == 24 for model in PUBLIC_MODEL_IDS for setting in SETTINGS), "task count mismatch")
    samples = [sample for model in PUBLIC_MODEL_IDS for setting in SETTINGS for task in full["models"][model][setting].values() for sample in task["samples"]]
    require(len(samples) == 2995, "episode count mismatch")
    for model_id in PUBLIC_MODEL_IDS:
        model = SOURCE_BY_MODEL_ID[model_id]
        for setting in SETTINGS:
            for task, entry in full["models"][model_id][setting].items():
                for sample in entry["samples"]:
                    report = task_directory(model, setting, task) / sample["sourceEpisode"] / "episode-result.json"
                    require(sha256(report) == sample["reportSha256"], f"stale frozen episode report: {sample['id']}")
    require(sum(len(sample["videos"]) for sample in samples) == 8985, "video reference count mismatch")
    require(all(full["overall"][model][setting]["episodes"] == (119 if setting == "recovery" else 120) for model in PUBLIC_MODEL_IDS for setting in SETTINGS), "official overall episode count mismatch")
    event_metrics = ("LOCAL_SUCCESS_ONCE", "LOCAL_SUCCESS_AT_END", "DROP_AFTER_SUCCESS", "GOAL_RETENTION")
    require(all(metric in sample["values"] for sample in samples for metric in event_metrics), "event metrics missing")
    require(any(sample["values"][metric] is not None for sample in samples for metric in event_metrics), "event metrics are all unavailable")
    require(not LEGACY_FULL_OUT.exists(), "legacy monolithic output must not be published")
    require(all("/mnt/" not in path.read_text() for path in MODEL_FILES.values()) and "/mnt/" not in AGG_OUT.read_text(), "private path leaked")
    for key, item in registry.items():
        path = Path(item["path"])
        require(key == item["sha256"] + ".mp4" and path.is_file() and path.stat().st_size == item["size"] and path.resolve().is_relative_to(SOURCE), f"invalid media item: {key}")
    print(f"Verified policy baselines: 5 models, 24 tasks, 2995 verified episodes, 5 explicit missing episodes, 8985 video references, {len(registry)} unique videos")


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
