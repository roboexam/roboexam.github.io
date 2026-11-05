/* eslint-disable @next/next/no-img-element -- Static GitHub Pages deployment has no image optimizer. */
import { ArrowRight, CheckCircle2, ExternalLink } from "lucide-react";
import { publicResults } from "../data/public-results";

const programCards = [
  {
    number: "01",
    title: "Invited talks",
    description: "Perspectives on foundation models, world models, robot learning, and deployment.",
    meta: "8 confirmed · 2 tentative",
  },
  {
    number: "02",
    title: "Research program",
    description: "Archival papers, accepted-paper posters, demonstrations, and a Best Paper presentation.",
    meta: "5–8-page papers",
  },
  {
    number: "03",
    title: "RoboExam competition",
    description: "Four embodied-system tracks connected through a shared task-and-intervention registry.",
    meta: "ID · OOD · Recovery",
  },
] as const;

const agenda = [
  ["13:00", "Opening", "Learning from failure"],
  ["13:10", "Invited talks I", "Learner–evaluator co-adaptation"],
  ["14:10", "Best Paper", "Presentation and award"],
  ["14:25", "Posters & demos", "Accepted papers and demonstrations"],
  ["15:15", "Coffee break", "Networking"],
  ["15:30", "Invited talks II", "Cross-agent transfer and retention"],
  ["16:30", "RoboExam", "Results and awards"],
  ["16:45", "Synthesis panel", "Audience case vote and reporting guidance"],
] as const;

const speakers = [
  ["Sergey Levine", "UC Berkeley", "https://people.eecs.berkeley.edu/~svlevine/"],
  ["Daniela Rus", "MIT CSAIL", "https://www.csail.mit.edu/person/daniela-rus"],
  ["Peter Stone", "The University of Texas at Austin", "https://www.cs.utexas.edu/~pstone/"],
  ["Cynthia Breazeal", "MIT Media Lab", "https://www.media.mit.edu/people/cynthiab/overview/"],
  ["Chelsea Finn", "Stanford University", "https://profiles.stanford.edu/chelsea-finn"],
  ["Kate Saenko", "Boston University / Meta FAIR", "https://ai.bu.edu/ksaenko.html"],
  ["Jeannette Bohg", "Stanford University", "https://web.stanford.edu/~bohg/"],
  ["Marios Savvides", "Carnegie Mellon University", "https://www.mariossavvides.com/"],
  ["Katerina Fragkiadaki", "Carnegie Mellon University", "https://www.cs.cmu.edu/~katef/"],
  ["Xiaozhu Ju", "X-Humanoid", "https://openreview.net/profile?id=~Xiaozhu_Ju1"],
] as const;

const evaluationScenes = [
  {
    mode: "SIM",
    title: "Reference-conditioned arrangement",
    description: "Visual grounding and long-horizon ordering under controlled scene variation.",
    video: "/samples/arrange-number-reference.mp4",
    poster: "/samples/arrange-number-reference.webp",
  },
  {
    mode: "SIM",
    title: "Closed-loop manipulation",
    description: "Policy execution with task progress, intervention, and recovery evidence.",
    video: "/samples/stack-bowls-policy.mp4",
    poster: "/samples/stack-bowls-policy.webp",
  },
  {
    mode: "SIM",
    title: "Failure and recovery",
    description: "Matched failure cases test whether an update repairs execution rather than only its explanation.",
    video: "/samples/stack-bowls-failure.mp4",
    poster: "/samples/stack-bowls-failure.webp",
  },
  {
    mode: "REAL",
    title: "Dual-arm towel folding",
    description: "AgileX manipulation with deformable-object and coordination challenges.",
    image: "/scenes/agilex-towel.webp",
  },
  {
    mode: "REAL",
    title: "Button sequencing",
    description: "Tianyi dual-arm execution conditioned on ordered visual cues.",
    image: "/scenes/tianyi-buttons.webp",
  },
  {
    mode: "REAL",
    title: "Semantic placement",
    description: "Tianyi object placement tests visual matching and physically grounded action.",
    image: "/scenes/tianyi-vegetables.webp",
  },
] as const;

const resultStats = [
  { value: "24", label: "shared tasks", detail: "reasoning, prediction, and execution" },
  { value: "3", label: "T1 final baselines", detail: "all five settings complete" },
  { value: "1,800", label: "T2 completed cases", detail: "three models across five regimes" },
  { value: "1,440", label: "T3 completed episodes", detail: "three models across four settings" },
] as const;

const t2MetricViews = [
  { key: "psnr", label: "PSNR", direction: "↑", max: 30, digits: 2, suffix: " dB" },
  { key: "ssim", label: "SSIM", direction: "↑", max: 1, digits: 3, suffix: "" },
  { key: "jepa", label: "JEPA", direction: "↑", max: 1, digits: 3, suffix: "" },
  { key: "positionMae", label: "EE position MAE", direction: "↓", max: 100, digits: 2, suffix: " mm" },
] as const;

const organizers = [
  {
    name: "Karl Henrik Johansson",
    affiliation: "KTH Royal Institute of Technology",
    role: "Organizer",
    photo: "/people/karl-henrik-johansson.jpg",
  },
  {
    name: "Amanda Prorok",
    affiliation: "University of Cambridge",
    role: "Organizer",
    photo: "/people/amanda-prorok.jpg",
  },
  {
    name: "Danica Kragić",
    affiliation: "KTH Royal Institute of Technology",
    role: "Organizer",
    photo: "/people/danica-kragic.jpg",
  },
  {
    name: "Mengyu Wang",
    affiliation: "Harvard University",
    role: "Organizer",
    photo: "/people/mengyu-wang.jpg",
  },
  {
    name: "Shanghang Zhang",
    affiliation: "Peking University",
    role: "Primary organizer",
    photo: "/people/shanghang-zhang.jpg",
  },
  {
    name: "Xiaobao Wei",
    affiliation: "Peking University",
    role: "Secondary organizer",
    photo: "/people/xiaobao-wei.jpg",
  },
  {
    name: "Jixian Wu",
    affiliation: "New York University",
    role: "Organizer",
    photo: "/people/jixian-wu.jpg",
  },
  {
    name: "Fangyuan Zhao",
    affiliation: "Peking University",
    role: "Organizer",
    photo: "/people/fangyuan-zhao.jpg",
  },
] as const;

function scoreWidth(value: number, max = 100) {
  return `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
}

const compactLeaderboards = [
  {
    id: "T1",
    title: "Embodied Agency",
    metric: "Final overall score",
    status: "Final",
    tone: "final",
    detail: "All five settings complete",
    rows: publicResults.t1.models.map((model) => ({
      rank: model.rank,
      name: model.name,
      score: model.overall.toFixed(2),
    })),
  },
  {
    id: "T2",
    title: "Physical Foresight",
    metric: "PSNR snapshot ↑",
    status: "Measured",
    tone: "measured",
    detail: "Native metric view · no combined total",
    rows: [...publicResults.t2.models]
      .sort((left, right) => right.psnr - left.psnr)
      .map((model, index) => ({
        rank: index + 1,
        name: model.name,
        score: `${model.psnr.toFixed(2)} dB`,
      })),
  },
  {
    id: "T3",
    title: "Simulation Deployment",
    metric: "ID task success ↑",
    status: "Measured",
    tone: "measured",
    detail: "480 completed episodes per model",
    rows: [...publicResults.t3.models]
      .sort((left, right) => right.taskSuccess[0] - left.taskSuccess[0])
      .map((model, index) => ({
        rank: index + 1,
        name: model.name,
        score: `${model.taskSuccess[0].toFixed(2)}%`,
      })),
  },
  {
    id: "T4",
    title: "Real-World Deployment",
    metric: publicResults.t4Proposal.metric,
    status: "Proposal",
    tone: "proposal",
    detail: "Layout-only values · not measured",
    rows: publicResults.t4Proposal.models.map((model, index) => ({
      rank: index + 1,
      name: model.name,
      score: model.score.toFixed(2),
    })),
  },
] as const;

export function PublicHome() {
  return <div className="content publicHome">
    <section className="publicHero" aria-labelledby="public-hero-title">
      <div className="publicHeroCopy">
        <p className="publicEyebrow">EmbodiVSI · 2027</p>
        <h1 id="public-hero-title">Beyond Passive Evaluation.</h1>
        <p className="workshopHeroTitle">Verifiable Self-Improvement for Physical Intelligence</p>
        <p className="publicHeroLead">
          An open research program on dual recursive self-improvement and open-ended multi-agent
          capability evolution, with RoboExam linking reasoning, world models, simulation, and
          real-world deployment.
        </p>
        <div className="workshopMeta" aria-label="Proposed workshop format">
          <span>Seattle</span><span>June 20 or 21, 2027</span><span>Half-day</span>
        </div>
        <div className="publicHeroActions">
          <a className="primary" href="#results">View verified results <ArrowRight size={18}/></a>
          <a href="#program">Explore the workshop</a>
        </div>
      </div>
    </section>

    <section id="program" className="publicSection programSection" aria-labelledby="program-title">
      <div className="publicSectionHeading">
        <div><p className="publicEyebrow">Program</p><h2 id="program-title">Talks, papers, and evidence-backed results.</h2></div>
        <p>A focused half-day program for sharing research and comparing verifiable embodied-AI progress.</p>
      </div>
      <div className="programCardGrid">
        {programCards.map((item) => <article key={item.number}>
          <span>{item.number}</span>
          <h3>{item.title}</h3>
          <p>{item.description}</p>
          <small>{item.meta}</small>
        </article>)}
      </div>
      <ol className="compactAgenda" aria-label="Proposed half-day schedule">
        {agenda.map(([time, title, description]) => <li key={time}>
          <time>{time}</time><strong>{title}</strong><span>{description}</span>
        </li>)}
      </ol>
    </section>

    <section id="results" className="publicSection resultsSection" aria-labelledby="results-title">
      <div className="publicSectionHeading">
        <div><p className="publicEyebrow">Verified results</p><h2 id="results-title">Completed evaluations, shown as measured.</h2></div>
        <p>Only complete published cohorts are included. Native metrics remain separate where no official combined score exists.</p>
      </div>

      <div className="resultStatGrid" aria-label="Published evaluation coverage">
        {resultStats.map((stat) => <article key={stat.label}>
          <strong>{stat.value}</strong><div><h3>{stat.label}</h3><p>{stat.detail}</p></div>
        </article>)}
      </div>

      <article className="resultPanel t1ResultPanel" aria-labelledby="t1-result-title">
        <header className="resultPanelHeader">
          <div><span className="trackBadge">T1 · Final</span><h3 id="t1-result-title">Embodied Agency</h3>
            <p>Overall scores require ID, three OOD settings, and failure recovery.</p></div>
          <div className="resultScope"><strong>24 tasks</strong><span>0–100 score</span></div>
        </header>
        <div className="t1ModelGrid">
          {publicResults.t1.models.map((model) => <article className="t1ModelCard" key={model.name}>
            <header>
              <span className="resultRank">#{model.rank}</span>
              <div><h4>{model.name}</h4><p>Final overall</p></div>
              <strong>{model.overall.toFixed(2)}</strong>
            </header>
            <div className="t1HeadlineMetrics">
              <span><small>Subtask</small><b>{model.subtask.toFixed(2)}</b></span>
              <span><small>VQA</small><b>{model.vqa.toFixed(2)}</b></span>
            </div>
            <div className="settingBars" aria-label={`${model.name} scores by setting`}>
              {publicResults.t1.settings.map((setting, index) => <div key={setting}>
                <span>{setting}</span><i aria-hidden="true"><b style={{ width: scoreWidth(model.settings[index]) }}/></i>
                <strong>{model.settings[index].toFixed(2)}</strong>
              </div>)}
            </div>
          </article>)}
        </div>
        <footer className="resultVersion">Result version <code>{publicResults.t1.version}</code></footer>
      </article>

      <article className="resultPanel t2ResultPanel" aria-labelledby="t2-result-title">
        <header className="resultPanelHeader">
          <div><span className="trackBadge">T2 · Complete cohort</span><h3 id="t2-result-title">Physical Foresight</h3>
            <p>Native metrics compare action-conditioned predictions. No cross-metric total is reported.</p></div>
          <div className="resultScope"><strong>600 cases / model</strong><span>24 tasks · 5 regimes</span></div>
        </header>
        <div className="t2ModelGrid">
          {publicResults.t2.models.map((model) => <article className="t2ModelCard" key={model.name}>
            <header><div><h4>{model.name}</h4><p>{model.checkpoint}</p></div><span>600</span></header>
            <dl>
              {t2MetricViews.map((metric) => {
                const value = model[metric.key];
                return <div key={metric.key} data-direction={metric.direction === "↓" ? "lower" : "higher"}>
                  <dt>{metric.label}<small>{metric.direction}</small></dt>
                  <dd><strong>{value.toFixed(metric.digits)}{metric.suffix}</strong>
                    <span aria-hidden="true"><i style={{ width: scoreWidth(value, metric.max) }}/></span>
                  </dd>
                </div>;
              })}
            </dl>
          </article>)}
        </div>
        <footer className="resultVersion">Result version <code>{publicResults.t2.version}</code></footer>
      </article>

      <article className="resultPanel t3ResultPanel" aria-labelledby="t3-result-title">
        <header className="resultPanelHeader">
          <div><span className="trackBadge">T3 · Complete settings</span><h3 id="t3-result-title">Simulation Deployment</h3>
            <p>Task success is shown alongside subtask progress for each completed setting.</p></div>
          <div className="resultScope"><strong>480 episodes / model</strong><span>120 per setting</span></div>
        </header>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Scrollable result table needs keyboard access. */}
        <div className="t3ResultTable" role="region" aria-label="T3 task success and subtask scores" tabIndex={0}>
          <table>
            <thead><tr><th scope="col">Model</th>{publicResults.t3.settings.map((setting) =>
              <th scope="col" key={setting}>{setting}</th>)}</tr></thead>
            <tbody>{publicResults.t3.models.map((model) => <tr key={model.name}>
              <th scope="row">{model.name}<small>480 / 480 episodes</small></th>
              {model.taskSuccess.map((score, index) => <td key={publicResults.t3.settings[index]}
                data-label={publicResults.t3.settings[index]}>
                <strong>{score.toFixed(2)}%</strong>
                <span aria-hidden="true"><i style={{ width: scoreWidth(score) }}/></span>
                <small>Subtask {model.subtask[index].toFixed(2)}</small>
              </td>)}
            </tr>)}</tbody>
          </table>
        </div>
        <footer className="resultVersion">Result version <code>{publicResults.t3.version}</code></footer>
      </article>

      <aside className="resultPolicy">
        <CheckCircle2 size={20} aria-hidden="true"/>
        <div><strong>Complete cohorts only</strong><p>Measured result panels omit unfinished baselines and real-robot trials. The T4 proposal preview below is not a result.</p></div>
        <span>Verified {publicResults.verifiedOn}</span>
      </aside>
    </section>

    <section id="scenes" className="publicSection sceneSection" aria-labelledby="scenes-title">
      <div className="publicSectionHeading">
        <div><p className="publicEyebrow">Evaluation scenes</p><h2 id="scenes-title">From simulation to physical deployment.</h2></div>
        <p>Representative scenes connect controlled diagnosis with evaluation on real robot systems.</p>
      </div>
      <div className="sceneGrid">
        {evaluationScenes.map((scene) => <figure key={scene.title}>
          <div className="sceneMedia">
            {"video" in scene
              ? <video autoPlay muted loop playsInline preload="metadata" poster={scene.poster}
                  aria-label={`${scene.title} simulation scene`}>
                  <source src={scene.video} type="video/mp4"/>
                  <track kind="captions" src="/no-spoken-audio.vtt" srcLang="en" label="No spoken audio" default/>
                </video>
              : <img src={scene.image} alt={`${scene.title} real-robot evaluation scene`}
                  width="960" height="540" loading="lazy"/>}
            <span className={`sceneMode sceneMode${scene.mode}`}>{scene.mode}</span>
          </div>
          <figcaption><h3>{scene.title}</h3><p>{scene.description}</p></figcaption>
        </figure>)}
      </div>
    </section>

    <section id="organizers" className="publicSection organizerSection" aria-labelledby="organizers-title">
      <div className="publicSectionHeading compactHeading">
        <div><p className="publicEyebrow">Organizing team</p><h2 id="organizers-title">Organizers</h2></div>
        <p>Research leadership and benchmark operations.</p>
      </div>
      <div className="organizerPhotoGrid">
        {organizers.map((person) => <article key={person.name}>
          <img src={person.photo} alt={`Portrait of ${person.name}`} width="96" height="96" loading="lazy"/>
          <div><span>{person.role}</span><h3>{person.name}</h3><p>{person.affiliation}</p></div>
        </article>)}
      </div>
    </section>

    <section id="speakers" className="publicSection" aria-labelledby="speakers-title">
      <div className="publicSectionHeading compactHeading">
        <div><p className="publicEyebrow">Invited speakers</p><h2 id="speakers-title">Vision, learning, and robotics.</h2></div>
        <p>Eight confirmed speakers and two tentative speakers.</p>
      </div>
      <div className="speakerGrid">
        {speakers.map(([name, affiliation, href], index) =>
          <a href={href} target="_blank" rel="noreferrer" key={name}>
            <span>{String(index + 1).padStart(2, "0")}<ExternalLink size={14}/></span>
            <h3>{name}</h3>
            <b>{affiliation}</b>
          </a>)}
      </div>
    </section>

    <section id="leaderboard-preview" className="publicSection leaderboardPreview"
      aria-labelledby="leaderboard-preview-title">
      <div className="publicSectionHeading">
        <div><p className="publicEyebrow">Current leaderboard</p><h2 id="leaderboard-preview-title">Four tracks in one compact view.</h2></div>
        <p>T1–T3 use completed dashboard results with track-specific metrics. T4 is a proposal-only score mock-up.</p>
      </div>
      <div className="trackLeaderboardGrid">
        {compactLeaderboards.map((track) => <article className={`leaderboardTrackCard ${track.tone}`} key={track.id}>
          <header>
            <span>{track.id}</span>
            <div><h3>{track.title}</h3><p>{track.metric}</p></div>
            <b>{track.status}</b>
          </header>
          <ol>
            {track.rows.map((row) => <li key={row.name}>
              <span>{String(row.rank).padStart(2, "0")}</span>
              <strong>{row.name}</strong>
              <b>{row.score}</b>
            </li>)}
          </ol>
          <footer>{track.detail}</footer>
        </article>)}
      </div>
      <p className="proposalScoreNote"><strong>T4 proposal preview:</strong> illustrative values demonstrate the intended score presentation and do not report hardware performance.</p>
    </section>
  </div>;
}
