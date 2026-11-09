#!/usr/bin/env python3
"""Build the homepage real-robot demo clips from the LeRobot v3 collection.

Reads the frozen selection below, cuts each episode window from the source
LeRobot v3 video files, re-encodes a short sped-up web rendition and a poster,
and writes a content-addressed bundle:

  <out>/<sha256>.mp4, <out>/<sha256>.jpg   media
  <out>/manifest.json                      full provenance (server only)
  <out>/home-demo-media.json               allowlist for the media route
  <out>/home-demos.json                    browser-safe catalog (no paths)

Copy home-demo-media.json to scripts/ and home-demos.json to
app/data/generated/ after a build. Sources are only read, never modified.
"""
import argparse
import glob
import hashlib
import json
import os
import re
import subprocess
import tempfile

import pyarrow.parquet as pq

SOURCE_ROOT = "/mnt/public_ckp/UniEmbodied-Bench/real/lerobot_data_v3"
HEAD = "camera_observations.color_images.camera_head"
# AgileX names its wrist cameras camera_wrist_{left,right}; Tienyi uses camera_{left,right}.
WRIST_CANDIDATES = {
    "left": ("camera_observations.color_images.camera_wrist_left", "camera_observations.color_images.camera_left"),
    "right": ("camera_observations.color_images.camera_wrist_right", "camera_observations.color_images.camera_right"),
}

RIGS = {
    "agilex_cobotmagic2_dualArm-gripper-3cameras_35": {"id": "agilex-35", "label": "AgileX Cobot Magic 2", "unit": "#35"},
    "tienyi_prod2.5_dualArm-gripper-3cameras_17": {"id": "tienyi-17", "label": "Tienyi Prod 2.5", "unit": "#17"},
    "tienyi_prod2.5_dualArm-gripper-3cameras_40": {"id": "tienyi-40", "label": "Tienyi Prod 2.5", "unit": "#40"},
}
TASKS = {
    "T1": {"id": "button_sequence", "label": "Button sequence"},
    "T2": {"id": "towel_folding", "label": "Towel folding"},
    "T3": {"id": "vegetable_sorting", "label": "Vegetable sorting"},
}

# Frozen selection: (rig directory, dataset directory suffix, episode index).
FEATURED = [
    ("agilex_cobotmagic2_dualArm-gripper-3cameras_35", "_T1_ID1", 0),
    ("agilex_cobotmagic2_dualArm-gripper-3cameras_35", "_T2_ID1", 0),
    ("tienyi_prod2.5_dualArm-gripper-3cameras_17", "_T3_ID1", 0),
]
STRIP = [
    ("agilex_cobotmagic2_dualArm-gripper-3cameras_35", "_T1_ID3", 0),
    ("agilex_cobotmagic2_dualArm-gripper-3cameras_35", "_T2_ID2", 0),
    ("agilex_cobotmagic2_dualArm-gripper-3cameras_35", "_T3_ID2", 0),
    ("tienyi_prod2.5_dualArm-gripper-3cameras_40", "_T1_ID1", 0),
    ("tienyi_prod2.5_dualArm-gripper-3cameras_17", "_T3_ID3", 0),
    ("agilex_cobotmagic2_dualArm-gripper-3cameras_35", "_T1_ID5", 0),
    ("agilex_cobotmagic2_dualArm-gripper-3cameras_35", "_T2_ID1", 2),
    ("tienyi_prod2.5_dualArm-gripper-3cameras_40", "_T1_ID4", 0),
    ("agilex_cobotmagic2_dualArm-gripper-3cameras_35", "_T3_ID5", 0),
    ("tienyi_prod2.5_dualArm-gripper-3cameras_17", "_T3_ID5", 0),
]
STRIP_SECONDS = 10.0
FEATURED_SECONDS = 16.0
X264 = ["-c:v", "libx264", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        "-map_metadata", "-1", "-an", "-g", "50", "-keyint_min", "25", "-sc_threshold", "0"]


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def dataset_dir(rig, suffix):
    matches = [d for d in glob.glob(os.path.join(SOURCE_ROOT, rig, "*")) if os.path.basename(d).rstrip("_").endswith(suffix)]
    if len(matches) != 1:
        raise SystemExit(f"expected one dataset for {rig}{suffix}, found {matches}")
    infos = glob.glob(os.path.join(matches[0], "*", "lerobot_*", "meta", "info.json"))
    if len(infos) != 1:
        raise SystemExit(f"expected one LeRobot root under {matches[0]}, found {infos}")
    return matches[0], os.path.dirname(os.path.dirname(infos[0]))


def task_key(name):
    match = re.search(r"_(T\d)_ID(\d)", name)
    if not match or match.group(1) not in TASKS:
        raise SystemExit(f"cannot parse task from {name}")
    return match.group(1), int(match.group(2))


def episode_window(root, episode, camera):
    files = sorted(glob.glob(os.path.join(root, "meta", "episodes", "**", "*.parquet"), recursive=True))
    prefix = f"videos/{camera}/"
    columns = ["episode_index", "length"] + [prefix + key for key in ("chunk_index", "file_index", "from_timestamp", "to_timestamp")]
    rows = [row for row in pq.ParquetDataset(files).read(columns=columns).to_pylist() if row["episode_index"] == episode]
    if len(rows) != 1:
        raise SystemExit(f"episode {episode} not unique in {root}")
    row = rows[0]
    source = os.path.join(root, "videos", camera, f"chunk-{row[prefix + 'chunk_index']:03d}", f"file-{row[prefix + 'file_index']:03d}.mp4")
    start, end = float(row[prefix + "from_timestamp"]), float(row[prefix + "to_timestamp"])
    if not (os.path.isfile(source) and end > start >= 0):
        raise SystemExit(f"bad window for {root} episode {episode} {camera}")
    return {"source": source, "start": start, "end": end, "frames": int(row["length"])}


def speed_for(seconds, target):
    return max(2, min(8, round(seconds / target)))


def run(args):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y", *args], check=True)


def publish(temporary, out, extension, registry):
    digest = sha256(temporary)
    name = f"{digest}.{extension}"
    final = os.path.join(out, name)
    os.replace(temporary, final)
    registry[name] = {"relative": name, "size": os.path.getsize(final), "sha256": digest}
    return {"file": name, "sha256": digest, "bytes": os.path.getsize(final)}


def poster(video, seconds, out, registry, scratch):
    target = os.path.join(scratch, "poster.jpg")
    run(["-ss", f"{seconds * 0.4:.3f}", "-i", video, "-frames:v", "1", "-q:v", "4", target])
    return publish(target, out, "jpg", registry)


def describe(rig, suffix, episode, root):
    name = os.path.basename(os.path.dirname(os.path.dirname(root)))
    task, variant = task_key(name)
    info = json.load(open(os.path.join(root, "meta", "info.json")))
    return {
        "rig": RIGS[rig]["id"], "task": TASKS[task]["id"], "variant": variant, "episode": episode,
        "instruction": info.get("metadata.language_instruction", "").strip(), "fps": info["fps"],
    }, os.path.relpath(os.path.dirname(os.path.dirname(root)), SOURCE_ROOT)


def build_strip(rig, suffix, episode, out, registry, scratch, provenance):
    _, root = dataset_dir(rig, suffix)
    item, relative = describe(rig, suffix, episode, root)
    window = episode_window(root, episode, HEAD)
    seconds = window["end"] - window["start"]
    speed = speed_for(seconds, STRIP_SECONDS)
    clip = os.path.join(scratch, "clip.mp4")
    run(["-ss", f"{window['start']:.6f}", "-t", f"{seconds:.6f}", "-i", window["source"],
         "-vf", f"setpts=(PTS-STARTPTS)/{speed},scale=640:-2:flags=lanczos,fps=25",
         *X264, "-crf", "27", "-maxrate", "1100k", "-bufsize", "2200k", clip])
    duration = seconds / speed
    item.update({"camera": "head", "speed": speed, "duration": round(duration, 3), "width": 640, "height": 360,
                 "video": publish(clip, out, "mp4", registry)})
    item["poster"] = poster(os.path.join(out, item["video"]["file"]), duration, out, registry, scratch)
    provenance.append({"kind": "strip", "dataset": relative, "episode": episode, "cameras": {"head": rel_window(window)},
                       "speed": speed, "video": item["video"]["sha256"]})
    return item


def build_featured(rig, suffix, episode, out, registry, scratch, provenance):
    _, root = dataset_dir(rig, suffix)
    item, relative = describe(rig, suffix, episode, root)
    features = json.load(open(os.path.join(root, "meta", "info.json")))["features"]
    keys = {"head": HEAD, **{side: next(k for k in options if features.get(k, {}).get("dtype") == "video") for side, options in WRIST_CANDIDATES.items()}}
    windows = {name: episode_window(root, episode, keys[name]) for name in ("head", "left", "right")}
    seconds = min(w["end"] - w["start"] for w in windows.values())
    speed = speed_for(seconds, FEATURED_SECONDS)
    inputs = []
    for name in ("head", "left", "right"):
        inputs += ["-ss", f"{windows[name]['start']:.6f}", "-t", f"{seconds:.6f}", "-i", windows[name]["source"]]
    graph = (f"[0:v]setpts=(PTS-STARTPTS)/{speed},scale=960:540:flags=lanczos,fps=25[h];"
             f"[1:v]setpts=(PTS-STARTPTS)/{speed},scale=480:270:flags=lanczos,fps=25[l];"
             f"[2:v]setpts=(PTS-STARTPTS)/{speed},scale=480:270:flags=lanczos,fps=25[r];"
             "[l][r]vstack=inputs=2[w];[h][w]hstack=inputs=2:shortest=1[out]")
    clip = os.path.join(scratch, "clip.mp4")
    run([*inputs, "-filter_complex", graph, "-map", "[out]", *X264, "-crf", "26", "-maxrate", "2600k", "-bufsize", "5200k", clip])
    duration = seconds / speed
    item.update({"camera": "head+wrists", "speed": speed, "duration": round(duration, 3), "width": 1440, "height": 540,
                 "video": publish(clip, out, "mp4", registry)})
    item["poster"] = poster(os.path.join(out, item["video"]["file"]), duration, out, registry, scratch)
    provenance.append({"kind": "featured", "dataset": relative, "episode": episode,
                       "cameras": {name: rel_window(w) for name, w in windows.items()}, "speed": speed, "video": item["video"]["sha256"]})
    return item


def rel_window(window):
    stat = os.stat(window["source"])
    return {"file": os.path.relpath(window["source"], SOURCE_ROOT), "size": stat.st_size, "mtime": int(stat.st_mtime),
            "from": window["start"], "to": window["end"], "frames": window["frames"]}


def collection_summary():
    datasets = []
    for info_path in sorted(glob.glob(os.path.join(SOURCE_ROOT, "*", "*", "*", "lerobot_*", "meta", "info.json"))):
        dataset = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(info_path))))
        rig = os.path.basename(os.path.dirname(dataset))
        task, variant = task_key(os.path.basename(dataset))
        info = json.load(open(info_path))
        datasets.append({"rig": RIGS[rig]["id"], "task": TASKS[task]["id"], "variant": variant,
                         "episodes": int(info["total_episodes"]), "frames": int(info["total_frames"]), "fps": info["fps"],
                         "instruction": info.get("metadata.language_instruction", "").strip()})
    rigs = [{**{k: v for k, v in meta.items()}, "datasets": sum(d["rig"] == meta["id"] for d in datasets),
             "episodes": sum(d["episodes"] for d in datasets if d["rig"] == meta["id"]),
             "tasks": sorted({d["task"] for d in datasets if d["rig"] == meta["id"]})} for meta in RIGS.values()]
    tasks = [{**meta, "variants": len({(d["rig"], d["variant"]) for d in datasets if d["task"] == meta["id"]}),
              "episodes": sum(d["episodes"] for d in datasets if d["task"] == meta["id"]),
              "rigs": sorted({d["rig"] for d in datasets if d["task"] == meta["id"]})} for meta in TASKS.values()]
    totals = {"rigs": len(rigs), "datasets": len(datasets), "episodes": sum(d["episodes"] for d in datasets),
              "frames": sum(d["frames"] for d in datasets), "cameras": 3, "fps": sorted({d["fps"] for d in datasets})}
    return totals, rigs, tasks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, help="new, empty bundle directory")
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    os.makedirs(args.out, exist_ok=False)
    registry, provenance = {}, []
    with tempfile.TemporaryDirectory(dir=args.out) as scratch:
        featured = [build_featured(*spec, args.out, registry, scratch, provenance) for spec in FEATURED]
        strip = [build_strip(*spec, args.out, registry, scratch, provenance) for spec in STRIP]
    bundle = os.path.basename(os.path.normpath(args.out))
    for entry in registry.values():
        entry["relative"] = f"{bundle}/{entry['relative']}"
    totals, rigs, tasks = collection_summary()
    catalog = {"schema": "roboexam.home-demos.v1", "version": args.version, "source": "UniEmbodied-Bench real · LeRobot v3",
               "totals": totals, "rigs": rigs, "tasks": tasks, "featured": featured, "strip": strip}
    json.dump(catalog, open(os.path.join(args.out, "home-demos.json"), "w"), ensure_ascii=False, indent=2)
    json.dump(registry, open(os.path.join(args.out, "home-demo-media.json"), "w"), indent=2)
    json.dump({"version": args.version, "sourceRoot": SOURCE_ROOT, "items": provenance}, open(os.path.join(args.out, "manifest.json"), "w"), indent=2)
    print(json.dumps({"featured": len(featured), "strip": len(strip), "files": len(registry), "totals": totals}))


if __name__ == "__main__":
    main()
