import { ArrowRight, Play, Trophy } from "lucide-react";
import { t1UnibenchResults } from "../data/t1-unibench-results";
import type { TrackId } from "../data/metric-plan";

const samples = [
  {
    label: "Closed-loop rollout",
    title: "Stack Bowls",
    meta: "Pi0.5 · In-distribution",
    description: "A policy completes a three-object manipulation sequence from visual observations.",
    outcome: "Success",
    tone: "success",
    video: "/samples/stack-bowls-policy.mp4",
    poster: "/samples/stack-bowls-policy.webp",
  },
  {
    label: "Reference execution",
    title: "Arrange Largest Number",
    meta: "Oracle · In-distribution",
    description: "A successful reference trace grounds the expected sequence and subtask boundaries.",
    outcome: "Reference",
    tone: "reference",
    video: "/samples/arrange-number-reference.mp4",
    poster: "/samples/arrange-number-reference.webp",
  },
  {
    label: "Failure evidence",
    title: "Stack Bowls",
    meta: "FastWAM · In-distribution",
    description: "The failed rollout remains visible so scores can be read alongside actual behavior.",
    outcome: "Failure",
    tone: "failure",
    video: "/samples/stack-bowls-failure.mp4",
    poster: "/samples/stack-bowls-failure.webp",
  },
] as const;

const trackCards: {
  id: TrackId;
  title: string;
  question: string;
  contract: string;
}[] = [
  {
    id: "T1",
    title: "Embodied Agency",
    question: "Can an agent read a scene, retain task state, plan, and choose the next action?",
    contract: "Video + instruction → answers, plan, next action",
  },
  {
    id: "T2",
    title: "Physical Foresight",
    question: "Can a model predict how the world changes under a candidate action?",
    contract: "History + candidate action → predicted future",
  },
  {
    id: "T3",
    title: "Simulation Deployment",
    question: "Can a policy complete long-horizon tasks under closed-loop feedback?",
    contract: "Robot observations → executable actions",
  },
  {
    id: "T4",
    title: "Real-World Deployment",
    question: "Does the behavior transfer to standardized real-robot trials?",
    contract: "Real observations → safe task execution",
  },
];

const improvementSteps = [
  ["01", "Execute", "Freeze the baseline and record task-level outputs, actions, and outcomes."],
  ["02", "Diagnose", "Connect scores to traces, failure types, and the evidence needed to explain them."],
  ["03", "Improve", "Declare a bounded update to the policy, memory, verifier, world model, or harness."],
  ["04", "Retest", "Measure held-out gain, transfer, retention, recovery, and safety under matched conditions."],
] as const;

const scheduleLanes = [
  {
    id: "challenge",
    title: "Benchmark challenge",
    description: "Development access, remote qualification, and organizer-run held-out verification.",
    items: [
      ["Dec 15, 2026", "Development release", "Public data, manifests, interfaces, and worked examples."],
      ["Feb 22–28, 2027", "Interface checks", "Participant onboarding and submission compatibility checks."],
      ["Mar 1–28", "Preliminary evaluation", "Remote simulation and designated real-robot evaluation."],
      ["Mar 29–31", "Qualification review", "Up to ten eligible teams per track advance to verification."],
      ["Apr 1–May 1", "Held-out verification", "Frozen submissions run on internal scenes and robot stations."],
      ["May 24", "Final leaderboard", "Audited rankings and track awards are released."],
    ],
  },
  {
    id: "research",
    title: "Research submissions",
    description: "An independent archival paper track for embodied AI, world models, and verifiable improvement.",
    items: [
      ["Jan 15, 2027", "Call opens", "Scope, topics, and submission guidance are published."],
      ["Feb 1", "Submission portal opens", "Complete papers can be submitted; no separate abstract deadline."],
      ["Mar 5 · AoE", "Paper deadline", "5–8-page archival submissions close."],
      ["Mar 24", "Decisions", "Peer-review decisions are released."],
      ["Apr 23 · AoE", "Camera-ready", "Final accepted manuscripts are due."],
      ["Jun 20–21", "Public presentations", "Accepted posters and the Best Paper presentation."],
    ],
  },
] as const;

const rankedT1 = t1UnibenchResults.models
  .filter((model) => model.overall?.overall != null)
  .sort((left, right) => right.overall!.overall! - left.overall!.overall!)
  .slice(0, 3);

export function PublicHome() {
  return <div className="content publicHome">
    <section className="publicHero" aria-labelledby="public-hero-title">
      <div className="publicHeroCopy">
        <p className="publicEyebrow">RoboExam · Physical AI benchmark</p>
        <h1 id="public-hero-title">Evidence for robots that reason, predict, act, and recover.</h1>
        <p className="publicHeroLead">
          RoboExam evaluates embodied systems across scene understanding, action-conditioned prediction,
          simulated control, and real-world deployment. Matched ID, OOD, and recovery settings reveal not
          only whether a system succeeds, but where and why it fails.
        </p>
        <div className="publicHeroActions">
          <a className="primary" href="/leaderboards">View leaderboards <ArrowRight size={18}/></a>
          <a href="#evaluation-design">Evaluation design</a>
        </div>
      </div>
      <figure className="publicHeroSample">
        <div className="publicHeroVideo">
          <video controls muted playsInline preload="metadata" poster="/samples/stack-bowls-policy.webp"
            aria-label="Stack Bowls successful policy rollout">
            <source src="/samples/stack-bowls-policy.mp4" type="video/mp4"/>
            <track kind="captions" src="/no-spoken-audio.vtt" srcLang="en" label="No spoken audio" default/>
          </video>
          <span className="publicPlayCue"><Play size={15} fill="currentColor"/> Episode evidence</span>
        </div>
        <figcaption>
          <span><b>T3</b> Simulation deployment</span>
          <strong>Stack three bowls</strong>
          <small>Policy rollout · head camera</small>
          <em>Success</em>
        </figcaption>
      </figure>
    </section>

    <section className="publicStats" aria-label="Benchmark scope">
      <article><strong>24</strong><span>simulation tasks</span></article>
      <article><strong>4</strong><span>independent tracks</span></article>
      <article><strong>5</strong><span>matched evaluation settings</span></article>
      <article><strong>3</strong><span>real-robot task families</span></article>
    </section>

    <section className="publicSection" aria-labelledby="sample-title">
      <div className="publicSectionHeading">
        <div><p className="publicEyebrow">Episode samples</p><h2 id="sample-title">See the task, rollout, and outcome.</h2></div>
        <p>Each result stays connected to the episode evidence behind it. Play these lightweight samples to inspect successful, reference, and failed behavior.</p>
      </div>
      <div className="publicSampleGrid">
        {samples.map((sample) => <article className="publicSampleCard" key={`${sample.label}:${sample.title}`}>
          <div className="publicSampleMedia">
            <video controls muted playsInline preload="none" poster={sample.poster}
              aria-label={`${sample.title}, ${sample.label}`}>
              <source src={sample.video} type="video/mp4"/>
              <track kind="captions" src="/no-spoken-audio.vtt" srcLang="en" label="No spoken audio" default/>
            </video>
            <span className={`publicOutcome ${sample.tone}`}>{sample.outcome}</span>
          </div>
          <div className="publicSampleCopy">
            <p>{sample.label}</p>
            <h3>{sample.title}</h3>
            <span>{sample.meta}</span>
            <small>{sample.description}</small>
          </div>
        </article>)}
      </div>
    </section>

    <section className="publicSection" aria-labelledby="track-title">
      <div className="publicSectionHeading">
        <div><p className="publicEyebrow">Evaluation interfaces</p><h2 id="track-title">One benchmark, four questions.</h2></div>
        <p>The tracks share tasks and evidence conventions while preserving the input, output, and scoring contract appropriate to each system.</p>
      </div>
      <div className="publicTrackGrid">
        {trackCards.map((track) => <a key={track.id} href={`/leaderboards#${track.id}`}>
          <span>{track.id}</span>
          <h3>{track.title}</h3>
          <p>{track.question}</p>
          <small>{track.contract}</small>
          <b>Open leaderboard <ArrowRight size={16}/></b>
        </a>)}
      </div>
    </section>

    <section className="publicSection publicSchedule" aria-labelledby="schedule-title">
      <div className="publicSectionHeading">
        <div>
          <p className="publicEyebrow">Provisional 2027 schedule</p>
          <h2 id="schedule-title">Two tracks, one shared research cycle.</h2>
        </div>
        <p>Benchmark participation and research submissions run independently. Joining the benchmark does not require a paper, and paper decisions do not affect leaderboard rankings.</p>
      </div>
      <div className="scheduleGrid">
        {scheduleLanes.map((lane) => <article className={`scheduleLane ${lane.id}`} key={lane.id}>
          <header>
            <span className="scheduleIcon" aria-hidden="true"/>
            <div><h3>{lane.title}</h3><p>{lane.description}</p></div>
          </header>
          <ol>
            {lane.items.map(([date, title, description]) => <li key={`${lane.id}:${date}`}>
              <time>{date}</time>
              <div><strong>{title}</strong><p>{description}</p></div>
            </li>)}
          </ol>
        </article>)}
      </div>
      <p className="scheduleNote"><b>Planning status:</b> dates, submission rules, evaluation limits, and venue-dependent activities remain provisional until formally confirmed.</p>
    </section>

    <section id="evaluation-design" className="publicEvidence" aria-labelledby="evidence-title">
      <div className="publicEvidenceIntro">
        <p className="publicEyebrow">Verifiable improvement</p>
        <h2 id="evidence-title">A final score is the start of the diagnosis.</h2>
        <p>RoboExam is designed to compare a declared baseline with a bounded update under frozen, held-out conditions. The report keeps gains, regressions, budgets, and failure evidence together.</p>
        <div className="publicScope" aria-label="Research scope">
          <span>Embodied reasoning</span><span>World models</span><span>Robot learning</span>
          <span>Failure diagnosis</span><span>Sim-to-real</span><span>Safety &amp; recovery</span>
        </div>
      </div>
      <ol className="publicCycle">
        {improvementSteps.map(([number, title, description]) => <li key={number}>
          <span>{number}</span><div><strong>{title}</strong><p>{description}</p></div>
        </li>)}
      </ol>
      <div className="publicRegimes">
        <span>In-distribution</span><span>Visual OOD</span><span>Semantic OOD</span>
        <span>Behavioral OOD</span><span>Failure recovery</span>
      </div>
    </section>

    <section className="publicSection publicLeaderboardPreview" aria-labelledby="results-title">
      <div className="publicResultsIntro">
        <p className="publicEyebrow">Current results</p>
        <h2 id="results-title">Compare methods under one evidence contract.</h2>
        <p>The public board separates task execution from VQA and reports incomplete settings as unavailable rather than silently filling gaps.</p>
        <a href="/leaderboards#T1">Explore all tracks <ArrowRight size={18}/></a>
      </div>
      <div className="publicRanking" aria-label="Track 1 leaderboard snapshot">
        <header><span>Track 1 snapshot</span><span>Overall</span></header>
        {rankedT1.map((model, index) => <article key={model.id}>
          <span>{index + 1}</span>
          <div><strong>{model.label}</strong><small>{model.splitsPresent.length} of 5 settings</small></div>
          <b>{model.overall!.overall!.toFixed(1)}</b>
        </article>)}
        <footer><Trophy size={17}/><span>Scores are shown out of 100; higher is better.</span></footer>
      </div>
    </section>
  </div>;
}
