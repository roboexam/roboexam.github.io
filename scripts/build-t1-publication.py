#!/usr/bin/env python3
"""Prepare one immutable, verified Track 1 source packet. No inference or RPC.

The default inspects all inputs and original media without writing. --execute
creates the fixed new publication directory exclusively; partial failures remain
for inspection and must never be silently retried or overwritten.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil
import stat
import subprocess

VERSION = "t1-stack-bowls-20261018-v1"
DESTINATION = Path("/mnt/gyc_ckp/benchmark2027/experiments/evaluation/track1") / VERSION
GUARD = Path("/mnt/gyc/benchmark2027/scripts/storage/layout_guard.py")
MODELS = ("deepseek", "mimo", "kimi", "gpt6-astra")
LAYOUTS = (124, 136, 125, 138, 134)
LABELS = {"deepseek": "DeepSeek v4.1 Flash", "mimo": "MiMo v2.6 Pro", "kimi": "Kimi K3", "gpt6-astra": "GPT-6 Astra"}
SOURCE_HASHES = {
    "initial-rescore": "dbe0180c90a33e30fb8c6bf7318efbfee1c43cff927dc8c6fe7a9e026c65e294",
    "selection": "541e74f44ed0e5b08a2da0c032f44ca809803aa38c4f253441bfb5309dae4d87",
    "native-progress": "b5855bab397f610dc75fd60fb2c11241bce67246d0b0f108ff15d54152f221b8",
    "gpt-overview": "5c1c0a437e3acab92a200fc44b64590590548801ca1f5998c0de5583ff80e668",
    "initial-sources": "f16422c5a69667ec7b5b1e027d57c2511b4055b5fa1d7f3c59bd779fcee320ac",
}
QUESTION_FIELDS = {"count": "count", "color": "interior_color", "a2": "bowl_centers", "b1": "stack_relation", "c1": "complete_plan"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode()


def hash_file(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def regular(path):
    require(path.is_file() and not path.is_symlink(), f"Expected regular file: {path}")
    require(stat.S_ISREG(path.stat().st_mode), f"Not regular: {path}")


def scaled(value):
    if value is None:
        return None
    require(isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and 0 <= value <= 1, "Invalid source score")
    return value * 100


def mean_available(values):
    values = [x for x in values if x is not None]
    return sum(values) / len(values) if values else None


def score_fields(question_scores, summary):
    result = {field: scaled(question_scores["stack_bowls.revised." + suffix]) for field, suffix in QUESTION_FIELDS.items()}
    result["a1"] = mean_available([result["count"], result["color"]])
    result.update(a=scaled(summary["A"]), b=scaled(summary["B"]), c=scaled(summary["C"]), composite=scaled(summary["vqa_composite"]))
    return result


def unique_index(rows, key):
    result = {}
    for row in rows:
        identity = key(row)
        require(identity not in result, f"Duplicate identity: {identity}")
        result[identity] = row
    return result


def public_scan(value):
    if isinstance(value, dict):
        for child in value.values():
            public_scan(child)
    elif isinstance(value, list):
        for child in value:
            public_scan(child)
    elif isinstance(value, str):
        require(not value.startswith(("/bh/", "/mnt/", "/Users/", "http://", "https://", "sk-")), "Private path, endpoint or credential in public projection")


def load_sources(inputs):
    docs, raw = {}, {}
    for name, expected in SOURCE_HASHES.items():
        path = inputs / f"{name}.json"
        regular(path)
        data = path.read_bytes()
        require(digest(data) == expected, f"Source SHA mismatch: {name}")
        raw[name] = data
        docs[name] = json.loads(data)
    return docs, raw


def verified_episode(episode, seal):
    episode = Path(episode)
    require(str(episode).startswith("/bh/zbh_ckp/runs/agentbench/"), "Unexpected original episode root")
    manifest_path = episode / "EVIDENCE_MANIFEST.json"
    regular(manifest_path)
    manifest_bytes = manifest_path.read_bytes()
    require(digest(manifest_bytes) == seal, f"Original episode seal mismatch: {episode}")
    members = unique_index(json.loads(manifest_bytes)["files"], lambda x: x["path"])

    def member(relative, optional=False, decode=True):
        if relative not in members:
            require(optional, f"Unsealed/missing member {relative}: {episode}")
            return None, None
        path = episode / relative
        regular(path)
        record = members[relative]
        require(path.stat().st_size == record["bytes"], f"Original member size mismatch: {path}")
        require(hash_file(path) == record["sha256"], f"Original member SHA mismatch: {path}")
        return (json.loads(path.read_bytes()) if decode else path), record

    return episode, manifest_bytes, member


def assemble(docs, raw):
    report, selection, progress, overview, initials = [docs[n] for n in SOURCE_HASHES]
    expected = {(m, layout) for m in MODELS for layout in LAYOUTS}
    initial_idx = unique_index(initials["rows"], lambda x: (x["model_family"], x["layout_id"]))
    report_idx = unique_index(report["episodes"], lambda x: (x["model"], x["layout"]))
    progress_idx = unique_index(progress["rows"], lambda x: (x["model"], x["layout_id"]))
    historical = unique_index(selection["groups"], lambda x: (x["model_family"], x["layout_id"]))
    gpt = unique_index([x for x in overview["original_five_rows"] if x["layout_id"] != 136] + [overview["independent_recovery136"]], lambda x: ("gpt6-astra", x["layout_id"]))
    require(set(initial_idx) == set(report_idx) == set(progress_idx) == expected, "Expected exact 4x5 source slots")
    require(len(report["questions"]) == 100, "Expected 100 question rows")
    require(sum(x["coverage"]["normal"] for x in initial_idx.values()) == 97, "Expected 97 normal first answers")
    questions = unique_index(report["questions"], lambda x: (x["model"], x["layout"], x["question_id"]))
    episodes, execution_meta, media, seal_files = [], [], [], {}
    for model in MODELS:
        for layout in LAYOUTS:
            key = model, layout
            initial, scored, native = initial_idx[key], report_idx[key], progress_idx[key]
            require(scored["original_episode"] == initial["episode_argument"] and scored["original_seal_sha256"] == initial["episode_manifest_sha256"], "Initial source join mismatch")
            episode_id = f"{VERSION}-{model}-layout{layout}"
            if model == "gpt6-astra":
                selected = gpt[key]
                source_episode, seal = selected["episode"], selected["episode_manifest_sha256"]
                original = selected["execution_raw"]
                steps = selected["native_ack_count"]
                expected_video_sha = selected["video"]["sha256"]
            else:
                selected = historical[key]
                component = selected["execution_component"]
                source_episode, seal = component["episode"], component["episode_manifest_sha256"]
                original = selected["original_execution_outcome"]
                steps = original.get("native_ack_count", original.get("actual_native_ack_count"))
                expected_video_sha = selected["selected_video"]["sha256"]
            source_path, seal_bytes, member = verified_episode(source_episode, seal)
            outcome, outcome_record = member("execution_outcome.json", optional=True)
            summary, summary_record = member("sim/summary.json", optional=True)
            video_path, video_record = member("sim/sensors.mp4", decode=False)
            require(expected_video_sha is None or expected_video_sha == video_record["sha256"], "Selected video mismatch")
            require(isinstance(steps, int) and not isinstance(steps, bool) and steps >= 0, "Invalid control steps")
            if summary:
                require(summary["step_id"] == steps, "Control ACK summary mismatch")
            frames = summary.get("video_frames") if summary else None
            dt = summary.get("control_dt") if summary else None
            fps = 1 / dt if isinstance(dt, (int, float)) and dt > 0 else None
            elapsed = (outcome or {}).get("episode_resources", {}).get("elapsed_seconds")
            require(elapsed is None or (isinstance(elapsed, (int, float)) and not isinstance(elapsed, bool) and math.isfinite(elapsed) and elapsed >= 0), "Invalid elapsed wall time")
            observed = native["native_progress_score_percent"]
            require(observed is None or (math.isfinite(observed) and 0 <= observed <= 100), "Invalid native progress")
            observed_seal = native.get("episode_manifest_sha256", native.get("source", {}).get("episode_manifest_sha256"))
            require(observed_seal == seal, "Native progress/execution seal mismatch")
            reason = original.get("benchmark_policy_stop_reason") or original.get("failure_category") or original.get("benchmark_result_kind") or original.get("status") or "not_recorded"
            valid, success = original.get("benchmark_result_valid"), original.get("benchmark_success")
            require(valid in (True, False, None) and success in (True, False, None), "Invalid null outcome")
            state = "initial-incomplete" if model == "kimi" and layout == 124 else "budget-censored" if original.get("goal_native_budget_censored") or original.get("resource_censored") else "infrastructure-error" if valid is None else "completed" if success is True else "incomplete"
            execution = {"steps": steps, "progress": observed, "success": success, "state": state, "reason": reason, "elapsedSeconds": elapsed}
            video = {"id": episode_id, "url": f"/api/t1-media/{episode_id}", "sha256": video_record["sha256"], "bytes": video_record["bytes"], "frames": frames, "fps": fps, "hasMotion": steps > 0 and frames is not None and frames > 1}
            same_episode = initial["episode_argument"] == source_episode
            provenance = {"initialSealSha256": initial["episode_manifest_sha256"], "executionSealSha256": seal, "sameEpisode": same_episode, "attempt": "independent-attempt" if model == "gpt6-astra" and layout == 136 else "recorded-run"}
            qvalues = {"stack_bowls.revised." + suffix: questions[(model, layout, "stack_bowls.revised." + suffix)]["score"] for suffix in QUESTION_FIELDS.values()}
            episode = {"id": episode_id, "modelId": model, "layoutId": layout, "answered": initial["coverage"]["normal"], "expected": initial["coverage"]["expected"], "scores": score_fields(qvalues, scored["summary"]), "execution": execution, "video": video, "provenance": provenance}
            episodes.append(episode)
            execution_meta.append({"id": episode_id, "modelId": model, "layoutId": layout, "execution": execution, "video": video, "provenance": provenance, "original": {"episode": str(source_path), "manifestSha256": seal, "manifestPath": f"sources/seals/{episode_id}.json", "outcomeFile": outcome_record, "summaryFile": summary_record, "videoFile": video_record, "benchmarkResultValid": valid, "outcome": {k: (outcome or {}).get(k) for k in ("status", "benchmark_result_kind", "benchmark_policy_stop_reason", "benchmark_result_valid", "benchmark_success", "benchmark_score", "native_progress_score", "native_control_steps", "resource_censored", "goal_native_budget_censored")}, "simSummary": summary}})
            media.append({"source": video_path, "destination": f"media/{episode_id}.mp4", "bytes": video_record["bytes"], "sha256": video_record["sha256"]})
            seal_files[f"sources/seals/{episode_id}.json"] = seal_bytes
    require(sum(x["video"]["hasMotion"] for x in episodes) == 16, "Expected 16 moving/4 static records")
    summaries = unique_index(report["summaries"], lambda x: x["model"])
    models = []
    for model in MODELS:
        summary = summaries[model]
        qvalues = {x["question_id"]: x["mean_score"] for x in summary["per_question"]}
        identity = initial_idx[(model, 124)]["candidate_identity"]
        observed = [x["execution"]["progress"] for x in episodes if x["modelId"] == model and x["execution"]["progress"] is not None]
        response_models = identity.get("observed_response_models", [])
        models.append({"id": model, "label": LABELS[model], "family": model, "requestModel": identity["request_model"], "responseModel": response_models[0] if len(response_models) == 1 else None, "answered": summary["normal_first_answers"], "expected": summary["expected_answers"], "scores": score_fields(qvalues, summary), "maxProgress": max(observed) if observed else None})
    raw["execution-metadata"] = json_bytes({"schemaVersion": "roboexam.t1-execution-metadata.v1", "episodes": execution_meta})
    source_files = {name: {"path": f"sources/{name}.json", "sha256": digest(data), "bytes": len(data)} for name, data in raw.items()}
    manifest = {"schemaVersion": "roboexam.t1-publication.v1", "resultVersion": VERSION, "generatedAt": report["generated_utc"], "task": {"id": "stack_bowls", "label": "Stack Bowls", "layoutIds": list(LAYOUTS)}, "models": models, "episodes": episodes, "scorer": {"commit": report["scorer"]["commit"], "policy": "semantic-v1", "reportSha256": SOURCE_HASHES["initial-rescore"], "notes": ["Initial VQA uses the recorded first answers and their original frozen truth.", "C1 retains the deployed parameter-matching rule; zero is not a manual judgment of planning quality.", "Some initial answers and execution evidence come from separate recorded runs; their seals and source relation remain distinct.", "Observed native progress is separate from final task success; C2/C3 have not been measured."]}, "sourceHashes": {name: record["sha256"] for name, record in source_files.items()}, "sourceFiles": source_files, "evidenceFiles": [{"path": path, "sha256": digest(data), "bytes": len(data)} for path, data in seal_files.items()]}
    public_scan({k: manifest[k] for k in ("resultVersion", "generatedAt", "task", "models", "episodes", "scorer", "sourceHashes")})
    return manifest, raw, media, seal_files


def write_exclusive(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb") as stream:
        stream.write(data)
    require(digest(path.read_bytes()) == digest(data), f"Written metadata mismatch: {path}")


def publish(output, manifest, sources, media, seals):
    require(output == DESTINATION, "Only the fixed publication root is permitted")
    subprocess.run(["/usr/bin/python3", str(GUARD), "validate", "evaluation_run", str(output)], check=True)
    require(not output.exists(), "Publication root already exists; inspect it, never overwrite or blind-retry")
    output.mkdir(parents=True, exist_ok=False)
    write_exclusive(output / "BUILD_STARTED.json", json_bytes({"resultVersion": VERSION, "sources": manifest["sourceHashes"]}))
    for name, data in sources.items():
        write_exclusive(output / f"sources/{name}.json", data)
    for relative, data in seals.items():
        write_exclusive(output / relative, data)
    for row in media:
        target = output / row["destination"]
        target.parent.mkdir(parents=True, exist_ok=True)
        before = row["source"].stat()
        with row["source"].open("rb") as source, target.open("xb") as dest:
            shutil.copyfileobj(source, dest, 1024 * 1024)
        require(target.stat().st_size == row["bytes"] and hash_file(target) == row["sha256"], f"Copied video mismatch: {target}")
        after = row["source"].stat()
        require((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns), "Original video changed during copy")
    write_exclusive(output / "publication-manifest.json", json_bytes(manifest))
    completion = {"schemaVersion": "roboexam.t1-publication-complete.v1", "resultVersion": VERSION, "manifestSha256": hash_file(output / "publication-manifest.json"), "sourceFiles": len(sources), "sealedEpisodes": len(seals), "mediaFiles": len(media), "mediaBytes": sum(x["bytes"] for x in media), "mediaCopyHashesVerified": True, "originalsMutated": False, "modelApiCalls": 0, "simulatorCalls": 0}
    write_exclusive(output / "PUBLICATION_COMPLETE.json", json_bytes(completion))
    return completion


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inputs", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=DESTINATION)
    parser.add_argument("--execute", action="store_true", help="Create the fixed new publication root; default is read-only inspect")
    args = parser.parse_args()
    docs, raw = load_sources(args.inputs)
    manifest, sources, media, seals = assemble(docs, raw)
    if args.execute:
        result = publish(args.output, manifest, sources, media, seals)
    else:
        result = {"mode": "read-only-inspect", "resultVersion": VERSION, "groups": len(manifest["episodes"]), "models": len(manifest["models"]), "movingRecords": sum(x["video"]["hasMotion"] for x in manifest["episodes"]), "expectedQuestions": sum(x["expected"] for x in manifest["episodes"]), "normalFirstAnswers": sum(x["answered"] for x in manifest["episodes"]), "mediaBytes": sum(x["bytes"] for x in media), "manifestSha256": digest(json_bytes(manifest)), "sourceHashes": manifest["sourceHashes"], "output": str(args.output), "writes": 0}
    print(json.dumps(result, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    main()
