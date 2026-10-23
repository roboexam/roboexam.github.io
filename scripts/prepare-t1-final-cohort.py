"""Prepare private, exact-attempt web publication inputs from sealed audit data.

This is a projection of saved answers and grades, never an evaluator. No model,
network, simulation or controller is started. Published native video bytes are
verified before and after immutable hardlink/copy publication.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil


VERSION = "t1-robodojo14-gpt-deepseek-20261023-v3"
MODELS = {"gpt": "gpt-6-1-sol", "deepseek": "deepseek"}


def read(path):
    return json.loads(Path(path).read_text())


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def fingerprint(value):
    return hashlib.sha256((json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     separators=(",", ":"), allow_nan=False) + "\n").encode()).hexdigest()


def write_new(path, value):
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write("\n")
    path.chmod(0o600)


def verify_seal(root):
    manifest = read(root / "EVIDENCE_MANIFEST.json")
    for row in manifest["files"]:
        path = root / row["path"]
        assert path.resolve().is_relative_to(root.resolve())
        assert path.stat().st_size == row["bytes"] and sha(path) == row["sha256"], path


def prepare(audit, publication, inventory, dry_run=False):
    report = audit / "cohort-v3-zero-unscorable"
    verify_seal(report)
    summary = read(report / "summary.json")
    assert summary["missing_score_policy"] == "zero-unscorable"
    assert all(x["overall"]["status"] == "complete" for x in summary["candidates"].values())
    selection_path = audit / "source-selection/selection.json"
    frozen_path = audit / "initial-inputs-frozen.json"
    map_path = audit / "process-map.final.json"
    assert sha(selection_path) == summary["selection_sha256"]
    assert sha(frozen_path) == summary["initial_inputs_sha256"]
    assert sha(map_path) == summary["process_map_sha256"]
    media = read(inventory)
    assert media["selectionSha256"] == summary["selection_sha256"]
    selected, frozen, mapping = read(selection_path), read(frozen_path), read(map_path)
    initial = read(report / "initial-questions.json")["rows"]
    slots = read(report / "process-slots.json")["rows"]
    process_questions = read(report / "process-questions.json")["rows"]
    native_cases = read(report / "native-cases.json")["rows"]
    assert (len(initial), len(slots), len(process_questions), len(native_cases)) == (780, 414, 82, 140)
    hashes = {name: sha(path) for name, path in {
        "cohortSummary": report / "summary.json", "initialQuestions": report / "initial-questions.json",
        "processSlots": report / "process-slots.json", "processQuestions": report / "process-questions.json",
        "nativeCases": report / "native-cases.json", "selection": selection_path,
        "initialInputs": frozen_path, "processMap": map_path,
        "zeroPolicy": report / "zero-policy-assignments.json",
    }.items()}
    frozen_items = {(candidate, row["attempt"], row["item"]["question_id"]): row
                    for candidate, rows in frozen["models"].items() for row in rows}
    videos = {(row["modelId"], row["caseId"]): row for row in media["episodes"]}
    sources = {}
    for candidate, config in mapping["candidates"].items():
        for spec in config["sources"]:
            scores = Path(spec["scores"])
            assert sha(scores / "EVIDENCE_MANIFEST.json") == spec["score_manifest_sha256"]
            verify_seal(scores)
            provenance = read(scores / "provenance.json")
            bundle = Path(provenance["bundle"])
            sources[candidate, spec["id"]] = {
                "bundle": bundle, "campaign": Path(provenance["campaign"]),
                "questions": {q["question_id"]: q for q in read(bundle / "bundle.json")["questions"]},
                "answers": {q["question_id"]: q for q in read(scores / "answers-scored.json")["records"]},
                "verified": {q["question_id"]: q for q in read(scores / "verified-records.json")["records"]},
            }
    source_root, media_root = publication / "source", publication / "media"
    episodes, details, initial_receipts, process_receipts, published = [], [], [], {}, []
    for case in selected["cases"]:
        task, layout = case["task_name"], case["layout_id"]
        for candidate, model_id in MODELS.items():
            src = case[candidate]
            attempt = Path(src["attempt_path"])
            assert sha(attempt / "result.json") == src["result_sha256"]
            result = read(attempt / "result.json")
            m = videos[candidate, case["case_id"]]
            assert m["attemptPath"] == str(attempt) and m["sourceRun"] == src["source_run"]
            assert result["status"] in {"success", "failure"} and m["frames"] == m["steps"] + 1
            identity = f"{VERSION}-{model_id}-{task}-layout{layout}"
            video = {"id": identity, "url": "/api/t1-benchmark-media/" + identity,
                     **{key: m[key] for key in ("sha256", "bytes", "frames", "fps")}}
            source_video = Path(m["sourcePath"])
            assert source_video == attempt / "sim/sensors.mp4"
            assert source_video.stat().st_size == video["bytes"] and sha(source_video) == video["sha256"]
            target = media_root / (identity + ".mp4")
            episode = {"id": identity, "modelId": model_id, "taskId": task, "layoutId": layout,
                       "attempt": attempt.name, "relativeAttempt": src["attempt_relative"],
                       "sourceRun": src["source_run"], "resultSha256": src["result_sha256"],
                       "nativeEpisodeId": result["episode_id"], "status": result["status"],
                       "steps": m["steps"], "progressScore": result.get("progress_score"),
                       "elapsedSeconds": result.get("elapsed_seconds"), "video": video}
            episodes.append(episode)
            published.append({**episode, "sourcePath": str(source_video), "publishedPath": str(target)})
            questions, answer_receipts = [], []
            by_id = {row["relative_path"]: row["sha256"] for row in src["answer_files"]}
            answer_files = {}
            for name, digest in by_id.items():
                path = attempt / name
                assert sha(path) == digest
                answer_files[read(path)["question_id"]] = (path, digest)
            for grade in initial:
                if (grade["candidate"], grade["task_name"], grade["layout_id"]) != (candidate, task, layout):
                    continue
                assert grade["attempt_path"] == str(attempt)
                qid = grade["question_id"]
                item = frozen_items[candidate, str(attempt), qid]
                assert fingerprint(item["public"]) == grade["public_input_sha256"]
                public, answer = item["public"], item["answer"]
                assert read(answer_files[qid][0]) == answer
                question = {"questionId": qid, "metricId": "b_interaction" if grade["group"] == "B_interaction_semantics" else grade["group"].lower(),
                            "question": public["question_en"], "response": answer.get("answer_text"),
                            "score": grade["score"], "status": grade["status"],
                            "formatCompliant": grade["format_compliant"]}
                if grade.get("score_origin") == "policy_zero":
                    question.update(scoreOrigin="policy_zero", observedScore=None)
                    assert question["response"] is None and question["score"] == 0
                questions.append(question)
                answer_receipts.append({"questionId": qid, "instanceId": answer["instance_id"],
                                        "publicInputSha256": grade["public_input_sha256"],
                                        "answerSha256": answer_files[qid][1]})
            initial_receipts.append({"episodeId": identity, "manifestSha256": src["grading_manifest_sha256"],
                                     "questionsSha256": sha(attempt / "public/questions.json"),
                                     "predictionsSha256": sha(attempt / "initial/predictions.json"), "answers": answer_receipts})
            checkpoints = []
            for slot in slots:
                if (slot["candidate"], slot["task_name"], slot["layout_id"]) != (candidate, task, layout):
                    continue
                assert slot["attempt"] == src["attempt_relative"]
                qid = slot.get("question_id")
                point = {"slotId": slot["slot_id"], "stageId": slot["stage_id"], "status": slot["status"],
                         "questionId": qid, "question": None, "response": None,
                         "triggerStep": None, "returnStep": None,
                         "scores": {"c2": slot["C2_score"], "c3": slot["C3_score"]}}
                if qid is not None:
                    saved = sources[candidate, slot["source_id"]]
                    q = saved["questions"][qid]
                    cp = q["checkpoint"]
                    assert q["episode"] == src["attempt_relative"] and cp["episode_id"] == result["episode_id"]
                    events = dict(zip(cp["event_stage_ids"], cp["native_event_steps"]))
                    point.update(triggerStep=events[slot["stage_id"]], returnStep=cp["cutoff_native_step"])
                    if slot["status"] == "scored":
                        scored = saved["answers"][qid]
                        public_file = saved["bundle"] / q["public_question_path"]
                        public = read(public_file)
                        first_file = saved["campaign"] / "questions" / qid / "first_response.json"
                        verified = saved["verified"][qid]
                        assert fingerprint(verified) == scored["answer_record_sha256"]
                        assert {k: v for k, v in verified.items() if k != "response_evidence_sha256"} == read(first_file)
                        assert verified["answer_text"] == scored["answer_text"]
                        assert verified["response_evidence_sha256"] == scored["response_evidence_sha256"]
                        assert sha(first_file.parent / "EVIDENCE_MANIFEST.json") == verified["response_evidence_sha256"]
                        assert scored["C2_score"] == slot["C2_score"] and scored["C3_score"] == slot["C3_score"]
                        point.update(question=public["question_en"], response=scored["answer_text"])
                        process_receipts[qid] = {"questionId": qid, "publicQuestionSha256": sha(public_file),
                                                 "firstResponseSha256": scored["answer_record_sha256"],
                                                 "responseEvidenceSha256": scored["response_evidence_sha256"],
                                                 "requestSha256": scored["request_sha256"]}
                    elif slot.get("score_origin") == "policy_zero":
                        point.update(scoreOrigin="policy_zero", observedScores={"c2": None, "c3": None})
                        assert slot["reasons"] == ["failed_terminal_checkpoint_has_no_legal_continuation"]
                    else:
                        raise ValueError("unapproved unresolved checkpoint")
                checkpoints.append(point)
            details.append({"episodeId": identity, "resultVersion": VERSION, "modelId": model_id,
                            "taskId": task, "layoutId": layout, "attempt": attempt.name,
                            "initial": questions, "checkpoints": checkpoints})
    assert len(episodes) == len(details) == 140 and len(process_receipts) == 82
    cohort = {"schema": "roboexam.t1-benchmark-cohort-source.v2", "resultVersion": VERSION,
              "generatedAt": "2026-10-23T00:00:00Z", "sourceHashes": hashes, "summary": summary,
              "selection": selected, "initial": initial, "slots": slots,
              "processQuestions": process_questions, "nativeCases": native_cases, "episodes": episodes}
    vqa = {"schema": "roboexam.t1-benchmark-vqa-source.v2", "resultVersion": VERSION,
           "sourceHashes": hashes, "evidence": {"initial": initial_receipts, "process": list(process_receipts.values())},
           "episodes": details}
    if dry_run:
        return {"dryRun": True, "episodes": len(episodes), "initial": len(initial),
                "processSlots": len(slots), "processFirstAnswers": len(process_receipts)}
    publication.mkdir(parents=True, exist_ok=True, mode=0o700)
    source_root.mkdir(mode=0o700, exist_ok=False)
    media_root.mkdir(mode=0o700, exist_ok=False)
    for row in published:
        source_video, target, video = Path(row["sourcePath"]), Path(row["publishedPath"]), row["video"]
        try:
            os.link(source_video, target)
        except OSError:
            shutil.copyfile(source_video, target)
            target.chmod(0o600)
        assert target.stat().st_size == video["bytes"] and sha(target) == video["sha256"]
    write_new(source_root / "cohort.json", cohort)
    write_new(source_root / "vqa-details.json", vqa)
    write_new(source_root / "media-manifest.json", {"schema": "roboexam.t1-benchmark-media-publication.v2",
              "resultVersion": VERSION, "selectionSha256": hashes["selection"],
              "inventorySha256": sha(inventory), "episodes": published})
    write_new(publication / "PREPARATION_RECEIPT.json", {"resultVersion": VERSION, "modelCalls": 0,
              "physicalSteps": 0, "files": {p.name: sha(p) for p in source_root.iterdir()},
              "episodes": len(episodes), "nativeVideos": len(published), "processFirstAnswers": len(process_receipts),
              "sourceAudit": str(audit), "mediaBytes": sum(x["video"]["bytes"] for x in episodes)})
    return {p.name: sha(p) for p in source_root.iterdir()}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audit-root", required=True, type=Path)
    parser.add_argument("--publication-root", required=True, type=Path)
    parser.add_argument("--media-inventory", required=True, type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    print(json.dumps(prepare(args.audit_root.resolve(), args.publication_root.resolve(), args.media_inventory.resolve(), args.dry_run)))
