"use client";
/* eslint-disable @next/next/no-img-element -- pre-sized static WebP frames; this static build has no image optimisation pipeline */

// The Overview below the hero, in the manuscript's order: the question (Sec. 1), the benchmark
// (Sec. 3), the hybrid agent (Sec. 4), the findings (Sec. 5). Numbers come from the manuscript
// bundle through data/overview.ts; images from data/overview-media.ts.
import { ArrowRight, ArrowUpRight, Play } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  answeringVsActing, CONDITIONS, casesPerTask, demosPerTask, familyTsr, galleryTasks, hybridRuns, overviewStats,
  overviewTags, replay, strengthRows, trackSizes, visualShift,
} from "../data/overview";
import { conditionMedia, figureMedia, taskMedia } from "../data/overview-media";
import { tracks, type TrackId } from "../data/metric-plan";
import type { ScenarioTag } from "../data/scenario-plan";
import { MethodMarquee } from "./method-marquee";
import { CapabilityIcon, TrackIcon } from "./podium";

const TRACK_UNITS: Record<TrackId, string> = { T1: "VLM agents", T2: "world models", T3: "policies in Isaac Sim", T4: "policies on a real robot" };

const pp = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)} pp`;

function Heading({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children?: ReactNode }) {
  return <div className="storyHead">
    <p className="eyebrow">{eyebrow}</p>
    <h2 id={id}>{title}</h2>
    {children && <p className="storyLede">{children}</p>}
  </div>;
}

export function OverviewQuestion() {
  return <section className="storySection storyQuestion" aria-labelledby="story-question-title">
    <p className="eyebrow">Why RoboExam</p>
    <h2 id="story-question-title">Where does each system excel, how does it respond to changing conditions, and how are its components&apos; outputs used during execution?</h2>
    <div className="questionBody">
      <p>Robotic agents now combine vision-language reasoning, action-outcome prediction and robot control. Yet VLMs are scored on embodied question answering, world models on future video and policies on task execution, each with its own tasks and conditions. Those scores cannot be compared, and none of them shows how one component&apos;s output changes what the robot does next.</p>
      <p>{`RoboExam puts all three on the same ${overviewStats.tasks} manipulation tasks and ${overviewStats.simCases} simulation cases, adds a real-robot track, and links every forecast to the decision and the physical outcome that follow.`}</p>
    </div>
  </section>;
}

/** Plays each tile's training clip while it is on screen; the still frame shows until the clip runs. */
function useGalleryPlayback() {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const video = entry.target as HTMLVideoElement;
        if (entry.isIntersecting) {
          if (!video.src && video.dataset.src) video.src = video.dataset.src;
          void video.play().catch(() => undefined);
        } else if (video.src) video.pause();
      }
    }, { rootMargin: "120px 0px", threshold: 0.2 });
    root.querySelectorAll("video").forEach((video) => observer.observe(video));
    return () => observer.disconnect();
  }, []);
  return ref;
}

function TaskTile({ task, dimmed, onOpen }: { task: (typeof galleryTasks)[number]; dimmed: boolean; onOpen: (taskId: string) => void }) {
  const media = taskMedia(task.id);
  // the clip is cropped exactly like its still frame
  const crop = media?.crop;
  const frame = crop ? { width: `${100 / crop.w}%`, height: `${100 / crop.h}%`, left: `${(-100 * crop.x) / crop.w}%`, top: `${(-100 * crop.y) / crop.h}%` } : undefined;
  return <li className={`taskTile ${dimmed ? "dimmed" : ""}`}>
    <button type="button" onClick={() => onOpen(task.id)} aria-label={`Play ${task.name} in Datasets`}>
      <figure>
        {media && <img src={media.image} width={media.width} height={media.height} alt="" loading="lazy" decoding="async"/>}
        {media && <video data-src={media.clip} style={frame} muted loop playsInline preload="none" aria-hidden="true" tabIndex={-1}
          onPlaying={(event) => event.currentTarget.classList.add("isPlaying")}/>}
        <span className="taskPlay" aria-hidden="true"><Play size={16} fill="currentColor"/></span>
        <figcaption><span>{task.name}</span>{task.isNew && <b>New</b>}</figcaption>
      </figure>
    </button>
  </li>;
}

export function OverviewBenchmark({ onTrack, onOpenTask }: { onTrack: (track: TrackId) => void; onOpenTask: (taskId: string) => void }) {
  const [tag, setTag] = useState<ScenarioTag | null>(null);
  const gallery = useGalleryPlayback();
  const active = overviewTags.find((item) => item.id === tag) ?? null;
  const figure = figureMedia.tracks;
  return <section className="storySection storyBenchmark" aria-labelledby="story-benchmark-title">
    <Heading id="story-benchmark-title" eyebrow="The benchmark" title={`${overviewStats.tasks} tasks, five conditions, four tracks.`}>
      {`${overviewStats.tasks - overviewStats.newTasks} tasks are adapted from RoboDojo and ${overviewStats.newTasks} are new, all on a dual-arm ARX X5 in Isaac Sim. Each has ${demosPerTask} training demonstrations and ${casesPerTask} evaluation cases: ${overviewStats.demos.toLocaleString("en-US")} demonstrations and ${overviewStats.simCases} cases in all.`}
    </Heading>

    <div className="tagFilter" role="group" aria-label="Filter tasks by capability tag">
      <button type="button" aria-pressed={tag === null} onClick={() => setTag(null)}>{`All ${overviewStats.tasks}`}</button>
      {overviewTags.map((item) => <button type="button" key={item.id} aria-pressed={tag === item.id} onClick={() => setTag(tag === item.id ? null : item.id)}>
        <CapabilityIcon tag={item.id} size={20}/><b>{item.letter}</b>{item.label}<small>{item.tasks.length}</small>
      </button>)}
    </div>
    <p className="tagRule" aria-live="polite">{active ? `${active.label}: ${active.rule}` : "Six overlapping tags describe what each task needs. Pick one to filter; click a task to watch it in Datasets."}</p>
    <ul className="taskGallery" ref={gallery} aria-label="The 24 simulation tasks">
      {galleryTasks.map((task) => <TaskTile key={task.id} task={task} dimmed={tag !== null && !task.tags.includes(tag)} onOpen={onOpenTask}/>)}
    </ul>

    <div className="conditionBlock">
      <h3>Every task runs under five conditions</h3>
      <ol className="conditionStrip">
        {CONDITIONS.map((condition) => {
          const sim = conditionMedia("sim", condition.id);
          const real = conditionMedia("real", condition.id);
          return <li key={condition.id}>
            <div className="conditionShots">
              {sim && <img src={sim.image} width={sim.width} height={sim.height} alt={`Simulation, ${condition.label}`} loading="lazy"/>}
              {real && <img src={real.image} width={real.width} height={real.height} alt={`Real robot, ${condition.label}`} loading="lazy"/>}
            </div>
            <strong>{condition.label}</strong>
            <p>{condition.rule}</p>
          </li>;
        })}
      </ol>
      <p className="figureNote">Top: Store tools in simulation. Bottom: towel folding on the real robot. Frames from Figure 3 of the paper.</p>
    </div>

    <figure className="paperFigure">
      <div className="figureScroll"><img src={figure.image} width={figure.width} height={figure.height} alt="Figure 2 of the paper: one shared case evaluated by the four tracks" loading="lazy"/></div>
      <figcaption>One shared case, four ways to evaluate it (Figure 2). T1 runs VLM agents through a robot-control harness with separate VQA probes, T2 predicts video for fixed actions, and T3 and T4 deploy policies in simulation and on a real robot.</figcaption>
    </figure>
    <nav className="trackLinks" aria-label="Open a track leaderboard">
      {tracks.map((track) => <button type="button" key={track.id} onClick={() => onTrack(track.id)}>
        <TrackIcon track={track.id} size={34}/>
        <span><b>{track.title}</b><small>{`${track.id} · ${trackSizes[track.id]} ${TRACK_UNITS[track.id]}`}</small></span>
        <ArrowUpRight size={16} aria-hidden="true"/>
      </button>)}
    </nav>
  </section>;
}

export function OverviewHybrid() {
  const direct = hybridRuns.find((run) => run.id === "direct");
  const forecast = hybridRuns.find((run) => run.id === "forecast");
  const figure = figureMedia.hybrid;
  return <section className="storySection storyHybrid" aria-labelledby="story-hybrid-title">
    <Heading id="story-hybrid-title" eyebrow="A hybrid agent" title="Does seeing the future help a robot act?">
      We added an optional world-model forecast to PyRUA-Lean, a VLM-driven robot-control agent running DeepSeek-V4.1 Flash. Before it acts, the agent can preview a candidate plan as LingBot-VA video, then keep or revise the plan.
    </Heading>
    <figure className="paperFigure">
      <div className="figureScroll"><img src={figure.image} width={figure.width} height={figure.height} alt="Figure 4 of the paper: the hybrid agent's pipeline and forecast comparison" loading="lazy"/></div>
      <figcaption>The agent loop and how forecasts are compared with ground truth under the same actions (Figure 4).</figcaption>
    </figure>
    {direct && forecast && <div className="hybridNumbers">
      <div><span>Without forecasting</span><b>{`${direct.tsr.toFixed(1)}%`}</b><small>{`TSR · Subtask ${direct.subtask.toFixed(1)}`}</small></div>
      <div><span>With forecasting</span><b>{`${forecast.tsr.toFixed(1)}%`}</b><small>{`TSR · Subtask ${forecast.subtask.toFixed(1)}`}</small></div>
      <p>{`On the same ${overviewStats.simCases} cases, forecasting adds ${pp(forecast.tsr - direct.tsr)}, which is not statistically significant. To see why, decision replay restores ${replay.points} recorded decision points and changes only the video the agent sees: none, one of four world models, or the simulator's ground truth.`}</p>
    </div>}
  </section>;
}

export function OverviewFindings() {
  const maxGap = Math.max(...strengthRows.map((row) => Math.abs(row.gapPp)));
  const maxDrop = Math.max(...visualShift.rows.map((row) => Math.abs(row.pp)));
  const { repairs } = replay;
  return <section className="storySection storyFindings" aria-labelledby="story-findings-title">
    <Heading id="story-findings-title" eyebrow="Findings" title="What the shared tasks show."/>
    <div className="findingsGrid">
      <article className="findingCard">
        <h3>Similar averages, opposite strengths</h3>
        <p className="findingLead">{`VLM agents average ${familyTsr.T1.toFixed(1)}% TSR and policies ${familyTsr.T3.toFixed(1)}%, yet each wins different tasks.`}</p>
        <div className="findingBody">
        <ul className="divergeBars" aria-label="Tasks with the largest gap between mean VLM-agent and mean policy TSR">
          {strengthRows.map((row) => {
            const width = `${(Math.abs(row.gapPp) / maxGap) * 50}%`;
            const agents = row.gapPp > 0;
            return <li key={row.id} title={`${row.task}: VLM agents ${row.t1.toFixed(1)}% vs policies ${row.t3.toFixed(1)}% TSR`}
              aria-label={`${row.task}: ${agents ? "VLM agents" : "policies"} lead by ${Math.abs(row.gapPp).toFixed(1)} points`}>
              <span className="barLabel"><span>{row.task}</span><b>{pp(row.gapPp)}</b></span>
              <span className="divergeTrack"><i className={agents ? "agents" : "policies"} style={agents ? { left: "50%", width } : { right: "50%", width }}/></span>
            </li>;
          })}
        </ul>
        <div className="divergeLegend" aria-hidden="true"><span><i className="swatch agents"/>VLM agents lead</span><span><i className="swatch policies"/>Policies lead</span></div>
        </div>
      </article>

      <article className="findingCard">
        <h3>Visual change hurts most</h3>
        <p className="findingLead">New textures, lighting, backgrounds, distractors or viewpoints cost policies and the hybrid agent the most success and more than double world-model error. VLM agents barely notice.</p>
        <div className="findingBody">
        <ul className="dropBars" aria-label="Change in TSR from ID to visual OOD">
          {visualShift.rows.map((row) => <li key={row.id} title={`${row.label} (${row.detail}): ${pp(row.pp)} TSR from ID to V-OOD`}>
            <span className="barLabel"><span>{row.label}<small>{row.detail}</small></span><b>{pp(row.pp)}</b></span>
            <span className="dropTrack"><i style={{ width: `${(Math.abs(row.pp) / maxDrop) * 100}%` }}/></span>
          </li>)}
        </ul>
        <div className="ratioTiles" aria-label="T2 world-model error under visual OOD relative to ID">
          <div><b>{`×${visualShift.t2.ee.toFixed(2)}`}</b><span>EE-position error</span></div>
          <div><b>{`×${visualShift.t2.mmse.toFixed(2)}`}</b><span>M-MSE</span></div>
        </div>
        </div>
      </article>

      <article className="findingCard">
        <h3>Seeing the true future rarely fixes a failed plan</h3>
        <p className="findingLead">{`At the ${replay.planFails} decision points where the original plan fails, the agent reaches its local goal this often:`}</p>
        <div className="findingBody">
        <ul className="replayBars" aria-label={`Local-goal attainment at ${replay.planFails} failed-plan points, by supplied video`}>
          {replay.rows.map((row) => <li key={row.forecast} className={row.forecast === "GT" ? "emphasis" : ""} title={`${row.forecast}: ${row.planFails} of ${replay.planFails}; ${row.all} of ${replay.points} over all points`}>
            <span className="barLabel"><span>{row.forecast === "Blank" ? "No video" : row.forecast === "GT" ? "Ground truth" : row.forecast}</span><b>{`${row.planFails} / ${replay.planFails}`}</b></span>
            <span className="replayTrack"><i style={{ width: `${(row.planFails / replay.planFails) * 100}%` }}/></span>
          </li>)}
        </ul>
        </div>
        <p className="findingFoot">{`A repair exists at ${repairs.repairablePoints} of the ${repairs.unsolvedFailedPoints} points nothing solved, yet fresh runs find it ${repairs.blank.successes} of ${repairs.blank.n} times without video and ${repairs.gt.successes} of ${repairs.gt.n} with ground truth.`}</p>
      </article>
    </div>
    <p className="findingNote">{`Answering is not acting: T1 agents score ${answeringVsActing.vqa[0].toFixed(0)}–${answeringVsActing.vqa[1].toFixed(0)}% on VQA but complete only ${answeringVsActing.tsr[0].toFixed(0)}–${answeringVsActing.tsr[1].toFixed(0)}% of tasks.`}</p>
  </section>;
}

export function OverviewExplore({ onLeaderboards, onDatasets }: { onLeaderboards: () => void; onDatasets: () => void }) {
  return <section className="storySection storyExplore" aria-labelledby="story-explore-title">
    <Heading id="story-explore-title" eyebrow="Explore" title="Every result in the paper, on the leaderboard.">
      Table 1, the per-condition and per-metric breakdowns, the real-robot runs, and the training and evaluation data.
    </Heading>
    <div className="heroCtas storyCtas">
      <button type="button" className="heroPrimary" onClick={onLeaderboards}>Explore leaderboards <ArrowRight size={17}/></button>
      <button type="button" className="heroSecondary" onClick={onDatasets}>Datasets <ArrowUpRight size={16}/></button>
    </div>
    <MethodMarquee/>
  </section>;
}
