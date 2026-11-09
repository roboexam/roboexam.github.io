import { useId } from "react";
import { methodIcon, monogram } from "../data/method-icons";
import type { ScenarioTag } from "../data/scenario-plan";

/**
 * One glass glyph per capability tag (public/brand/capabilities, generated as one
 * consistent set), used wherever the tag is named; the snowflake stands for all six together.
 */
const CAPABILITY_ICONS: Record<ScenarioTag | "ALL", string> = {
  ALL: "overall",
  G: "grounding",
  R: "spatial",
  F: "functional",
  P: "pose",
  T: "temporal",
  M: "multiple",
};
export const capabilityIconSrc = (tag: string) => `/brand/capabilities/${CAPABILITY_ICONS[tag as ScenarioTag] ?? CAPABILITY_ICONS.ALL}.webp`;

export function CapabilityIcon({ tag, size = 18 }: { tag: string; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- tiny static glyphs; no optimisation pipeline in this worker build
  return <img className="capabilityIcon" src={capabilityIconSrc(tag)} width={size} height={size} alt="" aria-hidden="true" draggable={false}/>;
}

/** One glass glyph per track, from the same generated set as the capability glyphs. */
export const trackIconSrc = (track: string) => `/brand/tracks/${track.toLowerCase()}.webp`;

export function TrackIcon({ track, size = 22 }: { track: string; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- tiny static glyphs; no optimisation pipeline in this worker build
  return <img className="trackIcon" src={trackIconSrc(track)} width={size} height={size} alt="" aria-hidden="true" draggable={false}/>;
}

const METALS: Record<number, { name: string; light: string; mid: string; dark: string }> = {
  1: { name: "Gold", light: "#fff2bd", mid: "#f0c24f", dark: "#a8761a" },
  2: { name: "Silver", light: "#ffffff", mid: "#cdd3de", dark: "#7c8698" },
  3: { name: "Bronze", light: "#ffd9b8", mid: "#d48b57", dark: "#8a4f28" },
};

/** Podium medal for ranks 1–3 (ribbon, struck disc, rank); a plain numeral after that. */
export function Medal({ rank, size = 22 }: { rank: number; size?: number }) {
  const id = useId();
  const metal = METALS[rank];
  if (!metal) return <span className="medalPlain" aria-label={`Rank ${rank}`}>{rank}</span>;
  return <svg className="medal" width={size} height={size * 1.27} viewBox="0 0 22 28" role="img" aria-label={`Rank ${rank} · ${metal.name}`}>
    <defs>
      <linearGradient id={`${id}d`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={metal.light}/>
        <stop offset=".5" stopColor={metal.mid}/>
        <stop offset="1" stopColor={metal.dark}/>
      </linearGradient>
    </defs>
    <path d="M4.5 0h5.2l3 9.5H7.5z" fill="#4a56c0"/>
    <path d="M12.3 0h5.2l-3 9.5H9.3z" fill="#e07d73"/>
    <circle cx="11" cy="18" r="9" fill={`url(#${id}d)`} stroke={metal.dark} strokeWidth=".7"/>
    <circle cx="11" cy="18" r="6.6" fill="none" stroke={metal.light} strokeOpacity=".75" strokeWidth=".8"/>
    <text x="11" y="21.1" textAnchor="middle" fontSize="8.6" fontWeight="800" fill={metal.dark}>{rank}</text>
  </svg>;
}

/** The method's organisation mark in a round chip, or a monogram when none is known. */
export function MethodLogo({ label, size = 20 }: { label: string; size?: number }) {
  const icon = methodIcon(label);
  const style = { width: size, height: size };
  if (!icon) return <span className="methodLogo monogram" style={{ ...style, fontSize: size * 0.4 }} aria-hidden="true">{monogram(label)}</span>;
  // eslint-disable-next-line @next/next/no-img-element -- tiny static marks; no optimisation pipeline in this worker build
  return <span className={`methodLogo ${icon.bleed ? "bleed" : ""}`} style={style} title={icon.org}><img src={icon.src} alt={icon.org} loading="lazy" decoding="async"/></span>;
}
