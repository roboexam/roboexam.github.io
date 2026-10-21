# Review synchronized action traces (2026-10-22)

Review reuses Dataset's `SynchronizedCameraPlayer` / `ActionTracePanel`.
The video and trace panel share one current-time state. Playback and seeking move
all available plot cursors; changing scene, folder, episode or source binding
aborts stale loads and rejects mismatched responses. Existing reviewer comments,
keys, save/export behavior and raw folder discovery remain unchanged.

## Sources and scope

- HDF5: use `vision/cam_head/video_pts_seconds`, six arm joint positions from
  `state/{left,right}_arm_joint_state`, and xyz from
  `state/{left,right}_arm_ee_pose_world`. Read only the selected episode and up to
  80 evenly spaced plotted samples. Preserve world-frame and rad/m units.
- Official Parquet: support the explicitly identified canonical v8 20D rot6d
  state contract in `clean_official`, using `timestamp`, `frame_index` and
  `observation.state` (left xyz 0:3, right xyz 10:13). Verify episode/task identity,
  frame count and the recorded fps clock. Display the recorded source frame;
  missing joint angles remain null and show a visible missing-data message.
  No joint angles are inferred from EE rotation or action vectors.
- Missing/ambiguous trajectories, unknown formats, absent or non-monotonic video
  clocks, mismatched identity/lengths and non-finite plotted values fail closed.
  Partial measured telemetry remains visible. No values are synthesized and no
  qualification, selector verdict, raw payload or training admission is changed.

## Exact binding and bounded CPU reader

`RawEpisode.trace` contains either an unavailable reason or an opaque URL:
`GET /api/raw-review-trace?id=<64-hex-binding>`.
The host binds that ID to the selected raw directory, metadata SHA-256, verified
video/review identity and the selected trajectory's exact physical file identity
(device/inode/size/nanosecond mtime/ctime). It never selects by seed, follows an
artifact's absolute staging path or accepts filesystem paths from clients.

The host resolves against its existing raw allowlist, opens with O_NOFOLLOW,
rechecks metadata and file identity before/after extraction, and passes only its
read-only fd 3 plus bounded metadata to `scripts/read-raw-action-trace.py`.
Python does not receive a browser path. The API exposes no private source paths.

At most two readers run concurrently, with a bounded queue, 20-second child
limit, 1 MiB output limit and CPU thread caps. CUDA visibility is empty and no
simulation/model modules are imported. Identical requests coalesce; unchanged
traces use a 256-entry process cache after fresh identity checks. Recently
changed files do not borrow an old cached trace. Cache loss only causes a reread.

Large HDF5 files are sampled, not repeatedly fully hashed. The API therefore
reports `trajectorySha256: null`, preserves an optional expected hash separately,
and declares `bindingMethod: raw_file_identity`. The panel states this boundary;
it does not represent the expected digest as a newly verified full-file hash or
new physical acceptance. Existing Dataset static traces retain their own URLs
and provenance. A shared validator checks both protocols before plotting.

## Runtime dependency

The dedicated CPU-only reader interpreter is:
`/mnt/gyc_ckp/benchmark2027/runtime/caches/dashboard_raw_action_traces/v1/python/bin/python`.
The location was validated as `runtime_cache` with the project layout guard.
`DASHBOARD_RAW_TRACE_PYTHON` may override this host setting. No shared environment,
other task's venv or existing dashboard environment file was changed.

Pinned requirements are `scripts/raw-action-trace-requirements.txt`:
NumPy 1.26.4, h5py 3.14.0, PyArrow 20.0.0 under Python 3.10. This runtime can be
reconstructed with an ordinary isolated venv and those requirements. The host
lacks ensurepip and direct PyPI TLS timed out, so setup used `venv --without-pip`
and an official PyPA pip.pyz plus matching Linux CPython-3.10 wheels downloaded
on the Mac, then offline installation into this owned venv. Wheel files and a
version/hash receipt are retained beneath the same managed cache, outside Git.
No system package or shared Python installation was modified.

## Verification

Based on local main `c525c464890faad61f7d57eb95133d9c6f63e790`, isolated worktree
`/mnt/gyc/benchmark2027/worktrees/dashboard_review_actions_20261022`.

- TypeScript, lint (zero errors, same four unrelated image warnings), build,
  repository hygiene and diff checks pass.
- Full default unit suite: 215 pass, including six new trace contract/API tests.
- Eleven CPU HDF5/Parquet reader tests pass (exact values, clocks, missing data,
  wrong identities/dimensions, non-finite values and frame/video mismatches).
  `npm run test:raw-action-traces` is also a required prebuild gate.
- Built-server rendered tests: 13 pass, including new route rejection checks.
- Real raw examples: Classify seed50131 (3360 frames), B08 visual seed1701900350
  (1591), official Bowls episode0 (240), official Arrange episode0 (578).
  All returned 80 real samples. Native HDF5 examples had both groups; official
  examples had EE only. Cold reads were 0.23–0.65 seconds; hot reads under 4 ms.
- Browser: four Classify charts appear alongside three-camera playback; seeking
  to video end placed all four plot cursors at x=640 and all three videos at
  67.2 seconds. Switching episode reset all cursors to zero and changed source
  bindings; official Bowls showed two measured EE charts and two missing-joint
  placeholders. The 390 px page had scrollWidth = clientWidth = 390.
- Existing raw comments are untouched; the browser save/restore flow is checked
  on the loopback-only test origin. No production test verdict is submitted.

The helper reads existing files only. No capture, simulation, GPU request,
recapture, metric rerun, data migration, admission or push is part of this change.
