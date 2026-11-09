// Organisation marks for leaderboard methods, matched on the method's display
// label. Files live in public/brand/methods: vendor marks come from the MIT
// LobeHub icon set, the rest from each organisation's own site.
// `bleed` marks carry their own ground and fill the whole badge; the others sit
// inset on a white face. Unmatched methods fall back to a monogram.

export type MethodIcon = { org: string; src: string; bleed: boolean };

const MARKS: [RegExp, MethodIcon][] = [
  [/^GPT/i, { org: "OpenAI", src: "/brand/methods/openai.svg", bleed: false }],
  [/^DeepSeek/i, { org: "DeepSeek", src: "/brand/methods/deepseek.svg", bleed: false }],
  [/^GLM/i, { org: "Zhipu AI", src: "/brand/methods/zhipu.svg", bleed: false }],
  [/^Claude/i, { org: "Anthropic", src: "/brand/methods/claude.svg", bleed: false }],
  [/^Qwen/i, { org: "Alibaba Qwen", src: "/brand/methods/qwen.svg", bleed: false }],
  [/^Ctrl-?World/i, { org: "Stanford University", src: "/brand/methods/stanford.png", bleed: false }],
  [/^LingBot/i, { org: "Ant Group", src: "/brand/methods/antgroup.svg", bleed: false }],
  [/^Motus/i, { org: "Tsinghua University", src: "/brand/methods/tsinghua.png", bleed: false }],
  [/^G0?\.?5$|^Galaxea/i, { org: "Galaxea", src: "/brand/methods/galaxea.png", bleed: true }],
  [/^Hy-?VLA|^Hy-Embodied/i, { org: "Tencent Hunyuan", src: "/brand/methods/hunyuan.svg", bleed: true }],
  [/^X-?VLA/i, { org: "Tsinghua University", src: "/brand/methods/tsinghua.png", bleed: false }],
  [/^Pi-?0/i, { org: "Physical Intelligence", src: "/brand/methods/physical-intelligence.png", bleed: false }],
  [/^(Open)?DM(0|$)/i,{ org: "Dexmal", src: "/brand/methods/dexmal.png", bleed: true }],
];

export function methodIcon(label: string): MethodIcon | null {
  return MARKS.find(([pattern]) => pattern.test(label))?.[1] ?? null;
}

/** Two-letter fallback for methods without a known mark. */
export function monogram(label: string) {
  const words = label.replace(/\(.*?\)/g, "").split(/[\s\-_.]+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : label.slice(0, 2)).toUpperCase();
}
