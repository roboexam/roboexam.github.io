import { spawn } from "node:child_process";
import path from "node:path";
import { validateActionTrace, type ActionTrace } from "./action-trace.ts";

export type TraceInput = { format: "hdf5" | "parquet"; episodeId: string; originalEpisodeId: string | null;
  taskName: string; manifestSha256: string; bindingSha256: string; expectedTrajectorySha256: string | null;
  officialState20D: boolean; sourceFrames: number | null; fps: number | null; videoFrames: number | null; videoDuration: number | null };
export type TraceResult = { status: "available"; trace: ActionTrace } | { status: "unavailable"; reason: string };
export type TraceExtractor = (fd: number, input: TraceInput) => Promise<TraceResult>;
let active = 0;
const queue: (() => void)[] = [];
const unavailable = (reason: string): TraceResult => ({ status: "unavailable", reason });

/** At most two bounded CPU readers; stdin is server metadata, fd 3 is read-only. */
export const extractRawActionTrace: TraceExtractor = async (fd, input) => {
  if (active >= 2) {
    if (queue.length >= 16) return unavailable("reader_busy");
    await new Promise<void>(resolve => queue.push(resolve));
  } else active++;
  try {
    return await new Promise<TraceResult>(resolve => {
      const child = spawn(process.env.DASHBOARD_RAW_TRACE_PYTHON ??
        "/mnt/gyc_ckp/benchmark2027/runtime/caches/dashboard_raw_action_traces/v1/python/bin/python",
      [path.join(process.cwd(), "scripts/read-raw-action-trace.py")], {
        stdio: ["pipe", "pipe", "pipe", fd],
        env: { ...process.env, OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1", MKL_NUM_THREADS: "1", ARROW_NUM_THREADS: "1", CUDA_VISIBLE_DEVICES: "", PYTHONDONTWRITEBYTECODE: "1" },
      });
      const chunks: Buffer[] = []; let length = 0; let settled = false;
      function done(result: TraceResult) { if (!settled) { settled = true; clearTimeout(timer); resolve(result); } }
      const timer = setTimeout(() => { child.kill("SIGKILL"); done(unavailable("reader_timeout")); }, 20000);
      child.stdout!.on("data", (chunk: Buffer) => {
        length += chunk.length;
        if (length > 1024 * 1024) { child.kill("SIGKILL"); done(unavailable("invalid_trace_output")); }
        else chunks.push(chunk);
      });
      child.stderr!.resume(); // Never expose Python paths or data diagnostics to browsers.
      child.on("error", () => done(unavailable("reader_unavailable")));
      child.on("close", code => {
        if (settled) return;
        if (code !== 0) return done(unavailable("reader_failed"));
        try {
          const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (value.status === "unavailable" && /^[a-z_]{1,80}$/.test(value.reason)) return done(unavailable(value.reason));
          if (value.status !== "available") throw new Error("invalid_result");
          const trace = validateActionTrace(value.trace, input.episodeId,
            { url: "", bindingSha256: input.bindingSha256, manifestSha256: input.manifestSha256 });
          done({ status: "available", trace });
        } catch { done(unavailable("invalid_trace_output")); }
      });
      child.stdin!.on("error", () => { /* A bounded child can exit before reading stdin. */ });
      child.stdin!.end(JSON.stringify(input));
    });
  } finally {
    const next = queue.shift();
    if (next) next(); else active--;
  }
};
