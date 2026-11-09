"use client";

// A small motion kit adapted from React Bits (https://github.com/DavidHDev/react-bits):
// LogoLoop → LogoMarquee, CountUp, SpotlightCard → SpotlightLayer, BlurText → RevealWords and
// GooeyNav → useNavGlider. Rewritten for this dashboard without animation libraries; ShinyText and
// GradientText live in fx.css.
//
// React Bits — MIT + Commons Clause License Condition v1.0. Copyright (c) 2026 David Haz.
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
// associated documentation files (the "Software"), to deal in the Software without restriction,
// including without limitation the rights to use, copy, modify, merge, publish, and distribute the
// Software as part of an application, website, or product, subject to the following conditions: the
// above copyright notice and this permission notice shall be included in all copies or substantial
// portions of the Software. Commons Clause: you may not sell, sublicense, or redistribute the
// components themselves, alone, in a bundle, or as a ported version.
//
// Every effect server-renders its final content (no blank or zeroed text before JavaScript, no
// hydration mismatch), animates through the DOM rather than React state, and stands still under
// prefers-reduced-motion.

import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const onScreen = (node: Element) => {
  const box = node.getBoundingClientRect();
  return box.top < window.innerHeight && box.bottom > 0;
};

/** Infinite, seamless strip: two copies of the row slide left by exactly one copy's width. Hover pauses it. */
export function LogoMarquee({ items, secondsPerItem = 2.6, label }: {
  items: { key: string; content: ReactNode }[];
  secondsPerItem?: number;
  label: string;
}) {
  const style = { "--fx-marquee-duration": `${Math.max(items.length, 1) * secondsPerItem}s` } as CSSProperties;
  return <div className="fxMarquee" style={style} role="region" aria-label={label}>
    <div className="fxMarqueeTrack">
      {[0, 1].map((copy) => <ul key={copy} className="fxMarqueeRow" aria-hidden={copy === 1 || undefined}>
        {items.map((item) => <li key={item.key}>{item.content}</li>)}
      </ul>)}
    </div>
  </div>;
}

/** Counts up from zero with an ease-out once the number scrolls into view. */
export function CountUp({ value, decimals = 0, duration = 1300 }: { value: number; decimals?: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const text = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node || reducedMotion()) return;
    const final = text(value);
    // write into React's own text node, so a later render of the same value stays in step
    const show = (label: string) => {
      if (node.firstChild?.nodeType === Node.TEXT_NODE) node.firstChild.nodeValue = label;
      else node.textContent = label;
    };
    let raf = 0;
    const run = () => {
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        show(text(value * (1 - (1 - p) ** 3)));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    show(text(0)); // before paint, so the final value never flashes first
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      run();
    }, { threshold: 0.5 });
    io.observe(node);
    return () => { io.disconnect(); cancelAnimationFrame(raf); show(final); };
  }, [value, decimals, duration]);
  return <span ref={ref} className="fxCount">{text(value)}</span>;
}

/** Splits a heading into words that blur in one after another the first time it comes into view. */
export function RevealWords({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    // already on screen at load: leave it be rather than blank it
    if (!node || reducedMotion() || onScreen(node)) return;
    node.classList.add("fxRevealPending");
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      node.classList.replace("fxRevealPending", "fxRevealIn");
    }, { threshold: 0.4 });
    io.observe(node);
    return () => { io.disconnect(); node.classList.remove("fxRevealPending"); };
  }, [text]);
  const words = text.split(" ");
  return <span ref={ref} className="fxReveal">
    <span className="fxSrOnly">{text}</span>
    {words.map((word, index) => <span key={index} aria-hidden="true" style={{ "--fx-i": index } as CSSProperties}>{word}{index < words.length - 1 ? " " : ""}</span>)}
  </span>;
}

/**
 * One document-level listener gives every `[data-spotlight]` card a light that follows the cursor
 * (the card's ::after reads --fx-x / --fx-y). Mount once.
 */
export function SpotlightLayer() {
  useEffect(() => {
    if (reducedMotion() || !window.matchMedia("(hover: hover)").matches) return;
    let card: HTMLElement | null = null;
    const move = (event: PointerEvent) => {
      const next = (event.target as Element | null)?.closest?.<HTMLElement>("[data-spotlight]") ?? null;
      card = next;
      if (!card) return;
      const box = card.getBoundingClientRect();
      card.style.setProperty("--fx-x", `${event.clientX - box.left}px`);
      card.style.setProperty("--fx-y", `${event.clientY - box.top}px`);
    };
    document.addEventListener("pointermove", move, { passive: true });
    return () => document.removeEventListener("pointermove", move);
  }, []);
  return null;
}

/**
 * A pill that glides between navigation items: it measures the active item and moves there.
 * Until it has measured, the active item keeps its own background, so there is no flash.
 */
export function useNavGlider(navRef: RefObject<HTMLElement | null>, active: string) {
  useIsomorphicLayoutEffect(() => {
    const nav = navRef.current;
    const glider = nav?.querySelector<HTMLElement>(".navGlider");
    if (!nav || !glider) return;
    const place = () => {
      const item = nav.querySelector<HTMLElement>("[aria-current=page]");
      if (!item) { glider.style.opacity = "0"; return; }
      glider.style.width = `${item.offsetWidth}px`;
      glider.style.transform = `translateX(${item.offsetLeft}px)`;
      glider.style.opacity = "1";
      nav.classList.add("hasGlider");
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [navRef, active]);
}
