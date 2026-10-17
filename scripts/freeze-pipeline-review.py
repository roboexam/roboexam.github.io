#!/usr/bin/env python3
"""Freeze completed resident clean candidates for human review; never admit data."""
import argparse, datetime, hashlib, json, subprocess
from pathlib import Path

BASE = Path("/mnt/gyc_ckp/benchmark2027")
GOAL = BASE / "experiments/audits/nine_pipeline_goal_20261016"
DEST = BASE / "experiments/audits/dashboard_pipeline_review_20261017"
CAMERAS = ("cam_head", "cam_left_wrist", "cam_right_wrist")
TASKS = ("find_category_outlier", "place_between_references", "mirror_pair_layout", "hold_water_mug")

def ref(p):
    p = Path(p); h = hashlib.sha256()
    with p.open("rb") as f:
        for b in iter(lambda: f.read(1048576), b""): h.update(b)
    return dict(path=str(p), sha256=h.hexdigest(), byte_size=p.stat().st_size)

def read(p): return json.loads(Path(p).read_text())
def bound(r):
    assert ref(r["path"]) == r, "changed evidence: " + r["path"]
    return read(r["path"])

def freeze(snapshot_id):
    assert snapshot_id.startswith("snapshot_") and "/" not in snapshot_id
    pointer_path = GOAL / "CURRENT_LONG_GOAL_EXECUTION_POINTER.v1.json"
    pointer = read(pointer_path); rolling = bound(pointer["rolling"])
    curated = read(BASE / "data/episode/curated_simulation_data/catalog.json")
    admitted = {(x["episode_id"], x["manifest_sha256"]) for x in curated["episodes"]}
    candidates = {}; receipts = []; excluded = []; sources = []
    b03 = read(GOAL / "b03_resident100_full_clean_milestone.v1.json")
    supplemental = [row["selection_state"] for row in b03["accepted_recordings"]]
    for name in ("b04_resident_original_v4_completed_prefix_resume_ledger.v1.json",
                 "b08_native6_original6_complete_prefix_6accepted0Taskfail.v1.json"):
        supplemental.extend(row["accepted_state"] for row in read(GOAL/name)["records"] if row["status"] == "accepted")
    for r in supplemental: bound(r)
    for task in rolling["tasks"]:
        assert task["task"] in TASKS
        for worker in task["workers"]:
            config = bound(worker["config"]); job = Path(config["job_log_dir"])
            sources.append(dict(task=task["task"], worker=worker["attempt_id"],
                                config=worker["config"], job_root=str(job)))
            selection_paths = sorted((job / "selections").glob("*.json")) if task["task"] != "place_between_references" else []
            selection_paths += [Path(r["path"]) for r in supplemental if Path(r["path"]).is_relative_to(job)]
            for selection_path in selection_paths:
                selection = read(selection_path)
                if selection.get("passed") is not True:
                    excluded.append(dict(path=str(selection_path), reason="selector_not_passed")); continue
                purpose_receipt = bound(selection["purpose_CPU"])
                selector_receipt = bound(selection["selector_CPU"])
                assert purpose_receipt["passed"] is True and selector_receipt["passed"] is True
                assert selector_receipt["validator_exit_code"] == 0
                purpose = bound(purpose_receipt["validator_report"])
                selector = bound(selector_receipt["validator_report"])
                assert purpose["passed"] is True and selector["passed"] is True
                assert purpose.get("functional_chain", True) is True
                assert purpose["recording"] == selection["recording"] == selector["recording"]
                assert selector.get("purpose") == "semantic_clean_training"
                recording = Path(selection["recording"])
                assert recording.resolve().is_relative_to(BASE / "runtime/staging/robodojo_data_generation")
                manifest_path = recording / "episode_manifest.json"
                manifest_ref = ref(manifest_path); manifest = read(manifest_path)
                parts = recording.relative_to(BASE / "runtime/staging/robodojo_data_generation").parts
                phase = BASE / "runtime/jobs/robodojo_data_generation" / Path(*parts[:-2]) / "phases" / Path(*parts[-2:])
                full_receipt = read(phase / "full_CPU_result.json")
                full = bound(full_receipt["validator_report"])
                assert full["capture_v3"]["manifest_sha256"] == manifest_ref["sha256"]
                assert full["checks"]["full_videos"] is True
                assert manifest["task_name"] == task["task"] == selection["task"]
                assert manifest["scene_seed"] == selection["seed"]
                identity = (manifest["episode_id"], manifest_ref["sha256"])
                if identity in admitted: continue
                if identity in candidates:
                    assert candidates[identity]["selector"]["selection_report_sha256"] == selector_receipt["validator_report"]["sha256"]
                    continue
                videos = {}
                for camera in CAMERAS:
                    video = manifest["artifacts"]["videos"][camera]
                    assert full["full_video_decodes"][camera]["passed"] is True
                    assert ref(video["path"]) == {k:video[k] for k in ("path","sha256","byte_size")}
                    assert video["semantics"]["frame_count"] > 0
                    videos[camera] = dict(path=video["path"], manifest_sha256=video["sha256"],
                        manifest_byte_size=video["byte_size"], manifest_frame_count=video["semantics"]["frame_count"],
                        manifest_fps=video["semantics"]["fps"], verification=dict(byte_size_verified=True,
                        sha256_verified=True, full_decode_passed=True, decoded_frame_count=video["semantics"]["frame_count"]))
                assert len({x["manifest_frame_count"] for x in videos.values()}) == 1
                contract = bound(purpose["contract"])
                selector_ref = selector_receipt["validator_report"]
                candidate = dict(episode_id=manifest["episode_id"], task=task["task"],
                    attempt=full["attempt_id"], scene_seed=selection["seed"],
                    manifest_sha256=manifest_ref["sha256"],
                    final_count_key_sha256=hashlib.sha256((manifest["episode_id"]+":"+manifest_ref["sha256"]).encode()).hexdigest(),
                    selector=dict(selection_report_sha256=selector_ref["sha256"]),
                    review_status="pending_human_video_review", videos=videos,
                    instruction=manifest["instruction"],
                    qualification=dict(functional=True, clean=True, strongFidelity=selection["strong_fidelity"],
                        time=selection["timing_qualification"]),
                    contractId=contract.get("contract_id", contract.get("schema_version", purpose["contract"]["sha256"])),
                    sourceCommit=manifest.get("pipeline_source",{}).get("commit"),
                    checks={k:True for k in ("complete_three_camera_set","deduplicated_within_snapshot",
                        "manifest_hash_verified","not_present_in_curated_baseline","selector_exit_code_zero",
                        "clean_selector_passed","three_video_hashes_verified","three_videos_fully_decodable")})
                candidates[identity] = candidate
                receipts.append(dict(episode_id=manifest["episode_id"], manifest=manifest_ref,
                    selection=ref(selection_path), purpose_CPU=selection["purpose_CPU"],
                    selector_CPU=selection["selector_CPU"], full_independent_CPU=ref(phase/"full_CPU_result.json"),
                    original_capture_success=manifest["validation"]["success"],
                    original_strong_fidelity=selection["strong_fidelity"]))
    rows = sorted(candidates.values(), key=lambda x:(x["task"],x["scene_seed"],x["episode_id"]))
    assert len({x["episode_id"] for x in rows}) == len(rows), "conflicting episode identities"
    counts = {t:sum(x["task"]==t for x in rows) for t in TASKS}
    assert counts[TASKS[0]] == counts[TASKS[1]] == 100, counts
    output = DEST / snapshot_id
    subprocess.run(["/usr/bin/python3","/mnt/gyc/benchmark2027/scripts/storage/layout_guard.py",
                    "validate","audit_run",str(output)],check=True)
    output.mkdir(parents=True,exist_ok=False)
    inventory = dict(schema_version="benchmark2027.rolling_human_video_review_inventory.v1",
        snapshot_id=snapshot_id, generated_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        review_status="pending_human_video_review", admission_status="not_authorized_not_admitted",
        candidate_count=len(rows), video_count=3*len(rows), candidates=rows,
        rolling=dict(previous_snapshot_id=None,previous_candidate_count=0,new_since_previous_count=len(rows)))
    (output/"candidate_inventory.json").write_text(json.dumps(inventory,ensure_ascii=False,indent=2)+"\n")
    (output/"provenance.json").write_text(json.dumps(dict(pointer=pointer,source_workers=sources,
        receipts=receipts,excluded=excluded,counts=counts,scope="resident400 completed ID clean only; no OOD/REC/debug or admission",
        original_evidence_unchanged=True,decode_reused_from_hash_bound_independent_CPU=True),ensure_ascii=False,indent=2)+"\n")
    complete=dict(status="complete",snapshot_id=snapshot_id,candidate_count=len(rows),video_count=3*len(rows),
        candidate_inventory_sha256=ref(output/"candidate_inventory.json")["sha256"],counts=counts)
    (output/"COMPLETE.json").write_text(json.dumps(complete,indent=2)+"\n")
    print(json.dumps(dict(snapshot=str(output),**complete),ensure_ascii=False))
    return output

if __name__ == "__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--snapshot-id",required=True)
    freeze(parser.parse_args().snapshot_id)
