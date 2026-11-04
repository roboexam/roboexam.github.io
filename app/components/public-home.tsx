import { ArrowRight, ExternalLink, Play, Trophy } from "lucide-react";
import { t1UnibenchResults } from "../data/t1-unibench-results";
import type { TrackId } from "../data/metric-plan";

const programPaths = [
  {
    label: "Open research program",
    title: "Papers, posters, and demonstrations",
    description: "A peer-reviewed program for original research, benchmark and system papers, negative results, and reproducibility studies from any platform.",
    facts: ["5–8-page archival papers", "Accepted-paper posters", "Best Paper presentation"],
  },
  {
    label: "RoboExam challenge",
    title: "Cross-embodiment, evidence-linked evaluation",
    description: "A shared challenge connecting simulation, humanoid and dual-arm trajectories, egocentric observations, and organizer-run held-out verification.",
    facts: ["Four independent tracks", "RoboMIND / LeRobot compatible", "Paper submission optional"],
  },
] as const;

const researchPrinciples = [
  ["01", "Trace both feedback loops", "Identify the failure behind an update and record how the revised agent changes the evaluator's next test."],
  ["02", "Test whether gains transfer", "Compare frozen versions under matched budgets on held-out tasks, then revisit earlier tasks to measure retention."],
  ["03", "Bridge embodiments, not just datasets", "Compare the same capability claim across simulation, humanoid and dual-arm systems, and egocentric evidence."],
] as const;

const ecosystemBridge = [
  {
    step: "01",
    label: "Open inputs",
    title: "RoboMIND / LeRobot compatible",
    description: "Instruction-conditioned RGB, state, and action traces enter one evidence contract instead of platform-specific score sheets.",
    tags: ["Humanoid", "Dual-arm", "Ego"],
  },
  {
    step: "02",
    label: "Capability loop",
    title: "Understand, predict, then act",
    description: "Embodied agency and physical foresight are evaluated before policies move into closed-loop simulation and real hardware.",
    tags: ["VLM", "World model", "VLA"],
  },
  {
    step: "03",
    label: "Independent check",
    title: "Qualify, freeze, and verify",
    description: "A scalable simulation stage is followed by held-out organizer execution under matched interfaces and declared budgets.",
    tags: ["Simulation", "Real robot", "Retest"],
  },
] as const;

const speakers = [
  ["Sergey Levine", "UC Berkeley", "General-purpose agents, reinforcement learning, and robotic learning.", "https://people.eecs.berkeley.edu/~svlevine/"],
  ["Peter Stone", "The University of Texas at Austin", "Long-horizon agents, multi-agent systems, and robot learning.", "https://www.cs.utexas.edu/~pstone/"],
  ["Chelsea Finn", "Stanford University", "Robot learning, meta-learning, and adaptation through interaction.", "https://profiles.stanford.edu/chelsea-finn"],
  ["Kate Saenko", "Boston University / Meta FAIR", "Out-of-distribution learning, domain adaptation, and vision-language models.", "https://ai.bu.edu/ksaenko.html"],
  ["Jeannette Bohg", "Stanford University", "Robust sensorimotor coordination and physical-robot manipulation.", "https://web.stanford.edu/~bohg/"],
  ["Marios Savvides", "Carnegie Mellon University", "Robust machine perception and multimodal representation learning.", "https://www.mariossavvides.com/"],
  ["Katerina Fragkiadaki", "Carnegie Mellon University", "Video and world models, embodied perception, and action.", "https://www.cs.cmu.edu/~katef/"],
] as const;

const eventProgram = [
  ["13:00–13:10", "Opening remarks", "Learning from failure"],
  ["13:10–14:10", "Four invited talks", "Foundation models, world models, and deployment"],
  ["14:10–14:30", "Best Paper", "Presentation and award"],
  ["14:30–15:15", "Posters and demonstrations", "Accepted papers and interactive work"],
  ["15:15–15:30", "Coffee break", "Transition back to talks"],
  ["15:30–16:15", "Three invited talks", "Diagnosis, memory, post-training, and safety"],
  ["16:15–16:55", "RoboExam results", "Four track reports and awards"],
  ["16:55–17:30", "Closing panel", "Which improvements transfer?"],
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

const scheduleLanes = [
  {
    id: "challenge",
    title: "RoboExam challenge",
    description: "Development access, remote qualification, and organizer-run held-out verification.",
    items: [
      ["Dec 15, 2026", "Development release", "Public data, manifests, interfaces, and worked examples."],
      ["Feb 22–28, 2027", "Interface checks", "Participant onboarding and submission compatibility checks."],
      ["Mar 1–28", "Preliminary evaluation", "Remote simulation and designated real-robot evaluation."],
      ["Mar 29–31", "Qualification review", "Up to ten eligible teams per track advance to verification."],
      ["Apr 1–May 1", "Official verification", "Frozen submissions run on internal scenes and robot stations."],
      ["May 24", "Final leaderboard", "Audited rankings and track awards are released."],
    ],
  },
  {
    id: "research",
    title: "Research submissions",
    description: "An independent archival paper program for embodied AI, world models, and verifiable improvement.",
    items: [
      ["Jan 15, 2027", "Call for papers", "Scope, topics, and submission guidance are published."],
      ["Feb 1", "OpenReview opens", "Complete papers can be submitted; no separate abstract deadline."],
      ["Mar 5 · AoE", "Paper deadline", "5–8-page archival submissions close."],
      ["Mar 24", "Decisions", "Peer-review decisions are released."],
      ["Apr 23 · AoE", "Camera-ready", "Final accepted manuscripts are due."],
      ["Jun 20–21", "Workshop program", "Accepted posters, invited talks, challenge results, and the closing panel."],
    ],
  },
] as const;

const organizers = [
  ["Shanghang Zhang", "Peking University", "Program Chair"],
  ["Karl Henrik Johansson", "KTH Royal Institute of Technology", "Secondary organizer"],
  ["Danica Kragić", "KTH Royal Institute of Technology", "Organizer"],
  ["Amanda Prorok", "University of Cambridge", "Organizer"],
  ["Xiaobao Wei", "Peking University", "RoboExam coordination"],
  ["Jixian Wu", "New York University", "Evaluation operations"],
  ["Fangyuan Zhao", "Peking University", "Challenge protocols"],
] as const;

const rankedT1 = t1UnibenchResults.models
  .filter((model) => model.overall?.overall != null)
  .sort((left, right) => right.overall!.overall! - left.overall!.overall!)
  .slice(0, 3);

export function PublicHome() {
  return <div className="content publicHome">
    <section className="publicHero workshopHero" aria-labelledby="public-hero-title">
      <div className="publicHeroCopy">
        <p className="publicEyebrow">EmbodiVSI · RoboExam × X-Humanoid ecosystem</p>
        <h1 id="public-hero-title">Beyond Passive Evaluation.</h1>
        <p className="workshopHeroTitle">From cross-embodiment data to verified capability gains</p>
        <p className="publicHeroLead">
          RoboExam connects X-Humanoid-aligned embodied data with a four-track loop for scene understanding,
          physical prediction, simulation deployment, and held-out real-robot verification. The goal is not
          only to improve a score, but to show that the gain transfers across tasks, embodiments, and conditions.
        </p>
        <div className="workshopMeta" aria-label="Proposed workshop format">
          <span>Seattle</span><span>June 20–21, 2027</span><span>Open research + challenge</span><span>Program subject to confirmation</span>
        </div>
        <div className="publicHeroActions">
          <a className="primary" href="#ecosystem">Explore the benchmark <ArrowRight size={18}/></a>
          <a href="/leaderboards">RoboExam leaderboards</a>
        </div>
      </div>
      <figure className="publicHeroSample">
        <div className="publicHeroVideo">
          <video controls muted playsInline preload="metadata" poster="/samples/stack-bowls-policy.webp"
            aria-label="Stack Bowls successful policy rollout">
            <source src="/samples/stack-bowls-policy.mp4" type="video/mp4"/>
            <track kind="captions" src="/no-spoken-audio.vtt" srcLang="en" label="No spoken audio" default/>
          </video>
          <span className="publicPlayCue"><Play size={15} fill="currentColor"/> Challenge evidence</span>
        </div>
        <figcaption>
          <span><b>RoboExam · T3</b> Simulation deployment</span>
          <strong>Evidence behind an improvement claim</strong>
          <small>Task rollout · outcome · trace</small>
          <em>Verified</em>
        </figcaption>
      </figure>
    </section>

    <section className="publicStats" aria-label="RoboExam benchmark scope">
      <article><strong>24</strong><span>simulation tasks</span></article>
      <article><strong>3</strong><span>real-world task families</span></article>
      <article><strong>4</strong><span>independently ranked tracks</span></article>
      <article><strong>2</strong><span>evaluation and verification stages</span></article>
    </section>

    <section id="ecosystem" className="publicSection ecosystemSection anchorSection" aria-labelledby="ecosystem-title">
      <div className="publicSectionHeading">
        <div>
          <p className="publicEyebrow">X-Humanoid ecosystem alignment</p>
          <h2 id="ecosystem-title">One evidence bridge from open embodied data to verified deployment.</h2>
        </div>
        <div className="ecosystemIntro">
          <p>RoboExam complements the open X-Humanoid stack without restricting participation to one robot, simulator, or model family.</p>
          <a href="https://huggingface.co/X-Humanoid" target="_blank" rel="noreferrer">
            Explore X-Humanoid resources <ExternalLink size={15}/>
          </a>
        </div>
      </div>
      <div className="ecosystemFlow" aria-label="X-Humanoid to RoboExam verification flow">
        <span>X-Humanoid open assets</span><ArrowRight aria-hidden="true"/>
        <span>RoboExam · T1–T4</span><ArrowRight aria-hidden="true"/>
        <span>Held-out sim + real verification</span>
      </div>
      <div className="ecosystemGrid">
        {ecosystemBridge.map((item) => <article key={item.step}>
          <div><span>{item.step}</span><p>{item.label}</p></div>
          <h3>{item.title}</h3>
          <p>{item.description}</p>
          <ul>{item.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>
        </article>)}
      </div>
    </section>

    <section id="program" className="publicSection anchorSection" aria-labelledby="program-title">
      <div className="publicSectionHeading">
        <div><p className="publicEyebrow">Two ways to participate</p><h2 id="program-title">One workshop, an open research program, and a shared challenge.</h2></div>
        <p>Authors may submit a paper, enter any RoboExam track, or do both. Paper decisions and challenge rankings remain independent.</p>
      </div>
      <div className="programPathGrid">
        {programPaths.map((path, index) => <article key={path.label}>
          <span>0{index + 1}</span>
          <p>{path.label}</p>
          <h3>{path.title}</h3>
          <div>{path.description}</div>
          <ul>{path.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
        </article>)}
      </div>
    </section>

    <section id="focus" className="publicEvidence anchorSection" aria-labelledby="focus-title">
      <div className="publicEvidenceIntro">
        <p className="publicEyebrow">Scientific focus</p>
        <h2 id="focus-title">What should count as genuine improvement?</h2>
        <p>The workshop moves beyond a single final score. It studies how a failure changes both the learning system and the evaluator, then asks whether the update transfers across tasks and embodiments, retains earlier skills, and remains within its declared budget.</p>
        <div className="publicScope" aria-label="Workshop topics">
          <span>Evaluator learning</span><span>World models</span><span>Robot learning</span>
          <span>Cross-embodiment transfer</span><span>OOD transfer</span><span>Safe deployment</span>
        </div>
      </div>
      <ol className="publicCycle">
        {researchPrinciples.map(([number, title, description]) => <li key={number}>
          <span>{number}</span><div><strong>{title}</strong><p>{description}</p></div>
        </li>)}
      </ol>
      <div className="publicRegimes">
        <span>Failure diagnosis</span><span>Bounded intervention</span><span>Held-out transfer</span>
        <span>Capability retention</span><span>Independent verification</span>
      </div>
    </section>

    <section id="speakers" className="publicSection anchorSection" aria-labelledby="speakers-title">
      <div className="publicSectionHeading">
        <div><p className="publicEyebrow">Tentative invited speakers</p><h2 id="speakers-title">Perspectives across vision, learning, and robotics.</h2></div>
        <p>All seven speakers have accepted tentative invitations. Final appearance times remain subject to venue confirmation and scheduling.</p>
      </div>
      <div className="speakerGrid">
        {speakers.map(([name, affiliation, focus, href]) => <a href={href} target="_blank" rel="noreferrer" key={name}>
          <span>Tentative <ExternalLink size={14}/></span>
          <h3>{name}</h3>
          <b>{affiliation}</b>
          <p>{focus}</p>
        </a>)}
      </div>
    </section>

    <section className="publicSection workshopEventSection" aria-labelledby="event-program-title">
      <div className="publicSectionHeading">
        <div><p className="publicEyebrow">Proposed half-day program</p><h2 id="event-program-title">From research talks to evidence-backed results.</h2></div>
        <p>A 4.5-hour afternoon program in Seattle local time, with invited talks, posters, demonstrations, challenge reports, and an audience panel.</p>
      </div>
      <ol className="eventProgram">
        {eventProgram.map(([time, title, description]) => <li key={time}>
          <time>{time}</time><div><strong>{title}</strong><p>{description}</p></div>
        </li>)}
      </ol>
    </section>

    <section id="challenge" className="publicSection anchorSection" aria-labelledby="track-title">
      <div className="publicSectionHeading">
        <div><p className="publicEyebrow">RoboExam improvement challenge</p><h2 id="track-title">Four tracks, one sim-to-real evidence chain.</h2></div>
        <p>Following the cross-embodiment spirit of X-Humanoid, the tracks connect reasoning, physical prediction, simulation, and real-robot deployment without collapsing them into one opaque score.</p>
      </div>
      <div className="publicTrackGrid">
        {trackCards.map((track) => <a key={track.id} href={`/leaderboards?track=${track.id}`}>
          <span>{track.id}</span>
          <h3>{track.title}</h3>
          <p>{track.question}</p>
          <small>{track.contract}</small>
          <b>Open leaderboard <ArrowRight size={16}/></b>
        </a>)}
      </div>
      <div className="challengeSampleHeading">
        <p className="publicEyebrow">Representative challenge evidence</p>
        <h3>See the task, rollout, and outcome.</h3>
        <p>These lightweight clips illustrate the evaluation protocol; they are not additional leaderboard entries.</p>
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

    <section id="dates" className="publicSection publicSchedule anchorSection" aria-labelledby="schedule-title">
      <div className="publicSectionHeading">
        <div>
          <p className="publicEyebrow">Provisional 2027 dates</p>
          <h2 id="schedule-title">Independent routes, one shared workshop.</h2>
        </div>
        <p>Research submissions and challenge participation follow separate processes, then meet in the workshop program.</p>
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
      <p className="scheduleNote"><b>Planning status:</b> dates, submission rules, speakers, and venue-dependent activities remain provisional until formally confirmed.</p>
    </section>

    <section className="publicSection publicLeaderboardPreview" aria-labelledby="results-title">
      <div className="publicResultsIntro">
        <p className="publicEyebrow">RoboExam challenge results</p>
        <h2 id="results-title">Results, with the evidence attached.</h2>
        <p>Validated challenge runs identify their task scope, evaluation condition, protocol version, and supporting evidence. Planned or incomplete jobs are not ranked.</p>
        <a href="/leaderboards?track=T1">Explore challenge leaderboards <ArrowRight size={18}/></a>
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

    <section id="organizers" className="publicSection anchorSection organizerSection" aria-labelledby="organizers-title">
      <div className="publicSectionHeading">
        <div><p className="publicEyebrow">Organizing team</p><h2 id="organizers-title">Research leadership and evaluation operations.</h2></div>
        <p>The team combines experience in foundation models, control, robot manipulation, multi-robot systems, world models, and benchmark operations.</p>
      </div>
      <div className="organizerGrid">
        {organizers.map(([name, affiliation, role]) => <article key={name}>
          <span>{role}</span><h3>{name}</h3><p>{affiliation}</p>
        </article>)}
      </div>
    </section>
  </div>;
}
