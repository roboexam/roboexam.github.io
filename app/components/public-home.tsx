/* eslint-disable @next/next/no-img-element -- Static GitHub Pages deployment has no image optimizer. */
import { ArrowRight, ExternalLink } from "lucide-react";
import { publicResults } from "../data/public-results";

const programCards = [
  {
    number: "01",
    title: "Invited talks",
    description: "Perspectives on foundation models, world models, robot learning, and deployment.",
    meta: "Invited perspectives",
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

const compactLeaderboards = [
  {
    id: "T1",
    title: "Embodied Agency",
    status: "Final",
    tone: "final",
    rows: publicResults.t1.models.map((model) => ({
      rank: model.rank,
      name: model.name,
      score: model.overall.toFixed(2),
    })),
  },
  {
    id: "T2",
    title: "Physical Foresight",
    status: "Pending",
    tone: "measured",
    rows: publicResults.t2.models.map((model) => ({
      rank: null,
      name: model.name,
      score: "—",
    })),
  },
  {
    id: "T3",
    title: "Simulation Deployment",
    status: "Pending",
    tone: "measured",
    rows: publicResults.t3.models.map((model) => ({
      rank: null,
      name: model.name,
      score: "—",
    })),
  },
  {
    id: "T4",
    title: "Real-World Deployment",
    status: "Pending",
    tone: "measured",
    rows: publicResults.t4.models.map((model) => ({
      rank: null,
      name: model.name,
      score: model.score === null ? "—" : String(model.score),
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
          <a className="primary" href="#leaderboard-preview">View four-track overview <ArrowRight size={18}/></a>
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
        <div><p className="publicEyebrow">Invited speakers</p><h2 id="speakers-title">Perspectives on Physical Intelligence</h2></div>
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
        <p>Overall scores follow each track’s official protocol. Pending scores are shown as —.</p>
      </div>
      <div className="trackLeaderboardGrid">
        {compactLeaderboards.map((track) => <article className={`leaderboardTrackCard ${track.tone}`} key={track.id}>
          <header>
            <span>{track.id}</span>
            <div><h3>{track.title}</h3><p>Overall score</p></div>
            <b>{track.status}</b>
          </header>
          <ol>
            {track.rows.map((row) => <li key={row.name}>
              <span>{row.rank === null ? "•" : String(row.rank).padStart(2, "0")}</span>
              <strong>{row.name}</strong>
              <b>{row.score}</b>
            </li>)}
          </ol>
        </article>)}
      </div>
    </section>
  </div>;
}
