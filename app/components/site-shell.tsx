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
      <Link className="researchBrand" href="/" aria-label="RoboExam home">
        <span className="brandGlyph" aria-hidden="true">r<span>.</span></span>RoboExam
      </Link>
      <nav aria-label="Primary navigation">
        <Link className={`researchNavItem ${active === "Overview" ? "active" : ""}`}
          aria-current={active === "Overview" ? "page" : undefined} href="/">Overview</Link>
        <Link className={`researchNavItem ${active === "Leaderboards" ? "active" : ""}`}
          aria-current={active === "Leaderboards" ? "page" : undefined} href="/leaderboards">Leaderboards</Link>
      </nav>
    </header>
    <main id="main-content" className="researchMain">{children}</main>
    <footer className="researchFooter">
      <div><strong>RoboExam</strong><span>Evidence for Physical AI.</span></div>
      <span>Reason · Predict · Act · Recover</span>
    </footer>
  </div>;
}
