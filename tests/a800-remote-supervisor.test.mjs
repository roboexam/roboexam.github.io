import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const loopScript = path.join(root, "ops/a800/remote-supervisor-loop.sh");

// The fake ssh answers the probe with whatever `probeAnswer` says and records
// every remote command, so a test can prove the watch only ever starts things.
async function buildFixture(t, { probeAnswer, cycles = 1, sshExit = 0 }) {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "unibench-remote-sup-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const state = path.join(fixture, "state");
  const bin = path.join(fixture, "bin");
  await Promise.all([mkdir(state, { recursive: true }), mkdir(bin, { recursive: true })]);

  const commandLog = path.join(fixture, "ssh-commands.log");
  const fakeSsh = path.join(bin, "fake-ssh");
  await writeFile(
    fakeSsh,
    `#!/usr/bin/env bash
# Arguments end with the remote command; record it and answer the probe.
for last; do :; done
echo "$last" >>'${commandLog}'
if [ ${sshExit} -ne 0 ]; then echo "ssh: connect failed" >&2; exit ${sshExit}; fi
case "$last" in
  *start-supervisor.sh*) echo "Dashboard host supervisor started (pid 1234)." ;;
  *) echo '${probeAnswer}' ;;
esac
exit 0
`,
  );
  await chmod(fakeSsh, 0o755);

  const env = {
    ...process.env,
    UNIBENCH_REMOTE_STATE_DIR: state,
    UNIBENCH_REMOTE_SSH_BIN: fakeSsh,
    UNIBENCH_REMOTE_MAX_CYCLES: String(cycles),
    UNIBENCH_REMOTE_INTERVAL_SECONDS: "1",
  };
  return { fixture, state, env, commandLog };
}

async function readCommands(commandLog) {
  try {
    return (await readFile(commandLog, "utf8")).split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

async function readStatus(state) {
  const raw = await readFile(path.join(state, "remote-supervisor-status.env"), "utf8");
  return Object.fromEntries(
    raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1).replace(/^'|'$/g, "")];
      }),
  );
}

test("does nothing while the 4090 supervisor is alive", async (t) => {
  const { state, env, commandLog } = await buildFixture(t, { probeAnswer: "alive" });
  await execFileAsync("bash", [loopScript], { env });

  const commands = await readCommands(commandLog);
  assert.equal(commands.length, 1, "only the probe may run");
  assert.ok(!commands.some((c) => c.includes("start-supervisor.sh")));
  assert.equal((await readStatus(state)).result, "ok");
});

test("starts the 4090 supervisor again when it is gone", async (t) => {
  const { state, env, commandLog } = await buildFixture(t, { probeAnswer: "down" });
  await execFileAsync("bash", [loopScript], { env });

  const commands = await readCommands(commandLog);
  assert.ok(commands.some((c) => c.includes("ops/4090/start-supervisor.sh")));
  const status = await readStatus(state);
  assert.equal(status.result, "repairing");
  assert.equal(status.repaired, "yes");
});

test("never issues a stop or kill on the remote host", async (t) => {
  const { env, commandLog } = await buildFixture(t, { probeAnswer: "down", cycles: 2 });
  await execFileAsync("bash", [loopScript], {
    env: { ...env, UNIBENCH_REMOTE_REPAIR_COOLDOWN_SECONDS: "1" },
  });

  const commands = await readCommands(commandLog);
  assert.ok(commands.length > 0);
  for (const command of commands) {
    // `kill -0` only asks whether a pid exists and sends no signal, so it is
    // stripped before looking for anything that would actually stop work.
    const withoutLivenessProbe = command.replace(/kill\s+-0\b/g, "");
    assert.ok(
      !/\bkill\b|\bpkill\b|\bkillall\b|kill-session|kill-server|\bstop[-.]/.test(withoutLivenessProbe),
      `unexpected destructive command: ${command}`,
    );
  }
});

test("holds a cooldown instead of restarting every cycle", async (t) => {
  const { env, commandLog } = await buildFixture(t, { probeAnswer: "down", cycles: 3 });
  await execFileAsync("bash", [loopScript], {
    env: { ...env, UNIBENCH_REMOTE_REPAIR_COOLDOWN_SECONDS: "600" },
  });

  const starts = (await readCommands(commandLog)).filter((c) => c.includes("start-supervisor.sh"));
  assert.equal(starts.length, 1, "one start attempt, not one per cycle");
});

test("reports an unreachable host instead of claiming health", async (t) => {
  const { state, env } = await buildFixture(t, { probeAnswer: "alive", sshExit: 255 });
  await execFileAsync("bash", [loopScript], { env });

  assert.equal((await readStatus(state)).result, "unreachable");
});

test("refuses to run a second watch against the same state directory", async (t) => {
  const { state, env } = await buildFixture(t, { probeAnswer: "alive" });
  const lockPath = path.join(state, "remote-supervisor.lock");
  const holder = spawn("flock", ["-n", lockPath, "sleep", "10"], { stdio: "ignore" });
  t.after(() => holder.kill("SIGKILL"));
  await new Promise((resolve) => setTimeout(resolve, 400));

  await assert.rejects(
    execFileAsync("bash", [loopScript], { env }),
    (error) => error.code === 1 && /Another remote dashboard supervisor already holds/.test(error.stderr),
  );
});
