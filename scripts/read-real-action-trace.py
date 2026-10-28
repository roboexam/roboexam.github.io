#!/usr/bin/env python3
"""Extract one allowlisted LeRobot episode from a server-opened Parquet file."""
from __future__ import annotations

import json
import os
import sys

import numpy as np

BUDGET = 80
V3 = {
    "left_joint": "puppet.arm_left_position_align.data",
    "right_joint": "puppet.arm_right_position_align.data",
    "left_ee": "puppet.end_effector_left_pose_align.data",
    "right_ee": "puppet.end_effector_right_pose_align.data",
    "left_action": "master.arm_left_position_align.data",
    "right_action": "master.arm_right_position_align.data",
}
V2 = {
    "left_ee": "observation.state.left_wrist_pose",
    "right_ee": "observation.state.right_wrist_pose",
    "action": "action",
    "action_valid": "action.valid",
}


def rounded(values):
    values = np.asarray(values, dtype=np.float64)
    if not np.isfinite(values).all():
        raise ValueError("non_finite_trace")
    return np.round(values, 5).tolist()


def sampled_positions(eligible):
    sampled = np.unique(
        np.linspace(0, len(eligible) - 1, min(BUDGET, len(eligible)), dtype=np.int64)
    )
    return eligible[sampled]


def video_time(table, frames, positions, duration):
    clock = frames.astype(np.float64)
    if "timestamp" in table.column_names:
        candidate = np.asarray(table["timestamp"].to_pylist(), dtype=np.float64)
        if (
            candidate.shape == clock.shape
            and np.isfinite(candidate).all()
            and (np.diff(candidate) > 0).all()
        ):
            clock = candidate
    span = clock[-1] - clock[0]
    if not np.isfinite(duration) or duration <= 0 or not np.isfinite(span) or span <= 0:
        raise ValueError("video_duration_missing")
    time = (clock[positions] - clock[0]) / span * duration
    if not np.isfinite(time).all() or not (np.diff(time) > 0).all():
        raise ValueError("invalid_video_clock")
    return time


def episode_table(handle, request, columns):
    import pyarrow as pa
    import pyarrow.compute as pc
    import pyarrow.parquet as pq

    parquet = pq.ParquetFile(handle)
    names = set(parquet.schema_arrow.names)
    if not {"episode_index", "frame_index"}.issubset(names):
        raise ValueError("episode_fields_missing")
    wanted = ["episode_index", "frame_index", *[name for name in columns if name in names]]
    parts = []
    for group in range(parquet.num_row_groups):
        table = parquet.read_row_group(group, columns=wanted, use_threads=False)
        selected = table.filter(pc.equal(table["episode_index"], request["episodeIndex"]))
        if selected.num_rows:
            parts.append(selected)
    if not parts:
        raise ValueError("episode_not_found")
    table = pa.concat_tables(parts) if len(parts) > 1 else parts[0]
    if table.num_rows != request["sourceFrames"] or not 2 <= table.num_rows <= 2_000_000:
        raise ValueError("source_frame_count_mismatch")
    frames = np.asarray(table["frame_index"].to_pylist(), dtype=np.int64)
    order = np.argsort(frames, kind="stable")
    table = table.take(pa.array(order))
    frames = frames[order]
    if len(np.unique(frames)) != len(frames) or not (np.diff(frames) > 0).all():
        raise ValueError("frame_index_mismatch")
    return table, frames, names


def matrix(table, column, positions, dimension):
    if column not in table.column_names:
        return None
    values = np.asarray(table[column].to_pylist(), dtype=np.float64)
    if values.ndim != 2 or values.shape[1] < dimension:
        raise ValueError("unsupported_trace_dimensions")
    return rounded(values[positions, :dimension])


def width(table, column):
    if column not in table.column_names:
        return None
    values = np.asarray(table[column].to_pylist())
    if values.ndim != 2:
        raise ValueError("unsupported_trace_dimensions")
    return values.shape[1]


def extract(handle, request):
    if request["format"] == "lerobot-v3":
        fields = list(V3.values()) + ["timestamp"]
    else:
        fields = list(V2.values()) + ["timestamp"]
    table, frames, names = episode_table(handle, request, fields)
    source_frames = table.num_rows
    if source_frames < 2:
        raise ValueError("action_samples_missing")
    positions = sampled_positions(np.arange(source_frames))
    action_allowed = True
    duration = float(request["durationSeconds"])
    time = video_time(table, frames, positions, duration)

    missing, datasets = [], ["episode_index", "frame_index"]
    if "timestamp" in names:
        datasets.append("timestamp")
    if request["format"] == "lerobot-v3":
        left_joint = matrix(table, V3["left_joint"], positions, 6)
        right_joint = matrix(table, V3["right_joint"], positions, 6)
        left_ee = matrix(table, V3["left_ee"], positions, 3)
        right_ee = matrix(table, V3["right_ee"], positions, 3)
        action_widths = [value for value in (width(table, V3["left_action"]), width(table, V3["right_action"])) if value is not None]
        action_dimension = min(action_widths) if action_widths else 0
        if action_dimension not in (0, 6, 7):
            raise ValueError("unsupported_trace_dimensions")
        left_action = matrix(table, V3["left_action"], positions, action_dimension) if action_dimension else None
        right_action = matrix(table, V3["right_action"], positions, action_dimension) if action_dimension else None
        labels = ["J1", "J2", "J3", "J4", "J5", "J6"] + (["Grip"] if action_dimension == 7 else [])
        action = {"unit": "joint command", "labels": labels,
                  "left": left_action, "right": right_action} if left_action is not None or right_action is not None else None
        candidates = V3
    else:
        left_joint = right_joint = None
        left_ee = matrix(table, V2["left_ee"], positions, 3)
        right_ee = matrix(table, V2["right_ee"], positions, 3)
        action_positions, action_time = positions, time
        if V2["action_valid"] in table.column_names:
            valid = np.asarray(table[V2["action_valid"]].to_pylist(), dtype=bool)
            action_allowed = valid.shape == (source_frames,) and int(valid.sum()) >= 2
            if action_allowed:
                action_positions = sampled_positions(np.flatnonzero(valid))
                action_time = video_time(table, frames, action_positions, duration)
        values = matrix(table, V2["action"], action_positions, 14) if action_allowed else None
        action = None if values is None else {
            "unit": "delta pose", "labels": ["ΔX", "ΔY", "ΔZ", "Qw", "Qx", "Qy", "Qz"],
            "t": action_time.tolist(),
            "left": [row[:7] for row in values], "right": [row[7:14] for row in values],
        }
        candidates = V2
    for label, field in candidates.items():
        if field in names:
            datasets.append(field)
        elif label != "action_valid":
            missing.append(label)
    if all(value is None for value in (left_joint, right_joint, left_ee, right_ee, action)):
        raise ValueError("robot_state_missing")

    trace = {
        "schemaVersion": "roboexam.action-trace.v1",
        "episodeId": request["episodeId"],
        "clock": {"dataset": "episode_relative_video_pts", "unit": "seconds", "sourceFrames": source_frames,
                  "samples": len(time), "label": "episode-relative video PTS"},
        "t": time.tolist(),
        "jointPosition": {"unit": "rad", "left": left_joint, "right": right_joint},
        "endEffectorPosition": {"unit": "m", "frame": "source", "left": left_ee, "right": right_ee},
        "provenance": {"manifestSha256": request["manifestSha256"], "trajectorySha256": None,
                       "bindingSha256": request["bindingSha256"], "bindingMethod": "real_parquet_identity",
                       "sourceFormat": request["format"], "datasets": datasets, "missing": missing},
    }
    if action is not None:
        trace["action"] = action
    return trace


def main():
    try:
        request = json.loads(sys.stdin.read(65537))
        with os.fdopen(3, "rb", closefd=False) as handle:
            trace = extract(handle, request)
        print(json.dumps({"status": "available", "trace": trace}, separators=(",", ":"), allow_nan=False))
    except (ValueError, KeyError, OSError, ImportError, TypeError, OverflowError) as error:
        reason = str(error)
        allowed = {
            "episode_fields_missing", "episode_not_found", "source_frame_count_mismatch", "frame_index_mismatch",
            "unsupported_trace_dimensions", "action_samples_missing", "video_duration_missing", "invalid_video_clock",
            "non_finite_trace", "robot_state_missing",
        }
        print(json.dumps({"status": "unavailable", "reason": reason if reason in allowed else "trajectory_unreadable"}))


if __name__ == "__main__":
    main()
