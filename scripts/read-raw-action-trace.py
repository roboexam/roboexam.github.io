#!/usr/bin/env python3
"""Read one server-authorized read-only descriptor; never accept browser paths."""
from __future__ import annotations

import json
import os
import sys
import numpy as np

BUDGET = 80
H5_FIELDS = {
    "left_joint": "state/left_arm_joint_state",
    "right_joint": "state/right_arm_joint_state",
    "left_ee": "state/left_arm_ee_pose_world",
    "right_ee": "state/right_arm_ee_pose_world",
}
CLOCK = "vision/cam_head/video_pts_seconds"


def indices_and_time(time):
    time = np.asarray(time, dtype=np.float64)
    if time.ndim != 1 or len(time) < 2 or len(time) > 2_000_000:
        raise ValueError("invalid_clock_length")
    if not np.isfinite(time).all() or not (np.diff(time) > 0).all():
        raise ValueError("invalid_video_clock")
    indices = np.unique(np.linspace(0, len(time) - 1, min(BUDGET, len(time)), dtype=np.int64))
    return indices, (time[indices] - time[0]).tolist()


def rounded(values):
    if not np.isfinite(values).all():
        raise ValueError("non_finite_trace")
    return np.round(values.astype(np.float64), 5).tolist()


def hdf5(handle, request):
    import h5py
    arrays, missing, datasets = {}, [], [CLOCK]
    with h5py.File(handle, "r") as h:
        if CLOCK not in h:
            raise ValueError("video_clock_missing")
        clock = h[CLOCK]
        if clock.ndim != 1 or not 2 <= len(clock) <= 2_000_000:
            raise ValueError("invalid_clock_length")
        n = len(clock)
        indices, time = indices_and_time(clock[:])
        for attr, wanted in [("episode_id", request.get("originalEpisodeId")), ("task_name", request.get("taskName"))]:
            actual = h.attrs.get(attr)
            if isinstance(actual, bytes):
                actual = actual.decode()
            if actual is not None and wanted is not None and str(actual) != wanted:
                raise ValueError("source_identity_mismatch")
        for name, dataset in H5_FIELDS.items():
            if dataset not in h:
                arrays[name] = None
                missing.append(name)
                continue
            data = h[dataset]
            dimension = 6 if name.endswith("joint") else 3
            if data.ndim != 2 or data.shape[0] != n or data.shape[1] < dimension:
                raise ValueError("unaligned_trace_arrays")
            arrays[name] = rounded(np.asarray(data[indices, :dimension], dtype=np.float64))
            datasets.append(dataset)
    return n, time, arrays, missing, datasets, CLOCK, "world", "video PTS clock"


def parquet(handle, request):
    import pyarrow.parquet as pq
    # Only the explicitly described raw official 20D rot6d state contract is supported.
    if not request.get("officialState20D"):
        raise ValueError("unsupported_parquet_contract")
    file = pq.ParquetFile(handle)
    if not 2 <= file.metadata.num_rows <= 2_000_000:
        raise ValueError("invalid_clock_length")
    required = ["timestamp", "observation.state", "episode_id", "task", "frame_index"]
    if not set(required).issubset(file.schema_arrow.names):
        raise ValueError("official_trace_fields_missing")
    table = file.read(columns=required, use_threads=False)
    episode_ids = set(table["episode_id"].to_pylist())
    if episode_ids != {request.get("originalEpisodeId")} or set(table["task"].to_pylist()) != {request.get("taskName")}:
        raise ValueError("source_identity_mismatch")
    n = table.num_rows
    frames = np.asarray(table["frame_index"].to_pylist())
    if not np.array_equal(frames, np.arange(n)):
        raise ValueError("frame_index_mismatch")
    if request.get("sourceFrames") != n:
        raise ValueError("official_frame_count_mismatch")
    raw_time = np.asarray(table["timestamp"].to_pylist(), dtype=np.float64)
    fps = request.get("fps")
    if not isinstance(fps, (int, float)) or not np.isfinite(fps) or fps <= 0 or not np.allclose(raw_time - raw_time[0], frames / fps, rtol=0, atol=1e-5):
        raise ValueError("official_video_clock_mismatch")
    indices, time = indices_and_time(raw_time)
    rows = table.take(indices)["observation.state"].to_pylist()
    state = np.asarray(rows, dtype=np.float64)
    if state.shape != (len(indices), 20):
        raise ValueError("unsupported_state_dimensions")
    # Canonical names: left xyz, left rot6d/gripper, right xyz, right rot6d/gripper.
    # No joint angles are inferred from end-effector poses or action vectors.
    arrays = {"left_joint": None, "right_joint": None,
              "left_ee": rounded(state[:, :3]), "right_ee": rounded(state[:, 10:13])}
    return n, time, arrays, ["left_joint", "right_joint"], ["timestamp", "observation.state"], "timestamp", "source", "recorded video-frame clock"


def extract(handle, request):
    result = hdf5(handle, request) if request["format"] == "hdf5" else parquet(handle, request)
    n, time, arrays, missing, datasets, clock, frame, label = result
    if all(value is None for value in arrays.values()):
        raise ValueError("robot_state_missing")
    if request.get("videoFrames") is not None and request["videoFrames"] != n:
        raise ValueError("video_frame_count_mismatch")
    duration = request.get("videoDuration")
    if duration is not None and (time[-1] > duration + .05 or abs(duration - time[-1]) > max(.2, duration * .01)):
        raise ValueError("video_duration_mismatch")
    return {
        "schemaVersion": "roboexam.action-trace.v1", "episodeId": request["episodeId"],
        "clock": {"dataset": clock, "unit": "seconds", "sourceFrames": n, "samples": len(time), "label": label},
        "t": time,
        "jointPosition": {"unit": "rad", "left": arrays["left_joint"], "right": arrays["right_joint"]},
        "endEffectorPosition": {"unit": "m", "frame": frame, "left": arrays["left_ee"], "right": arrays["right_ee"]},
        "provenance": {"manifestSha256": request["manifestSha256"], "trajectorySha256": None,
                       "expectedTrajectorySha256": request.get("expectedTrajectorySha256"),
                       "bindingSha256": request["bindingSha256"], "bindingMethod": "raw_file_identity",
                       "sourceFormat": request["format"], "datasets": datasets, "missing": missing},
    }


def main():
    try:
        request = json.loads(sys.stdin.read(65537))
        with os.fdopen(3, "rb", closefd=False) as handle:
            trace = extract(handle, request)
        print(json.dumps({"status": "available", "trace": trace}, separators=(",", ":"), allow_nan=False))
    except (ValueError, KeyError, OSError, ImportError, TypeError, OverflowError) as error:
        reason = str(error)
        allowed = {"invalid_clock_length", "invalid_video_clock", "video_clock_missing", "source_identity_mismatch",
                   "unaligned_trace_arrays", "non_finite_trace", "unsupported_parquet_contract", "official_trace_fields_missing",
                   "frame_index_mismatch", "official_frame_count_mismatch", "official_video_clock_mismatch",
                   "unsupported_state_dimensions", "robot_state_missing", "video_frame_count_mismatch", "video_duration_mismatch"}
        print(json.dumps({"status": "unavailable", "reason": reason if reason in allowed else "trajectory_unreadable"}))


if __name__ == "__main__":
    main()
