"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, CircleDot, MessageSquareText, Palette, Route, RotateCcw, Search, ShieldCheck } from "lucide-react";
import { curatedDataset as dataset, oodKind, partitionEpisodes, type CuratedChunk, type CuratedTask, type OodKind } from "../data/curated-dataset";
import { scenarioFor, scenarioTags, tagsForScenario, type ScenarioTag } from '../data/scenario-plan';
import { ScenarioTags } from './scenario-tags';
import { CuratedEpisodeCard } from "./curated-episode-card";

type RegimeId = "id" | OodKind | "recovery";
const regimes = [
  { id: "id", short: "ID", title: "In-distribution", subtitle: "Reference task contract", Icon: CircleDot },
  { id: "visual", short: "V-OOD", title: "Visual OOD", subtitle: "Appearance · lighting · camera", Icon: Palette },
  { id: "semantic", short: "S-OOD", title: "Semantic OOD", subtitle: "Equivalent language shifts", Icon: MessageSquareText },
  { id: "behavioral", short: "B-OOD", title: "Behavioral OOD", subtitle: "Novel goals · compositions", Icon: Route },
  { id: "recovery", short: "REC", title: "Failure Recovery", subtitle: "Deviation · correction · return", Icon: RotateCcw },
] as const;
function supportsRegime(task: CuratedTask, regime: RegimeId) {
  if (regime === "id") return task.clean > 0;
  if (regime === "recovery") return task.recovery > 0;
  return task.oodConditions.some((condition) => oodKind(condition) === regime);
}

function TaskWorkspace({ task }: { task: CuratedTask }) {
  const [chunk, setChunk] = useState<CuratedChunk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [regime, setRegime] = useState<RegimeId>("id");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(task.dataUrl, { signal: controller.signal });
        if (!response.ok) throw new Error("The index is temporarily unavailable");
        const bytes = await response.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const hash = Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("");
        if (hash !== task.sha256) throw new Error("Index integrity check failed; refresh and try again");
        const data: CuratedChunk = JSON.parse(new TextDecoder().decode(bytes));
        if (data.taskId !== task.id || data.catalogSha256 !== dataset.catalogSha256 || data.episodes.length !== task.count) throw new Error("Task index does not match the catalog");
        if (!controller.signal.aborted) setChunk(data);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Loading failed");
      }
    }
    void load();
    return () => controller.abort();
  }, [task.id, task.dataUrl, task.sha256, task.count, retry]);
  if (error) return <div className="curatedError" role="alert">{error}. <button onClick={() => { setError(null); setRetry(retry + 1); }}>Retry</button></div>;
  const split = partitionEpisodes(chunk?.episodes ?? []);
  const episodesByRegime: Record<RegimeId, typeof split.clean> = {
    id: split.clean,
    visual: split.ood.filter((episode) => oodKind(episode.oodCondition) === "visual"),
    semantic: split.ood.filter((episode) => oodKind(episode.oodCondition) === "semantic"),
    behavioral: split.ood.filter((episode) => oodKind(episode.oodCondition) === "behavioral"),
    recovery: split.recovery,
  };
  const active = regimes.find((item) => item.id === regime)!;
  return <div className="regimeExplorer">
    <div className="regimeRail" role="tablist" aria-label={`${task.name} evaluation regimes`}>
      {regimes.map(({ id, short, title, subtitle, Icon }) => <button type="button" role="tab" key={id}
        aria-selected={regime === id} aria-controls="regime-episode-panel" onClick={() => setRegime(id)}>
        <span className="regimeIcon"><Icon size={18}/></span>
        <span><small>{short}</small><strong>{title}</strong><em>{subtitle}</em></span>
        <b>{chunk ? episodesByRegime[id].length : "—"}</b>
      </button>)}
    </div>
    <div className="regimePanel" id="regime-episode-panel" role="tabpanel" aria-live="polite">
      <CuratedEpisodeCard
        category={regime === "id" ? "clean" : regime === "recovery" ? "recovery" : "ood"}
        heading={{ title: active.title, subtitle: active.subtitle }}
        taskName={task.name} episodes={episodesByRegime[regime]} loading={!chunk} />
    </div>
  </div>;
}

// A native <select> cannot be column-aligned: macOS draws the popup itself and
// ignores font-family and padding on <option>, so per-task counts never line
// up. This is a listbox of the same data laid out on a CSS grid instead.
function TaskPicker({ tasks, value, onChange }: { tasks: CuratedTask[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const current = tasks.find((task) => task.id === value) ?? null;
  const currentIndex = current ? tasks.indexOf(current) : -1;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  // Seeded here rather than in an effect: setting state synchronously inside
  // one cascades renders, and the highlighted row only ever changes on open.
  function openList() {
    setActive(currentIndex >= 0 ? currentIndex : 0);
    setOpen(true);
  }

  function choose(index: number) {
    const task = tasks[index];
    if (task) onChange(task.id);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openList();
      }
      return;
    }
    if (event.key === "Escape" || event.key === "Tab") { setOpen(false); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => Math.min(index + 1, tasks.length - 1)); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); return; }
    if (event.key === "Home") { event.preventDefault(); setActive(0); return; }
    if (event.key === "End") { event.preventDefault(); setActive(tasks.length - 1); return; }
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(active); }
  }

  return <div className="curatedPicker" ref={box}>
    <button type="button" className="curatedPickerButton" aria-haspopup="listbox" aria-expanded={open}
      aria-controls="curated-task-listbox" disabled={!tasks.length}
      onClick={() => (open ? setOpen(false) : openList())} onKeyDown={onKeyDown}>
      <span className="curatedSrOnly">Choose task</span>
      {current
        ? <><b>{currentIndex + 1}.</b><span>{current.name}</span><em>{current.count} episodes</em></>
        : <span>{tasks.length ? "Choose a task" : "No matching tasks"}</span>}
      <ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && tasks.length > 0 && <div className="curatedPickerPanel">
      <div className="curatedPickerHead" aria-hidden="true"><span /><span>Task</span><span>Total</span><span>Success</span><span>Recovery</span><span>OOD</span></div>
      <ul className="curatedPickerList" id="curated-task-listbox" role="listbox" ref={list}
        tabIndex={-1} aria-activedescendant={`curated-task-option-${active}`}>
        {tasks.map((task, index) => <li key={task.id} id={`curated-task-option-${index}`} role="option"
          aria-selected={task.id === value} data-active={index === active} tabIndex={-1}
          onPointerEnter={() => setActive(index)} onClick={() => choose(index)} onKeyDown={onKeyDown}>
          <span className="curatedPickerIndex">{index + 1}</span>
          <span className="curatedPickerName">{task.name}</span>
          <span className="curatedPickerTotal">{task.count}</span>
          <span className="curatedPickerClean">{task.clean}</span>
          <span className="curatedPickerRecovery">{task.recovery}</span>
          <span className="curatedPickerOod">{task.ood}</span>
        </li>)}
      </ul>
    </div>}
  </div>;
}

function TaskHeading({ task }: { task: CuratedTask }) {
  const scene = scenarioFor(task.id);
  return <div className="curatedTaskTitle"><div><h3>{task.name}</h3>{scene && <ScenarioTags scene={scene}/>}</div><div className="curatedTaskCounts"><span>{task.clean} clean</span><span>{task.recovery} recovery</span><span>{task.ood} OOD</span></div></div>;
}

function NoMatch() {
  return <div className="curatedNoMatch"><Search size={25} /><h3>No matching tasks</h3><p>Try a shorter query or clear one of the capability filters.</p></div>;
}

export function DatasetExplorer({ initialTaskId }: { initialTaskId?: string } = {}) {
  // Open on whatever sorts first rather than pinning one team member's task.
  const [taskId, setTaskId] = useState(initialTaskId ?? dataset.tasks[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<ScenarioTag[]>([]);
  const allTags = Object.keys(scenarioTags) as ScenarioTag[];
  const filtered = dataset.tasks.filter((t) => {
    const textMatch = `${t.id} ${t.name} ${t.instruction}`.toLowerCase().includes(query.trim().toLowerCase());
    return textMatch && selectedTags.every((tag) => { const scene = scenarioFor(t.id); return scene ? tagsForScenario(scene).includes(tag) : false; });
  });
  const task = taskId ? filtered.find((t) => t.id === taskId) ?? filtered[0] ?? null : selectedTags.length ? null : filtered[0] ?? null;
  const position = task ? filtered.indexOf(task) : -1;
  function move(delta: number) {
    if (!filtered.length) return;
    setTaskId(filtered[(position + delta + filtered.length) % filtered.length].id);
  }
  function toggleTag(tag: ScenarioTag) {
    setSelectedTags((current) => current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag]);
  }
  return <div className="curatedBrowser">
    <div className="datasetCohortSummary" aria-label="Five evaluation regimes">{regimes.map(({ id, short, title, subtitle, Icon }) =>
      <article key={id} className={`cohortSummary-${id}`}><div><span className="cohortSummaryIcon"><Icon size={17}/></span>
        <span><small>{short}</small><strong>{title}</strong></span>
        <b>{filtered.filter((item) => supportsRegime(item, id)).length}<small>tasks</small></b>
      </div><p>{subtitle}</p></article>)}</div>
    <section className="curatedTaskbar" aria-label="Task filters">
      <label className="curatedSearch"><Search size={17} /><span className="curatedSrOnly">Search tasks</span><input type="search" placeholder="Search tasks…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <div className="curatedTaskSelect"><TaskPicker tasks={filtered} value={task?.id ?? ""} onChange={setTaskId} /></div>
      <div className="curatedTaskPaging"><button aria-label="Previous task" onClick={() => move(-1)} disabled={!task || !filtered.length}><ArrowLeft size={17} /></button><span>{task ? `${position + 1} / ${filtered.length}` : `${filtered.length} matching tasks`}</span><button aria-label="Next task" onClick={() => move(1)} disabled={!task || !filtered.length}><ArrowRight size={17} /></button></div>
    </section>
    <section className="curatedTagbar" aria-label="Task capability filters"><div className="curatedTagHeading"><strong>Capability tags</strong><span>Match all selected</span></div>
      <div className="curatedTagOptions">
        {allTags.map((tag) => <label className={`curatedTagOption ${selectedTags.includes(tag) ? "selected" : ""}`} key={tag}>
          <input type="checkbox" checked={selectedTags.includes(tag)} onChange={() => toggleTag(tag)} />
          <span className="curatedTagCode">{tag}</span><span>{scenarioTags[tag].label}</span>
        </label>)}
        {selectedTags.length > 0 && <button className="curatedClearTags" onClick={() => setSelectedTags([])}>Clear filters</button>}
      </div>
      <p className="scenarioLegend">Proposal tags include candidate H and variant-only assignments. Recording contracts remain unchanged.</p>
    </section>
    {task ? <>
      <TaskHeading task={task} />
      <TaskWorkspace key={task.id} task={task} />
    </> : <NoMatch />}
    <div className="curatedFootnote"><ShieldCheck size={18} /><p>Episode records are not model success rates. Arrange / Solve OOD records await admission.</p></div>
  </div>;
}
