/* eslint-disable @next/next/no-html-link-for-pages -- Native anchors preserve hash scrolling in the static Vinext build. */
import type { ReactNode } from "react";
import Link from "next/link";

type Props = {
  active: "Overview" | "Leaderboards";
  children: ReactNode;
};

export function SiteShell({ active, children }: Props) {
  return <div className="researchShell">
    <a className="skipLink" href="#main-content">Skip to content</a>
    <header className="researchNav">
      <Link className="researchBrand" href="/" aria-label="EmbodiVSI home">
        <span className="brandGlyph brandGlyphImage" aria-hidden="true"/>EmbodiVSI
      </Link>
      <nav aria-label="Primary navigation">
        <Link className={`researchNavItem ${active === "Overview" ? "active" : ""}`}
          aria-current={active === "Overview" ? "page" : undefined} href="/">Home</Link>
        <a className="researchNavItem" href="/#program">Program</a>
        <a className="researchNavItem" href="/#speakers">Speakers</a>
        <a className="researchNavItem" href="/#organizers">Organizers</a>
        <Link className={`researchNavItem ${active === "Leaderboards" ? "active" : ""}`}
          aria-current={active === "Leaderboards" ? "page" : undefined} href="/leaderboards">Leaderboards</Link>
      </nav>
    </header>
    <main id="main-content" className="researchMain">{children}</main>
    <footer className="researchFooter">
      <div><strong>EmbodiVSI</strong><span>Verifiable Self-Improvement for Physical Intelligence.</span></div>
      <span>Open research program · RoboExam challenge</span>
    </footer>
  </div>;
}
