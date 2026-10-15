#!/usr/bin/env bash
# Shared settings for the cross-host watch that runs ON the A800 and targets
# the 4090 dashboard host.
set -euo pipefail

REMOTE_SSH_PORT="${UNIBENCH_REMOTE_SSH_PORT:-6015}"
REMOTE_SSH_TARGET="${UNIBENCH_REMOTE_SSH_TARGET:-root@10.40.0.110}"
REMOTE_DASHBOARD_DIR="${UNIBENCH_REMOTE_DASHBOARD_DIR:-/mnt/gyc/benchmark2027/dashboard}"
REMOTE_SUPERVISOR_PID_FILE="${UNIBENCH_REMOTE_SUPERVISOR_PID_FILE:-/mnt/gyc_ckp/benchmark2027/runtime/dashboard/supervisor.pid}"

# State stays on local disk. The 1TB project share is a network filesystem and
# is not a safe place to put a flock that guards a single running process.
STATE_DIR="${UNIBENCH_REMOTE_STATE_DIR:-/root/.unibench-remote-supervisor}"
REMOTE_LOCK_FILE="${STATE_DIR}/remote-supervisor.lock"
REMOTE_PID_FILE="${STATE_DIR}/remote-supervisor.pid"
REMOTE_LOG_FILE="${STATE_DIR}/remote-supervisor.log"
REMOTE_STATUS_FILE="${STATE_DIR}/remote-supervisor-status.env"

REMOTE_INTERVAL_SECONDS="${UNIBENCH_REMOTE_INTERVAL_SECONDS:-120}"
REMOTE_REPAIR_COOLDOWN_SECONDS="${UNIBENCH_REMOTE_REPAIR_COOLDOWN_SECONDS:-600}"
REMOTE_MAX_STATUS_AGE_SECONDS="${UNIBENCH_REMOTE_MAX_STATUS_AGE_SECONDS:-900}"
REMOTE_MAX_CYCLES="${UNIBENCH_REMOTE_MAX_CYCLES:-0}"

# Overridable so tests can substitute a fake ssh.
REMOTE_SSH_BIN="${UNIBENCH_REMOTE_SSH_BIN:-ssh}"
