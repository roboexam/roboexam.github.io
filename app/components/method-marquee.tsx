"use client";

import { useMemo } from "react";
import { buildMainBoard } from "../data/main-board";
import { methodIcon } from "../data/method-icons";
import { LogoMarquee } from "./fx";
import { MethodLogo } from "./podium";

const shortLabel = (label: string) => label.replace(/\s*\((xhigh|high)\)$/i, "");

/** Every method in the manuscript, each under its organisation's mark, as a slow loop.
 *  A policy deployed in both simulation (T3) and on real robots (T4) appears once. */
export function MethodMarquee() {
  const items = useMemo(() => {
    const methods = new Map<string, { label: string; type: string; tracks: string[] }>();
    for (const track of buildMainBoard()) {
      for (const row of track.rows.filter((item) => item.ranked)) {
        const entry = methods.get(row.label) ?? { label: row.label, type: row.type, tracks: [] };
        entry.tracks.push(track.id);
        methods.set(row.label, entry);
      }
    }
    return [...methods.values()].map((method) => ({
      key: method.label,
      content: <>
        <MethodLogo label={method.label} size={30}/>
        <span><b>{shortLabel(method.label)}</b><small>{method.tracks.join(" · ")} · {methodIcon(method.label)?.org ?? method.type}</small></span>
      </>,
    }));
  }, []);
  return <section className="methodMarquee" aria-labelledby="method-marquee-title">
    <p className="eyebrow" id="method-marquee-title">On the board · {items.length} methods evaluated across four tracks</p>
    <LogoMarquee items={items} label="Evaluated methods"/>
  </section>;
}
