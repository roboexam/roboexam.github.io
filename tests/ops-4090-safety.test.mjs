import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const guardScript = path.join(root, "ops/4090/guard-live-build.sh");
const verifyScript = path.join(root, "ops/4090/verify-assets.sh");
const fixedPublicStatusScript = path.join(root, "ops/4090/fixed-public-status.sh");

test("blocks an in-place build in the live checkout but permits worktrees and deploy builds", async (t) => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "unibench-build-guard-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const deploy = path.join(fixture, "dashboard");
  const worktree = path.join(fixture, "dashboard-wm");
  const bin = path.join(fixture, "bin");
  await Promise.all([mkdir(deploy), mkdir(worktree), mkdir(bin)]);
  const fakeTmux = path.join(bin, "tmux");
  await writeFile(fakeTmux, "#!/usr/bin/env bash\nexit 0\n");
  await chmod(fakeTmux, 0o755);

  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    UNIBENCH_DEPLOY_CHECKOUT: deploy,
    UNIBENCH_PORT: "49179",
  };

  await execFileAsync("bash", [guardScript], { cwd: worktree, env });
  await assert.rejects(
    execFileAsync("bash", [guardScript], { cwd: deploy, env }),
    (error) => error.code === 1 && /Refusing to build inside the live deployment checkout/.test(error.stderr),
  );
  await execFileAsync("bash", [guardScript], {
    cwd: deploy,
    env: { ...env, UNIBENCH_DEPLOY_BUILD: "1" },
  });
});

test("verifies the current HTML entry and every built client asset", async (t) => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "unibench-assets-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const client = path.join(fixture, "dist/client");
  await mkdir(path.join(client, ".vite"), { recursive: true });
  await mkdir(path.join(client, "_next/static/chunks"), { recursive: true });
  await mkdir(path.join(client, "_next/static/css"), { recursive: true });

  const entry = "/_next/static/chunks/index-good.js";
  const lazy = "/_next/static/chunks/dashboard-good.js";
  const css = "/_next/static/css/index-good.css";
  await writeFile(
    path.join(client, "vinext-client-entry-manifest.json"),
    `${JSON.stringify({ appBrowserEntry: entry.slice(1) }, null, 2)}\n`,
  );
  await writeFile(
    path.join(client, ".vite/manifest.json"),
    `${JSON.stringify({ entry: { file: entry.slice(1), css: [css.slice(1)] }, dashboard: { file: lazy.slice(1) } }, null, 2)}\n`,
  );
  await Promise.all([
    writeFile(path.join(client, entry), "export const ready = true;\n"),
    writeFile(path.join(client, lazy), "export const dashboard = true;\n"),
    writeFile(path.join(client, css), "body { color: #123; }\n"),
  ]);

  let staleHtml = false;
  let missingLazyAsset = false;
  const server = http.createServer((request, response) => {
    if (request.url === "/login") {
      const htmlEntry = staleHtml ? "/_next/static/chunks/index-stale.js" : entry;
      response.writeHead(200, { "content-type": "text/html" });
      response.end(`<link rel="stylesheet" href="${css}"><script type="module" src="${htmlEntry}"></script>`);
      return;
    }
    if (request.url === lazy && missingLazyAsset) {
      response.writeHead(404).end("missing");
      return;
    }
    const bodies = new Map([
      [entry, "export const ready = true;\n"],
      [lazy, "export const dashboard = true;\n"],
      [css, "body { color: #123; }\n"],
    ]);
    const body = bodies.get(request.url);
    if (!body) response.writeHead(404).end("not found");
    else response.writeHead(200).end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const env = {
    ...process.env,
    UNIBENCH_PROJECT_DIR: fixture,
    UNIBENCH_NODE_BIN: process.execPath,
    UNIBENCH_VERIFY_TIMEOUT: "5",
  };

  const verified = await execFileAsync("bash", [verifyScript, baseUrl], { cwd: root, env });
  assert.match(verified.stdout, /Asset verification passed: 3 client assets/);

  missingLazyAsset = true;
  await assert.rejects(
    execFileAsync("bash", [verifyScript, baseUrl], { cwd: root, env }),
    (error) => error.code === 1 && /asset request failed/.test(error.stderr),
  );
  missingLazyAsset = false;
  staleHtml = true;
  await assert.rejects(
    execFileAsync("bash", [verifyScript, baseUrl], { cwd: root, env }),
    (error) => error.code === 1 && /does not reference current entry/.test(error.stderr),
  );
});

test("retries transient public asset failures without accepting stale assets", async (t) => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "unibench-public-assets-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const client = path.join(fixture, "dist/client");
  await mkdir(path.join(client, ".vite"), { recursive: true });
  await mkdir(path.join(client, "_next/static/chunks"), { recursive: true });
  const entry = "/_next/static/chunks/index-retry.js";
  await writeFile(
    path.join(client, "vinext-client-entry-manifest.json"),
    `${JSON.stringify({ appBrowserEntry: entry.slice(1) }, null, 2)}\n`,
  );
  await writeFile(
    path.join(client, ".vite/manifest.json"),
    `${JSON.stringify({ entry: { file: entry.slice(1) } }, null, 2)}\n`,
  );
  await writeFile(path.join(client, entry), "export const retried = true;\n");

  let entryRequests = 0;
  const server = http.createServer((request, response) => {
    if (request.url === "/login") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(`<script type="module" src="${entry}"></script>`);
      return;
    }
    if (request.url === entry && entryRequests++ === 0) {
      response.writeHead(503).end("temporary");
      return;
    }
    if (request.url === entry) response.writeHead(200).end("export const retried = true;\n");
    else response.writeHead(404).end("not found");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();

  const verified = await execFileAsync(
    "bash",
    [verifyScript, `http://127.0.0.1:${address.port}`],
    {
      cwd: root,
      env: {
        ...process.env,
        UNIBENCH_PROJECT_DIR: fixture,
        UNIBENCH_NODE_BIN: process.execPath,
        UNIBENCH_VERIFY_RETRIES: "1",
        UNIBENCH_VERIFY_TIMEOUT: "5",
      },
    },
  );
  assert.match(verified.stdout, /Asset verification passed: 1 client assets/);
  assert.equal(entryRequests, 2);

  await assert.rejects(
    execFileAsync("bash", [verifyScript, `http://127.0.0.1:${address.port}`], {
      cwd: root,
      env: {
        ...process.env,
        UNIBENCH_PROJECT_DIR: fixture,
        UNIBENCH_NODE_BIN: process.execPath,
        UNIBENCH_VERIFY_SCOPE: "invalid",
      },
    }),
    (error) => error.code === 1 && /unsupported scope invalid/.test(error.stderr),
  );
});

test("fixed public gate requires an online node, exact Funnel mapping, and current assets", async (t) => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "unibench-fixed-public-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const runtime = path.join(fixture, "runtime");
  const bin = path.join(fixture, "bin");
  const client = path.join(fixture, "dist/client");
  await Promise.all([
    mkdir(runtime, { recursive: true }),
    mkdir(bin, { recursive: true }),
    mkdir(path.join(client, ".vite"), { recursive: true }),
    mkdir(path.join(client, "_next/static/chunks"), { recursive: true }),
  ]);
  await writeFile(path.join(runtime, "dashboard.env"), "");
  const entry = "/_next/static/chunks/index-fixed.js";
  await writeFile(
    path.join(client, "vinext-client-entry-manifest.json"),
    `${JSON.stringify({ appBrowserEntry: entry.slice(1) }, null, 2)}\n`,
  );
  await writeFile(
    path.join(client, ".vite/manifest.json"),
    `${JSON.stringify({ entry: { file: entry.slice(1) } }, null, 2)}\n`,
  );
  await writeFile(path.join(client, entry), "export const fixed = true;\n");

  const httpServer = http.createServer((request, response) => {
    if (request.url === "/login") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(`<script type="module" src="${entry}"></script>`);
    } else if (request.url === entry) response.writeHead(200).end("export const fixed = true;\n");
    else response.writeHead(404).end("not found");
  });
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => httpServer.close(resolve)));
  const httpAddress = httpServer.address();
  const fixedUrl = `http://127.0.0.1:${httpAddress.port}`;
  let proxyRequests = 0;
  const proxyServer = http.createServer((_request, response) => {
    proxyRequests += 1;
    response.writeHead(403).end("workspace proxy rejected the request");
  });
  await new Promise((resolve) => proxyServer.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => proxyServer.close(resolve)));
  const proxyAddress = proxyServer.address();
  const proxyUrl = `http://127.0.0.1:${proxyAddress.port}`;

  const socketPath = path.join(fixture, "tailscaled.sock");
  const socketServer = net.createServer();
  await new Promise((resolve) => socketServer.listen(socketPath, resolve));
  t.after(() => new Promise((resolve) => socketServer.close(resolve)));

  const fakeTmux = path.join(bin, "tmux");
  const fakeTailscale = path.join(bin, "tailscale");
  const fakeTailscaled = path.join(bin, "tailscaled");
  const stateFile = path.join(runtime, "tailscaled.state");
  await writeFile(fakeTmux, "#!/usr/bin/env bash\nexit 0\n");
  await writeFile(
    fakeTailscale,
    `#!/usr/bin/env bash
if [[ "$*" == *"status --json"* ]]; then
  printf '%s\\n' '{"BackendState":"Running","Self":{"Online":true,"KeyExpiry":"2099-01-01T00:00:00Z"}}'
elif [[ "$*" == *"funnel status"* ]]; then
  printf '%s\\n' "$UNIBENCH_FIXED_PUBLIC_URL" "|-- / proxy ${"${FAKE_FUNNEL_TARGET:-$UNIBENCH_TAILSCALE_FUNNEL_TARGET}"}"
else
  exit 2
fi
`,
  );
  await writeFile(fakeTailscaled, "#!/usr/bin/env bash\nexit 0\n");
  await writeFile(stateFile, "fixture-state\n");
  await Promise.all([chmod(fakeTmux, 0o755), chmod(fakeTailscale, 0o755), chmod(fakeTailscaled, 0o755)]);

  const nodeHome = path.dirname(path.dirname(process.execPath));
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    UNIBENCH_PROJECT_DIR: fixture,
    UNIBENCH_RUNTIME_DIR: runtime,
    UNIBENCH_NODE_HOME: nodeHome,
    UNIBENCH_FIXED_PUBLIC_URL: fixedUrl,
    UNIBENCH_TAILSCALE_BIN: fakeTailscale,
    UNIBENCH_TAILSCALED_BIN: fakeTailscaled,
    UNIBENCH_TAILSCALE_STATE_FILE: stateFile,
    UNIBENCH_TAILSCALE_SOCKET: socketPath,
    UNIBENCH_TAILSCALE_FUNNEL_TARGET: "http://127.0.0.1:3100",
    UNIBENCH_FIXED_VERIFY_RETRIES: "0",
    UNIBENCH_VERIFY_TIMEOUT: "5",
    HTTP_PROXY: proxyUrl,
    HTTPS_PROXY: proxyUrl,
    ALL_PROXY: proxyUrl,
    NO_PROXY: "",
    http_proxy: proxyUrl,
    https_proxy: proxyUrl,
    all_proxy: proxyUrl,
    no_proxy: "",
  };
  const healthy = await execFileAsync("bash", [fixedPublicStatusScript], { cwd: root, env });
  assert.match(healthy.stdout, /Fixed public URL: healthy/);
  assert.equal(proxyRequests, 0);

  await assert.rejects(
    execFileAsync("bash", [fixedPublicStatusScript], {
      cwd: root,
      env: { ...env, FAKE_FUNNEL_TARGET: "http://127.0.0.1:9999" },
    }),
    (error) => error.code === 1 && /mapping is missing or points at the wrong target/.test(error.stderr),
  );
});

test("starts the managed Tailscale daemon without workspace proxies", async () => {
  const ensureFixedFunnel = await readFile(
    path.join(root, "ops/4090/ensure-fixed-funnel.sh"),
    "utf8",
  );
  const daemonLaunch = ensureFixedFunnel
    .split("\n")
    .find((line) => line.includes('"exec env ') && line.includes("TAILSCALED_BIN"));
  assert.ok(daemonLaunch, "the managed tailscaled launch command must be explicit");
  for (const variable of [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "no_proxy",
  ]) {
    assert.match(daemonLaunch, new RegExp(`-u ${variable}\\b`));
  }
});

test("wires deployment convergence, fixed Funnel recovery, and the release watchdog", async () => {
  const [
    packageJson,
    common,
    update,
    start,
    status,
    publicStatus,
    fixedPublicStatus,
    ensureFixedFunnel,
    deployIfNeeded,
    watchdogLoop,
  ] = await Promise.all([
    readFile(path.join(root, "package.json"), "utf8"),
    readFile(path.join(root, "ops/4090/common.sh"), "utf8"),
    readFile(path.join(root, "ops/4090/update.sh"), "utf8"),
    readFile(path.join(root, "ops/4090/start.sh"), "utf8"),
    readFile(path.join(root, "ops/4090/status.sh"), "utf8"),
    readFile(path.join(root, "ops/4090/public-status.sh"), "utf8"),
    readFile(path.join(root, "ops/4090/fixed-public-status.sh"), "utf8"),
    readFile(path.join(root, "ops/4090/ensure-fixed-funnel.sh"), "utf8"),
    readFile(path.join(root, "ops/4090/deploy-if-needed.sh"), "utf8"),
    readFile(path.join(root, "ops/4090/watchdog-loop.sh"), "utf8"),
  ]);
  const scripts = JSON.parse(packageJson).scripts;
  assert.equal(scripts.prebuild, "bash ops/4090/guard-live-build.sh");
  assert.match(scripts.check, /^npm run check:prebuild && npm run build/);
  assert.match(update, /flock -n 9/);
  assert.match(update, /npm run check:prebuild/);
  assert.match(update, /link-vlm-sample-media\.sh/);
  assert.match(update, /link-l1-phase1-media\.sh/);
  assert.match(update, /UNIBENCH_DEPLOY_BUILD=1 npm run build/);
  assert.match(update, /changed during the release build/);
  assert.ok(update.indexOf("stop.sh") < update.indexOf("npm run build"));
  assert.match(start + status + publicStatus, /verify-assets\.sh/);
  assert.match(common, /unibench-dashboard\.tail4ada12\.ts\.net/);
  assert.match(status, /Deployment status: stale/);
  assert.match(update, /ensure-fixed-funnel\.sh/);
  assert.match(update, /UNIBENCH_FIXED_VERIFY_SCOPE=full/);
  assert.match(update, /UNIBENCH_FIXED_VERIFY_TIMEOUT=60/);
  assert.ok(update.indexOf("DEPLOYED_COMMIT_FILE") < update.indexOf("ensure-fixed-funnel.sh"));
  assert.match(fixedPublicStatus, /status --json/);
  assert.match(fixedPublicStatus, /funnel status/);
  assert.match(fixedPublicStatus, /verify-assets\.sh/);
  assert.match(ensureFixedFunnel, /funnel --bg --https=443/);
  assert.match(ensureFixedFunnel, /TAILSCALE_RESTART_COOLDOWN_SECONDS/);
  assert.match(deployIfNeeded, /source_commit.*deployed_commit/s);
  assert.match(deployIfNeeded, /update\.sh/);
  assert.match(deployIfNeeded, /ensure-fixed-funnel\.sh/);
  assert.match(watchdogLoop, /deploy-if-needed\.sh/);
  assert.match(watchdogLoop, /result="warning"/);
});
