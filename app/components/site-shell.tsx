import type { ReactNode } from "react";
import Link from "next/link";

type Props = {
  children: ReactNode;
};

export function SiteShell({ children }: Props) {
  return <div className="researchShell">
    <a className="skipLink" href="#main-content">Skip to content</a>
    <header className="researchNav">
      <Link className="researchBrand" href="/" aria-label="EmbodiVSI home">
        <span className="brandGlyph brandGlyphImage" aria-hidden="true"/>EmbodiVSI
      </Link>
      <nav aria-label="Primary navigation">
        <a className="researchNavItem" href="#results">Results</a>
        <a className="researchNavItem" href="#scenes">Scenes</a>
      </nav>
    </header>
    <main id="main-content" className="researchMain">{children}</main>
    <footer className="researchFooter">
      <div><strong>EmbodiVSI</strong><span>Verifiable Self-Improvement for Physical Intelligence.</span></div>
      <span>Open research program · RoboExam shared task registry</span>
    </footer>
  </div>;
}
