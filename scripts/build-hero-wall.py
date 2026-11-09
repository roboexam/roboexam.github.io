#!/usr/bin/env python3
"""Build the four-column hero video wall (one column per track).

Each column is pre-rendered as a single portrait video in which five
evaluation clips scroll seamlessly, so the page decodes four videos instead of
dozens of tiles. Columns alternate scroll direction. Tints are applied in CSS.

  <out>/<sha256>.mp4, <out>/<sha256>.jpg   column videos and posters
  <out>/manifest.json                      provenance (server only)
  <out>/home-demo-media.json               allowlist entries for the media route
  <out>/hero-wall.json                     browser-safe catalog (no paths)
"""
import argparse
import importlib.util
import json
import os
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("home_demos", os.path.join(HERE, "build-home-demos.py"))
home_demos = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(home_demos)

T1_MEDIA = "/mnt/gyc_ckp/benchmark2027/experiments/evaluation/track1/t1-unibench24-final-20261102-v1/media"
T2_CASES = ("/mnt/gyc_ckp/benchmark2027/experiments/evaluation/acwm_threebaseline_clean2400_20261103/"
            "benchmark2027_threebaseline_AB_eval600_20261103_v1/format_adapters/"
            "benchmark2027_pelican_remaining395_format_20261105_v2/cases")
T3_ROOT = "/mnt/gyc_ckp/benchmark2027/experiments/benchmark-policy"

# Frozen selection: successful ID-split episodes where the track records success.
COLUMNS = [
    {"track": "T1", "label": "VLM agent rollouts", "source": "UniBench-24 · GPT-6.1-sol · ID", "direction": "up", "crop": "640:360:0:0",
     "clips": [("solve_equation", f"{T1_MEDIA}/t1-unibench24-final-20261102-v1-gpt-6-1-sol-id-solve_equation-id2.mp4"),
               ("set_button_colors", f"{T1_MEDIA}/t1-unibench24-final-20261102-v1-gpt-6-1-sol-id-set_button_colors-id1.mp4"),
               ("pack_mixed_objects_into_box_v1", f"{T1_MEDIA}/t1-unibench24-final-20261102-v1-gpt-6-1-sol-id-pack_mixed_objects_into_box_v1-id2.mp4"),
               ("hold_water_mug", f"{T1_MEDIA}/t1-unibench24-final-20261102-v1-gpt-6-1-sol-id-hold_water_mug-id4.mp4"),
               ("mirror_pair_layout", f"{T1_MEDIA}/t1-unibench24-final-20261102-v1-gpt-6-1-sol-id-mirror_pair_layout-id1.mp4")]},
    {"track": "T2", "label": "World-model predictions", "source": "ACWM eval-600 · Pelican · ID", "direction": "down", "crop": None,
     "clips": [(task, f"{T2_CASES}/{task}__id__episode_000000/pred_cam_head_native.mp4")
               for task in ("fold_clothes", "build_tower", "pour_liquid_into_cup", "insert_key", "cover_blocks")]},
    {"track": "T3", "label": "Simulation policy rollouts", "source": "Benchmark policy · G05 · ID", "direction": "up", "crop": None,
     "clips": [(task, f"{T3_ROOT}/G05/id/{task}/{episode}/videos/head.mp4")
               for task, episode in (("stack_bowls", "episode_0"), ("hang_mugs", "episode_0"), ("fold_clothes", "episode_2"),
                                     ("pour_liquid_into_cup", "episode_3"), ("match_and_pick_from_conveyor", "episode_3"))]},
    {"track": "T4", "label": "Real-robot episodes", "source": "Real collection · 3 dual-arm rigs", "direction": "down", "crop": None,
     "real": [("agilex_cobotmagic2_dualArm-gripper-3cameras_35", "_T2_ID1", 0), ("agilex_cobotmagic2_dualArm-gripper-3cameras_35", "_T1_ID1", 0),
              ("tienyi_prod2.5_dualArm-gripper-3cameras_17", "_T3_ID1", 0), ("tienyi_prod2.5_dualArm-gripper-3cameras_40", "_T1_ID4", 0),
              ("agilex_cobotmagic2_dualArm-gripper-3cameras_35", "_T3_ID2", 0)]},
]
FPS = 20
PERIOD = 25.0            # seconds for one full scroll cycle
TILE_LOOP = PERIOD / 4   # each tile loops 4x per cycle so the wrap is seamless
WIDTH, TILE_H, GAP, WINDOW_H = 400, 225, 12, 900
PITCH = TILE_H + GAP
REPEAT = -(-WINDOW_H // PITCH)  # tiles repeated below the stack to cover the window
MAX_SPEED = 4.0


def probe_duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         check=True, capture_output=True, text=True).stdout.strip()
    return float(out)


def tile(source, start, length, crop, target):
    """Cut the centred window of a source into an exact TILE_LOOP-second 400x225 tile."""
    window = min(length, TILE_LOOP * MAX_SPEED)
    begin = start + (length - window) / 2
    speed = window / TILE_LOOP
    filters = [f"setpts=(PTS-STARTPTS)/{speed:.6f}"]
    if crop:
        filters.append(f"crop={crop}")
    filters += [f"scale={WIDTH}:{TILE_H}:force_original_aspect_ratio=increase:flags=lanczos", f"crop={WIDTH}:{TILE_H}",
                f"fps={FPS}", "tpad=stop_mode=clone:stop_duration=1"]
    frames = round(TILE_LOOP * FPS)
    home_demos.run(["-ss", f"{begin:.6f}", "-t", f"{window:.6f}", "-i", source, "-vf", ",".join(filters),
                    "-frames:v", str(frames), "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", target])
    return {"from": round(begin, 3), "to": round(begin + window, 3), "speed": round(speed, 3)}


def column(tiles, direction, target):
    count = len(tiles)
    inputs = []
    for path in tiles:
        inputs += ["-stream_loop", "-1", "-i", path]
    chains, stack = [], []
    for index in range(count):
        copies = 2 if index < REPEAT else 1
        labels = [f"a{index}"] + ([f"b{index}"] if copies == 2 else [])
        chain = f"[{index}:v]pad={WIDTH}:{PITCH}:0:0:color=0xF3F3F6"
        chains.append(chain + (f",split=2[{labels[0]}][{labels[1]}]" if copies == 2 else f"[{labels[0]}]"))
    stack = [f"[a{i}]" for i in range(count)] + [f"[b{i}]" for i in range(min(REPEAT, count))]
    total = round(PERIOD * FPS)
    travel = count * PITCH
    offset = f"mod(n*{travel}/{total},{travel})"
    y = offset if direction == "up" else f"{travel}-{offset}"
    graph = ";".join(chains) + f";{''.join(stack)}vstack=inputs={len(stack)},crop={WIDTH}:{WINDOW_H}:0:'{y}'[out]"
    home_demos.run([*inputs, "-filter_complex", graph, "-map", "[out]", "-frames:v", str(total), "-r", str(FPS),
                    *home_demos.X264, "-crf", "31", "-maxrate", "900k", "-bufsize", "1800k", target])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, help="new, empty bundle directory")
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    os.makedirs(args.out, exist_ok=False)
    registry, provenance, columns = {}, [], []
    bundle = os.path.basename(os.path.normpath(args.out))
    with tempfile.TemporaryDirectory(dir=args.out) as scratch:
        for spec in COLUMNS:
            tiles, sources = [], []
            if "real" in spec:
                for rig, suffix, episode in spec["real"]:
                    _, root = home_demos.dataset_dir(rig, suffix)
                    window = home_demos.episode_window(root, episode, home_demos.HEAD)
                    path = os.path.join(scratch, f"{spec['track']}-{len(tiles)}.mp4")
                    cut = tile(window["source"], window["start"], window["end"] - window["start"], None, path)
                    item, relative = home_demos.describe(rig, suffix, episode, root)
                    tiles.append(path)
                    sources.append({"task": item["task"], "rig": item["rig"], "dataset": relative, "episode": episode,
                                    "file": os.path.relpath(window["source"], home_demos.SOURCE_ROOT), **cut})
            else:
                for task, source in spec["clips"]:
                    path = os.path.join(scratch, f"{spec['track']}-{len(tiles)}.mp4")
                    cut = tile(source, 0.0, probe_duration(source), spec["crop"], path)
                    tiles.append(path)
                    sources.append({"task": task, "source": source, "size": os.path.getsize(source), **cut})
            rendered = os.path.join(scratch, f"{spec['track']}-column.mp4")
            column(tiles, spec["direction"], rendered)
            video = home_demos.publish(rendered, args.out, "mp4", registry)
            poster = home_demos.poster(os.path.join(args.out, video["file"]), 0.0, args.out, registry, scratch)
            columns.append({"track": spec["track"], "label": spec["label"], "source": spec["source"], "direction": spec["direction"],
                            "period": PERIOD, "width": WIDTH, "height": WINDOW_H, "tasks": [s["task"] for s in sources],
                            "video": video, "poster": poster})
            provenance.append({"track": spec["track"], "video": video["sha256"], "tiles": sources})
    for entry in registry.values():
        entry["relative"] = f"{bundle}/{entry['relative']}"
    json.dump({"schema": "roboexam.hero-wall.v1", "version": args.version, "columns": columns},
              open(os.path.join(args.out, "hero-wall.json"), "w"), ensure_ascii=False, indent=2)
    json.dump(registry, open(os.path.join(args.out, "home-demo-media.json"), "w"), indent=2)
    json.dump({"version": args.version, "fps": FPS, "period": PERIOD, "tileLoop": TILE_LOOP, "columns": provenance},
              open(os.path.join(args.out, "manifest.json"), "w"), indent=2)
    print(json.dumps({"columns": len(columns), "files": len(registry)}))


if __name__ == "__main__":
    main()
