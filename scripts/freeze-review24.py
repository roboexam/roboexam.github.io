#!/usr/bin/env python3
"""Publish an immutable, evidence-bound review inventory; never run simulation/admit data."""
import argparse, collections, datetime, functools, hashlib, json, os, re, shutil, subprocess, tempfile
from pathlib import Path

BASE = Path("/mnt/gyc_ckp/benchmark2027")
GOAL = BASE / "experiments/audits/nine_pipeline_goal_20261016"
DEST = BASE / "experiments/audits/dashboard_pipeline_review_20261017"
STAGING = BASE / "runtime/staging/robodojo_data_generation"
MEDIA_CACHE = BASE / "runtime/caches/dashboard_review_media/v1"
CAMERAS = ("cam_head", "cam_left_wrist", "cam_right_wrist")
TASKS = ("arrange_largest_number", "cover_blocks", "play_stacking_toy", "pour_by_language",
         "store_tools_in_toolbox", "press_by_number", "pack_objects_into_box", "fold_clothes",
         "hang_mugs", "match_and_pick_from_conveyor", "imitate_sorting_sequence",
         "classify_objects_by_language", "solve_equation", "stack_bowls", "push_T",
         "insert_key", "build_tower", "find_category_outlier", "place_between_references",
         "mirror_pair_layout", "hold_water_mug", "set_button_colors",
         "hold_button_until_cue", "clear_keyboard_then_close_laptop")
FOLLOW = {"validator_report", "independent_CPU", "full_CPU", "full_independent_CPU", "CPU",
          "Q_CPU", "R_CPU", "purpose_CPU", "selector_CPU", "report", "original_components",
          "independent_reuse_CPU", "results", "certificate", "independent_CPU_result"}
SOURCES, EXCLUDED = [], []

def sha(p):
    h = hashlib.sha256()
    with Path(p).open("rb") as f:
        for b in iter(lambda: f.read(1024*1024), b""): h.update(b)
    return h.hexdigest()

def ref(p):
    p = Path(p)
    return dict(path=str(p), sha256=sha(p), byte_size=p.stat().st_size)

@functools.lru_cache(maxsize=8)
def read(p):
    return json.loads(Path(p).read_text())

def bound(r):
    if isinstance(r, str): return read(r)
    assert isinstance(r, dict) and "path" in r, "missing evidence reference"
    p = Path(r["path"])
    if r.get("sha256"): assert sha(p) == r["sha256"], "evidence hash changed: " + str(p)
    if r.get("byte_size") is not None: assert p.stat().st_size == r["byte_size"]
    return read(str(p))

def json_refs(x):
    if isinstance(x, dict):
        if isinstance(x.get("path"), str) and x["path"].endswith(".json"):
            yield x
        else:
            for v in x.values(): yield from json_refs(v)
    elif isinstance(x, list):
        for v in x: yield from json_refs(v)

def docs_graph(references):
    docs, seen = [], set()
    queue = [(r, 0) for r in references]
    while queue:
        r, depth = queue.pop(0)
        if isinstance(r, str): r = ref(r)
        if not isinstance(r, dict) or not r.get("path") or r["path"] in seen: continue
        seen.add(r["path"])
        d = bound(r); docs.append((r, d))
        if depth >= 5 or not isinstance(d, dict): continue
        for k in FOLLOW:
            if k in d:
                for rr in json_refs(d[k]):
                    queue.append((rr, depth+1))
    return docs

def root_pass(d):
    return isinstance(d, dict) and (d.get("passed") is True or
        d.get("four_level_technical_passed") is True or d.get("success") is True)

def manifest_refs(d):
    for r in json_refs(d):
        if Path(r["path"]).name == "episode_manifest.json": yield r
    if isinstance(d, dict):
        for k in ["recording", "recording_dir"]:
            if isinstance(d.get(k), str) and Path(d[k]).is_dir():
                yield {"path": str(Path(d[k])/"episode_manifest.json")}
        for k, v in d.items():
            if k not in ["artifacts"] and isinstance(v, (dict, list)):
                yield from manifest_refs(v)
    elif isinstance(d, list):
        for v in d: yield from manifest_refs(v)

def add_spec(specs, acceptance, task=None, manifest=None, group="batch", batch=None,
             clean=True, family="ID", program=None, extra=None):
    if not isinstance(acceptance, (dict, str)): raise ValueError("no acceptance ref")
    r = ref(acceptance) if isinstance(acceptance, str) else acceptance
    d = bound(r); assert root_pass(d), "acceptance did not pass: " + r["path"]
    specs.append(dict(acceptance=r, task=task or d.get("task", d.get("task_name")),
                      manifest=manifest, group=group, batch=batch or Path(r["path"]).parent.name,
                      clean=clean, family=family, program=program, extra=extra or {}))

def discover():
    specs = []
    pointer = read(str(GOAL/"CURRENT_LONG_GOAL_EXECUTION_POINTER.v1.json"))
    SOURCES.append(ref(GOAL/"CURRENT_LONG_GOAL_EXECUTION_POINTER.v1.json"))
    milestones = [
        ("b01_resident100_full_clean_milestone.v2.json", "accepted_recordings", "primary"),
        ("b03_resident100_full_clean_milestone.v1.json", "accepted_recordings", "primary"),
        ("b04_resident100_full_clean_milestone.v1.json", "accepted_recordings", "primary"),
        ("B09_resident_clean100_actual_complete_20261018.v1.json", "rows", "backup"),
        ("B09_fast_round2_clean100_COMPLETE_actual_independent_CPU_selector_and_cost_20261018.v1.json", "rows", "primary"),
        ("B11_resident_clean100_actual_complete_20261018.v1.json", "rows", "primary")]
    for name, key, role in milestones:
        p = GOAL/name; m = read(str(p)); SOURCES.append(ref(p))
        assert m.get("passed", True) is True
        for row in m[key]:
            rr = next((row[k] for k in ["selected_state", "selection_state", "selector", "selection"] if k in row), None)
            add_spec(specs, rr, task=m.get("task"), group=role, batch=name,
                     manifest=(str(Path(row["recording"])/"episode_manifest.json") if row.get("recording") else None))
    # The previously named DRAFT prefix is usable only with the adopted, completed100 evidence.
    complete = GOAL/"B08_original_clean100_C7_resume90_COMPLETE_actual_CPU_selector_and_cost_20261018.v1.json"
    m = read(str(complete)); assert m["accepted"] == 100; SOURCES.append(ref(complete))
    cfg = bound(ref(GOAL/"b08_resident_clean100_C7_resume90_v10_xiao2_r7_20261018.config.json"))
    for k in ["resume_gate", "completed_C7_same_controller_prefix_contract"]:
        if k in cfg:
            refs = [cfg[k]] if isinstance(cfg[k], dict) and "path" in cfg[k] else list(json_refs(cfg[k]))
            for rr in refs:
                d = bound(rr); SOURCES.append(rr)
                assert d.get("passed", True) is not False, k
    pref = GOAL/"B08_C7_actual_complete90_prefix87accepted3failed_DRAFT_FOR_CPU_20261018.v1.json"
    SOURCES.append(ref(pref))
    for row in read(str(pref))["records"]:
        if row["status"] == "accepted":
            add_spec(specs, row["accepted_state"], task="hold_water_mug", group="primary", batch=complete.name)
    for row in m["new_closed_selections"]:
        add_spec(specs, row["selection"], task="hold_water_mug", group="primary", batch=complete.name)
    b = pointer["B06_current_authoritative"]["batch_registry"]
    SOURCES.append(b)
    for row in bound(b)["records"]:
        add_spec(specs, row["selector_CPU"], task="clear_keyboard_then_close_laptop",
                 group="primary", batch=Path(b["path"]).name)
    # Configs freeze the exact worker identity. Never read arbitrary latest directories.
    for filename, task in [
        ("cover_V2_loaded_roles_resident_wjx0_r5_20261018.config.v5.json", "cover_blocks"),
        ("play_V2_program_witness_C13_resident_wjx1_r7_side_20261019.config.v1.json", "play_stacking_toy"),
        ("pour_V2_postcompletion_resident_wjx2_r6_side_20261019.config.v1.json", "pour_by_language")]:
        p = GOAL/filename; cfg = read(str(p)); SOURCES.append(ref(p))
        for rr in sorted((Path(cfg["job_root"])/"selections").glob("*.json")):
            s = read(str(rr))
            if s.get("passed") is True: add_spec(specs, str(rr), task, group="primary", program=s.get("program"))
            else: EXCLUDED.append(dict(path=str(rr), reason="original_selector_rejected"))
        if cfg.get("accepted_prefix"):
            pref = bound(cfg["accepted_prefix"]); SOURCES.append(cfg["accepted_prefix"])
            def prefixes(x):
                if isinstance(x, dict):
                    for k, v in x.items():
                        if k in ["selector", "selection", "selected_state"] and isinstance(v, dict) and v.get("path"):
                            add_spec(specs, v, task, group="primary", batch=filename, program=x.get("program"))
                        elif k not in ["Q_CPU", "qualification_manifest", "layout"] and isinstance(v, (dict, list)): prefixes(v)
                elif isinstance(x, list):
                    for v in x: prefixes(v)
            prefixes(pref)
    p = GOAL/"COVER_GBR13405000_complete_preserved_nextBRG13405001_20261018.v1.json"
    d=read(str(p)); SOURCES.append(ref(p)); add_spec(specs,d["selected"],"cover_blocks",group="primary",program="GBR")
    # Development identity is a label, never an automatic rejection or quota offset.
    registry = bound(pointer["development_asset_registry"]); SOURCES.append(pointer["development_asset_registry"])
    for row in registry["extra_qualified_assets"]:
        rr = row.get("selector_evidence", row.get("selector", row.get("selector_report")))
        if isinstance(rr, list): rr = rr[0]
        manifest = row.get("original_R_manifest", row.get("recording_manifest"))
        if not manifest:
            aliases = row.get("recording_aliases", [])
            if aliases: manifest = aliases[0].get("manifest")
        if not manifest and row.get("recording"): manifest = str(Path(row["recording"])/"episode_manifest.json")
        if row["task"]=="pour_by_language": manifest=None
        add_spec(specs, rr, row["task"], manifest=manifest, group="development",
                 batch="development-reuse", extra={"assetId": row.get("asset_id"),
                 "independentHoldout": False, "quotaOffset": False, "expectedSeed": row.get("scene_seed")})
    for row in registry.get("Press_required_new_complete_pairs_20261018", {}).get("assets", []):
        add_spec(specs,row["selector"],"press_by_number",manifest=row["R"],group="development",batch="press-resident-development")
    p = BASE/"experiments/audits/hang_specialist_20261018_v1/SMOKE5_COMPLETE_Q_R_DEVELOPMENT_CLEAN_SELECTOR.v2.json"
    d=read(str(p)); add_spec(specs,str(p),"hang_mugs",manifest=d["R"],group="development",batch="hang-smoke5-reuse")
    # Store's adopted prefix excludes visual defects and keeps explicit alias provenance.
    p=GOAL/"store_specialist_20261018_v1/STORE_ID19_CLEAN100_FINITE_CPU_CONTINUATION_FROZEN_PLAN.v32_r2.json"
    plan=read(str(p)); SOURCES.append(ref(p))
    for rr in plan["quota_collection"]["retained_selections"]:
        add_spec(specs,rr,"store_tools_in_toolbox",group="primary",batch="store-ID19-adopted-prefix")
    out=STAGING/"store_tools_in_toolbox/specialist_finite_CPU_clean100_v32_resume_20261019/outputs/store_finite_CPU_v32_C31_continue_clean100_xiao2_r2_20261019"
    for rr in sorted((out/"selections").glob("*.json")):
        if read(str(rr)).get("passed") is True: add_spec(specs,str(rr),"store_tools_in_toolbox",group="primary",batch=out.name)
    # Engineering-complete pilots are reviewable, explicitly NOT clean-selector passes.
    jobs=BASE/"runtime/jobs/robodojo_data_generation"
    for task, cohort in [("classify_objects_by_language","classify_sop_qual_v8_20261016"),
                         ("solve_equation","sop_qualification_20261017_r2"),
                         ("imitate_sorting_sequence","imitate_sop_qual_v1_20261017")]:
        root=jobs/task/cohort
        for seed in sorted((root/"replay").glob("seed_*")):
            check=seed/"recording_check.json"
            if not check.exists(): check=seed/"closed_recording_check.json"
            result=read(str(seed/"result.json"))
            if check.exists(): rr=ref(check)
            else:
                raw=result.get("closed_recording_check")
                if isinstance(raw,dict) and raw.get("path"): rr=raw
                else:
                    # The result holds the complete independent closed-recording report.
                    rr=ref(seed/"result.json")
            man=STAGING/task/cohort/"replay"/seed.name/"attempt_0/episode_manifest.json"
            add_spec(specs,rr,task,manifest=str(man),clean=None,group="validation",batch=cohort)
    for cohort in ["arrange_v3_tempo_20261015","arrange_v3_smoke_20261015"]:
        root=jobs/"arrange_largest_number"/cohort
        pp=root/("recording_verification.json" if "tempo" in cohort else "recording_verification_codex.json")
        doc=read(str(pp)); assert doc["passed"]
        for row in doc["reports"]:
            add_spec(specs,str(pp),"arrange_largest_number",manifest=str(Path(row["recording"])/"episode_manifest.json"),
                     clean=None,group="validation",batch=cohort)
    for task in ["stack_bowls","push_T","insert_key","build_tower"]:
        root=STAGING/task/"id5_sop_20261018"
        for seed in sorted(root.glob("seed_*")):
            man=seed/"replay/episode_manifest.json"
            qc=seed/"replay/sop_machine_qc.json"
            if qc.exists() and read(str(qc)).get("four_level_technical_passed") is True:
                add_spec(specs,str(qc),task,manifest=str(man),clean=None,group="validation",batch="id5_sop_20261018")
        for cohort in ["ood5_sop_20261018","failure_recovery5_sop_20261018"]:
            pp=STAGING/task/cohort/"BACKUP_INDEX.json"
            if not pp.exists(): continue
            backup=read(str(pp)); SOURCES.append(ref(pp))
            for row in backup["members"]:
                rp=Path(row["phases"]["replay"]["source"])
                qc=rp/"sop_machine_qc.json"
                if qc.exists() and read(str(qc)).get("four_level_technical_passed") is True:
                    fam="REC" if cohort.startswith("failure") else ("Visual OOD" if row.get("family")=="visual" else "Semantic OOD")
                    add_spec(specs,str(qc),task,manifest=str(rp/"episode_manifest.json"),clean=None,
                             group="validation",family=fam,batch=cohort,program=row.get("condition"))
    return specs

def find_manifest(spec, docs):
    if spec["manifest"]:
        r=spec["manifest"]; r=ref(r) if isinstance(r,str) else r
        bound(r); return r
    paths=[]
    for _,d in docs:
        for r in manifest_refs(d):
            p=r["path"]
            if "/qualification" not in p and Path(p).exists() and p not in paths:
                if spec.get("extra",{}).get("expectedSeed") is not None and read(p).get("scene_seed")!=spec["extra"]["expectedSeed"]: continue
                paths.append(p)
    assert len(paths)==1, "ambiguous/missing replay manifest: "+str(paths[:5])
    return ref(paths[0])

def evidence_binds_manifest(docs, mr):
    def walk(x):
        if isinstance(x, dict):
            if x.get("manifest_sha256")==mr["sha256"]: return True
            if x.get("path")==mr["path"] and x.get("sha256")==mr["sha256"]: return True
            if x.get("recording")==str(Path(mr["path"]).parent): return True
            return any(walk(v) for v in x.values() if isinstance(v,(dict,list)))
        return any(walk(v) for v in x) if isinstance(x,list) else False
    return any(walk(d) for _,d in docs)

def bool_or_none(v):
    if isinstance(v,bool): return v
    if isinstance(v,dict):
        for k in ["passed","fidelity_passed"]:
            if isinstance(v.get(k),bool):return v[k]
    return None

def find_value(docs, names):
    for _,d in docs:
        if isinstance(d,dict):
            for k in names:
                if k in d:return d[k]
    return None

def decode_proof(docs, manifest_sha):
    def walk(x):
        if isinstance(x,dict):
            # A full-decode map must be in the same report subtree as a bound manifest.
            cap=x.get("capture_v3",{})
            bound_hash=(cap.get("manifest_sha256") if isinstance(cap,dict) else None) or x.get("manifest_sha256")
            if bound_hash==manifest_sha:
                flags=x.get("checks",{})
                probes=cap.get("checks",{}).get("video_probes",{}) if isinstance(cap,dict) else {}
                if any(flags.get(k) is True for k in ["three_full_video_decodes","three_full_decodes","full_videos"]) and all(c in probes for c in CAMERAS):
                    return True
                for k in ["full_video_decodes","full_video_decode"]:
                    m=x.get(k,{})
                    if all(isinstance(m.get(c),dict) and m[c].get("passed") is True for c in CAMERAS):return True
            return any(walk(v) for v in x.values() if isinstance(v,(dict,list)))
        if isinstance(x,list):return any(walk(v) for v in x)
        return False
    return any(walk(d) for _,d in docs)

def media_ref(video, freeze, receipts, decode_needed):
    p=Path(video["path"]).resolve()
    assert p.is_relative_to(STAGING) or p.is_relative_to(Path("/bh/zbh_ckp/runs")), "unapproved source root"
    n=video["byte_size"]; assert p.is_file() and p.stat().st_size==n
    sem=video["semantics"]; frames=sem["frame_count"]; fps=sem["fps"]
    assert isinstance(frames,int) and frames>0 and fps>0
    dest=p
    if not p.is_relative_to(STAGING):
        dest=MEDIA_CACHE/(video["sha256"]+".mp4")
        if freeze:
            MEDIA_CACHE.mkdir(parents=True,exist_ok=True)
            if not dest.exists():
                tmp=dest.with_suffix(".mp4.partial-"+str(os.getpid()))
                with p.open("rb") as src, tmp.open("xb") as out:
                    h=hashlib.sha256()
                    for b in iter(lambda:src.read(1024*1024),b""):h.update(b);out.write(b)
                assert h.hexdigest()==video["sha256"]
                os.replace(tmp,dest)
            assert dest.stat().st_size==n and sha(dest)==video["sha256"]
    if freeze and decode_needed:
        # Only missing hash-bound decode receipts require new CPU decoding. No simulation.
        proc=subprocess.run(["ffmpeg","-v","error","-threads","1","-i",str(dest),"-map","0:v:0","-progress","pipe:1","-nostats","-f","null","-"],
                            stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=600)
        assert proc.returncode==0, "publication decode failed: "+str(p)
        decoded=[int(x.split("=",1)[1]) for x in proc.stdout.decode().splitlines() if x.startswith("frame=")]
        assert decoded and decoded[-1]==frames, "full decode frame count mismatch"
        receipts.append(dict(source=ref(dest),full_decode_passed=True,
                             decoded_frame_count=decoded[-1],scope="publication media integrity only; not task/purpose qualification"))
    return dict(path=str(dest),source_path=str(p),manifest_sha256=video["sha256"],
                manifest_byte_size=n,manifest_frame_count=frames,manifest_fps=fps,original_manifest_path=video.get("original_manifest_path",str(p)),
                media_root_id="staging" if p.is_relative_to(STAGING) else "review-cache",
                verification=dict(byte_size_verified=True,sha256_verified=False,
                                  full_decode_passed=not decode_needed or freeze,
                                  decoded_frame_count=frames))

def specs_from_plan(plan_path):
    plan_ref=ref(plan_path); plan=bound(plan_ref)
    assert plan["status"]=="publication_plan_not_accepted" and not plan["issues"]
    SOURCES.extend(plan["sources"]); SOURCES.append(plan_ref)
    specs=[]
    for candidate in plan["candidates"]:
        members=candidate["memberships"]
        if candidate["task"]=="set_button_colors" and all(m["role"]=="backup" for m in members):
            EXCLUDED.append(dict(task=candidate["task"],manifest=candidate["source_manifest"],
                reason="user_excluded_B09_old_backup_from_Review_20261019_original_preserved"))
            continue
        for member in members:
            add_spec(specs,candidate["evidence"][0],candidate["task"],
                manifest=candidate["source_manifest"],group=member["role"],batch=member["batch"],
                clean=candidate["qualification"]["clean"],family=member["family"],
                program=member.get("program"),extra=candidate.get("extra",{}))
    return specs

def freeze(snapshot_id, plan_only=False, from_plan=None):
    assert re.fullmatch(r"snapshot_[a-zA-Z0-9_-]+",snapshot_id)
    specs=specs_from_plan(from_plan) if from_plan else discover()
    rows={}; receipts=[]; issues=[]; decode_candidates=0
    previous=read(str(DEST/"snapshot_resident400_20261017_review_v1/candidate_inventory.json"))
    old_ids={(x["task"],x["manifest_sha256"]):x["episode_id"] for x in previous["candidates"]}
    for i,spec in enumerate(specs):
        try:
            docs=docs_graph([spec["acceptance"]])
            mr=find_manifest(spec,docs); m=bound(mr)
            task=m["task_name"]; assert task in TASKS
            if spec["task"]:assert task==spec["task"]
            seed=m["scene_seed"]; assert isinstance(seed,int)
            ident=(task,mr["sha256"])
            membership=dict(batch=spec["batch"],role=spec["group"],family=spec["family"],program=spec["program"])
            if ident in rows:
                if membership not in rows[ident]["memberships"]:rows[ident]["memberships"].append(membership)
                continue
            if spec["clean"] is True:
                assert root_pass(docs[0][1]), "clean acceptance missing"
            videos=m["artifacts"]["videos"]
            assert set(CAMERAS).issubset(videos)
            dp=decode_proof(docs,mr["sha256"])
            if not dp:decode_candidates+=1
            # Check adjacent independent reports as approved evidence, without rerunning validators.
            if not dp:
                rp=Path(mr["path"]).parent
                rel=rp.relative_to(STAGING) if rp.is_relative_to(STAGING) else None
                adjacent=[rp/"sop_capture_qc.json"]
                if rel and len(rel.parts)>=4:
                    pp=BASE/"runtime/jobs/robodojo_data_generation"/Path(*rel.parts[:-2])/"phases"/Path(*rel.parts[-2:])
                    adjacent += [pp/"full_CPU_result.json",pp/"independent_CPU/CPU_queue_result.json"]
                for p in adjacent:
                    if p.exists():
                        dd=docs_graph([ref(p)]); docs+=dd
                        if decode_proof(dd,mr["sha256"]):dp=True;decode_candidates-=1;break
            assert evidence_binds_manifest(docs,mr), "acceptance does not bind this recording identity"
            top=docs[0][1]
            if isinstance(top.get("seed"),int): assert top["seed"]==seed, "cross-seed acceptance"
            actual_videos={}
            for camera in CAMERAS:
                video=dict(videos[camera])
                original=Path(video["path"])
                local=Path(mr["path"]).parent/original.name
                if local.exists() and local.resolve().is_relative_to(STAGING) and local.stat().st_size==video["byte_size"]:
                    video["original_manifest_path"]=video["path"]
                    video["path"]=str(local)
                actual_videos[camera]=video
            v={c:media_ref(actual_videos[c],not plan_only,receipts,not dp) for c in CAMERAS}
            assert len({x["manifest_frame_count"] for x in v.values()})==1
            fid=bool_or_none(find_value(docs,["strong_fidelity","strongFidelity"]))
            if fid is None:fid=bool_or_none(m.get("execution",{}).get("replay",{}))
            timing=find_value(docs,["timing_qualification","time_qualification","timing"])
            if not isinstance(timing,dict):timing=m.get("validation",{}).get("timing_qualification",{})
            timing=dict(timing or {})
            if "passed" not in timing and "timed_evaluation_admissible" in timing:timing["passed"]=timing["timed_evaluation_admissible"]
            timing.setdefault("status","passed" if timing.get("passed") is True else "not_qualified" if timing.get("passed") is False else "not_established")
            contract=find_value(docs,["contract"])
            cid=contract.get("path","") if isinstance(contract,dict) else contract
            if cid:cid=Path(str(cid)).name
            original=m["episode_id"]
            eid=old_ids.get(ident,"episode:"+hashlib.sha256((task+":"+original+":"+mr["sha256"]).encode()).hexdigest()[:32])
            cp=m.get("pipeline_source",{}).get("commit")
            if not cp:
                src=find_value(docs,["source"]);cp=src.get("commit") if isinstance(src,dict) else None
            rows[ident]=dict(episode_id=eid,original_episode_id=original,task=task,attempt=m.get("execution",{}).get("attempt_id",Path(mr["path"]).parent.parent.name),
                scene_seed=seed,manifest_sha256=mr["sha256"],final_count_key_sha256=hashlib.sha256((original+":"+mr["sha256"]).encode()).hexdigest(),
                selector=dict(selection_report_sha256=spec["acceptance"]["sha256"]),review_status="pending_human_video_review",
                instruction=m.get("instruction",""),qualification=dict(functional=True,clean=spec["clean"],strongFidelity=fid,time=timing),
                contractId=cid or "see-bound-evidence",sourceCommit=cp,videos=v,memberships=[membership],
                sourceClass="development" if spec["group"]=="development" else "self_capture",
                machineStatus="clean_selected" if spec["clean"] is True else "technical_pass_purpose_pending",
                source_manifest=mr,evidence=[r for r,_ in docs],extra=spec["extra"],
                checks=dict(complete_three_camera_set=True,deduplicated_within_snapshot=True,manifest_hash_verified=True,
                    not_present_in_curated_baseline=True,acceptance_evidence_verified=True,
                    selector_exit_code_zero=True if any(d.get("validator_exit_code")==0 for _,d in docs if isinstance(d,dict)) else None,
                    clean_selector_passed=spec["clean"] is True,
                    three_video_hashes_verified=False,three_videos_fully_decodable=dp or not plan_only))
        except Exception as e:
            issues.append(dict(task=spec.get("task"),acceptance=spec["acceptance"],reason=str(e),manifest=spec.get("manifest")))
        if i and i%100==0:print(json.dumps(dict(progress=i,specs=len(specs),candidates=len(rows),issues=len(issues))),flush=True)
    candidates=sorted(rows.values(),key=lambda x:(x["task"],x["scene_seed"],x["manifest_sha256"]))
    media={v["source_path"]:v for c in candidates for v in c["videos"].values()}
    copies=[v for v in media.values() if v["media_root_id"]=="review-cache"]
    summary=dict(candidate_count=len(candidates),clean_count=sum(c["qualification"]["clean"] is True for c in candidates),
                 counts=dict(collections.Counter(c["task"] for c in candidates)),specs=len(specs),unresolved=len(issues),
                 external_media_files=len(copies),external_media_bytes=sum(v["manifest_byte_size"] for v in copies),
                 missing_decode_receipt_candidates=decode_candidates)
    print(json.dumps(summary,ensure_ascii=False),flush=True)
    out=DEST/snapshot_id
    assert not issues, "unresolved publication inputs: "+json.dumps(issues[:5])
    if plan_only:
        plan_path=DEST/(snapshot_id+"_plan_"+str(os.getpid())+".json")
        plan_path.parent.mkdir(parents=True,exist_ok=True)
        plan_path.write_text(json.dumps(dict(status="publication_plan_not_accepted",
            summary=summary,candidates=candidates,issues=issues,sources=SOURCES),ensure_ascii=False)+"\n")
        print("PLAN "+str(plan_path),flush=True)
        print("ISSUES "+json.dumps(issues[:25],ensure_ascii=False),flush=True);return
    assert not out.exists(),"snapshot already exists"
    # Use the existing byte-integrity verifier and its metadata-sensitive receipts.
    # Never seed its cache from validator flags or a previously printed hash.
    verify_script = (
        "import {createMediaVerifier} from " + json.dumps((Path(__file__).parent/"media-integrity.mjs").as_uri()) + ";"
        "let s='';for await(const b of process.stdin)s+=b;"
        "const v=await createMediaVerifier('review-candidates');"
        "for(const x of JSON.parse(s))await v.verify(x.path,x.manifest_sha256,x.manifest_byte_size);"
        "await v.finish({snapshotId:"+json.dumps(snapshot_id)+"});")
    node=BASE/"runtime/node/node-v22.14.0-linux-x64/bin/node"
    subprocess.run([str(node),"--input-type=module","-e",verify_script],
                   input=json.dumps(list(media.values())),text=True,check=True)
    for c in candidates:
        c["checks"]["three_video_hashes_verified"]=True
        for v in c["videos"].values():v["verification"]["sha256_verified"]=True
    out.mkdir(parents=True)
    inv=dict(schema_version="benchmark2027.rolling_human_video_review_inventory.v1",snapshot_id=snapshot_id,
             generated_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),review_status="pending_human_video_review",
             admission_status="not_authorized_not_admitted",candidate_count=len(candidates),video_count=len(candidates)*3,
             candidates=candidates,task_scope=list(TASKS),
             rolling=dict(previous_snapshot_id=previous["snapshot_id"],previous_candidate_count=previous["candidate_count"],
                          new_since_previous_count=sum((c["task"],c["manifest_sha256"]) not in old_ids for c in candidates)))
    def write(name,data):(out/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n")
    write("candidate_inventory.json",inv)
    write("provenance.json",dict(sources=SOURCES,unresolved=issues,original_rejections=EXCLUDED,summary=summary,
                               publisher=ref(__file__),publication_decode_receipts=receipts,
                               admission=False,simulation_started=False,raw_evidence_modified=False))
    write("COMPLETE.json",dict(status="complete",snapshot_id=snapshot_id,candidate_count=len(candidates),video_count=len(candidates)*3,
                              candidate_inventory_sha256=sha(out/"candidate_inventory.json"),counts=summary["counts"],
                              completeness="published candidates only; unresolved evidence stays excluded, catalog does not claim all tasks complete"))
    print("SNAPSHOT "+str(out),flush=True)

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--snapshot-id",required=True);p.add_argument("--plan-only",action="store_true");p.add_argument("--from-plan")
    a=p.parse_args()
    if not a.plan_only:
        subprocess.run(["/usr/bin/python3","/mnt/gyc/benchmark2027/scripts/storage/layout_guard.py",
                        "validate","audit_run",str(DEST/a.snapshot_id)],check=True)
        subprocess.run(["/usr/bin/python3","/mnt/gyc/benchmark2027/scripts/storage/layout_guard.py",
                        "validate","runtime_cache",str(MEDIA_CACHE)],check=True)
    freeze(a.snapshot_id,a.plan_only,a.from_plan)
