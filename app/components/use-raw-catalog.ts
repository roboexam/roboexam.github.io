"use client";

import { useCallback, useEffect, useState } from "react";
import type { RawCatalog } from "../data/raw-review";

export async function readRaw<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 503 ? "公盘暂时不可读，稍后自动重试" : "数据读取失败，请刷新重试");
  return response.json();
}

/** One completed catalog request drives the task and episode refresh in both views. */
export function useRawCatalog() {
  const [catalog, setCatalog] = useState<RawCatalog | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [request, setRequest] = useState(0);
  const refresh = useCallback(() => setRequest(value => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function update(force: boolean) {
      let delay = 30000;
      setLoading(true);
      try {
        const value = await readRaw<RawCatalog>(`/api/raw-review${force ? "?refresh=1" : ""}`, controller.signal);
        if (value.schemaVersion !== "roboexam.raw-review.v1") throw new Error("公盘索引版本不一致");
        if (controller.signal.aborted) return;
        delay = Math.max(1000, value.refreshSeconds * 1000) + 100;
        setCatalog(value); setError(""); setRevision(value => value + 1);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "公盘读取失败");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          // Schedule after completion: a slow directory scan must not be aborted by its own poll.
          const poll = () => {
            if (document.hidden) timer = setTimeout(poll, delay);
            else void update(false);
          };
          timer = setTimeout(poll, delay);
        }
      }
    }
    void update(request > 0);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [request, refresh]);

  useEffect(() => {
    const visible = () => { if (!document.hidden) refresh(); };
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  return { catalog, error, loading, revision, refresh };
}

export type RawCatalogState = ReturnType<typeof useRawCatalog>;
