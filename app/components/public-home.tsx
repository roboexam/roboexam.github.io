/* eslint-disable @next/next/no-img-element -- Static GitHub Pages deployment has no image optimizer. */
import { ArrowRight, ExternalLink } from "lucide-react";

const programCards = [
  {
    number: "01",
    title: "Invited talks",
    description: "Ten confirmed perspectives on foundation models, world models, robot learning, and deployment.",
    meta: "10 confirmed speakers",
  },
  {
    number: "02",
    title: "Research program",
    description: "Archival papers, accepted-paper posters, demonstrations, and a Best Paper presentation.",
    meta: "5–8-page papers",
  },
  {
    number: "03",
    title: "RoboExam challenge",
    description: "Four model-interface tracks connected through a shared task-and-intervention registry.",
    meta: "10 finalists per track",
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

const organizers = [
  {
    name: "Karl Henrik Johansson",
    affiliation: "KTH Royal Institute of Technology",
    role: "Advisory organizer",
    photo: "/people/karl-henrik-johansson.jpg",
  },
  {
    name: "Amanda Prorok",
    affiliation: "University of Cambridge",
    role: "Advisory organizer",
    photo: "/people/amanda-prorok.jpg",
  },
  {
    name: "Danica Kragić",
    affiliation: "KTH Royal Institute of Technology",
    role: "Advisory organizer",
    photo: "/people/danica-kragic.jpg",
  },
  {
    name: "Mengyu Wang",
    affiliation: "Harvard University",
    role: "Advisory organizer",
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

export function PublicHome() {
  return <div className="content publicHome">
    <section className="publicHero" aria-labelledby="public-hero-title">
      <div className="publicHeroCopy">
        <p className="publicEyebrow">EmbodiVSI · 2027</p>
        <h1 id="public-hero-title">Beyond Passive Evaluation.</h1>
        <p className="workshopHeroTitle">Verifiable Self-Improvement for Physical Intelligence</p>
        <p className="publicHeroLead">
          An open research program on agentic evaluation and multi-agent co-evolution, with RoboExam
          linking VLM reasoning, physical foresight, simulation, and X-Humanoid-aligned deployment.
        </p>
        <div className="workshopMeta" aria-label="Proposed workshop format">
          <span>Seattle</span><span>June 20 or 21, 2027</span><span>Half-day</span>
        </div>
        <div className="publicHeroActions">
          <a className="primary" href="#program">View program <ArrowRight size={18}/></a>
          <a href="/leaderboards">Leaderboards</a>
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
        <div><p className="publicEyebrow">Confirmed invited speakers</p><h2 id="speakers-title">Invited speakers</h2></div>
        <p>Ten confirmed in-person speakers across vision, learning, and robotics.</p>
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

    <section className="leaderboardCallout" aria-labelledby="leaderboard-callout-title">
      <div>
        <p className="publicEyebrow">RoboExam</p>
        <h2 id="leaderboard-callout-title">Four tracks. Independent rankings.</h2>
        <p>T1 VLM reasoning · T2 action-conditioned prediction · T3 simulation · T4 real-robot deployment</p>
      </div>
      <a href="/leaderboards">Open leaderboards <ArrowRight size={18}/></a>
    </section>
  </div>;
}
