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
const loopScript = path.join(root, "ops/4090/supervisor-loop.sh");
const repairNames = ["start.sh", "ensure-fixed-funnel.sh", "start-watchdog.sh"];

async function buildFixture(t, { sessionsPresent, cycles = 1 }) {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "unibench-supervisor-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const runtime = path.join(fixture, "runtime");
  const bin = path.join(fixture, "bin");
  const repairs = path.join(fixture, "repairs");
  await Promise.all([
    mkdir(runtime, { recursive: true }),
    mkdir(bin, { recursive: true }),
    mkdir(repairs, { recursive: true }),
  ]);
  await writeFile(path.join(runtime, "dashboard.env"), "");

  const callLog = path.join(fixture, "calls.log");
  // `tmux has-session` exits non-zero both for a missing session and for a dead
  // tmux server, which is exactly the outage this supervisor exists for.
  const fakeTmux = path.join(bin, "tmux");
  await writeFile(fakeTmux, `#!/usr/bin/env bash\nexit ${sessionsPresent ? 0 : 1}\n`);
  await chmod(fakeTmux, 0o755);
  for (const name of repairNames) {
    const script = path.join(repairs, name);
    await writeFile(script, `#!/usr/bin/env bash\necho '${name}' >>'${callLog}'\nexit 0\n`);
    await chmod(script, 0o755);
  }

  const nodeHome = path.dirname(path.dirname(process.execPath));
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    UNIBENCH_PROJECT_DIR: fixture,
    UNIBENCH_RUNTIME_DIR: runtime,
    UNIBENCH_NODE_HOME: nodeHome,
    UNIBENCH_SUPERVISOR_REPAIR_DIR: repairs,
    UNIBENCH_SUPERVISOR_MAX_CYCLES: String(cycles),
    UNIBENCH_SUPERVISOR_INTERVAL_SECONDS: "1",
  };
  return { fixture, runtime, env, callLog };
}

async function readCalls(callLog) {
  try {
    return (await readFile(callLog, "utf8")).split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

async function readStatus(runtime) {
  const raw = await readFile(path.join(runtime, "supervisor-status.env"), "utf8");
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

test("leaves healthy sessions alone and reports them as present", async (t) => {
  const { runtime, env, callLog } = await buildFixture(t, { sessionsPresent: true });
  await execFileAsync("bash", [loopScript], { env });

  assert.deepEqual(await readCalls(callLog), [], "no repair may run while every session exists");
  const status = await readStatus(runtime);
  assert.equal(status.result, "ok");
  assert.equal(status.sessions_present, "3");
  assert.equal(status.sessions_total, "3");
});

test("recreates every guarded session when the tmux server is gone", async (t) => {
  const { runtime, env, callLog } = await buildFixture(t, { sessionsPresent: false });
  await execFileAsync("bash", [loopScript], { env });

  assert.deepEqual((await readCalls(callLog)).sort(), [...repairNames].sort());
  const status = await readStatus(runtime);
  // The fake tmux never reports success, so the cycle must admit it is still
  // repairing rather than claiming the sessions came back.
  assert.equal(status.result, "repairing");
  assert.equal(status.sessions_present, "0");
});

test("holds a repair cooldown instead of retrying a failing session every cycle", async (t) => {
  const { env, callLog } = await buildFixture(t, { sessionsPresent: false, cycles: 3 });
  await execFileAsync("bash", [loopScript], {
    env: { ...env, UNIBENCH_SUPERVISOR_REPAIR_COOLDOWN_SECONDS: "600" },
  });

  const calls = await readCalls(callLog);
  assert.equal(calls.length, repairNames.length, "each repair runs once, not once per cycle");
});

test("refuses to run a second supervisor against the same runtime", async (t) => {
  const { runtime, env } = await buildFixture(t, { sessionsPresent: true });
  const lockPath = path.join(runtime, "supervisor.lock");
  const holder = spawn("flock", ["-n", lockPath, "sleep", "10"], { stdio: "ignore" });
  t.after(() => holder.kill("SIGKILL"));
  await new Promise((resolve) => setTimeout(resolve, 400));

  await assert.rejects(
    execFileAsync("bash", [loopScript], { env }),
    (error) => error.code === 1 && /Another dashboard supervisor already holds/.test(error.stderr),
  );
});

test("stands aside while a deployment holds the deploy lock", async (t) => {
  const { runtime, env, callLog } = await buildFixture(t, { sessionsPresent: false });
  const deployLock = path.join(runtime, "deploy.lock");
  await writeFile(deployLock, "");
  const holder = spawn("flock", ["-n", deployLock, "sleep", "10"], { stdio: "ignore" });
  t.after(() => holder.kill("SIGKILL"));
  await new Promise((resolve) => setTimeout(resolve, 400));

  await execFileAsync("bash", [loopScript], { env });

  assert.deepEqual(await readCalls(callLog), [], "update.sh owns the service during a deployment");
  assert.equal((await readStatus(runtime)).result, "deploying");
});
