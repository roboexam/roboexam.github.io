// Text the static site does not publish, rewritten before bundling (build/static-redaction-vite-plugin.ts)
// and in the exported data snapshots (scripts/redact-static-site.mjs). Every rule is a literal, reviewed
// replacement; scripts/audit-static-site.mjs checks the result.

/** Both static sites: no internal cluster names in run statuses. */
export const publicRedactions = [
  [/\bAIHC (?=training|evaluation)/g, ""],
];

/** The anonymous site additionally names no sibling project or earlier project name. */
export const anonymousRedactions = [
  [/RMFA-RoboDojo/g, "RMFA"],
  [/RoboDojo/g, "Simulator"],
  [/robodojo/g, "sim"], // in run and annotation ids, e.g. t1-robodojo14-…
  [/UniEmbodied-Bench/g, "RoboExam"],
];

export const siteVariant = () => process.env.ROBOEXAM_SITE_VARIANT === "anonymous" ? "anonymous" : "public";

export function redactionsFor(variant = siteVariant()) {
  return variant === "anonymous" ? [...publicRedactions, ...anonymousRedactions] : publicRedactions;
}

export function redact(text, rules = redactionsFor()) {
  return rules.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
}
