// Text the static site does not publish, rewritten before bundling (build/static-redaction-vite-plugin.ts)
// and in the exported data snapshots (scripts/redact-static-site.mjs). Every rule is a literal, reviewed
// replacement; scripts/audit-static-site.mjs checks the result.

/** No internal cluster names in run statuses. */
export const redactions = [
  [/\bAIHC (?=training|evaluation)/g, ""],
];

export function redact(text) {
  return redactions.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
}
