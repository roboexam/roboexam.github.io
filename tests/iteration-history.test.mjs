import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { iterationHistory } from "../build/iteration-history.mjs";

test("counts independent product commits, not docs, merges or repeat builds", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "dashboard-iteration-"));
  const git = (...args) => execFileSync("git", args, { cwd, encoding:"utf8", stdio:["ignore","pipe","pipe"] }).trim();
  const commit = title => { git("add", "."); git("commit", "-m", title); };
  try {
    git("init", "-b", "main"); git("config", "user.email", "fixture@example.test"); git("config", "user.name", "Fixture");
    writeFileSync(path.join(cwd,"README.md"), "baseline"); commit("baseline");
    const baseline = git("rev-parse", "HEAD");
    assert.equal(iterationHistory(cwd, baseline).count, 0);
    writeFileSync(path.join(cwd,"README.md"), "docs change"); commit("docs only");
    assert.equal(iterationHistory(cwd, baseline).count, 0);
    git("checkout", "-b", "feature"); mkdirSync(path.join(cwd,"app"));
    writeFileSync(path.join(cwd,"app/page.tsx"), "small copy change"); commit("change a word");
    writeFileSync(path.join(cwd,"app/page.tsx"), "two changes");
    writeFileSync(path.join(cwd,"app/style.css"), "color"); commit("one commit, two files");
    git("checkout", "main"); git("merge", "--no-ff", "feature", "-m", "merge feature");
    const result = iterationHistory(cwd, baseline);
    assert.equal(result.count, 2); assert.equal(result.target, 1000);
    assert.deepEqual(iterationHistory(cwd, baseline), result);
    assert.deepEqual(result.recent.map(x=>x.number), [2,1]);
    git("revert", "--no-edit", "HEAD^2");
    assert.equal(iterationHistory(cwd, baseline).count, 3);
    const missingBaseline = iterationHistory(cwd, "f".repeat(40));
    assert.equal(missingBaseline.baseline, "local-dev");
    assert.equal(missingBaseline.count, 0);
  } finally { rmSync(cwd, {recursive:true, force:true}); }
});

test("continues the audited count from a dashboard vendored in a monorepo", () => {
  const root = mkdtempSync(path.join(tmpdir(), "dashboard-vendored-"));
  const cwd = path.join(root, "third_party", "dashboard");
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding:"utf8", stdio:["ignore","pipe","pipe"] }).trim();
  const commit = title => { git("add", "."); git("commit", "-m", title); };
  try {
    git("init", "-b", "main"); git("config", "user.email", "fixture@example.test"); git("config", "user.name", "Fixture");
    mkdirSync(path.join(cwd, "app"), { recursive: true });
    writeFileSync(path.join(cwd, "app", "page.tsx"), "vendored source"); commit("vendor dashboard");
    const vendoredCommit = git("rev-parse", "HEAD");
    writeFileSync(path.join(root, "README.md"), "unrelated root change"); commit("change monorepo docs");
    writeFileSync(path.join(cwd, "app", "page.tsx"), "dashboard update"); commit("update dashboard");

    const result = iterationHistory(cwd, "f".repeat(40), {
      commit: vendoredCommit,
      count: 101,
      baseline: "vendored:test",
      recent: [{ hash: "legacy", date: "2026-10-14", title: "Imported dashboard history", number: 101 }],
    });
    assert.equal(result.count, 102);
    assert.equal(result.baseline, "vendored:test");
    assert.deepEqual(result.recent.map(entry => entry.number), [102, 101]);
    assert.equal(result.recent[0].title, "update dashboard");
  } finally { rmSync(root, {recursive:true, force:true}); }
});
