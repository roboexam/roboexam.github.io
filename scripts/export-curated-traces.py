#!/usr/bin/env python3
"""Export downsampled, video-aligned robot traces for the dataset browser."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path

import h5py
import numpy as np

PROJECT = Path(__file__).resolve().parents[1]
CURATED_ROOT = Path(os.environ.get(
    "UNIBENCH_CURATED_ROOT",
    "/mnt/gyc_ckp/benchmark2027/data/episode/curated_simulation_data",
))
OOD_ROOT = Path(os.environ.get(
    "UNIBENCH_OOD_STAGING_ROOT",
    "/mnt/gyc_ckp/benchmark2027/runtime/staging/robodojo_data_generation",
))
DATASET = PROJECT / "app/data/generated/explorer-dataset.json"
OUTPUT = PROJECT / "public/curated-traces"
REGISTRY = PROJECT / "app/data/generated/curated-traces.json"
SAMPLE_BUDGET = 80
REQUIRED = {
    "time": "vision/cam_head/video_pts_seconds",
    "left_joint": "state/left_arm_joint_state",
    "right_joint": "state/right_arm_joint_state",
    "left_ee": "state/left_arm_ee_pose_world",
    "right_ee": "state/right_arm_ee_pose_world",
}


def load_json(path: Path):
    with path.open("rb") as handle:
        raw = handle.read()
    return json.loads(raw), raw


def public_episodes():
    dataset, _ = load_json(DATASET)
    episodes = {}
    for task in dataset["tasks"]:
        chunk, raw = load_json(PROJECT / "public" / task["dataUrl"].lstrip("/"))
        if hashlib.sha256(raw).hexdigest() != task["sha256"]:
            raise ValueError(f"chunk hash mismatch: {task['id']}")
        for episode in chunk["episodes"]:
            previous = episodes.setdefault(episode["id"], episode)
            if previous["manifestSha256"] != episode["manifestSha256"]:
                raise ValueError(f"conflicting episode identity: {episode['id']}")
    return episodes


def safe_manifest(episode):
    root = OOD_ROOT if episode.get("admissionStatus") == "staging_not_curated" else CURATED_ROOT
    candidate = (root / episode["manifest"]).resolve()
    if root.resolve() not in candidate.parents:
        raise ValueError("manifest escaped configured root")
    document, raw = load_json(candidate)
    if hashlib.sha256(raw).hexdigest() != episode["manifestSha256"]:
        raise ValueError("manifest hash mismatch")
    if document["episode_id"] != episode["id"]:
        raise ValueError("manifest episode mismatch")
    return document


def rounded(values):
    return np.round(values.astype(np.float64), 5).tolist()


def export_episode(episode):
    manifest = safe_manifest(episode)
    artifact = manifest.get("artifacts", {}).get("trajectory_hdf5", {})
    source = Path(artifact.get("path", ""))
    if not source.is_file():
        raise FileNotFoundError("trajectory artifact unavailable")
    with h5py.File(source, "r") as handle:
        if any(name not in handle for name in REQUIRED.values()):
            raise KeyError("required trace dataset unavailable")
        frame_count = min(handle[name].shape[0] for name in REQUIRED.values())
        if frame_count < 2:
            raise ValueError("trace has fewer than two frames")
        indices = np.unique(np.linspace(0, frame_count - 1, min(SAMPLE_BUDGET, frame_count), dtype=np.int64))
        time = np.asarray(handle[REQUIRED["time"]][indices], dtype=np.float64)
        time -= time[0]
        left_joint = np.asarray(handle[REQUIRED["left_joint"]][indices, :6], dtype=np.float64)
        right_joint = np.asarray(handle[REQUIRED["right_joint"]][indices, :6], dtype=np.float64)
        left_ee = np.asarray(handle[REQUIRED["left_ee"]][indices, :3], dtype=np.float64)
        right_ee = np.asarray(handle[REQUIRED["right_ee"]][indices, :3], dtype=np.float64)
    for values in (time, left_joint, right_joint, left_ee, right_ee):
        if not np.isfinite(values).all():
            raise ValueError("trace contains non-finite values")
    trace = {
        "schemaVersion": "roboexam.action-trace.v1",
        "episodeId": episode["id"],
        "clock": {
            "dataset": REQUIRED["time"],
            "unit": "seconds",
            "sourceFrames": frame_count,
            "samples": len(indices),
        },
        "t": rounded(time),
        "jointPosition": {
            "unit": "rad",
            "left": rounded(left_joint),
            "right": rounded(right_joint),
        },
        "endEffectorPosition": {
            "unit": "m",
            "frame": "world",
            "left": rounded(left_ee),
            "right": rounded(right_ee),
        },
        "provenance": {
            "manifestSha256": episode["manifestSha256"],
            "trajectorySha256": artifact.get("sha256"),
            "datasets": list(REQUIRED.values()),
        },
    }
    name = episode["id"].removeprefix("episode:") + ".json"
    content = (json.dumps(trace, separators=(",", ":"), ensure_ascii=False) + "\n").encode()
    digest = hashlib.sha256(content).hexdigest()
    (OUTPUT / name).write_bytes(content)
    return {
        "available": True,
        "url": f"/curated-traces/{name}",
        "sha256": digest,
        "manifestSha256": episode["manifestSha256"],
        "trajectorySha256": artifact.get("sha256"),
        "sourceFrames": frame_count,
        "samples": len(indices),
    }


def check_registry(episodes):
    registry, _ = load_json(REGISTRY)
    if registry.get("schemaVersion") != "roboexam.curated-trace-index.v1":
        raise ValueError("trace registry schema mismatch")
    if set(registry["episodes"]) != set(episodes):
        raise ValueError("trace registry episode set is stale")
    for episode_id, episode in episodes.items():
        entry = registry["episodes"][episode_id]
        if entry["manifestSha256"] != episode["manifestSha256"]:
            raise ValueError(f"trace manifest binding is stale: {episode_id}")
        if entry["available"]:
            path = PROJECT / "public" / entry["url"].lstrip("/")
            raw = path.read_bytes()
            if hashlib.sha256(raw).hexdigest() != entry["sha256"]:
                raise ValueError(f"trace hash mismatch: {episode_id}")
            trace = json.loads(raw)
            if trace["episodeId"] != episode_id or trace["provenance"]["manifestSha256"] != episode["manifestSha256"]:
                raise ValueError(f"trace identity mismatch: {episode_id}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    episodes = public_episodes()
    if args.check:
        check_registry(episodes)
        print(f"Curated traces verified: {len(episodes)} episodes")
        return
    OUTPUT.mkdir(parents=True, exist_ok=True)
    registry = {
        "schemaVersion": "roboexam.curated-trace-index.v1",
        "sampleBudget": SAMPLE_BUDGET,
        "episodes": {},
    }
    for index, (episode_id, episode) in enumerate(episodes.items(), 1):
        try:
            registry["episodes"][episode_id] = export_episode(episode)
        except (FileNotFoundError, KeyError, OSError, ValueError) as error:
            registry["episodes"][episode_id] = {
                "available": False,
                "manifestSha256": episode["manifestSha256"],
                "reason": str(error),
            }
        if index % 100 == 0:
            print(f"Exported {index}/{len(episodes)} traces", flush=True)
    content = json.dumps(registry, separators=(",", ":"), ensure_ascii=False) + "\n"
    REGISTRY.write_text(content, encoding="utf-8")
    available = sum(entry["available"] for entry in registry["episodes"].values())
    print(f"Curated traces exported: {available}/{len(episodes)} available")


if __name__ == "__main__":
    main()
