/* eslint-disable @next/next/no-img-element -- Static GitHub Pages deployment has no image optimizer. */
import { ArrowRight, ExternalLink } from "lucide-react";

const programCards = [
  {
    number: "01",
    title: "Invited talks",
    description: "Seven perspectives on foundation models, world models, robot learning, and deployment.",
    meta: "7 tentative speakers",
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
    description: "Four independent tracks from embodied reasoning to held-out simulation and real-robot verification.",
    meta: "X-Humanoid aligned",
  },
] as const;

const agenda = [
  ["13:00", "Opening", "Learning from failure"],
  ["13:10", "Invited talks I", "Foundation models and deployment"],
  ["14:10", "Papers & posters", "Best Paper and demonstrations"],
  ["15:15", "Coffee break", "Networking"],
  ["15:30", "Invited talks II", "World models, adaptation, and safety"],
  ["16:15", "RoboExam & panel", "Results, awards, and closing discussion"],
] as const;

const speakers = [
  ["Sergey Levine", "UC Berkeley", "https://people.eecs.berkeley.edu/~svlevine/"],
  ["Peter Stone", "The University of Texas at Austin", "https://www.cs.utexas.edu/~pstone/"],
  ["Chelsea Finn", "Stanford University", "https://profiles.stanford.edu/chelsea-finn"],
  ["Kate Saenko", "Boston University / Meta FAIR", "https://ai.bu.edu/ksaenko.html"],
  ["Jeannette Bohg", "Stanford University", "https://web.stanford.edu/~bohg/"],
  ["Marios Savvides", "Carnegie Mellon University", "https://www.mariossavvides.com/"],
  ["Katerina Fragkiadaki", "Carnegie Mellon University", "https://www.cs.cmu.edu/~katef/"],
] as const;

const organizers = [
  {
    name: "Shanghang Zhang",
    affiliation: "Peking University",
    role: "Program Chair",
    photo: "/people/shanghang-zhang.jpg",
  },
  {
    name: "Karl Henrik Johansson",
    affiliation: "KTH Royal Institute of Technology",
    role: "Secondary organizer",
    photo: "/people/karl-henrik-johansson.jpg",
  },
  {
    name: "Danica Kragić",
    affiliation: "KTH Royal Institute of Technology",
    role: "Organizer",
    photo: "/people/danica-kragic.jpg",
  },
  {
    name: "Amanda Prorok",
    affiliation: "University of Cambridge",
    role: "Organizer",
    photo: "/people/amanda-prorok.jpg",
  },
  {
    name: "Xiaobao Wei",
    affiliation: "Peking University",
    role: "RoboExam coordination",
    photo: "/people/xiaobao-wei.jpg",
  },
  {
    name: "Jixian Wu",
    affiliation: "New York University",
    role: "Evaluation operations",
    photo: "/people/jixian-wu.jpg",
  },
  {
    name: "Fangyuan Zhao",
    affiliation: "Peking University",
    role: "Challenge protocols",
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
          An open research program and the RoboExam challenge, connecting X-Humanoid-aligned data,
          world models, policy learning, and held-out sim-to-real evaluation.
        </p>
        <div className="workshopMeta" aria-label="Proposed workshop format">
          <span>Seattle</span><span>June 20–21, 2027</span><span>Half-day</span>
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

    <section id="speakers" className="publicSection" aria-labelledby="speakers-title">
      <div className="publicSectionHeading compactHeading">
        <div><p className="publicEyebrow">Tentative invited speakers</p><h2 id="speakers-title">Invited speakers</h2></div>
        <p>Seven tentative speakers across vision, learning, and robotics.</p>
      </div>
      <div className="speakerGrid">
        {speakers.map(([name, affiliation, href], index) =>
          <a href={href} target="_blank" rel="noreferrer" key={name}>
            <span>0{index + 1}<ExternalLink size={14}/></span>
            <h3>{name}</h3>
            <b>{affiliation}</b>
          </a>)}
      </div>
    </section>

    <section className="leaderboardCallout" aria-labelledby="leaderboard-callout-title">
      <div>
        <p className="publicEyebrow">RoboExam</p>
        <h2 id="leaderboard-callout-title">Four tracks. Independent rankings.</h2>
      </div>
      <a href="/leaderboards">Open leaderboards <ArrowRight size={18}/></a>
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
  </div>;
}
