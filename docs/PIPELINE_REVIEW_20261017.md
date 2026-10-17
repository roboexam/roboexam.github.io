# Resident ID clean human-review publication

The /review page publishes a frozen subset of the ongoing 400-episode collection.
It is a viewing/annotation surface, not admission or evaluation data. Original
PASS/REJECTED fields, captures, contracts and manifests are never rewritten.

Run scripts/freeze-pipeline-review.py with a new snapshot ID from a personal
RoboExam worktree. It reads the current Goal execution pointer, verifies bound
CPU purpose/selector reports, the original independent recording report,
manifest identity and each video's bytes/hash. Full decode is reused only from
the hash-bound original independent report. Native HDF5/raw evidence is not
copied or re-audited. B03 uses its exact completed milestone membership;
B04/B08 append-only accepted prefix states preserve earlier rejected results.

The immutable inventory/provenance/COMPLETE records live under
/mnt/gyc_ckp/benchmark2027/experiments/audits/dashboard_pipeline_review_20261017/.
scripts/pipeline-review-source.json pins an exact snapshot and inventory hash.
Legacy UNIBENCH_REVIEW_ROOT service settings cannot override this publication pin.
The exporter verifies the pin and emits per-task public chunks plus the
server-only media allowlist. It never reads arbitrary client-supplied paths.
The public bundle contains stable identities/hashes and controlled media URLs;
source paths remain in the server-side provenance record.

Functional success, semantic clean selector acceptance, strong fidelity, and
formal time eligibility remain separate. An old manifest success=false due to
fidelity does not override an explicitly bound semantic-clean acceptance.
Conversely, video availability or a runtime success flag never grants admission.

Each reviewer may save a decision and timestamped notes in their own browser,
keyed by exact episode ID + manifest hash, then export JSON for team collation.
Records are NOT shared automatically. Human opinions cannot alter machine
verdicts or promote a candidate. Original snapshots and deployment revisions
remain recoverable.

Publication uses the normal personal-worktree validation and shared-main
ops/4090/update.sh release path. No Git remote push or data promotion is needed.
