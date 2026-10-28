"use client";

import { CheckCircle2, ChevronLeft, ChevronRight, Compass, Film, LoaderCircle, RotateCcw } from "lucide-react";
import { useState } from "react";
import { eventMarkLabels, oodKind, oodKindLabels, oodLabel, oodRank, typeLabels, type CuratedEpisode } from "../data/curated-dataset";
import { SynchronizedCameraPlayer } from "./synchronized-camera-player";

const categories = {
  clean: { title: "Clean / Success", subtitle: "Complete success trajectory", Icon: CheckCircle2 },
  recovery: { title: "Failure Recovery", subtitle: "Observe deviation and recovery", Icon: RotateCcw },
  ood: { title: "OOD", subtitle: "Visual · Semantic · Behavioral", Icon: Compass },
};

export function CuratedEpisodeCard({ category, episodes, taskName, loading, heading }: {
  category: keyof typeof categories;
  episodes: CuratedEpisode[];
  taskName: string;
  loading: boolean;
  heading?: { title: string; subtitle: string };
}) {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const groupOf = (episode: CuratedEpisode) => category === "ood" ? (episode.oodCondition ?? "") : episode.type;
  const groups = [...new Set(episodes.map(groupOf))].sort((a, b) =>
    category === "ood" ? oodRank(a) - oodRank(b) || a.localeCompare(b) : a.localeCompare(b));
  const activeFilter = filter === "all" || groups.includes(filter) ? filter : "all";
  const list = episodes.filter((episode) => activeFilter === "all" || groupOf(episode) === activeFilter);
  const episode = list.find((item) => item.id === selected) ?? list[0];
  const index = episode ? list.indexOf(episode) : -1;
  const representative = episode?.media.find((item) => item.camera === "cam_head") ?? episode?.media[0];
  const { title: defaultTitle, subtitle: defaultSubtitle, Icon } = categories[category];
  const title = heading?.title ?? defaultTitle;
  const subtitle = heading?.subtitle ?? defaultSubtitle;
  const choose = (id: string) => setSelected(id);

  return <section className={`curatedCard curatedCard-${category}`} aria-label={`${taskName} ${title}`}>
    <div className="curatedCardHeading"><span className="curatedCategoryIcon"><Icon size={21}/></span>
      <div><h4>{title}</h4><p>{subtitle}</p></div>
      <span className="curatedCount">{loading ? "—" : episodes.length}<small>episodes</small></span>
    </div>
    <div className="curatedCardBody">
      {category !== "clean" && !loading && episodes.length > 0
        ? <label className="curatedFilter"><span>{category === "ood" ? "Condition" : "Failure type"}</span>
          <select value={activeFilter} onChange={(event) => { setFilter(event.target.value); setSelected(null); }}>
            <option value="all">{category === "ood" ? "All conditions" : "All types"} · {episodes.length}</option>
            {groups.map((group) => <option value={group} key={group}>
              {category === "ood" ? oodLabel(group) : typeLabels[group as keyof typeof typeLabels]} · {episodes.filter((item) => groupOf(item) === group).length}
            </option>)}
          </select>
        </label>
        : <div className="curatedCardHint">{category === "clean"
          ? "Reference trajectory"
          : category === "ood" ? "Reserved for generalization evaluation" : "Failure and recovery process"}</div>}

      {loading
        ? <div className="curatedEmpty"><LoaderCircle className="curatedSpin"/><p>Loading data index…</p></div>
        : episode && representative ? <div className="curatedEpisodeContent" key={episode.id}>
          {episode.admissionStatus === "staging_not_curated" && <p className="curatedCardHint">Machine validated · sampled-frame evidence present · staged, not admitted</p>}
          <div className="curatedEpisodePicker"><label><span>Choose episode <small>{index + 1} / {list.length}</small></span>
            <select aria-label={`${title} Choose episode`} value={episode.id} onChange={(event) => choose(event.target.value)}>
              {list.map((item) => <option key={item.id} value={item.id}>episode_{item.index}{category === "recovery"
                ? ` · ${typeLabels[item.type]}`
                : category === "ood" ? ` · ${oodLabel(item.oodCondition)}` : ""} · seed {item.seed}</option>)}
            </select>
          </label><div>
            <button aria-label={`${title} previous`} disabled={index <= 0} onClick={() => choose(list[index - 1].id)}><ChevronLeft size={17}/></button>
            <button aria-label={`${title} next`} disabled={index >= list.length - 1} onClick={() => choose(list[index + 1].id)}><ChevronRight size={17}/></button>
          </div></div>
          <div className="episodeInstruction"><span>Instruction · 任务指令</span><p>{episode.instruction || "No instruction recorded"}</p></div>
          <SynchronizedCameraPlayer media={episode.media}
            title={`${taskName} ${title} episode_${episode.index}`}
            traceId={episode.id}
            marks={episode.marks.map((mark) => ({ label: eventMarkLabels[mark.label] ?? mark.label, seconds: mark.seconds }))}/>
          <div className="curatedClipMeta">
            <span>{episode.oodCondition ? `${oodKindLabels[oodKind(episode.oodCondition)!]} · ${oodLabel(episode.oodCondition)}` : typeLabels[episode.type]}</span>
            <span>{representative.fps} fps · {representative.frames.toLocaleString()} frames</span>
          </div>
          <details className="curatedDetails"><summary>Episode data identity</summary>
            <dl><dt>Scene seed</dt><dd>{episode.seed} (initialization seed, not the episode index)</dd>
              <dt>Episode ID</dt><dd>{episode.id}</dd>
              <dt>Camera SHA-256</dt><dd>{episode.media.map((item) => `${item.camera}: ${item.sha256}`).join(" · ")}</dd>
              <dt>Collector revision</dt><dd>{episode.sourceCommit ?? "Not recorded"}</dd>
              <dt>{episode.admissionStatus === "staging_not_curated" ? "Staged manifest" : "Curated manifest"}</dt><dd>{episode.manifest}</dd>
              {episode.reviewScope && <><dt>Review scope</dt><dd>{episode.reviewScope}</dd>
                <dt>Validator SHA-256</dt><dd>{episode.validatorSha256}</dd>
                <dt>Frame-review SHA-256</dt><dd>{episode.reviewSha256}</dd></>}
            </dl>
          </details>
        </div>
        : <div className="curatedEmpty"><div className="curatedEmptyArt"><span/><span/><div>{category === "ood" ? <Compass size={34}/> : <Film size={34}/>}</div></div>
          <h5>{category === "ood" ? "OOD evidence pending" : "No curated sample"}</h5>
          <p>{category === "ood" ? "No admitted sample is available for this OOD type and task." : "This task has no admitted sample for this category."}</p>
          <span className="curatedEmptyTag">{category === "ood" ? "Pending · 0 episodes" : "Awaiting admission"}</span>
        </div>}
    </div>
  </section>;
}
