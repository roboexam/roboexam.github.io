"use client";

import { useMemo } from "react";
import { buildMainBoard } from "../data/main-board";
import { methodIcon } from "../data/method-icons";
import { LogoMarquee } from "./fx";
import { MethodLogo } from "./podium";

const shortLabel = (label: string) => label.replace(/\s*\((xhigh|high)\)$/i, "");

/** Every method with results on the board, each under its organisation's mark, as a slow loop. */
export function MethodMarquee() {
  const items = useMemo(() => buildMainBoard()
    .filter((track) => track.rows.some((row) => row.overall !== null || row.ranked))
    .flatMap((track) => track.rows.map((row) => ({
      key: `${track.id}:${row.id}`,
      content: <>
        <MethodLogo label={row.label} size={30}/>
        <span><b>{shortLabel(row.label)}</b><small>{track.id} · {methodIcon(row.label)?.org ?? row.type}</small></span>
      </>,
    }))), []);
  return <section className="methodMarquee" aria-labelledby="method-marquee-title">
    <p className="eyebrow" id="method-marquee-title">On the board · {items.length} methods under evaluation</p>
    <LogoMarquee items={items} label="Methods under evaluation"/>
  </section>;
}
