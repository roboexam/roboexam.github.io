# All 24 scene staging review — 2026-10-19

This extends the existing Review page; it does not launch simulation, change a
controller, recapture a trajectory, alter any historical verdict, or admit data.
The deployment source is the RoboExam main subtree, third_party/dashboard.

## Candidate sources and identities

scripts/freeze-review24.py reads explicit adopted milestones, frozen configs,
compatible prefixes, development registries and the small SOP acceptance reports.
It preserves source references and hashes in an immutable audit snapshot. It does
not infer acceptance from a playable video, directory name, time flag or success
alone. A failed selector is excluded. A completed engineering pilot without a
clean-use selector is published only as technical_pass_purpose_pending, clean=null.
The original 2026-10-17 snapshot remains unchanged.

Every new candidate ID includes its task, original episode identity and recording
manifest hash. Unchanged entries from the original review snapshot retain their
IDs and local reviewer notes. Repeated CPU reports for the same recording merge
memberships; a development/primary alias is one candidate. Distinct recording
variants retain distinct identities, with the original episode ID preserved.
B09 round1 stays archived as backup and is excluded from this Review publication by the user; round2 is primary. OOD and recovery never become ID clean
merely by entering Review. Official conveyor data are not relabelled as self capture.

## Files and controlled media

Inventory/provenance/COMPLETE live below:
 /mnt/gyc_ckp/benchmark2027/experiments/audits/dashboard_pipeline_review_20261017/

Public chunks contain identities, provenance hashes and controlled URLs, never
source filesystem paths. review-media accepts only a hash already in the generated
allowlist. It resolves that entry under one of two fixed roots, checks realpath,
size and HTTP ranges, and never accepts a client-supplied path or remote host.

Most video bytes remain at their original shared staging paths. A small set of
xiaobao-only /bh videos is copied byte-for-byte, with hashes, into:
 /mnt/gyc_ckp/benchmark2027/runtime/caches/dashboard_review_media/v1/
No HDF5, raw contacts, actual controls or datasets are moved. Relocated immutable
ID5 videos are read from the explicit replay directory only when their declared
size and SHA256 match; original manifest references stay unchanged.

Use the existing media-integrity verifier and its metadata-sensitive receipts.
Full decode is reused only from a manifest-bound independent report. Missing
decode evidence requires a publication-only CPU integrity check, not a fabricated
capture qualification. Human review, functional success, fidelity, timing,
clean-use selection and formal membership remain independent.

## Refresh and validation

Use an isolated RoboExam worktree branched from actual local main. On xiaobao
(which can read /bh), with a fresh snapshot identity:

 python3 -B scripts/freeze-review24.py --snapshot-id snapshot_all24_NEW_ID --plan-only
 python3 -B scripts/freeze-review24.py --snapshot-id snapshot_all24_NEW_ID --from-plan ABSOLUTE_PLAN_PATH

Inspect the exact counts, unresolved references and provenance before changing
scripts/pipeline-review-source.json. Never point at an incomplete snapshot.
Then, in the isolated dashboard worktree:

 npm run export:review-candidates
 npm run typecheck
 npm run lint
 npm run test:unit
 UNIBENCH_DEPLOY_CHECKOUT=/mnt/gyc/benchmark2027/roboexam/third_party/dashboard npm run build
 npm run test:render

Browser verification must cover the real Review entry, task switching, the
empty-task state, B09 primary and archived-backup exclusion, development reuse, purpose-pending
pilots, three camera playback, seeking/ranges, exact episode deep links, notes,
and mobile layout. A data refresh is a frozen publication, not a live capture
coordinator. Do not modify Goal pointers or running capture workers.

After coordinated main integration, use the existing ops/4090/update.sh and
status/fixed-public/watchdog verification. No new timer, no push, no change of
public URL. Keep all snapshots and original evidence recoverable.

## Published source selection

Snapshot: snapshot_all24_noB09backup_20261019_review_v3.
864 unique candidates across 21 non-empty scenes, with all24 scene entries.
771 have semantic clean-use selector receipts; 93 are engineering samples whose
purpose qualification remains pending. Routes: 804 ID,20 Semantic OOD,20 Visual
OOD,20 recovery. The old286 remain included and keep their reviewer identities;
578 are first registered to Review, not necessarily newly produced trajectories.
B09 shows round2 primary100 and development7; archived round1 backup100 is excluded.
No official-data or historical curated pool was imported.

## Browser verification

The isolated production build was tested through an SSH loopback forward.
Home→Review navigation works. Play primary filtering gives11 with only the
current three video elements; playback advances allthree cameras together.
Next episode and cross-scene switches discard prior media. A keyed episode
container fixes an observed old-player residue during membership filtering.
Tower Semantic OOD selects5, clean-selected intersects to zero, purpose-pending
restores the5. The official Match Conveyor entry stays empty and explains the
separate official source. B09 primary selects100 and no backup source is offered.
At390×844, B09 and the longest B06 heading stay within the viewport with no
horizontal overflow; the viewport override is reset after testing.
All286 old recording IDs/manifest pairs remain identical, preserving note keys.
