import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const publishScript = path.join(root, "ops/4090/publish-curated.sh");

// A throwaway repository with a stub exporter, so the test exercises the
// publish policy without running a real export or touching the project.
async function buildRepo(t) {
  const repo = await mkdtemp(path.join(os.tmpdir(), "unibench-publish-"));
  t.after(() => rm(repo, { recursive: true, force: true }));
  await mkdir(path.join(repo, "app/data/generated"), { recursive: true });
  await mkdir(path.join(repo, "public/curated-data"), { recursive: true });
  await mkdir(path.join(repo, "public/explorer-data"), { recursive: true });
  await mkdir(path.join(repo, "scripts"), { recursive: true });

  const bundle = (episodes) => `${JSON.stringify({
    tasks: [{ id: "demo", clean: episodes, recovery: 0, ood: 0 }],
    episodeCount: episodes,
  })}\n`;
  await writeFile(path.join(repo, "app/data/generated/curated-dataset.json"), bundle(1));
  await writeFile(path.join(repo, "app/data/generated/curated-media.json"), "{}\n");
  await writeFile(path.join(repo, "app/data/generated/explorer-dataset.json"), "{}\n");
  await writeFile(path.join(repo, "scripts/curated-task-metadata.json"), "{}\n");
  await writeFile(path.join(repo, "README.md"), "fixture\n");

  const git = (...args) => execFileAsync("git", args, { cwd: repo });
  await git("init", "-q");
  await git("config", "user.email", "test@example.com");
  await git("config", "user.name", "Test");
  await git("add", ".");
  await git("commit", "-q", "-m", "fixture");

  // The stub stands in for `npm run export:curated-dataset`. It lives outside
  // the repository on purpose: an untracked file inside it would (correctly)
  // trip the guard this script exists to enforce.
  const tools = await mkdtemp(path.join(os.tmpdir(), "unibench-publish-tools-"));
  t.after(() => rm(tools, { recursive: true, force: true }));
  const exporter = path.join(tools, "stub-export.sh");
  await writeFile(exporter, `#!/usr/bin/env bash\nprintf '%s' '${bundle(3).trim()}' > app/data/generated/curated-dataset.json\necho "" >> app/data/generated/curated-dataset.json\necho "stub export"\n`);
  await execFileAsync("chmod", ["+x", exporter]);

  const env = {
    ...process.env,
    UNIBENCH_PUBLISH_EXPORT_CMD: `bash ${exporter}`,
    UNIBENCH_NODE_HOME: path.dirname(path.dirname(process.execPath)),
  };
  return { repo, env, git };
}

test("publishes the re-exported bundle and commits only generated paths", async (t) => {
  const { repo, env, git } = await buildRepo(t);
  const result = await execFileAsync("bash", [publishScript], { cwd: repo, env });

  assert.match(result.stdout, /Before: 1 tasks, 1 episodes/);
  assert.match(result.stdout, /After: {2}1 tasks, 3 episodes/);
  const committed = await execFileAsync("git", ["show", "--name-only", "--format=", "HEAD"], { cwd: repo });
  assert.deepEqual(committed.stdout.trim().split("\n"), ["app/data/generated/curated-dataset.json"]);
  const status = await git("status", "--porcelain");
  assert.equal(status.stdout.trim(), "", "the working tree is left clean");
});

test("refuses to publish while unrelated files are modified", async (t) => {
  const { repo, env } = await buildRepo(t);
  await writeFile(path.join(repo, "README.md"), "someone else is editing this\n");

  await assert.rejects(
    execFileAsync("bash", [publishScript], { cwd: repo, env }),
    (error) => error.code === 1 && /not part of a curated export/.test(error.stderr) && /README\.md/.test(error.stderr),
  );
});

test("dry run writes the bundle but commits nothing", async (t) => {
  const { repo, env, git } = await buildRepo(t);
  const before = await git("rev-parse", "HEAD");
  const result = await execFileAsync("bash", [publishScript, "--dry-run"], { cwd: repo, env });

  assert.match(result.stdout, /nothing was committed/);
  const after = await git("rev-parse", "HEAD");
  assert.equal(after.stdout, before.stdout);
  const bundle = await readFile(path.join(repo, "app/data/generated/curated-dataset.json"), "utf8");
  assert.match(bundle, /"episodeCount":3/);
});

test("says so instead of committing when the catalog has not moved", async (t) => {
  const { repo, env, git } = await buildRepo(t);
  await execFileAsync("bash", [publishScript], { cwd: repo, env });
  const before = await git("rev-parse", "HEAD");

  const again = await execFileAsync("bash", [publishScript], { cwd: repo, env });
  assert.match(again.stdout, /Nothing changed/);
  const after = await git("rev-parse", "HEAD");
  assert.equal(after.stdout, before.stdout);
});
